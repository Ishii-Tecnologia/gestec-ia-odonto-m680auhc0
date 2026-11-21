/* Verificação do segundo fator e códigos de recuperação (Etapa 13)

   POST /backend/v1/verificar-segundo-fator  { desafio, codigo }
   POST /backend/v1/recuperar-acesso         { email, codigo_recuperacao }
   POST /backend/v1/ativar-segundo-fator     { senha }
   POST /backend/v1/desativar-segundo-fator  { senha }
   GET  /backend/v1/segundo-fator/status

   AQUI É ONDE A SESSÃO NASCE. O login por senha (hook
   segundo_fator_login.js) recusou o token e devolveu um desafio; esta rota
   confere o código e emite o token com record.newStaticAuthToken().

   POR QUE TOKEN ESTÁTICO: o MFA nativo do PocketBase faria isso sozinho, mas
   exige o OTP público ligado — e o OTP público não tem regra de acesso, então
   logaria qualquer pessoa só com código, sem senha. Trocar "sessão que não
   renova" por "login sem senha" não é troca. O token estático é renovável como
   qualquer outro (o PocketBase renova por /auth-refresh, que já tem o hook de
   conta desativada da Etapa 4).

   COMPARAÇÃO EM TEMPO CONSTANTE: comparação com `===` vaza, pelo tempo de
   resposta, quantos caracteres iniciais do hash acertaram. Uso XOR acumulado. */

