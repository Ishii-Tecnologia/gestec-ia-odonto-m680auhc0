/* Hooks de acesso (Etapa 4)

   1. Bloqueia login de usuario desativado (ativo = false).
   2. Registra o login bem-sucedido na auditoria.

   Regras do guia do Skip Cloud que valem aqui:
   - toda saida que PERMITE o login passa por e.next();
   - para recusar, throw BadRequestError (um return seco responde 200 vazio
     para todos os logins do app);
   - sempre passar a colecao ('users'), senao o hook tambem roda no
     _superusers e tranca a plataforma fora do painel.

   DESCOBERTA IMPORTANTE: no hook de autenticacao o objeto `e.request` NAO
   existe (e o MESMO evento de record hook, sem a requisicao HTTP exposta),
   e ler `e.request.remoteAddr` lanca "Cannot read property 'remoteAddr' of
   undefined". O acesso vem por `e.requestInfo()`, e o IP pelos cabecalhos
   repassados pelo proxy do Skip. Por isso o IP sai de um trecho todo
   protegido, com fallback para string vazia: auditar nunca pode derrubar
   um login valido. */

onRecordAuthWithPasswordRequest((e) => {
  if (!e.record) return e.next()

  if (e.record.getBool('ativo') === false) {
    throw new BadRequestError('Conta desativada. Procure o responsavel pela clinica.')
  }

  try {
    // IP: no hook de auth nao ha e.request; vem pelos headers do proxy.
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
