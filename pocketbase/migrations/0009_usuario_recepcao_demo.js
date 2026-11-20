/* Migration 0009 - Usuario de demonstracao com papel recepcao (Etapa 4)

   Existe por um motivo de teste: o convite cria a conta com senha aleatoria
   que ninguem conhece, entao nao havia como PROVAR o criterio de pronto da
   Etapa 4 ("usuario recepcao entra, e bloqueado em rota clinica e a tentativa
   aparece em auditoria_acesso"). Sem uma conta de recepcao com senha
   conhecida, o teste nao poderia ser feito de ponta a ponta.

   E dado de demonstracao, como os tenants demo: sai junto com eles.
   `demo = true` no registro (via email @demo.gestec.local) e a senha e
   publica de proposito — jamais usar em producao. */

migrate(
  (app) => {
    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      return // sem tenant demo, nada a fazer
    }

    const email = 'alfa.recepcao@demo.gestec.local'
    let jaExiste = false
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', email)
      jaExiste = true
    } catch (_) {}
    if (jaExiste) return

    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const r = new Record(users)
    r.setEmail(email)
    r.setPassword('Demo@2026!')
    r.setVerified(true)
    r.set('emailVisibility', true)
    r.set('nome', 'Recepcao Demo Alfa')
    r.set('tenant_id', alfa.id)
    r.set('papel', 'recepcao')
    r.set('ativo', true)
    r.set('precisa_trocar_senha', false)
    app.save(r)
  },
  (app) => {
    try {
      app
        .db()
        .newQuery("DELETE FROM users WHERE email = 'alfa.recepcao@demo.gestec.local'")
        .execute()
    } catch (_) {}
  },
)
