/* Relatórios gerenciais (Etapa 11)

   GET /backend/v1/relatorios/dre?mes=YYYY-MM[&unidade=&profissional=]
   GET /backend/v1/relatorios/fluxo-caixa?dias=90[&saldo_minimo=]
   GET /backend/v1/relatorios/aging

   A REGRA QUE NÃO PODE SER VIOLADA:

     DRE usa COMPETÊNCIA.  Fluxo de caixa usa CAIXA.

   São relatórios que respondem perguntas DIFERENTES com o MESMO dinheiro, e
   por isso não podem compartilhar data:

   - "Sobrou alguma coisa em outubro?" → tudo que pertence a outubro, pago ou
     não. É o DRE. Serviço feito em outubro entra em outubro, ainda que o
     paciente pague em dezembro.
   - "Vou ter dinheiro no dia 20?" → o que efetivamente entra e sai nesse dia.
     É o fluxo. Um Pix de hoje não ajuda a pagar a folha do dia 5 se o serviço
     foi feito mas o pagamento cai dia 25.

   Usar competência no fluxo faz a clínica decidir com dinheiro que não está
   lá. Usar caixa no DRE faz o mês parecer ruim quando só houve atraso de
   recebimento. Os dois erros levam a decisões opostas.

   E o caso que o critério 2 pede: cartão de crédito entra no fluxo na
   `data_credito_prevista` (30 dias depois), NÃO na data da venda. Um sistema
   que projeta o cartão na data do pagamento mostra dinheiro que a maquininha
   ainda não liberou. */

