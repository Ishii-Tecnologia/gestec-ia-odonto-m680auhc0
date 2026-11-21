/* Sonda 3 — token customizado e coleções internas de OTP/MFA. Temporária.

   Preciso saber duas coisas antes de desenhar os códigos de recuperação:
   1. existe record.newAuthToken()? (se existir, consigo emitir sessão depois de
      validar um código de recuperação — o MFA nativo não aceita um "método"
      customizado como segundo fator)
   2. quais campos as coleções internas _otps e _mfas têm, para eu registrar a
      auditoria do segundo fator sem inventar estrutura. */

routerAdd(
  'GET',
  '/backend/v1/probe-token',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('nao')
    const out = {}

    // --- 1) emissores de token no record ---
    try {
      const r = $app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
      out.record_metodos = []
      const proto = Object.getPrototypeOf(r)
      for (const n of Object.getOwnPropertyNames(proto)) {
        if (n.toLowerCase().indexOf('token') >= 0 || n.toLowerCase().indexOf('auth') >= 0) {
          out.record_metodos.push(n)
        }
      }
      out.newAuthToken = typeof r.newAuthToken
      out.newStaticAuthToken = typeof r.newStaticAuthToken
      out.refreshTokenKey = typeof r.refreshTokenKey
    } catch (err) {
      out.record_metodos = 'ERR ' + String(err).slice(0, 120)
    }

    // --- 2) membros do $app ligados a token ---
    out.app_token = []
    try {
      const proto = Object.getPrototypeOf($app)
      for (const n of Object.getOwnPropertyNames(proto)) {
        const l = n.toLowerCase()
        if (l.indexOf('token') >= 0 || l.indexOf('mfa') >= 0 || l.indexOf('otp') >= 0) {
          out.app_token.push(n)
        }
      }
    } catch (err) {
      out.app_token = 'ERR ' + String(err).slice(0, 100)
    }

    // --- 3) coleções internas ---
    out.internas = {}
    for (const nome of ['_otps', '_mfas']) {
      try {
        const c = $app.findCollectionByNameOrId(nome)
        out.internas[nome] = c.fields.map(function (f) {
          return f.name + ':' + f.type
        })
      } catch (err) {
        out.internas[nome] = 'nao existe'
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
