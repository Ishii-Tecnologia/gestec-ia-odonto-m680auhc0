/* Hooks de acesso (Etapa 4)

   1. Bloqueia login de usuario desativado (ativo = false).
   2. Registra o login bem-sucedido na auditoria.
   3. Bloqueia a RENOVACAO do token de uma conta desativada.

   Regras do guia do Skip Cloud que valem aqui:
   - toda saida que PERMITE o login passa por e.next();
   - para recusar, throw BadRequestError (um return seco responde 200 vazio
     para todos os logins do app);
   - sempre passar a colecao ('users'), senao o hook tambem roda no
     _superusers e tranca a plataforma fora do painel.

   DESCOBERTA IMPORTANTE: no hook de autenticacao o objeto `e.request` NAO
   existe, e ler `e.request.remoteAddr` lanca
   "Cannot read property 'remoteAddr' of undefined". O IP vem pelos cabecalhos
   repassados pelo proxy. Tudo envolvido em try/catch: auditar nunca pode
   derrubar um login valido.

   Sobre o item 3: a revogacao completa de uma conta desativada e feita na
   rota /backend/v1/definir-ativo, que troca o tokenKey e invalida na hora os
   tokens ja emitidos. Este bloqueio cobre o outro caminho — alguem tentando
   renovar um token antes de a troca de tokenKey ter acontecido. */

onRecordAuthWithPasswordRequest((e) => {
  if (!e.record) return e.next()

  if (e.record.getBool('ativo') === false) {
    throw new BadRequestError('Conta desativada. Procure o responsavel pela clinica.')
  }

  try {
    // No hook de auth nao ha e.request: o IP vem pelos headers do proxy.
    let ip = ''
    try {
      const info = e.requestInfo()
      const h = (info && info.headers) || {}
      const encaminhado = h['x-forwarded-for'] || h['x_forwarded_for'] || h['x-real-ip'] || ''
      ip = String(encaminhado).split(',')[0].trim().slice(0, 45)
    } catch (_) {
      ip = ''
    }

    const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
    aud.set('tenant_id', e.record.getString('tenant_id'))
    aud.set('usuario_id', e.record.id)
    aud.set('acao', 'login')
    aud.set('ip', ip)
    aud.set('rota', '/api/collections/users/auth-with-password')
    $app.save(aud)
  } catch (_) {
    // auditar nunca pode derrubar o login
  }

  return e.next()
}, 'users')

onRecordAuthRefreshRequest((e) => {
  if (e.record && e.record.getBool('ativo') === false) {
    throw new BadRequestError('Conta desativada. Procure o responsavel pela clinica.')
  }
  return e.next()
}, 'users')
