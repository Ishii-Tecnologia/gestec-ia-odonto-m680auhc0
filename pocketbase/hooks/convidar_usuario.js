/* Rota de convite de usuario (Etapa 4)

   POST /backend/v1/convidar-usuario
   Corpo: { nome, email, papel }

   Por que uma rota e nao um create direto na colecao users:
   1. Criar usuario exige senha. A API de records aceita o campo password,
      mas quem chama definiria a senha — e o convidado precisa receber uma
      temporaria e ser obrigado a trocar no primeiro acesso.
   2. A regra de create de users deixa entrar proprietario e gestor, mas nao
      impede que um gestor convide outro 'proprietario' e escale privilegio.
      Aqui isso e barrado explicitamente.
   3. Quem convida fica registrado na auditoria.

   A senha temporaria NAO e devolvida na resposta em producao: ela vai por
   e-mail (fluxo de reset). Enquanto o SMTP do projeto nao estiver configurado,
   a rota devolve o e-mail do convidado e o chamador usa a tela de "esqueci a
   senha" — nunca a senha em texto claro na resposta. */

routerAdd(
  'POST',
  '/backend/v1/convidar-usuario',
  (e) => {
    if (e.hasSuperuserAuth())
      return e.forbiddenError('Use o painel do Skip para contas de plataforma.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papelCaller = e.auth.getString('papel')
    const tenantCaller = e.auth.getString('tenant_id')

    if (papelCaller !== 'proprietario' && papelCaller !== 'gestor') {
      return e.forbiddenError('Somente proprietario ou gestor pode convidar usuarios.')
    }

    const body = e.requestInfo().body || {}
    const nome = String(body.nome || '').trim()
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const papel = String(body.papel || '').trim()

    const PAPEIS = ['proprietario', 'gestor', 'dentista', 'recepcao', 'financeiro']
    if (!nome) return e.badRequestError('Informe o nome.')
    if (!email || email.indexOf('@') < 1) return e.badRequestError('Informe um e-mail valido.')
    if (PAPEIS.indexOf(papel) < 0) return e.badRequestError('Papel invalido.')

    // Escalada de privilegio: um gestor nao cria proprietario.
    if (papel === 'proprietario' && papelCaller !== 'proprietario') {
      return e.forbiddenError('Somente o proprietario pode criar outro proprietario.')
    }

    // E-mail ja usado em qualquer tenant: PocketBase exige e-mail unico global.
    let jaExiste = false
    try {
      $app.findAuthRecordByEmail('_pb_users_auth_', email)
      jaExiste = true
    } catch (_) {}
    if (jaExiste) return e.badRequestError('Ja existe uma conta com este e-mail.')

    const tenant = $app.findRecordById('tenant', tenantCaller)

    const users = $app.findCollectionByNameOrId('_pb_users_auth_')
    const registro = new Record(users)
    registro.setEmail(email)
    registro.setPassword(
      $security.randomStringWithAlphabet(
        18,
        'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789',
      ),
    )
    registro.setVerified(false)
    registro.set('emailVisibility', true)
    registro.set('nome', nome)
    registro.set('tenant_id', tenant.id)
    registro.set('papel', papel)
    registro.set('ativo', true)
    registro.set('precisa_trocar_senha', true)
    $app.save(registro)

    // auditoria: quem convidou, quem foi convidado
    try {
      const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
      aud.set('tenant_id', tenant.id)
      aud.set('usuario_id', e.auth.id)
      aud.set('acao', 'convite_usuario')
      aud.set('motivo', 'convidou ' + email + ' como ' + papel)
      aud.set('ip', String(e.request.remoteAddr || '').split(':')[0])
      aud.set('rota', '/backend/v1/convidar-usuario')
      $app.save(aud)
    } catch (_) {
      // Falha ao auditar nao pode desfazer o convite ja gravado.
    }

    return e.json(200, {
      ok: true,
      id: registro.id,
      email: email,
      papel: papel,
      // Sem senha na resposta: o convidado define a dele pelo fluxo de reset.
      proximo_passo: 'O convidado precisa usar "esqueci minha senha" para definir a senha.',
    })
  },
  $apis.requireAuth(),
)
