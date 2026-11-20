/* Migration 0017 - Segundo dentista de demonstração (Etapa 7)

   O critério de pronto 1 ("dentista B não lê a evolução do dentista A") só
   pode ser provado com DOIS profissionais de verdade, cada um com login. O
   seed original criou três profissionais, mas apenas um usuário dentista.

   Este usuário existe para testar sigilo, não para operar: fica no tenant demo
   Alfa, vinculado ao Dr. Bruno, e sai junto com os demos. */

migrate(
  (app) => {
    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      return
    }

    const email = 'alfa.dentista2@demo.gestec.local'
    let jaExiste = false
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', email)
      jaExiste = true
    } catch (_) {}

    if (!jaExiste) {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const r = new Record(users)
      r.setEmail(email)
      r.setPassword('Demo@2026!')
      r.setVerified(true)
      r.set('emailVisibility', true)
      r.set('nome', 'Dr. Bruno (demo)')
      r.set('tenant_id', alfa.id)
      r.set('papel', 'dentista')
      r.set('ativo', true)
      r.set('precisa_trocar_senha', false)
      app.save(r)
    }

    // vincula ao profissional Dr. Bruno, se ainda não houver vínculo
    try {
      const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
      const prof = app.findFirstRecordByFilter(
        'profissional',
        'tenant_id = "' + alfa.id + '" && nome ~ "Bruno"',
      )
      let temVinculo = false
      try {
        app.findFirstRecordByFilter(
          'usuario_profissional',
          'usuario_id = "' + u.id + '" && profissional_id = "' + prof.id + '"',
        )
        temVinculo = true
      } catch (_) {}
      if (!temVinculo) {
        const up = new Record(app.findCollectionByNameOrId('usuario_profissional'))
        up.set('tenant_id', alfa.id)
        up.set('usuario_id', u.id)
        up.set('profissional_id', prof.id)
        up.set('principal', true)
        app.save(up)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      app
        .db()
        .newQuery("DELETE FROM users WHERE email = 'alfa.dentista2@demo.gestec.local'")
        .execute()
    } catch (_) {}
  },
)
