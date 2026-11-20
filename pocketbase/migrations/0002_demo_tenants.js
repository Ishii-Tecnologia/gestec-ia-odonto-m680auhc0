/* Migration 0002 - Dados de demonstracao (Etapa 2)

   Cria DOIS tenants ficticios para provar o isolamento entre clinicas.
   Todos ficam marcados com demo = true, para poderem ser removidos de uma vez:
   basta filtrar demo = true e apagar. Nenhum dado real depende deles.

   Idempotente: rodar de novo nao duplica nem lanca erro. */

migrate(
  (app) => {
    const tenantCol = app.findCollectionByNameOrId('tenant')
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')

    const DEMO = [
      {
        cnpj: '11222333000181',
        razao_social: 'Clinica Demo Alfa Ltda',
        nome_fantasia: 'Clinica Demo Alfa',
        municipio: 'Curitiba',
        uf: 'PR',
      },
      {
        cnpj: '44555666000172',
        razao_social: 'Consultorio Demo Beta Ltda',
        nome_fantasia: 'Consultorio Demo Beta',
        municipio: 'Londrina',
        uf: 'PR',
      },
    ]

    const tenantIds = []

    for (const t of DEMO) {
      let registro
      try {
        registro = app.findFirstRecordByData('tenant', 'cnpj', t.cnpj)
      } catch (_) {
        registro = new Record(tenantCol)
        registro.set('cnpj', t.cnpj)
      }
      registro.set('razao_social', t.razao_social)
      registro.set('nome_fantasia', t.nome_fantasia)
      registro.set('municipio', t.municipio)
      registro.set('uf', t.uf)
      registro.set('regime_tributario', 'simples')
      registro.set('ativo', true)
      registro.set('demo', true)
      app.save(registro)
      tenantIds.push(registro.id)
    }

    // Um usuario proprietario por tenant + um dentista no tenant Alfa, para
    // permitir testar isolamento e restricao de papel.
    const USUARIOS = [
      {
        email: 'alfa.proprietario@demo.gestec.local',
        nome: 'Proprietario Demo Alfa',
        tenant: tenantIds[0],
        papel: 'proprietario',
      },
      {
        email: 'alfa.dentista@demo.gestec.local',
        nome: 'Dentista Demo Alfa',
        tenant: tenantIds[0],
        papel: 'dentista',
      },
      {
        email: 'beta.proprietario@demo.gestec.local',
        nome: 'Proprietario Demo Beta',
        tenant: tenantIds[1],
        papel: 'proprietario',
      },
    ]

    for (const u of USUARIOS) {
      let registro
      try {
        registro = app.findAuthRecordByEmail('_pb_users_auth_', u.email)
      } catch (_) {
        registro = new Record(usersCol)
        registro.set('email', u.email)
        registro.set('emailVisibility', true)
        registro.set('verified', true)
        registro.setPassword('Demo@2026!')
      }
      registro.set('nome', u.nome)
      registro.set('tenant_id', u.tenant)
      registro.set('papel', u.papel)
      registro.set('ativo', true)
      registro.set('precisa_trocar_senha', false)
      app.save(registro)
    }
  },
  (app) => {
    // Down: remove apenas o que foi marcado como demo.
    try {
      app.db().newQuery("DELETE FROM users WHERE email LIKE '%@demo.gestec.local'").execute()
    } catch (_) {}
    try {
      app.db().newQuery('DELETE FROM tenant WHERE demo = true').execute()
    } catch (_) {}
  },
)
