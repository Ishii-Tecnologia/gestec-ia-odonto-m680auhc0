/* Migration 0040 — Módulos e assinatura (Etapa 14)

   Objetivo: transformar o sistema em produto vendável com mensalidade por CNPJ.

   TRÊS DECISÕES QUE DEFINEM ESTA ETAPA:

   1. VALOR CONGELADO. `assinatura.valor_centavos` guarda o preço NO MOMENTO da
      contratação, e não aponta para `modulo.preco_centavos`. Se apontasse, mudar
      o catálogo reajustaria o contrato de todo mundo em silêncio — o cliente
      passaria a pagar outro valor sem ter sido avisado, e sem rastro de quando
      mudou. Com o valor congelado, reajuste é um evento explícito, registrado em
      `assinatura_evento`.

   2. CANCELAR NÃO APAGA. `status = cancelada` + `fim`. O dado continua lá e
      exportável. O módulo sai do menu e as rotas passam a recusar escrita, mas
      nada é destruído: a clínica que cancela o financeiro em dezembro ainda vai
      precisar do histórico em janeiro para o contador.

   3. STATUS É DERIVADO DO TEMPO, MAS NÃO SÓ. Guardar `status` explicitamente
      permite "suspensa" (inadimplência), que não se deduz de datas. Mas uma
      assinatura ativa com `fim` no passado está vencida de fato, então a leitura
      cruza os dois: nunca confio só na coluna.

   SOBRE `tenant_modulo` (criada na Etapa 3): é a forma antiga de dizer "esta
   clínica tem este módulo". Não a apago — vira dado histórico. A partir daqui
   `assinatura` é a fonte da verdade, e o backfill abaixo converte o que existir.
   Apagar a tabela antiga numa migração de feature nova é o tipo de limpeza que
   quebra relatório de quem já estava usando. */

