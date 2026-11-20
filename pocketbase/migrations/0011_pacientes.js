/* Migration 0011 - Pacientes (Etapa 5)

   Coleções:
   - paciente: cadastro + endereço. Dado pessoal (LGPD), não dado clínico.
   - responsavel_legal: obrigatório para menor de 18 anos.
   - alerta_clinico: alergia, condição sistêmica, medicação, gestação.
   - anamnese: histórico em VERSÕES. Sem update e sem delete.

   QUEM VÊ O QUÊ (decisão, não descuido):
   - paciente: todos os papéis do tenant. A recepção precisa cadastrar e
     agendar; esconder o cadastro inviabiliza o trabalho dela.
   - alerta_clinico: LEITURA para todos os papéis do tenant, inclusive
     recepção e financeiro. Motivo: uma alergia a látex ou a dipirona é
     informação de segurança. Se a recepção não vê, ela marca a consulta e
     ninguém percebe. Aqui segurança da pessoa vence o sigilo do dado.
   - anamnese: SÓ papéis clínicos. É histórico clínico completo; a recepção
     não tem o que fazer com ele — e é dado sensível.
   - Escrita de alerta e anamnese: só papéis clínicos (o dentista registra).

   anamnese sem updateRule e sem deleteRule porque histórico clínico não se
   reescreve: corrigir é criar a versão seguinte. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id

    const todosDoTenant = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    const clinicos =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'dentista')"
    // cadastro de paciente: recepção também cadastra
    const quemCadastra =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'recepcao' || @request.auth.papel = 'dentista')"

    // ---------- paciente ----------
    const paciente = new Collection({
      name: 'paciente',
      type: 'base',
      listRule: todosDoTenant,
      viewRule: todosDoTenant,
      createRule: quemCadastra,
      updateRule: quemCadastra,
      deleteRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && @request.auth.papel = 'proprietario'",
      fields: [
        {
          name: 'tenant_id',
          type: 'relation',
          required: true,
          collectionId: tenantId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'nome', type: 'text', required: true, max: 160 },
        { name: 'cpf', type: 'text', max: 11 },
        { name: 'data_nascimento', type: 'date' },
        {
          name: 'sexo',
          type: 'select',
          values: ['feminino', 'masculino', 'outro', 'nao_informado'],
          maxSelect: 1,
        },
        { name: 'email', type: 'email' },
        { name: 'telefone', type: 'text', max: 20 },
        { name: 'cep', type: 'text', max: 8 },
        { name: 'logradouro', type: 'text' },
        { name: 'numero', type: 'text', max: 20 },
        { name: 'complemento', type: 'text' },
        { name: 'bairro', type: 'text' },
        { name: 'cidade', type: 'text' },
        { name: 'uf', type: 'text', max: 2 },
        { name: 'observacoes', type: 'text', max: 2000 },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_paciente_cpf ON paciente (tenant_id, cpf) WHERE cpf != ''",
        'CREATE INDEX idx_paciente_nome ON paciente (tenant_id, nome)',
      ],
    })
    app.save(paciente)

    // ---------- responsavel_legal ----------
    const responsavel = new Collection({
      name: 'responsavel_legal',
      type: 'base',
      listRule: todosDoTenant,
      viewRule: todosDoTenant,
      createRule: quemCadastra,
      updateRule: quemCadastra,
      deleteRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && @request.auth.papel = 'proprietario'",
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
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: paciente.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'nome', type: 'text', required: true, max: 160 },
        { name: 'cpf', type: 'text', max: 11 },
        {
          name: 'parentesco',
          type: 'select',
          values: ['mae', 'pai', 'avo', 'tutor', 'outro'],
          maxSelect: 1,
        },
        { name: 'telefone', type: 'text', max: 20 },
        { name: 'email', type: 'email' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_responsavel_paciente ON responsavel_legal (paciente_id)'],
    })
    app.save(responsavel)

    // ---------- alerta_clinico ----------
    const alerta = new Collection({
      name: 'alerta_clinico',
      type: 'base',
      listRule: todosDoTenant,
      viewRule: todosDoTenant,
      createRule: clinicos,
      updateRule: clinicos,
      deleteRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
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
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: paciente.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['alergia', 'condicao_sistemica', 'medicacao', 'gestacao', 'outro'],
          maxSelect: 1,
        },
        { name: 'descricao', type: 'text', required: true, max: 500 },
        {
          name: 'gravidade',
          type: 'select',
          required: true,
          values: ['baixa', 'media', 'alta', 'critica'],
          maxSelect: 1,
        },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_alerta_paciente ON alerta_clinico (paciente_id, ativo)',
        'CREATE INDEX idx_alerta_tenant_gravidade ON alerta_clinico (tenant_id, gravidade)',
      ],
    })
    app.save(alerta)

    // ---------- anamnese ----------
    // Sem updateRule e sem deleteRule: null. Histórico clínico só cresce.
    const anamnese = new Collection({
      name: 'anamnese',
      type: 'base',
      listRule: clinicos,
      viewRule: clinicos,
      createRule: clinicos,
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
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: paciente.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'versao', type: 'number', required: true },
        { name: 'respostas', type: 'json' },
        {
          name: 'autor_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'observacoes', type: 'text', max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_anamnese_versao ON anamnese (paciente_id, versao)',
        'CREATE INDEX idx_anamnese_paciente ON anamnese (paciente_id, created DESC)',
      ],
    })
    app.save(anamnese)
  },
  (app) => {
    ;['anamnese', 'alerta_clinico', 'responsavel_legal', 'paciente'].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    })
  },
)