routerAdd(
  'POST',
  '/backend/v1/verificar-segundo-fator',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')

    const body = e.requestInfo().body || {}
    const desafio = String(body.desafio || '').trim()
    const codigo = String(body.codigo || '').replace(/\D/g, '')

    if (!desafio) return e.badRequestError('Sessao de verificacao ausente. Entre novamente.')
    if (codigo.length !== 6) return e.badRequestError('Informe os 6 digitos do codigo.')

    const hashDesafio = $security.sha256(desafio)
    /* O desafio foi gravado como sha256(desafio + '|' + usuarioId); para achar a
       linha sem saber o usuário, procuro pelo hash do desafio puro NAO serve.
       Solução: guardei desafio_hash = sha256(desafio + '|' + usuarioId) e não sei
       o usuário aqui. Então procuro as linhas vivas e comparo o hash composto
       uma a uma — o volume é o de tentativas em aberto, dezenas, não milhares. */
    let linha = null
    let usuarioId = ''
    try {
      /* FILTRO SÓ POR desafio_hash EXISTENTE, não por usado_em = "".
         Campo date nasce com valor zero e o filtro `= ""` não casa com ele —
         descobri isso no código de recuperação, e o mesmo erro estava aqui:
         ao reaproveitar um código, a linha já usada ficava fora do filtro e a
         resposta virava "sessão inválida" em vez de "código já usado". Perdia-se
         o sinal de REPLAY, que é justamente o que a auditoria precisa separar. */
      const vivas = $app.findRecordsByFilter(
        'codigo_segundo_fator',
        'desafio_hash != ""',
        '-created',
        500,
        0,
      )
      for (const c of vivas) {
        const u = c.getString('usuario_id')
        const esperado = $security.sha256(desafio + '|' + u)
        const alvo = c.getString('desafio_hash')
        // comparação em tempo constante
        let dif = esperado.length === alvo.length ? 0 : 1
        const n = Math.min(esperado.length, alvo.length)
        for (let i = 0; i < n; i++) {
          dif |= esperado.charCodeAt(i) ^ alvo.charCodeAt(i)
        }
        if (dif === 0) {
          linha = c
          usuarioId = u
          break
        }
      }
    } catch (err) {
      return e.badRequestError('Falha ao consultar a verificacao.')
    }

    if (!usuarioId) {
      return e.badRequestError('Sessao de verificacao invalida ou expirada. Entre novamente.')
    }

    /* A partir daqui existe usuário identificado: toda falha é auditada. */
    function auditar(resultado, detalhe) {
      try {
        const aud = new Record($app.findCollectionByNameOrId('autenticacao_fator'))
        aud.set(
          'tenant_id',
          usuarioId
            ? $app.findRecordById('_pb_users_auth_', usuarioId).getString('tenant_id') || ''
            : '',
        )
        aud.set('usuario_id', usuarioId)
        aud.set('metodo', 'email')
        aud.set('resultado', resultado)
        aud.set('detalhe', detalhe)
        $app.save(aud)
      } catch (_) {}
    }

    if (!linha) {
      return e.badRequestError('Codigo invalido.')
    }

    // já usado? isso é REPLAY — sinal diferente de "código errado"
    if (linha.getString('usado_em')) {
      auditar('reuso', 'tentativa de usar codigo ja consumido')
      return e.badRequestError('Este codigo ja foi usado. Entre novamente.')
    }

    // expirado?
    const expira = Date.parse(String(linha.getString('expira_em')).replace(' ', 'T'))
    if (isNaN(expira) || expira < Date.now()) {
      auditar('expirado', 'codigo expirado')
      linha.set('usado_em', new Date().toISOString())
      try {
        $app.save(linha)
      } catch (_) {}
      return e.badRequestError('Codigo expirado. Entre novamente para receber outro.')
    }

    // tentativas
    const tentativas = linha.getInt('tentativas') || 0
    if (tentativas >= 5) {
      auditar('bloqueado', 'limite de 5 tentativas atingido')
      linha.set('usado_em', new Date().toISOString())
      try {
        $app.save(linha)
      } catch (_) {}
      return e.badRequestError('Muitas tentativas. Entre novamente para receber um novo codigo.')
    }

    // confere o código (tempo constante)
    const esperadoCodigo = linha.getString('codigo_hash')
    const recebido = $security.sha256(codigo + '|' + usuarioId)
    let dif = esperadoCodigo.length === recebido.length ? 0 : 1
    const n = Math.min(esperadoCodigo.length, recebido.length)
    for (let i = 0; i < n; i++) {
      dif |= esperadoCodigo.charCodeAt(i) ^ recebido.charCodeAt(i)
    }

    if (dif !== 0) {
      linha.set('tentativas', tentativas + 1)
      try {
        $app.save(linha)
      } catch (_) {}
      auditar('falha', 'codigo incorreto (' + (tentativas + 1) + '/5)')
      const restam = 5 - (tentativas + 1)
      return e.badRequestError(
        restam > 0
          ? 'Codigo incorreto. Restam ' + restam + ' tentativa(s).'
          : 'Codigo incorreto. Entre novamente para receber um novo codigo.',
      )
    }

    // ---------- sucesso ----------
    let usuario
    try {
      usuario = $app.findRecordById('_pb_users_auth_', usuarioId)
    } catch (_) {
      return e.badRequestError('Usuario nao encontrado.')
    }

    /* Conta desativada continua bloqueada mesmo com código válido. Esta é a
       checagem que o critério 7 cobra, e ela tem de estar DEPOIS da validação do
       código: senão a resposta "conta desativada" revelaria, a quem tem só a
       senha, que o código estava certo. */
    if (usuario.getBool('ativo') === false) {
      auditar('bloqueado', 'conta desativada tentou completar o segundo fator')
      return e.forbiddenError('Conta desativada. Procure o responsavel pela clinica.')
    }

    linha.set('usado_em', new Date().toISOString())
    linha.set('codigo_hash', '') // some com o hash: uso único de verdade
    try {
      $app.save(linha)
    } catch (_) {}

    auditar('sucesso', 'segundo fator confirmado; sessao emitida')

    let token = ''
    try {
      token = usuario.newStaticAuthToken({ duration: 1209600 }) // 14 dias
    } catch (err) {
      return e.badRequestError(
        'Codigo confirmado, mas falhou emitir a sessao: ' + String(err).slice(0, 120),
      )
    }

    return e.json(200, {
      ok: true,
      token: token,
      // o registro vai junto porque o cliente precisa dele para montar a sessão
      record: {
        id: usuario.id,
        email: usuario.getString('email'),
        nome: usuario.getString('nome'),
        papel: usuario.getString('papel'),
        tenant_id: usuario.getString('tenant_id'),
        ativo: usuario.getBool('ativo'),
        precisa_trocar_senha: usuario.getBool('precisa_trocar_senha'),
        two_factor_ativo: usuario.getBool('two_factor_ativo'),
      },
    })
  },
  $apis.bodyLimit(4096),
)

