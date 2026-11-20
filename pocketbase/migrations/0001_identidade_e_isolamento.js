/* Migration 0001 - Identidade e isolamento (Etapa 2)
   - tenant: a clinica (CNPJ). Raiz do isolamento multi-tenant.
   - users: estendida com tenant, papel e campos de controle.
   - Campos que concedem poder (papel, tenant_id) NAO podem ser auto-editados.

   Regra de acesso em PocketBase e um filtro avaliado na API, nao um RLS de
   banco. Codigo de hook roda como admin e ignora estas regras: por isso toda
   logica de servidor precisa repetir o filtro por tenant_id. */

migrate(
  (app) => {
    // ---------- tenant ----------
    const tenant = new Collection({
      name: 'tenant',
      type: 'base',
      listRule: "@request.auth.id != '' && id = @request.auth.tenant_id",
      viewRule: "@request.auth.id != '' && id = @request.auth.tenant_id",
      createRule: null,
      updateRule:
        "@request.auth.id != '' && id = @request.auth.tenant_id && @request.auth.papel = 'proprietario'",
      deleteRule: null,
      fields: [
        { name: 'cnpj', type: 'text', required: true, min: 14, max: 14 },
        { name: 'razao_social', type: 'text', required: true },
        { name: 'nome_fantasia', type: 'text' },
        { name: 'municipio', type: 'text' },
        { name: 'uf', type: 'text', max: 2 },
        {
          name: 'regime_tributario',
          type: 'select',
          values: ['simples', 'lucro_presumido', 'lucro_real', 'mei'],
          maxSelect: 1,
        },
        { name: 'email_contato', type: 'email' },
        { name: 'telefone', type: 'text' },
        { name: 'ativo', type: 'bool' },
        {
          name: 'demo',
          type: 'bool',
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_tenant_cnpj ON tenant (cnpj)',
        'CREATE INDEX idx_tenant_demo ON tenant (demo)',
      ],
    })
    app.save(tenant)

    // ---------- users ----------
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    users.fields.add(new TextField({ name: 'nome', required: false }))
    users.fields.add(
      new RelationField({
        name: 'tenant_id',
        collectionId: tenant.id,
        maxSelect: 1,
        cascadeDelete: false,
      }),
    )
    users.fields.add(
      new SelectField({
        name: 'papel',
        values: ['proprietario', 'gestor', 'dentista', 'recepcao', 'financeiro'],
        maxSelect: 1,
      }),
    )
    users.fields.add(new BoolField({ name: 'ativo' }))
    users.fields.add(new BoolField({ name: 'precisa_trocar_senha' }))

    // list/view: so o proprio tenant.
    users.listRule = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    users.viewRule = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"

    // create: apenas proprietario ou gestor do tenant.
    users.createRule =
      "@request.auth.id != '' && @request.auth.papel = 'proprietario' && tenant_id = @request.auth.tenant_id"

    // update: o usuario edita o proprio cadastro, mas NUNCA o papel nem o
    // tenant. Sem este bloqueio, qualquer usuario se promove a proprietario
    // pela API e o isolamento inteiro cai.
    users.updateRule =
      'id = @request.auth.id && @request.body.papel:changed = false && @request.body.tenant_id:changed = false'

    // delete: so proprietario do mesmo tenant.
    users.deleteRule =
      "@request.auth.id != '' && @request.auth.papel = 'proprietario' && tenant_id = @request.auth.tenant_id"

    app.save(users)

    app.db().newQuery('CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id)').execute()
  },
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    ;['nome', 'tenant_id', 'papel', 'ativo', 'precisa_trocar_senha'].forEach((f) => {
      try {
        users.fields.removeByName(f)
      } catch (_) {}
    })
    app.save(users)

    try {
      app.delete(app.findCollectionByNameOrId('tenant'))
    } catch (_) {}
  },
)
