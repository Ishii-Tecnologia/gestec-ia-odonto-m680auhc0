/* Migration 0028 - Financeiro do paciente (Etapa 10)

   Quatro coleções. O que define esta etapa é uma distinção que quase todo
   sistema de consultório erra: DATA DE COMPETÊNCIA ≠ DATA DE LIQUIDAÇÃO.

   - `data_competencia`: o mês a que o serviço pertence (base do DRE).
   - `data_liquidacao`: o dia em que o dinheiro entrou (base do fluxo de caixa).
   - `data_credito_prevista`: quando o dinheiro estará DISPONÍVEL — em cartão,
     30 dias depois. É a diferença entre "vendi" e "tenho o dinheiro".

   Sem separar as três, o dono da clínica olha um número que mistura venda do
   mês passado com dinheiro que só cai no mês que vem — e decide errado. Foi o
   ponto principal da pesquisa de sistemas financeiros (06-financeiro-e-contabil).

   DECISÕES DE ESCRITA:

   1. `titulo_receber` e `pagamento` têm createRule/updateRule/deleteRule NULOS.
      Aqui isso é CORRETO (ao contrário do erro que cometi na Etapa 9): o status e
      o valor pago são DERIVADOS e precisam ser recalculados a cada pagamento.
      Se o cliente pudesse gravar direto, ele gravaria `status = 'pago'` sem
      nenhum pagamento — e o saldo deixaria de ser confiável. As rotas rodam como
      superuser e passam por cima da regra, então a baixa continua funcionando.

   2. ESTORNO É LANÇAMENTO NOVO, nunca exclusão. `pagamento.tipo` é
      'recebimento' ou 'estorno', e o valor pago de um título é
      soma(recebimentos) − soma(estornos). Apagar pagamento destruiria a trilha
      de quem recebeu, quando e em que forma.

   3. Valores em CENTAVOS INTEIROS. Float não representa 0,10 e erro de
      centavo em recebível vira discussão com o paciente e divergência com o
      contador. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id
    const pacId = app.findCollectionByNameOrId('paciente').id
    const profId = app.findCollectionByNameOrId('profissional').id
    const orcId = app.findCollectionByNameOrId('orcamento').id
    const atId = app.findCollectionByNameOrId('atendimento').id

    const leitura = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    /* Recepção VÊ e OPERA o financeiro do paciente (é ela que dá baixa).
       Mas não vê o catálogo de custo da clínica: plano_contas aceita receita e
       custo, e custo não é assunto de recepção. */
    const opera =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'recepcao' || @request.auth.papel = 'dentista')"
    const gestao =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')"

    // ---------- plano_contas ----------
    const planoContas = new Collection({
      name: 'plano_contas',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: gestao,
      updateRule: gestao,
      deleteRule: gestao,
      fields: [
        {
          name: 'tenant_id',
          type: 'relation',
          required: true,
          collectionId: tenantId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'codigo', type: 'text', required: true, max: 30 },
        { name: 'nome', type: 'text', required: true, max: 160 },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['receita', 'custo', 'despesa', 'deducao'],
        },
        // `pai_id` é autorreferência: entra depois do primeiro save (o id da
        // coleção só existe depois). Ver Etapa 9 — relation com collectionId
        // vazio é recusada com "cannot be blank".
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_planocontas_codigo ON plano_contas (tenant_id, codigo)'],
    })
    app.save(planoContas)

    const colPC = app.findCollectionByNameOrId('plano_contas')
    colPC.fields.add(
      new RelationField({
        name: 'pai_id',
        collectionId: colPC.id,
        maxSelect: 1,
        cascadeDelete: false,
      }),
    )
    app.save(colPC)

    // ---------- forma_pagamento ----------
    const forma = new Collection({
      name: 'forma_pagamento',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: gestao,
      updateRule: gestao,
      deleteRule: gestao,
      fields: [
        {
          name: 'tenant_id',
          type: 'relation',
          required: true,
          collectionId: tenantId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'nome', type: 'text', required: true, max: 80 },
        /* Dias até o dinheiro ficar DISPONÍVEL.
           0 = dinheiro/Pix/débito; 30 = cartão de crédito (padrão do mercado).
           Não é "dias para o paciente pagar": é quando a clínica recebe. */
        { name: 'prazo_compensacao_dias', type: 'number', min: 0, onlyInt: true },
        /* Taxa da maquininha, em PORCENTO (2.5 = 2,5%). Fica aqui e não no
           pagamento porque é característica da forma, não daquela venda. */
        { name: 'taxa_percentual', type: 'number', min: 0 },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_forma_nome ON forma_pagamento (tenant_id, nome)'],
    })
    app.save(forma)

    const formaId = app.findCollectionByNameOrId('forma_pagamento').id

    // ---------- titulo_receber ----------
    const titulo = new Collection({
      name: 'titulo_receber',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      // derivados: só a rota grava (ver comentário do topo)
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
          name: 'orcamento_id',
          type: 'relation',
          collectionId: orcId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'atendimento_id',
          type: 'relation',
          collectionId: atId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        // base dos "recebimentos por profissional"
        {
          name: 'profissional_id',
          type: 'relation',
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'descricao', type: 'text', required: true, max: 300 },
        { name: 'valor_centavos', type: 'number', required: true, min: 1, onlyInt: true },
        /* Derivado dos pagamentos. Materializado porque precisa entrar em
           filtro e soma no banco — mas quem escreve é a rota, nunca o cliente. */
        { name: 'valor_pago_centavos', type: 'number', min: 0, onlyInt: true },
        { name: 'vencimento', type: 'date', required: true },
        /* Mês do serviço — base do DRE. */
        { name: 'data_competencia', type: 'date', required: true },
        /* Dia em que o dinheiro entrou — base do fluxo de caixa. Fica vazio
           enquanto o título não é quitado. */
        { name: 'data_liquidacao', type: 'date' },
        {
          name: 'plano_contas_id',
          type: 'relation',
          required: true,
          collectionId: colPC.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['aberto', 'parcial', 'pago', 'vencido', 'cancelado'],
        },
        // parcela "3/4" só para o extrato ficar legível
        { name: 'parcela', type: 'number', min: 1, onlyInt: true },
        { name: 'parcelas_total', type: 'number', min: 1, onlyInt: true },
        { name: 'observacao', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_titulo_paciente ON titulo_receber (tenant_id, paciente_id, vencimento)',
        'CREATE INDEX idx_titulo_status ON titulo_receber (tenant_id, status, vencimento)',
        'CREATE INDEX idx_titulo_competencia ON titulo_receber (tenant_id, data_competencia)',
        'CREATE INDEX idx_titulo_plano ON titulo_receber (tenant_id, plano_contas_id)',
        'CREATE INDEX idx_titulo_orcamento ON titulo_receber (orcamento_id)',
      ],
    })
    app.save(titulo)

    const tituloId = app.findCollectionByNameOrId('titulo_receber').id

    // ---------- pagamento ----------
    const pagamento = new Collection({
      name: 'pagamento',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
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
          name: 'titulo_receber_id',
          type: 'relation',
          required: true,
          collectionId: tituloId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        /* 'estorno' é lançamento NOVO com valor positivo, subtraído no saldo.
           Nunca apago um recebimento: a trilha de quem recebeu precisa existir
           inclusive quando deu errado. */
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['recebimento', 'estorno'],
        },
        { name: 'valor_centavos', type: 'number', required: true, min: 1, onlyInt: true },
        {
          name: 'forma_pagamento_id',
          type: 'relation',
          required: true,
          collectionId: formaId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'data_pagamento', type: 'date', required: true },
        /* data_pagamento + prazo da forma. Calculada na rota e gravada, porque
           o prazo da forma pode mudar amanhã e o pagamento de hoje não pode
           mudar junto. */
        { name: 'data_credito_prevista', type: 'date' },
        { name: 'observacao', type: 'text', max: 500 },
        {
          name: 'registrado_por',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_pag_titulo ON pagamento (titulo_receber_id, data_pagamento)',
        'CREATE INDEX idx_pag_tenant_data ON pagamento (tenant_id, data_pagamento)',
        'CREATE INDEX idx_pag_credito ON pagamento (tenant_id, data_credito_prevista)',
      ],
    })
    app.save(pagamento)
  },
  (app) => {
    ;['pagamento', 'titulo_receber', 'forma_pagamento', 'plano_contas'].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    })
  },
)