routerAdd(
  'GET',
  '/backend/v1/relatorios/dre',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('O DRE e restrito ao proprietario e ao gestor.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()

    // mes no formato YYYY-MM; padrão = mês corrente
    const agora = new Date()
    const mesPadrao =
      agora.getUTCFullYear() + '-' + String(agora.getUTCMonth() + 1).padStart(2, '0')
    const mes = String(q.get('mes') || mesPadrao)
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return e.badRequestError('Informe o mes no formato AAAA-MM.')
    }
    const fUnidade = String(q.get('unidade') || '')
    const fProf = String(q.get('profissional') || '')

    const inicio = mes + '-01 00:00:00.000Z'
    const [ano, m] = mes.split('-').map(Number)
    const proximo =
      m === 12 ? ano + 1 + '-01-01' : ano + '-' + String(m + 1).padStart(2, '0') + '-01'
    const fim = proximo + ' 00:00:00.000Z'

    // ---------- RECEITAS por COMPETÊNCIA ----------
    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' +
          tenant +
          '" && data_competencia >= "' +
          inicio +
          '" && data_competencia < "' +
          fim +
          '" && status != "cancelado"' +
          (fProf ? ' && profissional_id = "' + fProf + '"' : ''),
        '',
        5000,
        0,
      )
    } catch (_) {}

    // agrupa receita por categoria do plano de contas e por tipo
    const porCategoria = {}
    let receitaBruta = 0
    let deducoes = 0
    const detalheReceita = []

    for (const t of titulos) {
      const valor = t.getInt('valor_centavos') || 0
      const pcId = t.getString('plano_contas_id')
      let tipo = 'receita'
      let nomeCat = 'Sem categoria'
      try {
        const pc = $app.findRecordById('plano_contas', pcId)
        tipo = pc.getString('tipo')
        // usa o nome do PAI quando houver, para não abrir 20 linhas
        const paiId = pc.getString('pai_id')
        if (paiId) {
          try {
            nomeCat = $app.findRecordById('plano_contas', paiId).getString('nome')
          } catch (_) {
            nomeCat = pc.getString('nome')
          }
        } else {
          nomeCat = pc.getString('nome')
        }
      } catch (_) {}

      if (tipo === 'deducao') {
        deducoes += valor
      } else if (tipo === 'receita') {
        receitaBruta += valor
      }

      const chave = nomeCat
      if (!porCategoria[chave]) porCategoria[chave] = { nome: chave, tipo: tipo, valor: 0 }
      porCategoria[chave].valor += valor

      detalheReceita.push({
        id: t.id,
        descricao: t.getString('descricao'),
        valor_centavos: valor,
        categoria: nomeCat,
        tipo: tipo,
      })
    }

    const receitaLiquida = receitaBruta - deducoes

    // ---------- CUSTOS e DESPESAS por COMPETÊNCIA ----------
    let despesas = []
    try {
      despesas = $app.findRecordsByFilter(
        'despesa',
        'tenant_id = "' +
          tenant +
          '" && data_competencia >= "' +
          inicio +
          '" && data_competencia < "' +
          fim +
          '"',
        '',
        5000,
        0,
      )
    } catch (_) {}

    // filtra por centro de custo quando pediu unidade ou profissional
    function passaFiltro(d) {
      if (!fUnidade && !fProf) return true
      const ccId = d.getString('centro_custo_id')
      if (!ccId) return false
      try {
        const cc = $app.findRecordById('centro_custo', ccId)
        if (fUnidade && cc.getString('unidade_id') !== fUnidade) return false
        if (fProf && cc.getString('profissional_id') !== fProf) return false
        return true
      } catch (_) {
        return false
      }
    }

    let custosDiretos = 0
    let despesasFixas = 0
    const porCusto = {}
    const porDespesa = {}

    for (const d of despesas) {
      if (!passaFiltro(d)) continue
      const valor = d.getInt('valor_centavos') || 0
      let tipo = 'despesa'
      let nomeCat = 'Sem categoria'
      try {
        const pc = $app.findRecordById('plano_contas', d.getString('plano_contas_id'))
        tipo = pc.getString('tipo')
        const paiId = pc.getString('pai_id')
        if (paiId) {
          try {
            nomeCat = $app.findRecordById('plano_contas', paiId).getString('nome')
          } catch (_) {
            nomeCat = pc.getString('nome')
          }
        } else {
          nomeCat = pc.getString('nome')
        }
      } catch (_) {}

      /* Custo x despesa fixa é a separação que produz a MARGEM DE
         CONTRIBUIÇÃO. Custo varia com o atendimento (material, laboratório,
         repasse); despesa fixa existe mesmo sem paciente (aluguel, folha).
         Somar os dois esconde se a clínica ganha por atender ou só cobre
         estrutura. */
      if (tipo === 'custo') {
        custosDiretos += valor
        if (!porCusto[nomeCat]) porCusto[nomeCat] = { nome: nomeCat, valor: 0 }
        porCusto[nomeCat].valor += valor
      } else {
        despesasFixas += valor
        if (!porDespesa[nomeCat]) porDespesa[nomeCat] = { nome: nomeCat, valor: 0 }
        porDespesa[nomeCat].valor += valor
      }
    }

    const margemContribuicao = receitaLiquida - custosDiretos
    const resultadoOperacional = margemContribuicao - despesasFixas

    // ---------- retiradas: FORA do resultado operacional ----------
    let retiradas = []
    let totalProlabore = 0
    let totalDistribuicao = 0
    try {
      retiradas = $app.findRecordsByFilter(
        'retirada_socio',
        'tenant_id = "' +
          tenant +
          '" && data_competencia >= "' +
          inicio +
          '" && data_competencia < "' +
          fim +
          '"',
        '',
        500,
        0,
      )
      for (const r of retiradas) {
        const v = r.getInt('valor_centavos') || 0
        if (r.getString('tipo') === 'prolabore') totalProlabore += v
        else totalDistribuicao += v
      }
    } catch (_) {}

    // quanto do resultado o dono efetivamente tirou — mostrado à parte
    const resultadoAposRetiradas = resultadoOperacional - totalProlabore - totalDistribuicao

    function lista(map) {
      return Object.keys(map)
        .map((k) => map[k])
        .sort((a, b) => b.valor - a.valor)
    }

    return e.json(200, {
      mes: mes,
      periodo: { inicio: inicio, fim: fim },
      filtros: { unidade: fUnidade, profissional: fProf },
      // degraus, na ordem em que se lê um DRE
      degraus: {
        receita_bruta_centavos: receitaBruta,
        deducoes_centavos: deducoes,
        receita_liquida_centavos: receitaLiquida,
        custos_diretos_centavos: custosDiretos,
        margem_contribuicao_centavos: margemContribuicao,
        despesas_fixas_centavos: despesasFixas,
        resultado_operacional_centavos: resultadoOperacional,
      },
      // retirada de sócio NÃO é despesa operacional
      retiradas: {
        prolabore_centavos: totalProlabore,
        distribuicao_centavos: totalDistribuicao,
        total_centavos: totalProlabore + totalDistribuicao,
        resultado_apos_retiradas_centavos: resultadoAposRetiradas,
      },
      margem_percentual:
        receitaLiquida > 0 ? Math.round((resultadoOperacional / receitaLiquida) * 1000) / 10 : 0,
      receitas_por_categoria: lista(porCategoria),
      custos_por_categoria: lista(porCusto),
      despesas_por_categoria: lista(porDespesa),
      // para conferir o critério 1 na mão
      detalhe_receitas: detalheReceita,
      titulos_considerados: titulos.length,
      despesas_consideradas: despesas.length,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/relatorios/fluxo-caixa',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('O fluxo de caixa e restrito ao proprietario e ao gestor.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const dias = Math.min(365, Math.max(1, Number(q.get('dias')) || 90))
    const saldoMinimo = Math.round(Number(q.get('saldo_minimo_centavos')) || 0)
    const saldoInicial = Math.round(Number(q.get('saldo_inicial_centavos')) || 0)

    const agora = new Date()
    const hojeIso = agora.toISOString().slice(0, 10)
    const inicioDia = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()),
    )

    const diasMapa = {}
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicioDia.getTime() + i * 86400000).toISOString().slice(0, 10)
      diasMapa[d] = { data: d, entradas: 0, saidas: 0, detalhe_entradas: [], detalhe_saidas: [] }
    }

    function dentro(dia) {
      return diasMapa[dia] !== undefined
    }

    /* ---- ENTRADAS: pela DATA DE CRÉDITO PREVISTA ----
       Este é o ponto do critério 2. Uso data_credito_prevista, não
       data_pagamento: cartão pago hoje só está disponível em 30 dias. Projetar
       na data do pagamento mostraria dinheiro que a clínica não pode usar. */
    let pagamentos = []
    try {
      pagamentos = $app.findRecordsByFilter(
        'pagamento',
        'tenant_id = "' + tenant + '"',
        'data_pagamento',
        10000,
        0,
      )
    } catch (_) {}

    for (const p of pagamentos) {
      const ehEstorno = p.getString('tipo') === 'estorno'
      const credito = String(
        p.getString('data_credito_prevista') || p.getString('data_pagamento'),
      ).slice(0, 10)
      // realizado: entrou de verdade até hoje (usa a data em que o dinheiro ficou
      // disponível, que é a mesma lógica do projetado)
      if (!dentro(credito)) continue
      const v = (p.getInt('valor_centavos') || 0) * (ehEstorno ? -1 : 1)
      diasMapa[credito].entradas += v
      diasMapa[credito].detalhe_entradas.push({
        tipo: ehEstorno ? 'estorno' : 'recebimento',
        valor_centavos: v,
        origem: 'recebimento',
      })
    }

    /* ---- SAÍDAS: despesas por VENCIMENTO (caixa), não por competência ---- */
    let despesas = []
    try {
      despesas = $app.findRecordsByFilter(
        'despesa',
        'tenant_id = "' + tenant + '"',
        'vencimento',
        10000,
        0,
      )
    } catch (_) {}

    for (const d of despesas) {
      const venc = String(d.getString('vencimento')).slice(0, 10)
      if (!dentro(venc)) continue
      const v = d.getInt('valor_centavos') || 0
      diasMapa[venc].saidas += v
      diasMapa[venc].detalhe_saidas.push({
        fornecedor: d.getString('fornecedor'),
        valor_centavos: v,
        pago: !!d.getString('pago_em'),
      })
    }

    // retiradas contam no caixa (saem da conta), ainda que fora do DRE
    let retiradas = []
    try {
      retiradas = $app.findRecordsByFilter(
        'retirada_socio',
        'tenant_id = "' + tenant + '"',
        'data_competencia',
        1000,
        0,
      )
    } catch (_) {}
    for (const r of retiradas) {
      const dia = String(r.getString('data_competencia')).slice(0, 10)
      if (!dentro(dia)) continue
      const v = r.getInt('valor_centavos') || 0
      diasMapa[dia].saidas += v
      diasMapa[dia].detalhe_saidas.push({
        fornecedor: 'Retirada de socio',
        valor_centavos: v,
        pago: true,
      })
    }

    // ---- série acumulada + alerta de mínimo ----
    const serie = []
    let saldo = saldoInicial
    let primeiroAlerta = ''
    let totalEntradas = 0
    let totalSaidas = 0
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicioDia.getTime() + i * 86400000).toISOString().slice(0, 10)
      const dia = diasMapa[d]
      totalEntradas += dia.entradas
      totalSaidas += dia.saidas
      saldo += dia.entradas - dia.saidas
      const fura = saldo < saldoMinimo
      if (fura && !primeiroAlerta) primeiroAlerta = d
      serie.push({
        data: d,
        entradas_centavos: dia.entradas,
        saidas_centavos: dia.saidas,
        saldo_centavos: saldo,
        abaixo_do_minimo: fura,
        passado: d <= hojeIso,
      })
    }

    return e.json(200, {
      dias: dias,
      hoje: hojeIso,
      saldo_inicial_centavos: saldoInicial,
      saldo_minimo_centavos: saldoMinimo,
      serie: serie,
      totais: {
        entradas_centavos: totalEntradas,
        saidas_centavos: totalSaidas,
        saldo_final_centavos: saldo,
      },
      alerta: primeiroAlerta
        ? {
            primeira_data_abaixo_do_minimo: primeiroAlerta,
            dias_abaixo: serie.filter((s) => s.abaixo_do_minimo).length,
          }
        : null,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/relatorios/aging',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao'].indexOf(papel) < 0) {
      return e.forbiddenError('O aging e restrito a gestao e recepcao.')
    }

    const tenant = e.auth.getString('tenant_id')
    const hojeIso = new Date().toISOString().slice(0, 10)
    const hojeTs = Date.parse(hojeIso)

    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' + tenant + '" && status != "cancelado" && status != "pago"',
        'vencimento',
        5000,
        0,
      )
    } catch (_) {}

    /* FAIXAS DO AGING. Os limites são por dias de atraso e cada faixa acumula
       sem sobrepor — é o que o plano pede (30/60/90/120+) e o que o contador
       espera. Um título com 45 dias cai em "31 a 60", nunca em duas faixas. */
    const faixas = [
      { chave: 'a_vencer', rotulo: 'A vencer', min: -99999, max: -1, total: 0, itens: [] },
      { chave: 'd0_30', rotulo: '1 a 30 dias', min: 0, max: 30, total: 0, itens: [] },
      { chave: 'd31_60', rotulo: '31 a 60 dias', min: 31, max: 60, total: 0, itens: [] },
      { chave: 'd61_90', rotulo: '61 a 90 dias', min: 61, max: 90, total: 0, itens: [] },
      { chave: 'd91_120', rotulo: '91 a 120 dias', min: 91, max: 120, total: 0, itens: [] },
      { chave: 'd120p', rotulo: 'Mais de 120 dias', min: 121, max: 99999, total: 0, itens: [] },
    ]

    let totalGeral = 0
    let totalVencido = 0
    let totalAVencer = 0

    for (const t of titulos) {
      const total = t.getInt('valor_centavos') || 0
      const pago = t.getInt('valor_pago_centavos') || 0
      const saldo = total - pago
      if (saldo <= 0) continue

      const venc = String(t.getString('vencimento')).slice(0, 10)
      if (!venc) continue
      const atraso = Math.floor((hojeTs - Date.parse(venc)) / 86400000)

      let pacienteNome = ''
      try {
        pacienteNome = $app.findRecordById('paciente', t.getString('paciente_id')).getString('nome')
      } catch (_) {}

      const item = {
        id: t.id,
        paciente_id: t.getString('paciente_id'),
        paciente_nome: pacienteNome,
        descricao: t.getString('descricao'),
        vencimento: venc,
        dias_atraso: atraso,
        saldo_centavos: saldo,
      }

      totalGeral += saldo
      if (atraso >= 0) totalVencido += saldo
      else totalAVencer += saldo

      for (const f of faixas) {
        if (atraso >= f.min && atraso <= f.max) {
          f.total += saldo
          f.itens.push(item)
          break
        }
      }
    }

    return e.json(200, {
      hoje: hojeIso,
      total_geral_centavos: totalGeral,
      total_vencido_centavos: totalVencido,
      total_a_vencer_centavos: totalAVencer,
      faixas: faixas.map((f) => ({
        chave: f.chave,
        rotulo: f.rotulo,
        total_centavos: f.total,
        quantidade: f.itens.length,
        percentual: totalGeral > 0 ? Math.round((f.total / totalGeral) * 1000) / 10 : 0,
        // devolve até 100 itens por faixa: a tela mostra a faixa, não o extrato
        itens: f.itens.sort((a, b) => b.dias_atraso - a.dias_atraso).slice(0, 100),
      })),
    })
  },
  $apis.requireAuth(),
)
