/* Migration 0013 - Agenda (Etapa 6)

   OBJETIVO: impedir sobreposição de horário com garantia de BANCO, não de tela.
   SQLite não tem EXCLUDE (o recurso do Postgres que recusaria intervalo
   sobreposto). Validação na aplicação não sobrevive a duas abas abertas ou a
   duas recepcionistas clicando juntas.

   SOLUÇÃO: materializar cada agendamento em blocos de 15 minutos numa tabela
   `agenda_slot`, com índice UNIQUE em (profissional_id, inicio) e em
   (sala_id, inicio). Dois agendamentos que disputem o mesmo bloco do mesmo
   profissional colidem no índice — e o SQLite recusa a segunda escrita, mesmo
   em envio simultâneo, porque é o próprio motor que valida.

   Por que 15 minutos: é a granularidade que o plano define e cobre a grade
   real do consultório. Um agendamento de 30 min ocupa 2 slots; de 45 min, 3.

   POR QUE UM SLOT POR BLOCO (e não dois registros, um de profissional e outro
   de sala): com um registro contendo AMBOS os campos, o mesmo INSERT colide
   tanto no índice do profissional quanto no da sala. Menos linhas, mesma
   garantia, e o UNIQUE cobre os dois eixos de uma vez.

   `agendamento_id` e `bloqueio_id` são opcionais: o slot pode vir de um
   agendamento (alguém marcado) ou de um bloqueio (almoço, folga, feriado).
   Um dos dois sempre existe; quem garante é a rota que grava. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id
    const unidadeId = app.findCollectionByNameOrId('unidade').id
    const salaId = app.findCollectionByNameOrId('sala').id
    const profId = app.findCollectionByNameOrId('profissional').id
    const pacId = app.findCollectionByNameOrId('paciente').id

    const leitura = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    // Agenda é operada pela recepção — ela precisa criar e mexer.
    const opera =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'recepcao' || @request.auth.papel = 'dentista')"
    const apaga =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')"

    // ---------- agendamento ----------
    const agendamento = new Collection({
      name: 'agendamento',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      // Criação e reagendamento passam pela rota /backend/v1/agendar, que grava
      // os slots na mesma transação. Create/update diretos ficam nulos para
      // ninguém gravar um agendamento sem slots (isso furaria a agenda).
      createRule: null,
      updateRule: null,
      deleteRule: apaga,
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
          collectionId: unidadeId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'sala_id',
          type: 'relation',
          required: true,
          collectionId: salaId,
          maxSelect: 1,
          cascadeDelete: false,
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
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'inicio', type: 'date', required: true },
        { name: 'fim', type: 'date', required: true },
        {
          name: 'tipo',
          type: 'select',
          values: ['avaliacao', 'retorno', 'procedimento', 'urgencia', 'outro'],
          maxSelect: 1,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          values: ['agendado', 'confirmado', 'atendido', 'faltou', 'cancelado'],
          maxSelect: 1,
        },
        {
          name: 'origem',
          type: 'select',
          values: ['recepcao', 'telefone', 'portal', 'outro'],
          maxSelect: 1,
        },
        { name: 'motivo_cancelamento', type: 'text', max: 500 },
        { name: 'observacoes', type: 'text', max: 1000 },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_agendamento_tenant_inicio ON agendamento (tenant_id, inicio)',
        'CREATE INDEX idx_agendamento_prof_inicio ON agendamento (profissional_id, inicio)',
        'CREATE INDEX idx_agendamento_sala_inicio ON agendamento (sala_id, inicio)',
        'CREATE INDEX idx_agendamento_paciente ON agendamento (paciente_id, inicio DESC)',
      ],
    })
    app.save(agendamento)

    // ---------- bloqueio_agenda ----------
    const bloqueio = new Collection({
      name: 'bloqueio_agenda',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: null,
      updateRule: null,
      deleteRule: apaga,
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
          name: 'profissional_id',
          type: 'relation',
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'sala_id',
          type: 'relation',
          collectionId: salaId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'inicio', type: 'date', required: true },
        { name: 'fim', type: 'date', required: true },
        { name: 'motivo', type: 'text', max: 200 },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_bloqueio_tenant_inicio ON bloqueio_agenda (tenant_id, inicio)'],
    })
    app.save(bloqueio)

    // ---------- agenda_slot ----------
    const agendamentoId = app.findCollectionByNameOrId('agendamento').id
    const bloqueioId = app.findCollectionByNameOrId('bloqueio_agenda').id

    const slot = new Collection({
      name: 'agenda_slot',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: null,
      updateRule: null,
      // Apagar slot direto furaria o bloqueio: slots só somem junto com o
      // agendamento ou o bloqueio, pela rota. Superusuário ainda pode, para
      // suporte e migração.
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
          name: 'profissional_id',
          type: 'relation',
          required: true,
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'sala_id',
          type: 'relation',
          required: true,
          collectionId: salaId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        // início do bloco de 15 minutos, em UTC
        { name: 'inicio', type: 'date', required: true },
        {
          name: 'agendamento_id',
          type: 'relation',
          collectionId: agendamentoId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'bloqueio_id',
          type: 'relation',
          collectionId: bloqueioId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        // AS DUAS GARANTIAS REAIS DA ETAPA. Sem estes índices, nada impede
        // dois pacientes no mesmo horário do mesmo dentista.
        'CREATE UNIQUE INDEX idx_slot_prof ON agenda_slot (profissional_id, inicio)',
        'CREATE UNIQUE INDEX idx_slot_sala ON agenda_slot (sala_id, inicio)',
        'CREATE INDEX idx_slot_agendamento ON agenda_slot (agendamento_id)',
        'CREATE INDEX idx_slot_bloqueio ON agenda_slot (bloqueio_id)',
        'CREATE INDEX idx_slot_tenant_inicio ON agenda_slot (tenant_id, inicio)',
      ],
    })
    app.save(slot)
  },
  (app) => {
    ;['agenda_slot', 'bloqueio_agenda', 'agendamento'].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    })
  },
)
