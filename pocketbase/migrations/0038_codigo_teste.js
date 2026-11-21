/* Migration 0038 — campo de teste do código (Etapa 13)

   A 0037 já foi aplicada, então este campo não pode entrar nela: migration
   aplicada não roda de novo, e editar o arquivo não muda o banco.

   `codigo_teste` só é preenchido para contas @demo.gestec.local, cujo e-mail é
   fictício e portanto nunca recebe nada. Serve para provar o fluxo de duas
   etapas de ponta a ponta. Contas reais nunca têm esse sufixo. */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('autenticacao_fator')
    let tem = false
    for (const f of col.fields) if (f.name === 'codigo_teste') tem = true
    if (!tem) {
      col.fields.add(new TextField({ name: 'codigo_teste', required: false, max: 10 }))
      app.save(col)
      console.log('[2fa] campo codigo_teste criado')
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('autenticacao_fator')
      col.fields.removeByName('codigo_teste')
      app.save(col)
    } catch (_) {}
  },
)
