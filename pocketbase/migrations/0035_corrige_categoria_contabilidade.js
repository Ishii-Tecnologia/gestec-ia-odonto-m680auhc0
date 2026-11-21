/* Migration 0035 - Corrige a categoria de contabilidade (Etapa 11)

   ERRO MEU no seed 0033: lancei "Contabilidade Silva - Honorarios contabeis"
   na categoria 6.6, que na 0029 é "Taxas de cartão". A tela mostrou
   "Contabilidade Silva · 6.6 Taxas de cartão" e foi assim que apareceu.

   O erro não quebra conta nenhuma (o total de despesas fixas continua certo),
   mas classificação errada estraga o relatório que existe justamente para
   classificar: o contador vai ver honorários contábeis somados em taxas de
   cartão e vai ter de refazer a mão.

   Correção: cria a conta 6.8 Honorarios contabeis (que faltava no plano) e
   move a despesa para ela.

   LIÇÃO: ao semear dado que depende de um catálogo, conferir o catálogo em vez
   de inventar o código — foi exatamente o mesmo erro das especialidades na
   Etapa 8, só que ali o código não existia e o campo ficou vazio. Aqui o
   código existia e apontava para outra coisa, que é mais silencioso ainda. */

migrate(
  (app) => {
    const log = (m) => console.log('[fix-conta] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    // 6.8 Honorarios contabeis
    let contaId = ''
    try {
      contaId = app.findFirstRecordByData('plano_contas', 'codigo', '6.8').id
      log('conta 6.8 ja existe')
    } catch (_) {
      try {
        const col = app.findCollectionByNameOrId('plano_contas')
        const r = new Record(col)
        r.set('tenant_id', tenant)
        r.set('codigo', '6.8')
        r.set('nome', 'Honorarios contabeis')
        r.set('tipo', 'despesa')
        r.set('ativo', true)
        app.save(r)
        contaId = r.id
        log('conta 6.8 criada')
      } catch (err) {
        log('falhou criar 6.8: ' + String(err))
        return
      }
    }

    let movidas = 0
    try {
      const lista = app.findRecordsByFilter(
        'despesa',
        'tenant_id = "' + tenant + '" && fornecedor ~ "Contabilidade"',
        '',
        20,
        0,
      )
      for (const d of lista) {
        if (d.getString('plano_contas_id') !== contaId) {
          d.set('plano_contas_id', contaId)
          app.save(d)
          movidas++
        }
      }
    } catch (err) {
      log('falha ao mover: ' + String(err))
    }
    log('despesas de contabilidade movidas: ' + movidas)

    // verificação: nenhuma despesa pode estar em categoria de tipo errado
    try {
      const todas = app.findRecordsByFilter('despesa', 'tenant_id = "' + tenant + '"', '', 500, 0)
      let ruins = []
      for (const d of todas) {
        try {
          const pc = app.findRecordById('plano_contas', d.getString('plano_contas_id'))
          const tipo = pc.getString('tipo')
          if (tipo !== 'custo' && tipo !== 'despesa') {
            ruins.push(
              d.getString('fornecedor') + ' -> ' + pc.getString('codigo') + ' (' + tipo + ')',
            )
          }
        } catch (_) {
          ruins.push(d.getString('fornecedor') + ' -> categoria inexistente')
        }
      }
      log(
        ruins.length === 0
          ? 'todas as despesas em categoria de custo/despesa'
          : 'PROBLEMAS: ' + ruins.join(' | '),
      )
    } catch (_) {}
  },
  (app) => {},
)
