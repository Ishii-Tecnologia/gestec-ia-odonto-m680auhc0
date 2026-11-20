/* Migration 0003 - Núcleo organizacional (Etapa 3)
   Cria a estrutura física e profissional da clínica:
   - unidade: cada endereço/filial do CNPJ
   - sala: cadeira/consultório dentro de uma unidade
   - profissional: cirurgião-dentista com CRO
   - especialidade: catálogo global das 25 especialidades do CFO
   - modulo / tenant_modulo: catálogo de módulos e o que cada clínica contratou

   Tudo com tenant_id e regra de acesso por tenant. As regras de API são a
   única barreira entre CNPJs no PocketBase: hooks rodam como admin e as
   ignoram, então quem escrever hook precisa repetir o filtro. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id

    const regraLista = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    const regraCria =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')"
    const regraEdita =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor') && @request.body.tenant_id:changed = false"
    const regraApaga =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && @request.auth.papel = 'proprietario'"

    // ---------- unidade ----------
    const unidade = new Collection({
      name: 'unidade',
      type: 'base',
      listRule: regraLista,
      viewRule: regraLista,
      createRule: regraCria,
      updateRule: regraEdita,
      deleteRule: regraApaga,
      fields: [
        {
          name: 'tenant_id',
          type: 'relation',
          required: true,
          collectionId: tenantId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'nome', type: 'text', required: true, max: 120 },
        { name: 'cnpj', type: 'text', max: 14 },
        { name: 'cep', type: 'text', max: 8 },
        { name: 'logradouro', type: 'text' },
        { name: 'numero', type: 'text', max: 20 },
        { name: 'complemento', type: 'text' },
        { name: 'bairro', type: 'text' },
        { name: 'municipio', type: 'text' },
        { name: 'uf', type: 'text', max: 2 },
        { name: 'telefone', type: 'text' },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_unidade_tenant_nome ON unidade (tenant_id, nome)'],
    })
    app.save(unidade)

    // ---------- especialidade (catálogo global do CFO) ----------
    const especialidade = new Collection({
      name: 'especialidade',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'nome', type: 'text', required: true, max: 120 },
        { name: 'codigo', type: 'text', required: true, max: 20 },
        { name: 'norma', type: 'text' },
        { name: 'ordem', type: 'number' },
        { name: 'ativa', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_especialidade_codigo ON especialidade (codigo)'],
    })
    app.save(especialidade)

    // ---------- sala ----------
    const sala = new Collection({
      name: 'sala',
      type: 'base',
      listRule: regraLista,
      viewRule: regraLista,
      createRule: regraCria,
      updateRule: regraEdita,
      deleteRule: regraApaga,
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
          name: 'unidade_id',
          type: 'relation',
          required: true,
          collectionId: unidade.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'nome', type: 'text', required: true, max: 80 },
        {
          name: 'tipo',
          type: 'select',
          values: ['cadeira', 'consultorio', 'cirurgico', 'laboratorio'],
          maxSelect: 1,
        },
        { name: 'ativa', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_sala_unidade_nome ON sala (tenant_id, unidade_id, nome)'],
    })
    app.save(sala)

    // ---------- profissional ----------
    const especialidadeId = especialidade.id

    const profissional = new Collection({
      name: 'profissional',
      type: 'base',
      listRule: regraLista,
      viewRule: regraLista,
      createRule: regraCria,
      updateRule: regraEdita,
      deleteRule: regraApaga,
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
          name: 'unidade_id',
          type: 'relation',
          collectionId: unidade.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'usuario_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'nome', type: 'text', required: true, max: 160 },
        { name: 'cro_numero', type: 'text', required: true, max: 10 },
        { name: 'cro_uf', type: 'text', required: true, max: 2 },
        { name: 'cpf', type: 'text', max: 11 },
        { name: 'email', type: 'email' },
        { name: 'telefone', type: 'text' },
        {
          name: 'especialidades',
          type: 'relation',
          collectionId: especialidadeId,
          maxSelect: 2,
          cascadeDelete: false,
        },
        { name: 'cor_agenda', type: 'text', max: 7 },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_profissional_cro ON profissional (tenant_id, cro_uf, cro_numero)',
      ],
    })
    app.save(profissional)

    // ---------- modulo (catálogo global) ----------
    const modulo = new Collection({
      name: 'modulo',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'codigo', type: 'text', required: true, max: 40 },
        { name: 'nome', type: 'text', required: true, max: 120 },
        { name: 'descricao', type: 'text' },
        { name: 'preco_centavos', type: 'number', required: true },
        { name: 'ordem', type: 'number' },
        { name: 'disponivel', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_modulo_codigo ON modulo (codigo)'],
    })
    app.save(modulo)

    // ---------- tenant_modulo ----------
    const tenantModulo = new Collection({
      name: 'tenant_modulo',
      type: 'base',
      listRule: regraLista,
      viewRule: regraLista,
      createRule: regraCria,
      updateRule: regraEdita,
      deleteRule: regraApaga,
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
          name: 'modulo_id',
          type: 'relation',
          required: true,
          collectionId: modulo.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'status',
          type: 'select',
          values: ['ativo', 'suspenso', 'cancelado'],
          maxSelect: 1,
        },
        { name: 'preco_centavos', type: 'number' },
        { name: 'contratado_em', type: 'date' },
        { name: 'cancelado_em', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_tenant_modulo ON tenant_modulo (tenant_id, modulo_id)',
        'CREATE INDEX idx_tenant_modulo_status ON tenant_modulo (tenant_id, status)',
      ],
    })
    app.save(tenantModulo)

    // índices auxiliares de FK
    ;[
      'CREATE INDEX IF NOT EXISTS idx_unidade_tenant ON unidade (tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_sala_tenant ON sala (tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_sala_unidade ON sala (unidade_id)',
      'CREATE INDEX IF NOT EXISTS idx_profissional_tenant ON profissional (tenant_id)',
    ].forEach((sql) => app.db().newQuery(sql).execute())
  },
  (app) => {
    ;['tenant_modulo', 'modulo', 'profissional', 'sala', 'especialidade', 'unidade'].forEach(
      (n) => {
        try {
          app.delete(app.findCollectionByNameOrId(n))
        } catch (_) {}
      },
    )
  },
)
