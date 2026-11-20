/* Migration 0023 - Orçamento, plano versionado e execução (Etapa 9)

   A etapa que fecha o ciclo proposto → aprovado → executado. Seis coleções.

   QUATRO DECISÕES QUE MANDAM NO RESTO DA ETAPA:

   1. `item_tratamento.valor_centavos` É SNAPSHOT DO PREÇO.
      Não é preço "resolvido na hora da leitura". Se o item guardasse só o
      procedimento e o preço viesse da tabela atual, um reajuste reescreveria o
      passado: o orçamento que o paciente aprovou em janeiro passaria a mostrar
      outro valor. Já anotei isso como pendência na Etapa 8 — aqui se resolve.
      O preço entra no item quando o plano é montado e não muda mais.

   2. SÓ A VERSÃO MAIS RECENTE CONTA PARA EXECUÇÃO E PASSIVO CLÍNICO.
      Versão 1 tinha 3 itens, um executado; versão 2 copia os 3 e o executado
      vem junto. Se eu somasse todas as versões, aquele item executado contaria
      DUAS vezes no realizado e o passivo sairia errado. Então toda soma
      (realizado, pendente, passivo) filtra pela versão corrente do plano.
      As versões antigas ficam consultáveis — é histórico, não saldo.

   3. Alterar plano é ROTA, não update.
      `plano_tratamento`, `fase` e `item_tratamento` têm createRule/updateRule
      nulos. A razão: versionar exige copiar fases e itens numa transação e
      recalcular "qual é a versão corrente". Um update direto no cliente
      poderia editar a versão antiga — exatamente o que a etapa proíbe.

   4. Item executado NUNCA muda de fase nem de procedimento.
      Só `status`. Garantido por hook: se o registro já é 'executado' e alguém
      tenta mudar procedimento, dente ou valor, a gravação é recusada. Deixar
      isso só na tela seria confiar em quem chama a API por fora.

   `orcamento` também tem escrita por rota: o total tem de bater com a soma dos
   itens daquela versão, e isso é conta que não se faz no cliente. */

