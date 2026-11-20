/* Migration 0015 - Prontuário (Etapa 7) — ETAPA CRÍTICA

   INTEGRIDADE ACIMA DE VELOCIDADE.

   Decisão de sigilo (a mais importante deste arquivo):
   `evolucao` e `odontograma_snapshot` guardam `usuario_autor_id` — o usuário
   que registrou, fixado pelo servidor a partir do token, nunca pelo corpo do
   pedido. A regra de leitura é `usuario_autor_id = @request.auth.id`.

   Por que denormalizar o usuário autor, se já existe `profissional_id`:
   a regra de acesso do PocketBase NÃO faz consulta em outra coleção, então
   não há como escrever "o profissional deste registro é o profissional
   vinculado a mim em usuario_profissional". Gravar o vínculo resolvido no
   próprio registro torna a regra uma comparação direta de campo — e ela passa
   a valer até para quem chamar a API por fora do app.

   `updateRule` e `deleteRule` NULOS em evolução e odontograma: prontuário não
   se reescreve. Corrigir é criar uma retificação referenciando a anterior.

   Proprietário e gestor NÃO têm leitura clínica automática. Eles administram,
   mas não leem prontuário de paciente que não acompanham — é o que separa
   "dono da clínica" de "profissional responsável". O caminho legítimo para
   outro profissional ler é `acesso_prontuario`, temporário e com justificativa. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id
    const pacId = app.findCollectionByNameOrId('paciente').id
    const profId = app.findCollectionByNameOrId('profissional').id
    const uniId = app.findCollectionByNameOrId('unidade').id
    const agId = app.findCollectionByNameOrId('agendamento').id

    const clinicos =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'dentista')"

    // ---------- atendimento ----------
    const atendimento = new Collection({
      name: 'atendimento',
      type: 'base',
      listRule: clinicos,
      viewRule: clinicos,
      createRule: clinicos,
      updateRule: clinicos,
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
          name: 'agendamento_id',
          type: 'relation',
          collectionId: agId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'profissional_responsavel_id',
          type: 'relation',
          required: true,
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'unidade_id',
          type: 'relation',
          collectionId: uniId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'inicio', type: 'date' },
        { name: 'fim', type: 'date' },
        {
          name: 'status',
          type: 'select',
          values: ['em_andamento', 'finalizado', 'cancelado'],
          maxSelect: 1,
        },
        { name: 'queixa_principal', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_atendimento_tenant ON atendimento (tenant_id, inicio DESC)',
        'CREATE INDEX idx_atendimento_paciente ON atendimento (paciente_id, inicio DESC)',
      ],
    })
    app.save(atendimento)

    // ---------- evolução (imutável) ----------
    // Sem `referencia_evolucao_id` ainda: relação consigo mesma precisa da
    // coleção já existente, então entra logo abaixo.
    const evolucao = new Collection({
      name: 'evolucao',
      type: 'base',
      listRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && usuario_autor_id = @request.auth.id",
      viewRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && usuario_autor_id = @request.auth.id",
      // create nulo: gravação só pela rota /backend/v1/registrar-evolucao, que
      // calcula a cadeia de hash e fixa o autor. Sem isso, qualquer um
      // gravaria evolução em nome de outro profissional.
      createRule: null,
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
          name: 'atendimento_id',
          type: 'relation',
          collectionId: atendimento.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'profissional_id',
          type: 'relation',
          required: true,
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'usuario_autor_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'texto', type: 'text', required: true, max: 20000 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          values: ['evolucao', 'retificacao'],
          maxSelect: 1,
        },
        { name: 'motivo_retificacao', type: 'text', max: 1000 },
        { name: 'hash_anterior', type: 'text', max: 64 },
        { name: 'hash_registro', type: 'text', max: 64 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX idx_evolucao_paciente ON evolucao (paciente_id, created DESC)',
        'CREATE INDEX idx_evolucao_autor ON evolucao (usuario_autor_id, paciente_id)',
      ],
    })
    app.save(evolucao)

    // agora a auto-referência da retificação
    const evolucaoSalva = app.findCollectionByNameOrId('evolucao')
    if (!evolucaoSalva.fields.getByName('referencia_evolucao_id')) {
      evolucaoSalva.fields.add(
        new RelationField({
          name: 'referencia_evolucao_id',
          collectionId: evolucaoSalva.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
      app.save(evolucaoSalva)
    }

    // ---------- odontograma por snapshot ----------
    const odonto = new Collection({
      name: 'odontograma_snapshot',
      type: 'base',
      listRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && usuario_autor_id = @request.auth.id",
      viewRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && usuario_autor_id = @request.auth.id",
      createRule: null,
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
          name: 'atendimento_id',
          type: 'relation',
          collectionId: atendimento.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'profissional_id',
          type: 'relation',
          required: true,
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'usuario_autor_id',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'dentes', type: 'json' },
        {
          name: 'denticao',
          type: 'select',
          values: ['permanente', 'decidua', 'mista'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        'CREATE INDEX idx_odonto_paciente ON odontograma_snapshot (paciente_id, created DESC)',
      ],
    })
    app.save(odonto)

    // ---------- acesso temporário ao prontuário ----------
    const acesso = new Collection({
      name: 'acesso_prontuario',
      type: 'base',
      // Quem concedeu, quem recebeu e o profissional responsável enxergam;
      // o resto só pelo painel de gestão da tela (que consulta o paciente).
      listRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (concedido_por = @request.auth.id || concedido_para = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (concedido_por = @request.auth.id || concedido_para = @request.auth.id)",
      // Concessão só pela rota: quem concede precisa ter acesso ao prontuário.
      // Se fosse createRule aberto, o dentista B se concederia acesso ao
      // paciente do dentista A — escalada de privilégio.
      createRule: null,
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
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'concedido_por',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'concedido_para',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'expira_em', type: 'date', required: true },
        { name: 'justificativa', type: 'text', required: true, max: 1000 },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_acesso_paciente ON acesso_prontuario (paciente_id, ativo, expira_em)',
        'CREATE INDEX idx_acesso_para ON acesso_prontuario (concedido_para)',
      ],
    })
    app.save(acesso)

    // ---------- resumo compartilhável ----------
    // Conteúdo REVISADO pelo responsável, em campo próprio. Nunca derivado do
    // texto da evolução: derivar vazaria justamente o que o sigilo protege.
    const resumo = new Collection({
      name: 'resumo_compartilhavel',
      type: 'base',
      listRule: clinicos,
      viewRule: clinicos,
      createRule: clinicos,
      updateRule:
        "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && usuario_autor_id = @request.auth.id",
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
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'profissional_responsavel_id',
          type: 'relation',
          required: true,
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'usuario_autor_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'conteudo', type: 'text', required: true, max: 5000 },
        { name: 'revisado_em', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_resumo_paciente ON resumo_compartilhavel (paciente_id)'],
    })
    app.save(resumo)
  },
  (app) => {
    ;[
      'resumo_compartilhavel',
      'acesso_prontuario',
      'odontograma_snapshot',
      'evolucao',
      'atendimento',
    ].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    })
  },
)
