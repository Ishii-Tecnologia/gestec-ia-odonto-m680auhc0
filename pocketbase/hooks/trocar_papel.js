/* Rota de troca de papel (Etapa 4)

   POST /backend/v1/trocar-papel
   Corpo: { usuario_id, papel }

   Por que existe: a regra de update da colecao users proibe alterar `papel`
   pela API — e precisa proibir, senao qualquer usuario se promove sozinho.
   Mas alguem tem de poder promover os outros: o proprietario (para gestor) e
   o gestor (para papeis abaixo dele). Essa e a unica porta, e ela confere.

   Trocas de papel ficam na auditoria: quem mudou o papel de quem. */

routerAdd(
  'POST',
  '/backend/v1/trocar-papel',
  (e) => {
    if (e.hasSuperuserAuth())
      return e.forbiddenError('Use o painel do Skip para contas de plataforma.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papelCaller = e.auth.getString('papel')
    const tenantCaller = e.auth.getString('tenant_id')

    if (papelCaller !== 'proprietario' && papelCaller !== 'gestor') {
      return e.forbiddenError('Somente proprietario ou gestor pode alterar papeis.')
    }

    const body = e.requestInfo().body || {}
    const usuarioId = String(body.usuario_id || '').trim()
    const novoPapel = String(body.papel || '').trim()
    const PAPEIS = ['proprietario', 'gestor', 'dentista', 'recepcao', 'financeiro']

    if (!usuarioId) return e.badRequestError('Informe o usuario.')
    if (PAPEIS.indexOf(novoPapel) < 0) return e.badRequestError('Papel invalido.')

    let alvo
    try {
      alvo = $app.findRecordById('_pb_users_auth_', usuarioId)
    } catch (_) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    // O alvo tem de ser da mesma clinica. Esta e a barreira que impede
    // administrar usuario de outro tenant por id.
    if (alvo.getString('tenant_id') !== tenantCaller) {
      return e.notFoundError('Usuario nao encontrado.')
    }

    // Nao mexer no proprio papel: evita perder o acesso administrativo sozinho.
    if (alvo.id === e.auth.id) {
      return e.badRequestError('Voce nao pode alterar o seu proprio papel.')
    }

    // Gestor nao toca em proprietario nem cria proprietario.
    if (papelCaller === 'gestor') {
      if (alvo.getString('papel') === 'proprietario') {
        return e.forbiddenError('Somente o proprietario pode alterar outro proprietario.')
      }
      if (novoPapel === 'proprietario') {
        return e.forbiddenError('Somente o proprietario pode conceder esse papel.')
      }
    }

    const papelAnterior = alvo.getString('papel')
    if (papelAnterior === novoPapel) {
      return e.json(200, { ok: true, sem_alteracao: true })
    }

    alvo.set('papel', novoPapel)
    $app.save(alvo)

    try {
      const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
      aud.set('tenant_id', tenantCaller)
      aud.set('usuario_id', e.auth.id)
      aud.set('acao', 'trocar_papel')
      aud.set(
        'motivo',
        'alterou papel de ' + alvo.getString('email') + ': ' + papelAnterior + ' -> ' + novoPapel,
      )
      aud.set('ip', String(e.request.remoteAddr || '').split(':')[0])
      aud.set('rota', '/backend/v1/trocar-papel')
      $app.save(aud)
    } catch (_) {}

    return e.json(200, { ok: true, papel: novoPapel })
  },
  $apis.requireAuth(),
)
