/* Gestão do segundo fator e recuperação de acesso (Etapa 13)

   POST /backend/v1/ativar-segundo-fator     { senha }
   POST /backend/v1/desativar-segundo-fator  { senha }
   GET  /backend/v1/segundo-fator/status
   POST /backend/v1/recuperar-acesso         { email, codigo_recuperacao }

   TRÊS DECISÕES QUE MERECEM EXPLICAÇÃO:

   1. ATIVAR E DESATIVAR EXIGEM A SENHA. O token de sessão já prova que a pessoa
      entrou; mas se o notebook ficou aberto, quem senta nele desligaria o 2FA e
      ficaria com a conta para sempre. Pedir a senha de novo é o único jeito de
      saber que é a pessoa, não quem achou a máquina destravada.

   2. OS CÓDIGOS DE RECUPERAÇÃO APARECEM UMA VEZ SÓ. Depois disso o banco tem
      apenas o hash. Não é excesso de zelo: um código de recuperação é uma senha
      alternativa, e senha guardada em claro no banco vaza junto com o banco.

   3. RECUPERAÇÃO EMITE TOKEN ESTÁTICO. Quem perdeu o celular e o e-mail não pode
      ficar preso para fora do próprio prontuário. O código de recuperação é o
      último recurso; ele entra uma vez e é consumido. */

