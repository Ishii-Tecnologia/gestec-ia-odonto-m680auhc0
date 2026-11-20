/* Migration 0010 - Separa "ativar" de "desativar" na auditoria

   Bug encontrado ao conferir a trilha: as duas ações (ativar e desativar)
   gravavam acao = 'desativar_usuario', porque o valor 'ativar_usuario' não
   existia no select. Uma trilha de auditoria que diz "desativou" quando
   alguém foi reativado é pior que trilha nenhuma: engana quem investiga.

   Aqui o valor novo é adicionado ao select. Os registros já gravados ficam
   como estão (não se reescreve auditoria), mas o campo `motivo` de cada um
   já dizia "ativou <email>" ou "desativou <email>", então a informação
   correta nunca se perdeu. */

migrate(
  (app) => {
    const auditoria = app.findCollectionByNameOrId('auditoria_acesso')
    const campo = auditoria.fields.getByName('acao')

    const valores = campo.values || []
    if (valores.indexOf('ativar_usuario') < 0) {
      // insere antes de 'desativar_usuario' para a lista ficar legível
      const novos = []
      for (const v of valores) {
        if (v === 'desativar_usuario') novos.push('ativar_usuario')
        novos.push(v)
      }
      campo.values = novos
      app.save(auditoria)
    }
  },
  (app) => {
    const auditoria = app.findCollectionByNameOrId('auditoria_acesso')
    const campo = auditoria.fields.getByName('acao')
    campo.values = (campo.values || []).filter((v) => v !== 'ativar_usuario')
    app.save(auditoria)
  },
)