/* Reenvio do código: mesmo desafio, novo código. Deliberadamente separado da
   verificação, porque reenviar é ação repetida e precisa de limite próprio. */
routerAdd(
  'POST',
  '/backend/v1/reenviar-codigo',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')

    const body = e.requestInfo().body || {}
    const desafio = String(body.desafio || '').trim()
    if (!desafio) return e.badRequestError('Sessao de verificacao ausente. Entre novamente.')

    let linha = null
    let usuarioId = ''
    try {
      const vivas = $app.findRecordsByFilter(
        'codigo_segundo_fator',
        'desafio_hash != ""',
        '-created',
        500,
        0,
      )
      for (const c of vivas) {
        const u = c.getString('usuario_id')
        const esperado = $security.sha256(desafio + '|' + u)
        const alvo = c.getString('desafio_hash')
        let dif = esperado.length === alvo.length ? 0 : 1
        const n = Math.min(esperado.length, alvo.length)
        for (let i = 0; i < n; i++) dif |= esperado.charCodeAt(i) ^ alvo.charCodeAt(i)
        if (dif === 0) {
          linha = c
          usuarioId = u
          break
        }
      }
    } catch (_) {}

    if (!usuarioId || !linha) {
      return e.badRequestError('Sessao expirada. Entre novamente com sua senha.')
    }

    /* Limite de reenvio: sem isso, o botão "reenviar" vira um canhão de e-mail
       (e o relay do Skip tem teto de 10 destinatários por hora). */
    const criado = Date.parse(String(linha.getString('created')).replace(' ', 'T'))
    const tentativas = linha.getInt('tentativas') || 0
    if (tentativas >= 5) {
      return e.badRequestError('Muitas tentativas. Entre novamente.')
    }
    if (!isNaN(criado) && Date.now() - criado < 30000) {
      return e.tooManyRequestsError('Aguarde 30 segundos antes de pedir outro codigo.')
    }

    let usuario
    try {
      usuario = $app.findRecordById('_pb_users_auth_', usuarioId)
    } catch (_) {
      return e.badRequestError('Usuario nao encontrado.')
    }
    if (usuario.getBool('ativo') === false) {
      return e.forbiddenError('Conta desativada.')
    }

    // sem randomInt neste runtime: dígitos direto do gerador criptográfico
    let codigo = ''
    try {
      codigo = $security.randomStringWithAlphabet(6, '0123456789')
    } catch (_) {
      return e.badRequestError('Falha ao gerar um novo codigo.')
    }

    linha.set('codigo_hash', $security.sha256(codigo + '|' + usuarioId))
    linha.set('tentativas', 0)
    linha.set('expira_em', new Date(Date.now() + 10 * 60 * 1000).toISOString())
    try {
      $app.save(linha)
    } catch (_) {
      return e.badRequestError('Nao foi possivel gerar um novo codigo.')
    }

    try {
      const mc = $app.newMailClient()
      const msg = new MailerMessage({
        from: { address: 'nao-responda@gestec.local', name: 'GesTec-IA-Odonto' },
        to: [{ address: usuario.getString('email') }],
        subject: 'Seu novo codigo de acesso',
        html:
          '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">' +
          '<h2 style="margin:0 0 8px;font-size:18px">Novo codigo de verificacao</h2>' +
          '<p style="color:#555;margin:0 0 16px;font-size:14px">Vale por 10 minutos e so pode ser usado uma vez. O codigo anterior nao funciona mais.</p>' +
          '<div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:16px;background:#f4f6f8;border-radius:8px;text-align:center">' +
          codigo +
          '</div></div>',
      })
      mc.send(msg)
    } catch (err) {
      return e.badRequestError('Falhou o envio do codigo. Procure o responsavel pela clinica.')
    }

    return e.json(200, { ok: true, mensagem: 'Novo codigo enviado.' })
  },
  $apis.bodyLimit(2048),
)
