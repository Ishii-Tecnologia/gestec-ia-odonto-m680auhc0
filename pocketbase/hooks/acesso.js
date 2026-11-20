/* Hooks de acesso (Etapa 4)

   1. Bloqueia login de usuario desativado (ativo = false).
      Sem isso, desativar um usuario na tela nao tira o acesso dele.

   2. Registra o login bem-sucedido na auditoria.

   Cuidado obrigatorio (guia do Skip Cloud): no hook de autenticacao, TODA
   saida que permite o login precisa passar por e.next(). Um `return` seco
   responde 200 vazio para todo login do app. Para recusar, usa-se throw.
   E sempre passar a colecao: sem ela o hook roda tambem no _superusers e
   tranca a plataforma fora do proprio painel.

   A gravacao da auditoria acontece ANTES do e.next() de proposito: neste
   ponto a senha ja foi validada (e.record existe), e gravar antes evita
   escrever no banco depois que a resposta do login ja foi emitida. Erro ao
   auditar e engolido: nunca pode derrubar um login valido. */

onRecordAuthWithPasswordRequest((e) => {
  if (!e.record) return e.next()

  // 1. conta desativada
  if (e.record.getBool('ativo') === false) {
    throw new BadRequestError('Conta desativada. Procure o responsavel pela clinica.')
  }

  // 2. marca que a senha temporaria ainda precisa ser trocada
  //    (o campo vai no token e a guarda de rota usa)
  try {
    const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
    aud.set('tenant_id', e.record.getString('tenant_id'))
    aud.set('usuario_id', e.record.id)
    aud.set('acao', 'login')
    aud.set('ip', String(e.request.remoteAddr || '').split(':')[0])
    aud.set('rota', '/api/collections/users/auth-with-password')
    $app.save(aud)
  } catch (_) {
    // auditar nunca pode derrubar o login
  }

  return e.next()
}, 'users')
