/* Sonda temporária: descobre quais APIs de e-mail e de configuração de auth
   existem neste runtime (goja). Será apagada depois. */

routerAdd(
  'GET',
  '/backend/v1/_probe',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('nao')
    const out = {}

    // 1) quais membros o $app expõe para envio de e-mail
    const cand = ['newMailClient', 'mailer', 'newMailer', 'sendMail', 'mailClient']
    out.app_members = {}
    for (const c of cand) {
      try {
        out.app_members[c] = typeof $app[c]
      } catch (err) {
        out.app_members[c] = 'ERR: ' + String(err).slice(0, 60)
      }
    }

    // 2) globais de mail
    out.globals = {}
    const glob = ['$mailer', '$mail', 'MailerMessage', 'MailClient', '$mails']
    for (const g of glob) {
      try {
        out.globals[g] = typeof eval(g)
      } catch (err) {
        out.globals[g] = 'undefined'
      }
    }

    // 3) opções de auth da coleção users: otp / mfa / passwordAuth
    try {
      const users = $app.findCollectionByNameOrId('_pb_users_auth_')
      out.users_auth = {}
      out.users_auth.has_otp = typeof users.otp
      out.users_auth.has_mfa = typeof users.mfa
      out.users_auth.has_passwordAuth = typeof users.passwordAuth
      try {
        out.users_auth.otp = {
          enabled: users.otp.enabled,
          duration: users.otp.duration,
          length: users.otp.length,
          template: String(users.otp.emailTemplate && users.otp.emailTemplate.subject),
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

    // 4) escritores disponíveis no objeto collection (para a migration)
    try {
      const users = $app.findCollectionByNameOrId('_pb_users_auth_')
      out.setters = []
      const nomes = Object.getOwnPropertyNames(Object.getPrototypeOf(users))
      for (const n of nomes) {
        if (n.toLowerCase().indexOf('otp') >= 0 || n.toLowerCase().indexOf('mfa') >= 0) {
          out.setters.push(n)
        }
      }
    } catch (err) {
      out.setters = 'ERR ' + String(err).slice(0, 100)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
