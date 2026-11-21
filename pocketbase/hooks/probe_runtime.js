/* Sonda temporária: descobre quais APIs de e-mail e de configuração de auth
   existem neste runtime (goja). Será apagada depois. */

routerAdd(
  'GET',
  '/backend/v1/probe-runtime',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('nao')
    const out = {}

    const cand = ['newMailClient', 'mailer', 'newMailer', 'sendMail', 'mailClient']
    out.app_members = {}
    for (const c of cand) {
      try {
        out.app_members[c] = typeof $app[c]
      } catch (err) {
        out.app_members[c] = 'ERR: ' + String(err).slice(0, 60)
      }
    }

    try {
      const users = $app.findCollectionByNameOrId('_pb_users_auth_')
      out.users_auth = {}
      out.users_auth.otp_type = typeof users.otp
      out.users_auth.mfa_type = typeof users.mfa
      out.users_auth_passwordAuth_type = typeof users.passwordAuth
      try {
        out.users_auth.otp = {
          enabled: users.otp.enabled,
          duration: users.otp.duration,
          length: users.otp.length,
        }
      } catch (err) {
        out.users_auth.otp = 'ERR ' + String(err).slice(0, 80)
      }
      try {
        out.users_auth.mfa = { enabled: users.mfa.enabled, rule: users.mfa.rule }
      } catch (err) {
        out.users_auth.mfa = 'ERR ' + String(err).slice(0, 80)
      }
      try {
        out.users_auth.passwordAuth = { enabled: users.passwordAuth.enabled }
      } catch (err) {
        out.users_auth.passwordAuth = 'ERR ' + String(err).slice(0, 80)
      }
    } catch (err) {
      out.users_auth = 'ERR ' + String(err).slice(0, 120)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
