/* Migration 0020 - Catálogo e preços (Etapa 8)

   OBJETIVO: ter o que cobrar antes de montar orçamento. Quatro coleções e um
   campo novo em `paciente`.

   TRÊS DECISÕES QUE VALEM EXPLICAR:

   1. `paciente.convenio_id` (novo campo, opcional).
      O plano pede "ao selecionar um paciente, resolver qual tabela de preço se
      aplica". Sem saber o convênio do paciente, isso é impossível. Nulo =
      particular. Não é faturamento de convênio (proibido nesta etapa): é só a
      chave que escolhe a tabela.

   2. `procedimento.codigo` é ÚNICO por tenant.
      Código repetido quebra importação e orçamento, e é o tipo de erro que
      passa despercebido até alguém cobrar o código errado. Índice UNIQUE
      resolve no banco, não na tela.

   3. `tabela_preco_item` é ÚNICO por (tabela, procedimento).
      Dois preços para o mesmo procedimento na mesma tabela não têm
      interpretação correta — nenhuma das duas escolhas é defensável. Recuso no
      banco.

   SOBRE VIGÊNCIA: não há índice que impeça dois períodos sobrepostos na mesma
   tabela (SQLite não tem EXCLUDE, e sobreposição de intervalo não é expressável
   em UNIQUE). Então a checagem fica na ROTA /backend/v1/salvar-tabela-preco —
   e está documentada lá por que ela é necessária: duas tabelas vigentes do
   mesmo convênio fariam o preço depender da ordem da consulta.

   `tabela_preco_item` não tem base própria de tenant lógica, mas guarda
   tenant_id denormalizado: a access rule do PocketBase não consulta outra
   coleção, então sem ele a regra não teria como isolar a clínica. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id
    const espId = app.findCollectionByNameOrId('especialidade').id
    const pacId = app.findCollectionByNameOrId('paciente').id

    const leitura = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    // Catálogo é operado por quem atende e por quem administra. Recepção
    // consulta preço para orçar, mas não altera tabela de preço.
    const edita =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'dentista')"
    const apaga =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')"

    // ---------- convenio ----------
    const convenio = new Collection({
      name: 'convenio',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: edita,
      updateRule: edita,
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
        { name: 'nome', type: 'text', required: true, max: 160 },
        // Registro ANS é dado cadastral do convênio. Não é integração TISS.
        { name: 'registro_ans', type: 'text', max: 20 },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_convenio_nome ON convenio (tenant_id, nome)'],
    })
    app.save(convenio)

    // ---------- procedimento ----------
    const procedimento = new Collection({
      name: 'procedimento',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: edita,
      updateRule: edita,
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
        { name: 'codigo', type: 'text', required: true, max: 40 },
        { name: 'nome', type: 'text', required: true, max: 200 },
        {
          name: 'especialidade_id',
          type: 'relation',
          collectionId: espId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        // Procedimento que é feito "por dente" precisa de seleção de dente no
        // orçamento; os demais não. Sem esta marca, a Etapa 9 teria de
        // adivinhar pela descrição.
        { name: 'por_dente', type: 'bool' },
        { name: 'dentes_aplicaveis', type: 'text', max: 200 },
        { name: 'ativo', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_procedimento_codigo ON procedimento (tenant_id, codigo)',
        'CREATE INDEX idx_procedimento_nome ON procedimento (tenant_id, nome)',
      ],
    })
    app.save(procedimento)

    // ---------- tabela_preco ----------
    const tabelaPreco = new Collection({
      name: 'tabela_preco',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      // Escrita pela rota: ela confere sobreposição de vigência, que nenhum
      // índice consegue garantir. Ver /backend/v1/salvar-tabela-preco.
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
        { name: 'nome', type: 'text', required: true, max: 160 },
        {
          // NULO = tabela particular. É a chave de resolução de preço.
          name: 'convenio_id',
          type: 'relation',
          collectionId: convenio.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'vigencia_inicio', type: 'date', required: true },
        { name: 'vigencia_fim', type: 'date' },
        { name: 'ativa', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_tabela_convenio ON tabela_preco (tenant_id, convenio_id)',
        'CREATE INDEX idx_tabela_vigencia ON tabela_preco (tenant_id, vigencia_inicio)',
      ],
    })
    app.save(tabelaPreco)

    // ---------- tabela_preco_item ----------
    const item = new Collection({
      name: 'tabela_preco_item',
      type: 'base',
      listRule: leitura,
      viewRule: leitura,
      createRule: edita,
      updateRule: edita,
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
          name: 'tabela_preco_id',
          type: 'relation',
          required: true,
          collectionId: tabelaPreco.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'procedimento_id',
          type: 'relation',
          required: true,
          collectionId: procedimento.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        /* Dinheiro em CENTAVOS INTEIROS, nunca float.
           Ponto flutuante não representa 0,10 exatamente, e erro de
           arredondamento em preço vira discussão com o paciente. */
        { name: 'valor_centavos', type: 'number', required: true, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_item_unico ON tabela_preco_item (tabela_preco_id, procedimento_id)',
        'CREATE INDEX idx_item_tabela ON tabela_preco_item (tabela_preco_id)',
      ],
    })
    app.save(item)

    // ---------- campo novo em paciente ----------
    const pac = app.findCollectionByNameOrId('paciente')
    if (!pac.fields.getByName('convenio_id')) {
      pac.fields.add(
        new RelationField({
          name: 'convenio_id',
          collectionId: convenio.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
      app.save(pac)
    }
  },
  (app) => {
    ;['tabela_preco_item', 'tabela_preco', 'procedimento', 'convenio'].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    })
  },
)
