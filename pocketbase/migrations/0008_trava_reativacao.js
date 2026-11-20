/* Migration 0008 - Fecha a reativacao propria (Etapa 4)

   Brecha encontrada: a regra de update de `users` permite que cada um edite
   o PROPRIO cadastro (`id = @request.auth.id`). Ela ja bloqueia mudar `papel`
   e `tenant_id`, mas nao bloqueava `ativo`. Consequencia: um usuario
   desativado pelo gestor ainda tem token valido por um tempo e, nesse
   intervalo, podia chamar a API e gravar `ativo = true` no proprio registro —
   voltando a entrar sem autorizacao de ninguem.

   Agora `ativo` tambem fica imutavel pelo proprio usuario. Quem ativa e
   desativa e a rota /backend/v1/definir-ativo, que confere o papel de quem
   pede e registra na auditoria.

   `precisa_trocar_senha` continua editavel pelo proprio usuario de proposito:
   a tela de troca de senha precisa grava-lo como false ao concluir, e o campo
   nao concede privilegio nenhum — so obriga a trocar a senha. */

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.updateRule =
      'id = @request.auth.id && @request.body.papel:changed = false && @request.body.tenant_id:changed = false && @request.body.ativo:changed = false'
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    users.updateRule =
      'id = @request.auth.id && @request.body.papel:changed = false && @request.body.tenant_id:changed = false'
    app.save(users)
  },
)
