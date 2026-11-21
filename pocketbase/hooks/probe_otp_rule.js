/* Sonda 4 — o OTP tem regra de acesso? Temporária.

   RISCO QUE ESTA SONDA VERIFICA: no PocketBase, quando OTP está habilitado na
   coleção, o endpoint público /request-otp manda um código para QUALQUER e-mail
   e /auth-with-otp autentica com ele. Se não houver uma regra restringindo quem
   pode usar OTP, habilitá-lo para servir de segundo fator abriria um caminho de
   login SEM SENHA — exatamente o oposto do que a etapa quer. Preciso saber se
   esta versão tem otp.rule e se ela aceita filtro. */

routerAdd(
  'GET',
  '/backend/v1/probe-otp-rule',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('nao')
    const out = {}

    try {
      const users = $app.findCollectionByNameOrId('_pb_users_auth_')
      out.otp_keys = Object.keys(users.otp)
      out.otp_rule_tipo = typeof users.otp.rule
      out.otp_rule_valor = users.otp.rule === undefined ? '(undefined)' : users.otp.rule
      out.mfa_keys = Object.keys(users.mfa)
      out.mfa_rule_valor = users.mfa.rule
    } catch (err) {
      out.erro = String(err).slice(0, 200)
    }

    // tenta escrever a regra no OTP e reler (numa cópia, sem salvar)
    try {
      const users = $app.findCollectionByNameOrId('_pb_users_auth_')
      users.otp.rule = 'two_factor_ativo = true'
      out.escrita_otp_rule = 'aceitou: ' + String(users.otp.rule)
      // não salva: é sonda de forma, não de efeito
    } catch (err) {
      out.escrita_otp_rule = 'ERR ' + String(err).slice(0, 200)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
