/* Migration 0029 - Plano de contas e formas de pagamento demo (Etapa 10)

   Plano de contas mínimo, mas com a distinção que importa para o contador:
   receita operacional (tratamento) X dedução (desconto/glosa). Se tudo for
   "receita", o faturamento bruto sai inflado e o contador refaz a conta na mão.

   Formas de pagamento com os prazos REAIS de compensação:
     0 dias  → dinheiro, Pix, débito
     1 dia   → débito em algumas maquininhas (D+1)
     30 dias → crédito

   A taxa fica na forma, em percentual, porque é característica da maquininha —
   não daquela venda específica. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-fin] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    try {
      const ja = app.findRecordsByFilter('plano_contas', 'tenant_id = "' + tenant + '"', '', 1, 0)
      if (ja.length > 0) {
        log('ja existe plano de contas, saindo')
        return
      }
    } catch (_) {}

    // ---------- plano de contas ----------
    const col = app.findCollectionByNameOrId('plano_contas')
    function conta(codigo, nome, tipo, paiId) {
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('codigo', codigo)
      r.set('nome', nome)
      r.set('tipo', tipo)
      r.set('ativo', true)
      if (paiId) r.set('pai_id', paiId)
      app.save(r)
      return r.id
    }

    const receitaOp = conta('3', 'Receita Operacional', 'receita')
    conta('3.1', 'Tratamentos odontológicos', 'receita', receitaOp)
    conta('3.2', 'Procedimentos estéticos', 'receita', receitaOp)
    conta('3.3', 'Produtos e materiais', 'receita', receitaOp)

    conta('4', 'Deduções', 'deducao')
    conta('4.1', 'Descontos concedidos', 'deducao')
    conta('4.2', 'Glosas de convênio', 'deducao')

    conta('5', 'Custos', 'custo')
    conta('5.1', 'Materiais e insumos', 'custo')
    conta('5.2', 'Laboratório de prótese', 'custo')
    conta('5.3', 'Repasse a profissionais', 'custo')

    conta('6', 'Despesas', 'despesa')
    conta('6.1', 'Folha e encargos', 'despesa')
    conta('6.2', 'Aluguel e condomínio', 'despesa')
    conta('6.3', 'Energia, água e telefone', 'despesa')
    conta('6.4', 'Sistemas e software', 'despesa')
    conta('6.5', 'Marketing', 'despesa')
    conta('6.6', 'Taxas de cartão', 'despesa')
    conta('6.7', 'Impostos sobre serviço', 'despesa')

    log('plano de contas: 17 contas')

    // ---------- formas de pagamento ----------
    const colF = app.findCollectionByNameOrId('forma_pagamento')
    function forma(nome, prazo, taxa) {
      const r = new Record(colF)
      r.set('tenant_id', tenant)
      r.set('nome', nome)
      r.set('prazo_compensacao_dias', prazo)
      r.set('taxa_percentual', taxa)
      r.set('ativo', true)
      app.save(r)
    }

    forma('Dinheiro', 0, 0)
    forma('Pix', 0, 0)
    forma('Débito', 1, 1.2)
    forma('Crédito', 30, 3.5)
    forma('Crédito parcelado', 30, 4.9)
    forma('Transferência', 0, 0)
    forma('Convênio', 45, 0) // convênio paga devagar e sem taxa de maquininha

    log('7 formas de pagamento')
  },
  (app) => {
    try {
      const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
      app
        .db()
        .newQuery(
          'DELETE FROM pagamento WHERE tenant_id = {:t};' +
            'DELETE FROM titulo_receber WHERE tenant_id = {:t};' +
            'DELETE FROM forma_pagamento WHERE tenant_id = {:t};' +
            'DELETE FROM plano_contas WHERE tenant_id = {:t};',
        )
        .bind({ t: alfa.id })
        .execute()
    } catch (_) {}
  },
)
