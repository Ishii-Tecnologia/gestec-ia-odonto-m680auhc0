/* Hooks de acesso (Etapa 4)

   1. Bloqueia login de usuario desativado (ativo = false).
   2. Registra o login bem-sucedido na auditoria.

   Regras do guia que valem aqui:
   - toda saida que PERMITE o login passa por e.next()/return e.next();
   - para recusar, throw BadRequestError;
   - sempre passar a colecao ('users'), senao o hook roda no _superusers e
     tranca a plataforma fora do painel.

   A auditoria e gravada em try/catch: falhar ao auditar nunca pode derrubar
   um login valido. O erro vai para o log do backend (skip_cloud_list_logs),
   nao para o usuario. */

onRecordAuthWithPasswordRequest((e) => {
  if (!e.record) {
    console.log('[acesso] login sem record, seguindo')
    return e.next()
  }

  const desativado = e.record.getBool('ativo') === false
  console.log('[acesso] login de ' + e.record.getString('email') + ' ativo=' + !desativado)

  if (desativado) {
    throw new BadRequestError('Conta desativada. Procure o responsavel pela clinica.')
  }

  try {
    const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
    aud.set('tenant_id', e.record.getString('tenant_id'))
    aud.set('usuario_id', e.record.id)
    aud.set('acao', 'login')
    aud.set('ip', String(e.request.remoteAddr || '').split(':')[0])
    aud.set('rota', '/api/collections/users/auth-with-password')
    $app.save(aud)
    console.log('[acesso] auditoria de login gravada')
  } catch (err) {
    console.log('[acesso] FALHOU ao gravar auditoria: ' + String(err))
  }

  return e.next()
}, 'users')
