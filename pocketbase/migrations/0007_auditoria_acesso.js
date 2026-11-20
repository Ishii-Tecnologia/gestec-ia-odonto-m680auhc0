/* Migration 0007 - Auditoria de acesso (Etapa 4)

   auditoria_acesso e a trilha de quem abriu dado sensivel. Regras:
   - create: qualquer usuario autenticado do proprio tenant (a tela clinica
     registra o proprio acesso);
   - list/view: SO proprietario e gestor — a recepcao nao enxerga a trilha;
   - update e delete: NULOS, de proposito. Registro de auditoria que pode ser
     alterado ou apagado nao e auditoria. Como null = superusuario, a trilha
     continua visivel no painel do Skip para suporte, mas nenhum usuario do
     app consegue reescreve-la.

   Nao ha campo tenant_id auto-editavel: o create exige que o tenant_id do
   corpo seja o do proprio usuario, entao nao da para gravar acesso em nome
   de outra clinica. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id

    let auditoria
    try {
      auditoria = app.findCollectionByNameOrId('auditoria_acesso')
    } catch (_) {
      auditoria = new Collection({
        name: 'auditoria_acesso',
        type: 'base',
        listRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        viewRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        createRule: "@request.auth.id != '' && tenant_id = @request.auth.tenant_id",
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'tenant_id',
            type: 'relation',
            required: true,
            collectionId: tenantId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'usuario_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
            cascadeDelete: false,
          },
          // paciente_id entra como texto por enquanto: a colecao paciente e da
          // Etapa 5. Migration futura troca por relation quando ela existir.
          { name: 'paciente_id', type: 'text', max: 40 },
          {
            name: 'acao',
            type: 'select',
            required: true,
            values: [
              'login',
              'logout',
              'ver_prontuario',
              'ver_odontograma',
              'ver_paciente',
              'editar_prontuario',
              'exportar',
              'tentativa_negada',
              'convite_usuario',
              'desativar_usuario',
              'trocar_papel',
            ],
            maxSelect: 1,
          },
          { name: 'ip', type: 'text', max: 45 },
          { name: 'motivo', type: 'text', max: 500 },
          { name: 'rota', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: [
          'CREATE INDEX idx_auditoria_tenant_created ON auditoria_acesso (tenant_id, created DESC)',
          'CREATE INDEX idx_auditoria_usuario ON auditoria_acesso (tenant_id, usuario_id)',
          'CREATE INDEX idx_auditoria_paciente ON auditoria_acesso (paciente_id)',
        ],
      })
      app.save(auditoria)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('auditoria_acesso'))
    } catch (_) {}
  },
)
