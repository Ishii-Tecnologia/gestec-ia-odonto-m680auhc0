/* Migration 0016 - Ações de auditoria do prontuário (Etapa 7)

   A Etapa 7 grava três ações que ainda não existem no select:
   - conceder_acesso
   - revogar_acesso
   - ver_odontograma (já existia, mas confiro)

   Sem isto, o `$app.save` da auditoria falharia silenciosamente (os hooks
   engolem o erro para não derrubar a ação principal) e a trilha ficaria
   incompleta — justamente no ponto que o critério de pronto 3 exige. */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('auditoria_acesso')
    const campo = col.fields.getByName('acao')
    const valores = (campo.values || []).slice()
    let mudou = false

    const novos = ['conceder_acesso', 'revogar_acesso', 'ver_odontograma', 'ver_prontuario']
    for (const v of novos) {
      if (valores.indexOf(v) < 0) {
        valores.push(v)
        mudou = true
      }
    }

    if (mudou) {
      campo.values = valores
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('auditoria_acesso')
    const campo = col.fields.getByName('acao')
    campo.values = (campo.values || []).filter(
      (v) => ['conceder_acesso', 'revogar_acesso'].indexOf(v) < 0,
    )
    app.save(col)
  },
)