migrate(
  (app) => {
    const tenantId = app.findCollectionByNameOrId('tenant').id
    const pacId = app.findCollectionByNameOrId('paciente').id
    const profId = app.findCollectionByNameOrId('profissional').id
    const procId = app.findCollectionByNameOrId('procedimento').id
    const atId = app.findCollectionByNameOrId('atendimento').id

    const leitura = "@request.auth.id != '' && tenant_id = @request.auth.tenant_id"
    const clinico =
      "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor' || @request.auth.papel = 'dentista')"

    // ---------- plano_tratamento ----------
    const plano = new Collection({
      name: 'plano_tratamento',
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
        { name: 'titulo', type: 'text', required: true, max: 200 },
        { name: 'versao', type: 'number', required: true, min: 1, onlyInt: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['proposto', 'aprovado', 'em_execucao', 'concluido', 'cancelado'],
        },
        /* `plano_anterior_id` (cadeia de versões) NÃO entra aqui: ele aponta
           para a própria coleção, que ainda não tem id antes do primeiro save.
           PocketBase recusa relation com collectionId vazio ("cannot be
           blank"), então o campo é adicionado logo depois, com o id já
           conhecido. Foi o erro da primeira tentativa. */
        { name: 'observacoes', type: 'text', max: 2000 },
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
        'CREATE INDEX idx_plano_paciente ON plano_tratamento (tenant_id, paciente_id, created DESC)',
        'CREATE INDEX idx_plano_anterior ON plano_tratamento (plano_anterior_id)',
      ],
    })
    app.save(plano)

    // autorrelação: só dá para apontar para si mesma depois de existir
    const colPlano = app.findCollectionByNameOrId('plano_tratamento')
    colPlano.fields.add(
      new RelationField({
        name: 'plano_anterior_id',
        collectionId: colPlano.id,
        maxSelect: 1,
        cascadeDelete: false,
      }),
    )
    app.save(colPlano)

    // ---------- fase ----------
    const fase = new Collection({
      name: 'fase',
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
          name: 'plano_tratamento_id',
          type: 'relation',
          required: true,
          collectionId: colPlano.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'ordem', type: 'number', required: true, min: 1, onlyInt: true },
        { name: 'nome', type: 'text', required: true, max: 120 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_fase_plano ON fase (plano_tratamento_id, ordem)'],
    })
    app.save(fase)

    // ---------- item_tratamento ----------
    const faseId = app.findCollectionByNameOrId('fase').id
    const item = new Collection({
      name: 'item_tratamento',
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
          name: 'fase_id',
          type: 'relation',
          required: true,
          collectionId: faseId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'procedimento_id',
          type: 'relation',
          required: true,
          collectionId: procId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        // notação FDI; texto porque "11-48" e "multiplos" não são número
        { name: 'dente', type: 'text', max: 20 },
        {
          name: 'face',
          type: 'select',
          maxSelect: 5,
          values: [
            'oclusal',
            'mesial',
            'distal',
            'vestibular',
            'lingual',
            'palatina',
            'incisal',
            'cervical',
          ],
        },
        { name: 'quantidade', type: 'number', required: true, min: 1, onlyInt: true },
        /* SNAPSHOT do preço no momento em que o plano foi montado.
           Não recalcular depois: reajuste de tabela não pode reescrever
           orçamento aprovado. */
        { name: 'valor_unitario_centavos', type: 'number', required: true, min: 0 },
        { name: 'observacao', type: 'text', max: 500 },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['proposto', 'executado', 'substituido', 'cancelado'],
        },
        // `substituido_por_item_id` também é autorreferência: entra depois do
        // primeiro save, pelo mesmo motivo de plano_anterior_id.
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_item_fase ON item_tratamento (fase_id)',
        'CREATE INDEX idx_item_proc ON item_tratamento (tenant_id, procedimento_id)',
        'CREATE INDEX idx_item_status ON item_tratamento (tenant_id, status)',
      ],
    })
    app.save(item)

    const colItem = app.findCollectionByNameOrId('item_tratamento')
    colItem.fields.add(
      new RelationField({
        name: 'substituido_por_item_id',
        collectionId: colItem.id,
        maxSelect: 1,
        cascadeDelete: false,
      }),
    )
    app.save(colItem)

    // ---------- orcamento ----------
    const orcamento = new Collection({
      name: 'orcamento',
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
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'plano_tratamento_id',
          type: 'relation',
          required: true,
          collectionId: colPlano.id,
          maxSelect: 1,
          cascadeDelete: true,
        },
        // qual versão do plano este orçamento representa
        { name: 'plano_versao', type: 'number', required: true, min: 1, onlyInt: true },
        { name: 'valor_bruto_centavos', type: 'number', required: true, min: 0 },
        { name: 'desconto_centavos', type: 'number', min: 0 },
        { name: 'valor_final_centavos', type: 'number', required: true, min: 0 },
        { name: 'parcelas', type: 'number', min: 1, onlyInt: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['proposto', 'aprovado', 'recusado', 'expirado'],
        },
        { name: 'validade', type: 'date' },
        {
          name: 'aprovado_por',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'aprovado_em', type: 'date' },
        { name: 'motivo_recusa', type: 'text', max: 1000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_orc_plano ON orcamento (plano_tratamento_id, plano_versao)',
        'CREATE INDEX idx_orc_paciente ON orcamento (tenant_id, paciente_id, created DESC)',
      ],
    })
    app.save(orcamento)

    // ---------- procedimento_realizado ----------
    const realizado = new Collection({
      name: 'procedimento_realizado',
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
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        {
          name: 'atendimento_id',
          type: 'relation',
          collectionId: atId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'procedimento_id',
          type: 'relation',
          required: true,
          collectionId: procId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'item_tratamento_id',
          type: 'relation',
          collectionId: colItem.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'dente', type: 'text', max: 20 },
        {
          name: 'face',
          type: 'select',
          maxSelect: 5,
          values: [
            'oclusal',
            'mesial',
            'distal',
            'vestibular',
            'lingual',
            'palatina',
            'incisal',
            'cervical',
          ],
        },
        /* Executante e solicitante são pessoas diferentes quando um
           especialista realiza o que outro indicou. Misturar os dois apaga
           justamente a informação que permite auditar a produção. */
        {
          name: 'profissional_executante_id',
          type: 'relation',
          required: true,
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        {
          name: 'profissional_solicitante_id',
          type: 'relation',
          collectionId: profId,
          maxSelect: 1,
          cascadeDelete: false,
        },
        /* Snapshot do valor: o realizado não pode mudar quando a tabela de
           preço mudar. */
        { name: 'valor_centavos', type: 'number', required: true, min: 0 },
        {
          name: 'executado_por',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_real_paciente ON procedimento_realizado (tenant_id, paciente_id, created DESC)',
        'CREATE INDEX idx_real_item ON procedimento_realizado (item_tratamento_id)',
      ],
    })
    app.save(realizado)

    // ---------- credito_paciente ----------
    const credito = new Collection({
      name: 'credito_paciente',
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
          name: 'paciente_id',
          type: 'relation',
          required: true,
          collectionId: pacId,
          maxSelect: 1,
          cascadeDelete: true,
        },
        { name: 'valor_centavos', type: 'number', required: true, min: 0 },
        {
          name: 'origem',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['cancelamento_tratamento', 'estorno', 'ajuste'],
        },
        {
          name: 'tratamento_id',
          type: 'relation',
          collectionId: colPlano.id,
          maxSelect: 1,
          cascadeDelete: false,
        },
        // quanto do crédito já foi consumido; o saldo é a diferença
        { name: 'utilizado_centavos', type: 'number', min: 0 },
        { name: 'observacao', type: 'text', max: 1000 },
        {
          name: 'autor_id',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
          cascadeDelete: false,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_credito_paciente ON credito_paciente (tenant_id, paciente_id, created DESC)',
      ],
    })
    app.save(credito)
  },
  (app) => {
    ;[
      'credito_paciente',
      'procedimento_realizado',
      'orcamento',
      'item_tratamento',
      'fase',
      'plano_tratamento',
    ].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    })
  },
)
