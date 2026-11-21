/* Migration 0032 - Financeiro gerencial: coleções (Etapa 11)

   Cinco coleções. Três decisões que definem a etapa:

   1. `retirada_socio` é coleção SEPARADA de `despesa`.
      Retirada de sócio não é despesa operacional. Se entrasse em `despesa`, o
      DRE mostraría um "resultado" que já descontou o que o dono tirou — e o
      dono passaria a achar que a clínica dá menos lucro do que dá. Pró-labore e
      distribuição são eventos de sócio, não de operação.

   2. `despesa.recorrente` existe para o caso do 13º, férias e anuidade do
      conselho: reconhecido no mês da competência (entra no DRE daquele mês),
      pago na data própria. Sem essa marca, ou se reconhece no pagamento (e o
      DRE mente no mês) ou se reconhece no mês (e ninguém sabe que falta pagar).

   3. `comunicacao` nasce aqui, e não na Etapa 13, porque a régua de cobrança
      já depende dela. Criar depois exigiria refazer a régua. A Etapa 13
      reutiliza.

   `fechamento_caixa.diferenca_centavos` é DERIVADO (conferido − sistema) e
   gravado pela rota: diferença digitada à mão permite esconder quebra de caixa.
   Mais importante: `responsavel` é obrigatório — fechamento sem nome não serve
   para nada, é justamente o que se quer saber quando falta dinheiro. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id
    const unidadeId = app.findCollectionByNameOrId('unidade').id
    const profId = app.findCollectionByNameOrId('profissional').id
    const espId = app.findCollectionByNameOrId('especialidade').id
    const pcId = app.findCollectionByNameOrId('plano_contas').id
    const formaId = app.findCollectionByNameOrId('forma_pagamento').id
    const pacId = app.findCollectionByNameOrId('paciente').id

    const leitura = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    /* Gerencial é assunto de dono. Recepção não vê DRE, despesa nem fechamento
       com diferença: são números da empresa, não da operação do balcão. */
    const gestao =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')"

    // ---------- centro_custo ----------
    const centro = new Collection({
      name: 'centro_custo',
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
        { name: 'nome', type: 'text', required: true, max: 160 },
        // os três são opcionais e combináveis: "cadeira 2", "Dra. Ana",
        // "Ortodontia" e "Unidade Centro / Dra. Ana" são centros válidos
        {
          name: 'unidade_id',
          type: 'relation',
          collectionId: unidadeId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'profissional_id',
          type: 'relation',
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'especialidade_id',
          type: 'relation',
          collectionId: espId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_centro_nome ON centro_custo (tenant_id, nome)'],
    })
    app.save(centro)

    const centroId = app.findCollectionByNameOrId('centro_custo').id

    // ---------- despesa ----------
    const despesa = new Collection({
      name: 'despesa',
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
        { name: 'fornecedor', type: 'text', required: true, max: 160 },
        { name: 'descricao', type: 'text', max: 300 },
        {
          name: 'plano_contas_id',
          type: 'relation',
          required: true,
          collectionId: pcId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'centro_custo_id',
          type: 'relation',
          collectionId: centroId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'valor_centavos', type: 'number', required: true, min: 1, onlyInt: true },
        /* Mês da competência: quando a despesa "aconteceu" para o DRE.
           Diferente do vencimento (quando sai do caixa). */
        { name: 'data_competencia', type: 'date', required: true },
        { name: 'vencimento', type: 'date', required: true },
        /* Vazio = a pagar. Preenchido = paga. */
        { name: 'pago_em', type: 'date' },
        /* Reconhecida todo mês, paga na data própria (13º, férias, anuidade). */
        { name: 'recorrente', type: 'bool' },
        { name: 'observacao', type: 'text', max: 1000 },
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
        'CREATE INDEX idx_despesa_comp ON despesa (tenant_id, data_competencia)',
        'CREATE INDEX idx_despesa_venc ON despesa (tenant_id, vencimento)',
        'CREATE INDEX idx_despesa_plano ON despesa (tenant_id, plano_contas_id)',
      ],
    })
    app.save(despesa)

    // ---------- fechamento_caixa ----------
    const fechamento = new Collection({
      name: 'fechamento_caixa',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: null, // diferença é derivada: só a rota grava
      updateRule: null,
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
        { name: 'data', type: 'date', required: true },
        {
          name: 'forma_pagamento_id',
          type: 'relation',
          required: true,
          collectionId: formaId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        /* Quanto o SISTEMA diz que entrou nesta forma, neste dia.
           Calculado a partir dos pagamentos, não digitado — senão o
           "valor do sistema" vira o número que o operador quiser. */
        { name: 'valor_sistema_centavos', type: 'number', min: 0, onlyInt: true },
        { name: 'valor_conferido_centavos', type: 'number', required: true, min: 0, onlyInt: true },
        /* DERIVADO: conferido − sistema. Gravado pela rota. */
        { name: 'diferenca_centavos', type: 'number', onlyInt: true },
        /* Quem contou o dinheiro. Obrigatório: fechamento sem nome não serve
           para nada — é justamente o que se quer saber quando falta. */
        {
          name: 'responsavel',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'observacao', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        /* Um fechamento por dia e forma: dois fechamentos do mesmo caixa
           permitiriam "fechar de novo" até o número bater. */
        'CREATE UNIQUE INDEX idx_fechamento_dia ON fechamento_caixa (tenant_id, data, forma_pagamento_id)',
      ],
    })
    app.save(fechamento)

    // ---------- retirada_socio ----------
    const retirada = new Collection({
      name: 'retirada_socio',
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
        { name: 'valor_centavos', type: 'number', required: true, min: 1, onlyInt: true },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['prolabore', 'distribuicao'],
        },
        { name: 'data_competencia', type: 'date', required: true },
        { name: 'observacao', type: 'text', max: 500 },
        {
          name: 'socio_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_retirada_comp ON retirada_socio (tenant_id, data_competencia)'],
    })
    app.save(retirada)

    // ---------- comunicacao ----------
    const comunicacao = new Collection({
      name: 'comunicacao',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      // gravada pela régua (cron) e por rotas; cliente não cria
      createRule: null,
      updateRule: null,
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
        {
          name: 'paciente_id',
          type: 'relation',
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'canal',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['email', 'whatsapp', 'sms'],
        },
        {
          name: 'tipo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['confirmacao', 'retorno', 'aniversario', 'cobranca'],
        },
        { name: 'destinatario', type: 'text', max: 200 },
        { name: 'assunto', type: 'text', max: 200 },
        { name: 'corpo', type: 'text', max: 5000 },
        /* Referência ao título que originou a cobrança: permite saber quantas
           tentativas já foram feitas para AQUELE título, e não cair em loop
           mandando D+1 todo dia. */
        {
          name: 'titulo_receber_id',
          type: 'relation',
          collectionId: app.findCollectionByNameOrId('titulo_receber').id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'etapa_regua', type: 'text', max: 20 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['enviado', 'falhou', 'entregue'],
        },
        { name: 'erro', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_com_titulo ON comunicacao (titulo_receber_id, created)',
        'CREATE INDEX idx_com_tenant ON comunicacao (tenant_id, created DESC)',
      ],
    })
    app.save(comunicacao)
  },
  (app) => {
    ;['comunicacao', 'retirada_socio', 'fechamento_caixa', 'despesa', 'centro_custo'].forEach(
      (n) => {
        try {
          app.delete(app.findCollectionByNameOrId(n))
        } catch (_) {}
      },
    )
  },
)