migrate(
  (app) => {
    const log = (m) => console.log('[modulos] ' + m)

    // ---------- 1. catálogo ----------
    /* A tabela `modulo` já existe (Etapa 3) com preco_centavos e disponivel.
       Não recrio: só garanto os módulos previstos no plano. */
    const CATALOGO = [
      { codigo: 'agenda', nome: 'Agenda', preco: 4900, ordem: 1, dep: '' },
      { codigo: 'prontuario', nome: 'Prontuário', preco: 8900, ordem: 2, dep: '' },
      { codigo: 'orcamento', nome: 'Orçamento e planos', preco: 6900, ordem: 3, dep: 'prontuario' },
      { codigo: 'financeiro', nome: 'Financeiro', preco: 7900, ordem: 4, dep: '' },
      {
        codigo: 'relatorios',
        nome: 'Relatórios de gestão',
        preco: 4900,
        ordem: 5,
        dep: 'financeiro',
      },
      { codigo: 'estoque', nome: 'Estoque', preco: 3900, ordem: 6, dep: '' },
      { codigo: 'automacoes', nome: 'Lembretes automáticos', preco: 5900, ordem: 7, dep: '' },
      { codigo: 'ia', nome: 'Assistente de IA', preco: 9900, ordem: 8, dep: '' },
      { codigo: 'api_publica', nome: 'API e integrações', preco: 12900, ordem: 9, dep: '' },
    ]

    const colModulo = app.findCollectionByNameOrId('modulo')

    // campo de dependência (para o aviso de pacote)
    let temDep = false
    for (const f of colModulo.fields) if (f.name === 'depende_de') temDep = true
    if (!temDep) {
      colModulo.fields.add(new TextField({ name: 'depende_de', required: false, max: 40 }))
      app.save(colModulo)
      log('campo modulo.depende_de criado')
    }

    for (const m of CATALOGO) {
      let registro = null
      try {
        registro = app.findFirstRecordByData('modulo', 'codigo', m.codigo)
      } catch (_) {
        try {
          registro = new Record(colModulo)
          registro.set('codigo', m.codigo)
          registro.set('nome', m.nome)
          registro.set('preco_centavos', m.preco)
          registro.set('disponivel', true)
          registro.set('ordem', m.ordem)
          if (m.dep) registro.set('depende_de', m.dep)
          app.save(registro)
        } catch (err) {
          log('falhou criar ' + m.codigo + ': ' + String(err).slice(0, 80))
        }
      }
      // módulo existente: só preenche a dependência se estiver vazia
      if (registro && m.dep && !registro.getString('depende_de')) {
        registro.set('depende_de', m.dep)
        try {
          app.save(registro)
        } catch (_) {}
      }
    }
    log('catalogo garantido')

    // ---------- 2. assinatura ----------
    let temAssinatura = true
    try {
      app.findCollectionByNameOrId('assinatura')
    } catch (_) {
      temAssinatura = false
    }

    if (!temAssinatura) {
      const col = new Collection({
        name: 'assinatura',
        type: 'base',
        listRule: "@request.auth.id != '' && tenant_id = @request.auth.tenant_id",
        viewRule: "@request.auth.id != '' && tenant_id = @request.auth.tenant_id",
        /* Ninguém cria ou altera assinatura pelo cliente HTTP: contratar e
           cancelar passam por rota, que valida dependência e grava o evento.
           Assinatura é dinheiro — se o próprio tenant pudesse escrever nela,
           bastaria um POST para liberar o módulo sem pagar. */
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'tenant_id',
            type: 'relation',
            required: true,
            collectionId: 'pbc_2034940204',
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'modulo_id',
            type: 'relation',
            required: true,
            collectionId: 'pbc_3689067128',
            cascadeDelete: false,
            maxSelect: 1,
          },
          /* Valor congelado na contratação. Ver o comentário do topo. */
          { name: 'valor_centavos', type: 'number', required: true, min: 0, onlyInt: true },
          { name: 'inicio', type: 'date', required: false },
          { name: 'fim', type: 'date', required: false },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['ativa', 'cancelada', 'suspensa'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_ass_tenant ON assinatura (tenant_id, status)',
          'CREATE INDEX idx_ass_modulo ON assinatura (modulo_id)',
        ],
      })
      app.save(col)
      log('colecao assinatura criada')
    }

    // ---------- 3. evento ----------
    let temEvento = true
    try {
      app.findCollectionByNameOrId('assinatura_evento')
    } catch (_) {
      temEvento = false
    }

    if (!temEvento) {
      const col = new Collection({
        name: 'assinatura_evento',
        type: 'base',
        /* Trilha imutável: quem mudou o quê e quando. É aqui que se prova que um
           reajuste foi avisado, e não aplicado em silêncio. */
        listRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        viewRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'tenant_id',
            type: 'relation',
            required: true,
            collectionId: 'pbc_2034940204',
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'assinatura_id',
            type: 'relation',
            required: false,
            collectionId: '',
            cascadeDelete: false,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['contratacao', 'cancelamento', 'reativacao', 'mudanca_valor', 'suspensao'],
          },
          { name: 'valor_anterior_centavos', type: 'number', required: false, min: 0 },
          { name: 'valor_novo_centavos', type: 'number', required: false, min: 0 },
          {
            name: 'autor_id',
            type: 'relation',
            required: false,
            collectionId: '_pb_users_auth_',
            cascadeDelete: false,
            maxSelect: 1,
          },
          { name: 'observacao', type: 'text', required: false, max: 500 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_asev_tenant ON assinatura_evento (tenant_id, created DESC)'],
      })
      // a relação precisa do id real da coleção assinatura (criada acima)
      col.fields.getByName('assinatura_id').collectionId =
        app.findCollectionByNameOrId('assinatura').id
      app.save(col)
      log('colecao assinatura_evento criada')
    }

    // ---------- 4. backfill de tenant_modulo ----------
    /* A Etapa 3 já marcava módulos por tenant. Converto o que existir para
       assinatura, com o preço ATUAL do catálogo (é a única referência que
       existe para o passado — dali em diante o valor fica congelado). */
    const hoje = new Date().toISOString()
    let convertidos = 0
    try {
      const vinculos = app.findRecordsByFilter('tenant_modulo', '', '', 500, 0)
      for (const v of vinculos) {
        const tenantId = v.getString('tenant_id')
        const moduloId = v.getString('modulo_id')
        if (!tenantId || !moduloId) continue
        try {
          app.findFirstRecordByFilter(
            'assinatura',
            'tenant_id = "' + tenantId + '" && modulo_id = "' + moduloId + '"',
          )
          continue // já convertido
        } catch (_) {}

        let preco = 0
        try {
          preco = app.findRecordById('modulo', moduloId).getInt('preco_centavos') || 0
        } catch (_) {}

        const a = new Record(app.findCollectionByNameOrId('assinatura'))
        a.set('tenant_id', tenantId)
        a.set('modulo_id', moduloId)
        a.set('valor_centavos', preco)
        a.set('inicio', hoje)
        a.set('status', 'ativa')
        try {
          app.save(a)
          convertidos++
        } catch (_) {}
      }
    } catch (err) {
      log('backfill: ' + String(err).slice(0, 100))
    }
    log('assinaturas convertidas de tenant_modulo: ' + convertidos)
  },
  (app) => {
    for (const nome of ['assinatura_evento', 'assinatura']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
