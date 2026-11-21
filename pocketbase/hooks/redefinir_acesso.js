/* Redefinição de acesso pelo gestor (Etapa 13 — aresta encontrada na auditoria)

   POST /backend/v1/redefinir-acesso-usuario
   Corpo: { usuario_id, acao: 'desligar_2fa' | 'nova_senha_temporaria' }

   O BURACO QUE ESTA ROTA FECHA, descoberto na auditoria de qualidade:

   A regra de update de `users` é `id = @request.auth.id` — cada um edita só o
   próprio cadastro, e o campo `two_factor_ativo` vai junto. Consequência real,
   reproduzida em teste: um funcionário com 2FA ativo que perde o acesso ao
   e-mail fica PERMANENTEMENTE FORA. O proprietário não tem como desligar o
   fator dele; os códigos de recuperação são a única saída, e se ele também os
   perdeu, a conta está morta. Numa clínica, isso significa a recepcionista
   parada num sábado e o dono sem nenhum botão para resolver.

   A saída não podia ser abrir o campo na regra de update: `two_factor_ativo` é
   um campo de SEGURANÇA, e permitir que qualquer um altere o próprio (ou o
   alheio) pela API derrubaria a proteção que a Etapa 13 construiu. Então é
   rota, com as mesmas travas de `definir-ativo`:

   - só proprietario e gestor;
   - alvo tem de ser da mesma clínica;
   - ninguém redefini o próprio acesso por aqui (usa a tela Segurança, com senha);
   - gestor não mexe em proprietário;
   - TODA redefinição vai para a auditoria — desligar o 2FA de alguém é
     justamente o que um invasor faria primeiro se tivesse o token de um gestor.

   SENHA TEMPORÁRIA: usar `setPassword`, que faz o hash. `set('password', ...)`
   gravaria em claro. E `precisa_trocar_senha = true` obriga a troca no primeiro
   acesso, porque senha ditada por outra pessoa não é segredo de ninguém. */

routerAdd(
  'POST',
  '/backend/v1/redefinir-acesso-usuario',
  (e) => {
    if (e.hasSuperuserAuth())
      return e.forbiddenError('Use o painel do Skip para contas de plataforma.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papelCaller = e.auth.getString('papel')
    const tenantCaller = e.auth.getString('tenant_id')

    if (papelCaller !== 'proprietario' && papelCaller !== 'gestor') {
      return e.forbiddenError('Somente proprietario ou gestor pode redefinir o acesso de alguem.')
    }

    const body = e.requestInfo().body || {}
    const usuarioId = String(body.usuario_id || '').trim()
    const acao = String(body.acao || '')

    if (!usuarioId) return e.badRequestError('Informe o usuario.')
    if (acao !== 'desligar_2fa' && acao !== 'nova_senha_temporaria') {
      return e.badRequestError('Acao invalida. Use desligar_2fa ou nova_senha_temporaria.')
    }

    let alvo
    try {
      alvo = $app.findRecordById('_pb_users_auth_', usuarioId)
    } catch (_) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    // mesma clínica — e 404 (não 403) para não confirmar que o id existe em outro tenant
    if (alvo.getString('tenant_id') !== tenantCaller) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    /* Redefinir o próprio acesso por esta rota esvaziaria a exigência de senha
       da tela Segurança: quem achasse a máquina destravada desligaria o próprio
       2FA por aqui. Para si mesmo, o caminho é a tela Segurança, com senha. */
    if (alvo.id === e.auth.id) {
      return e.badRequestError(
        'Para alterar o seu proprio acesso, use a tela Seguranca (que pede a sua senha).',
      )
    }

    if (papelCaller === 'gestor' && alvo.getString('papel') === 'proprietario') {
      return e.forbiddenError(
        'Somente o proprietario pode redefinir o acesso de outro proprietario.',
      )
    }

    let retorno = { ok: true, acao: acao }

    if (acao === 'desligar_2fa') {
      alvo.set('two_factor_ativo', false)
      $app.save(alvo)

      /* Queima os códigos pendentes: se o motivo do desligamento for "perdi o
         celular e o e-mail", os códigos que sobraram não servem para nada, e
         deixá-los vivos só aumenta a superfície. */
      try {
        $app
          .db()
          .newQuery(
            'UPDATE codigo_segundo_fator SET recuperacao_hash = "", usado_em = {:agora} WHERE usuario_id = {:u}',
          )
          .bind({ agora: new Date().toISOString(), u: alvo.id })
          .execute()
      } catch (_) {}

      retorno.mensagem =
        'Verificacao em duas etapas desligada. O usuario entra so com a senha e pode ativar de novo na tela Seguranca.'
    } else {
      /* Senha temporária legível mas difícil de adivinhar. Sem caracteres
         ambíguos (0/O, 1/l/I): a senha vai ser ditada por telefone. */
      const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
      let senha = ''
      try {
        senha = $security.randomStringWithAlphabet(10, ALFABETO) + '7!'
      } catch (_) {
        return e.badRequestError('Falha ao gerar a senha.')
      }

      try {
        alvo.setPassword(senha) // faz o hash; `set('password')` gravaria em claro
      } catch (err) {
        return e.badRequestError('Falha ao definir a senha: ' + String(err).slice(0, 120))
      }
      alvo.set('precisa_trocar_senha', true)
      // invalida tokens antigos: trocar a senha sem revogar deixaria a sessão
      // do antigo dono da conta viva por até 5 dias
      alvo.set('tokenKey', $security.randomString(50))
      $app.save(alvo)

      retorno.senha_temporaria = senha
      retorno.mensagem =
        'Senha temporaria criada. Entregue pessoalmente; o usuario sera obrigado a trocar no primeiro acesso.'
    }

    // auditoria: desligar 2FA de alguém é ação sensível, sempre registrada
    try {
      const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
      aud.set('tenant_id', tenantCaller)
      aud.set('usuario_id', e.auth.id)
      aud.set('acao', acao === 'desligar_2fa' ? 'redefinir_2fa' : 'redefinir_senha')
      aud.set(
        'motivo',
        (acao === 'desligar_2fa' ? 'desligou o 2FA de ' : 'criou senha temporaria para ') +
          alvo.getString('email'),
      )
      aud.set('rota', '/backend/v1/redefinir-acesso-usuario')
      $app.save(aud)
    } catch (_) {}

    return e.json(200, retorno)
  },
  $apis.requireAuth(),
)
