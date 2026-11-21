/* Migration 0026 - Libera update de item com guarda de campo (Etapa 9)

   PROBLEMA ENCONTRADO NO TESTE: eu tinha posto updateRule nulo em
   `item_tratamento` para forçar tudo a passar por rota. Consequência real: com
   a regra nula, o PocketBase recusa QUALQUER update — inclusive os que a
   própria rota faz depois de validar (`item.set('status','executado')` roda como
   superuser e passa, mas a GUARDA em onRecordUpdateRequest nunca é alcançada
   pela API, porque a regra barra antes do hook).

   Ou seja: a guarda que eu escrevi existia e não protegia nada. É o tipo de
   segurança que parece existir e não existe — pior que não ter.

   CORREÇÃO: libero o update para papel clínico do próprio tenant, e a guarda
   passa a ser o que realmente impede alterar item executado. Ela roda em
   onRecordUpdateRequest, ANTES de gravar, e recusa mudança de procedimento,
   dente, valor ou quantidade quando o status já é 'executado'.

   createRule e deleteRule seguem nulos: criar item fora da rota faria item sem
   versão consistente, e apagar destruiria histórico. */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('item_tratamento')
    col.updateRule =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'dentista')"
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('item_tratamento')
    col.updateRule = null
    app.save(col)
  },
)
