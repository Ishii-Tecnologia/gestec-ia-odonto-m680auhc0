/* Rota de ativacao/desativacao de usuario (Etapa 4)

   POST /backend/v1/definir-ativo
   Corpo: { usuario_id, ativo }

   Por que uma rota: a regra de update da colecao users so permite que cada
   um edite o PROPRIO cadastro (`id = @request.auth.id`). Isso e o que impede
   alguem de mexer no cadastro dos outros pela API — mas tambem impede o
   proprietario de desativar um funcionario. A porta legitima e esta rota,
   que confere quem pede, confere o tenant do alvo e registra na auditoria.

   Travas:
   - so proprietario e gestor;
   - alvo tem de ser da mesma clinica;
   - ninguem desativa a si mesmo (evita se trancar fora);
   - gestor nao desativa proprietario. */

routerAdd(
  'POST',
  '/backend/v1/definir-ativo',
  (e) => {
    if (e.hasSuperuserAuth())
      return e.forbiddenError('Use o painel do Skip para contas de plataforma.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papelCaller = e.auth.getString('papel')
    const tenantCaller = e.auth.getString('tenant_id')

    if (papelCaller !== 'proprietario' && papelCaller !== 'gestor') {
      return e.forbiddenError('Somente proprietario ou gestor pode ativar ou desativar usuarios.')
    }

    const body = e.requestInfo().body || {}
    const usuarioId = String(body.usuario_id || '').trim()
    const ativo = body.ativo === true || body.ativo === 'true'

    if (!usuarioId) return e.badRequestError('Informe o usuario.')
    if (typeof body.ativo === 'undefined')
      return e.badRequestError('Informe ativo (true ou false).')

    let alvo
    try {
      alvo = $app.findRecordById('_pb_users_auth_', usuarioId)
    } catch (_) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    if (alvo.getString('tenant_id') !== tenantCaller) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    if (alvo.id === e.auth.id) {
      return e.badRequestError('Voce nao pode desativar a propria conta.')
    }

    if (papelCaller === 'gestor' && alvo.getString('papel') === 'proprietario') {
      return e.forbiddenError('Somente o proprietario pode alterar outro proprietario.')
    }

    alvo.set('ativo', ativo)

    // REVOGAÇÃO IMEDIATA DOS TOKENS
    // O token de autenticação do PocketBase dura 5 dias e não é consultado
    // contra o banco a cada requisição: desativar o usuário sem mais nada
    // deixaria o token emitido antes continuar lendo dados clínicos por dias
    // (comprovado em teste). Trocar o tokenKey invalida na hora todo token já
    // emitido para este usuário, porque a assinatura deixa de conferir.
    alvo.set('tokenKey', $security.randomString(50))

    $app.save(alvo)

    try {
      const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
      aud.set('tenant_id', tenantCaller)
      aud.set('usuario_id', e.auth.id)
      aud.set('acao', 'desativar_usuario')
      aud.set('motivo', (ativo ? 'ativou ' : 'desativou ') + alvo.getString('email'))
      aud.set('ip', String(e.request.remoteAddr || '').split(':')[0])
      aud.set('rota', '/backend/v1/definir-ativo')
      $app.save(aud)
    } catch (_) {}

    return e.json(200, { ok: true, ativo: ativo })
  },
  $apis.requireAuth(),
)