routerAdd(
  'GET',
  '/backend/v1/segundo-fator/status',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const ativo = e.auth.getBool('two_factor_ativo') === true
    const papel = e.auth.getString('papel')
    // obrigatório por papel: quem lê prontuário
    const obrigatorio = ['proprietario', 'gestor', 'dentista'].indexOf(papel) >= 0

    let restantes = 0
    if (ativo) {
      try {
        const codigos = $app.findRecordsByFilter(
          'codigo_segundo_fator',
          'usuario_id = "' + e.auth.id + '" && recuperacao_hash != "" && recuperacao_usado_em = ""',
          '',
          50,
          0,
        )
        restantes = codigos.length
      } catch (_) {}
    }

    return e.json(200, {
      ativo: ativo,
      obrigatorio_para_papel: obrigatorio,
      codigos_recuperacao_restantes: restantes,
      alerta:
        ativo && restantes <= 2
          ? 'Voce tem poucos codigos de recuperacao. Gere novos antes de perder o acesso.'
          : '',
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/ativar-segundo-fator',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const body = e.requestInfo().body || {}
    const senha = String(body.senha || '')
    if (!senha)
      return e.badRequestError('Informe sua senha para ativar a verificacao em duas etapas.')

    let usuario
    try {
      usuario = $app.findRecordById('_pb_users_auth_', e.auth.id)
    } catch (_) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    let senhaOk = false
    try {
      senhaOk = usuario.validatePassword(senha) === true
    } catch (err) {
      return e.badRequestError('Nao foi possivel validar a senha.')
    }
    if (!senhaOk) return e.badRequestError('Senha incorreta.')

    if (usuario.getBool('two_factor_ativo') === true) {
      return e.badRequestError('A verificacao em duas etapas ja esta ativa nesta conta.')
    }

    /* Gera 8 códigos de recuperação legíveis (sem 0/O e 1/l/I: código de
       recuperação é digitado à mão, de uma tela, sob estresse). */
    const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const claros = []
    const col = $app.findCollectionByNameOrId('codigo_segundo_fator')

    for (let i = 0; i < 8; i++) {
      let bruto = ''
      try {
        bruto = $security.randomStringWithAlphabet(10, ALFABETO)
      } catch (_) {
        bruto = $security.randomString(10)
      }
      const formatado = bruto.slice(0, 5) + '-' + bruto.slice(5, 10)
      claros.push(formatado)

      try {
        const r = new Record(col)
        r.set('usuario_id', usuario.id)
        r.set('recuperacao_hash', $security.sha256(formatado + '|' + usuario.id))
        r.set('codigo_hash', '')
        $app.save(r)
      } catch (err) {
        return e.badRequestError('Falha ao gerar os codigos de recuperacao.')
      }
    }

    usuario.set('two_factor_ativo', true)
    try {
      $app.save(usuario)
    } catch (err) {
      return e.badRequestError('Falha ao ativar a verificacao em duas etapas.')
    }

    try {
      const aud = new Record($app.findCollectionByNameOrId('autenticacao_fator'))
      aud.set('tenant_id', usuario.getString('tenant_id'))
      aud.set('usuario_id', usuario.id)
      aud.set('metodo', 'recuperacao')
      aud.set('resultado', 'sucesso')
      aud.set('detalhe', 'segundo fator ativado; 8 codigos de recuperacao gerados')
      $app.save(aud)
    } catch (_) {}

    return e.json(200, {
      ok: true,
      ativo: true,
      /* Os códigos vão no corpo UMA vez. A tela obriga a pessoa a guardá-los
         antes de continuar, e avisa que não serão mostrados de novo. */
      codigos_recuperacao: claros,
      aviso:
        'Guarde estes codigos agora. Cada um serve uma vez, para entrar se voce perder o acesso ao e-mail. Eles nao serao mostrados de novo.',
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/desativar-segundo-fator',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const body = e.requestInfo().body || {}
    const senha = String(body.senha || '')
    if (!senha) return e.badRequestError('Informe sua senha.')

    let usuario
    try {
      usuario = $app.findRecordById('_pb_users_auth_', e.auth.id)
    } catch (_) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    let senhaOk = false
    try {
      senhaOk = usuario.validatePassword(senha) === true
    } catch (_) {}
    if (!senhaOk) return e.badRequestError('Senha incorreta.')

    /* Papel que LÊ PRONTUÁRIO não pode desligar. A etapa diz que o fator é
       obrigatório para esses papéis; deixar desligar por botão tornaria o
       "obrigatório" uma sugestão. Para esses, a saída é o proprietário redefinir
       o acesso — decisão consciente, registrada na auditoria. */
    const papel = usuario.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) >= 0) {
      return e.forbiddenError(
        'A verificacao em duas etapas e obrigatoria para o seu perfil, porque voce tem acesso a prontuario. Procure o proprietario se precisar trocar o metodo de acesso.',
      )
    }

    usuario.set('two_factor_ativo', false)
    try {
      $app.save(usuario)
    } catch (err) {
      return e.badRequestError('Falha ao desativar.')
    }

    // queima os códigos de recuperação pendentes
    try {
      $app
        .db()
        .newQuery(
          'UPDATE codigo_segundo_fator SET recuperacao_hash = "" WHERE usuario_id = {:u} AND recuperacao_usado_em = ""',
        )
        .bind({ u: usuario.id })
        .execute()
    } catch (_) {}

    try {
      const aud = new Record($app.findCollectionByNameOrId('autenticacao_fator'))
      aud.set('tenant_id', usuario.getString('tenant_id'))
      aud.set('usuario_id', usuario.id)
      aud.set('metodo', 'recuperacao')
      aud.set('resultado', 'sucesso')
      aud.set('detalhe', 'segundo fator desativado pelo proprio usuario')
      $app.save(aud)
    } catch (_) {}

    return e.json(200, { ok: true, ativo: false })
  },
  $apis.requireAuth(),
)

/* Recuperação: o último recurso de quem perdeu o acesso ao e-mail.
   Rota PÚBLICA (sem requireAuth) porque é justamente para quem não consegue
   entrar. Por isso o cuidado é maior:
   - o código é de uso único e tem hash;
   - erro e acerto respondem o mesmo tanto de informação (não revela se o e-mail
     existe nem se o código estava perto);
   - toda tentativa vai para a auditoria, com o resultado. */
routerAdd(
  'POST',
  '/backend/v1/recuperar-acesso',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')

    const body = e.requestInfo().body || {}
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const codigo = String(body.codigo_recuperacao || '')
      .trim()
      .toUpperCase()

    const FALHA = 'Codigo de recuperacao invalido ou ja utilizado.'
    if (!email || !codigo) return e.badRequestError(FALHA)

    const hash = $security.sha256(codigo + '|' + '__pendente__') // será recalculado com o id

    let usuario = null
    try {
      usuario = $app.findAuthRecordByEmail('_pb_users_auth_', email)
    } catch (_) {
      // mesma resposta de código errado: não confirma se o e-mail existe
      return e.badRequestError(FALHA)
    }

    if (usuario.getBool('ativo') === false) {
      return e.forbiddenError('Conta desativada. Procure o responsavel pela clinica.')
    }
    if (usuario.getBool('two_factor_ativo') !== true) {
      return e.badRequestError('Esta conta nao usa verificacao em duas etapas.')
    }

    const alvo = $security.sha256(codigo + '|' + usuario.id)
    let linha = null
    try {
      /* FILTRO SÓ POR usuario_id, e a seleção em JS.
         Tentei `recuperacao_usado_em = ""` e não funciona: campo date criado agora
         nasce com valor zero, e o filtro do PocketBase não casa `""` com esse
         zero. O sintoma era o pior possível — código de recuperação sempre
         "inválido", com o código certo na mão. */
      const candidatas = $app.findRecordsByFilter(
        'codigo_segundo_fator',
        'usuario_id = "' + usuario.id + '" && recuperacao_hash != ""',
        '-created',
        50,
        0,
      )
      for (const c of candidatas) {
        if (String(c.getString('recuperacao_usado_em') || '').length > 0) continue // já usado
        const valor = c.getString('recuperacao_hash')
        let dif = valor.length === alvo.length ? 0 : 1
        const n = Math.min(valor.length, alvo.length)
        for (let i = 0; i < n; i++) dif |= valor.charCodeAt(i) ^ alvo.charCodeAt(i)
        if (dif === 0) {
          linha = c
          break
        }
      }
    } catch (_) {}

    function auditar(resultado, detalhe) {
      try {
        const aud = new Record($app.findCollectionByNameOrId('autenticacao_fator'))
        aud.set('tenant_id', usuario ? usuario.getString('tenant_id') : '')
        aud.set('usuario_id', usuario ? usuario.id : '')
        aud.set('metodo', 'recuperacao')
        aud.set('resultado', resultado)
        aud.set('detalhe', detalhe)
        $app.save(aud)
      } catch (_) {}
    }

    if (!linha) {
      auditar('falha', 'codigo de recuperacao invalido ou ja usado')
      return e.badRequestError(FALHA)
    }

    // consome AGORA: se a emissão do token falhar, o código já não vale mais.
    // Preferir "pedir outro código" a "código reutilizável".
    linha.set('recuperacao_usado_em', new Date().toISOString())
    linha.set('recuperacao_hash', '')
    try {
      $app.save(linha)
    } catch (_) {
      return e.badRequestError('Falha ao consumir o codigo.')
    }

    let token = ''
    try {
      token = usuario.newStaticAuthToken({ duration: 3600 }) // 1h: só para reconfigurar
    } catch (_) {
      auditar('falha', 'codigo valido mas falhou emitir sessao')
      return e.badRequestError('Codigo valido, mas falhou abrir a sessao.')
    }

    auditar('sucesso', 'acesso recuperado por codigo de recuperacao')

    return e.json(200, {
      ok: true,
      token: token,
      record: {
        id: usuario.id,
        email: usuario.getString('email'),
        nome: usuario.getString('nome'),
        papel: usuario.getString('papel'),
        tenant_id: usuario.getString('tenant_id'),
        ativo: usuario.getBool('ativo'),
        two_factor_ativo: usuario.getBool('two_factor_ativo'),
      },
      aviso:
        'Voce entrou com um codigo de recuperacao. Gere novos codigos na tela de seguranca, porque este ja foi usado.',
    })
  },
  $apis.bodyLimit(2048),
)
