/* Sonda 2 — envio de e-mail e configuração nativa de OTP/MFA.
   Temporária; será apagada.

   Por que sondar: o plano diz "SMTP primeiro, senão o 2FA tranca todos fora".
   Antes de ligar OTP/MFA na coleção users preciso saber, sem chutar:
   1. como se envia e-mail neste runtime (o mailer do hook funciona?);
   2. se o envio é bloqueado no preview (a doc diz que o mailer do PocketBase
      registra "skipped" no preview — preciso saber se $app.newMailClient()
      segue o mesmo caminho);
   3. se consigo gravar otp/mfa na coleção por código (senão a migration não
      consegue configurar nada). */

onMailerSend((e) => {
  // Se este hook rodar no preview, é a prova de que o caminho de e-mail chega
  // até aqui mesmo quando o envio é bloqueado — e o log diz o motivo.
  try {
    const msg = e.message
    $app
      .logger()
      .info(
        '[mailer-hook] disparou',
        'para',
        String(msg && msg.to),
        'assunto',
        String(msg && msg.subject),
      )
  } catch (err) {
    try {
      $app.logger().error('[mailer-hook] falhou ao ler message: ' + String(err))
    } catch (_) {}
  }
  return e.next()
})

routerAdd(
  'GET',
  '/backend/v1/probe-mail',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('nao')
    const out = {}
    const q = e.request.url.query()
    const destino = String(q.get('para') || '')

    // --- 1) forma do mail client ---
    try {
      const mc = $app.newMailClient()
      out.mailclient_type = typeof mc
      out.mailclient_membros = []
      try {
        const proto = Object.getPrototypeOf(mc)
        for (const n of Object.getOwnPropertyNames(proto)) out.mailclient_membros.push(n)
      } catch (_) {}
    } catch (err) {
      out.mailclient_erro = String(err).slice(0, 150)
    }

    // --- 2) construtores globais de mensagem ---
    out.mensagem_globais = {}
    const cand = ['MailerMessage', 'MailMessage', 'Message', 'EmailMessage']
    for (const c of cand) {
      try {
        out.mensagem_globais[c] = typeof eval(c)
      } catch (_) {
        out.mensagem_globais[c] = 'undefined'
      }
    }

    // --- 3) inspeção do objeto de opções OTP/MFA ---
    try {
      const users = $app.findCollectionByNameOrId('_pb_users_auth_')
      out.otp_campos = []
      try {
        for (const k of Object.getOwnPropertyNames(users.otp)) out.otp_campos.push(k)
      } catch (_) {}
      out.mfa_campos = []
      try {
        for (const k of Object.getOwnPropertyNames(users.mfa)) out.mfa_campos.push(k)
      } catch (_) {}
    } catch (err) {
      out.otp_campos = 'ERR ' + String(err).slice(0, 100)
    }

    // --- 4) tentativa real de envio ---
    if (destino) {
      try {
        const mc = $app.newMailClient()
        let m = null
        try {
          m = new MailerMessage({
            from: { address: 'nao-responda@gestec.local', name: 'GesTec' },
            to: [{ address: destino }],
            subject: 'Teste de envio — GesTec Etapa 13',
            html: '<p>Teste de envio a partir de um hook.</p>',
          })
          out.mensagem_construida = 'ok'
        } catch (err) {
          out.mensagem_construida = 'ERR ' + String(err).slice(0, 120)
        }
        if (m) {
          mc.send(m)
          out.envio = 'send() retornou sem erro'
        }
      } catch (err) {
        out.envio = 'ERR ' + String(err).slice(0, 300)
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
