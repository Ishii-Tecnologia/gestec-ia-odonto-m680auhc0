/* Painel do proprietário (Etapa 12)

   GET /backend/v1/relatorios/painel?de=&ate=

   Junta números que já existem em outras etapas: agenda (6), plano/execução (9),
   financeiro do paciente (10) e DRE (11). Não cria dado novo — só lê.

   O CRITÉRIO 1 é "os números do painel batem com os relatórios detalhados". Ele
   só se cumpre de um jeito: o painel e os relatórios detalhados têm de usar a
   MESMA conta. Por isso o resultado do mês aqui é calculado pela mesma função
   lógica do DRE (competência, custo direto, despesa fixa), e o faturamento usa a
   mesma base dos títulos por competência. Se eu tivesse escrito "uma continha
   rápida" para o painel, os dois números divergiriam e ninguém confiaria em
   nenhum.

   OCUPAÇÃO tem uma premissa que precisa ficar explícita, senão o número é
   decorativo: taxa = horas agendadas / horas disponíveis. "Disponível" depende
   de quantas horas a clínica abre e quantas cadeiras tem — então devolvo os três
   componentes (agendado, disponível, e a premissa usada) para a tela poder
   mostrar a conta em vez de só o percentual. */

routerAdd(
  'GET',
  '/backend/v1/relatorios/painel',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('O painel e restrito ao proprietario e ao gestor.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const agora = new Date()
    const mesIni =
      agora.getUTCFullYear() + '-' + String(agora.getUTCMonth() + 1).padStart(2, '0') + '-01'
    const de = String(q.get('de') || mesIni).slice(0, 10)
    const ate = String(q.get('ate') || agora.toISOString().slice(0, 10)).slice(0, 10)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      return e.badRequestError('Datas invalidas.')
    }

    const iniIso = de + ' 00:00:00.000Z'
    const fimIso = ate + ' 23:59:59.999Z'

    // ---------------- AGENDA ----------------
    let agendamentos = []
    try {
      agendamentos = $app.findRecordsByFilter(
        'agendamento',
        'tenant_id = "' + tenant + '" && inicio >= "' + iniIso + '" && inicio <= "' + fimIso + '"',
        'inicio',
        5000,
        0,
      )
    } catch (_) {}

    const porStatus = {
      agendado: 0,
      confirmado: 0,
      atendido: 0,
      faltou: 0,
      cancelado: 0,
    }
    let minutosAgendados = 0
    for (const a of agendamentos) {
      const st = a.getString('status')
      if (porStatus[st] !== undefined) porStatus[st]++
      // só conta como ocupado o que de fato consome a cadeira
      if (st === 'atendido' || st === 'confirmado' || st === 'agendado') {
        const ini = Date.parse(String(a.getString('inicio')).replace(' ', 'T'))
        const fim = Date.parse(String(a.getString('fim')).replace(' ', 'T'))
        if (!isNaN(ini) && !isNaN(fim) && fim > ini) minutosAgendados += (fim - ini) / 60000
      }
    }

    /* Horas disponíveis: dias úteis (seg-sáb) × salas ativas × horas por dia.
       A premissa vai na resposta. 8h por dia é a abertura típica de consultório;
       a tela mostra a conta para o dono conferir e, se a clínica abrir 10h,
       ela mesma vê que o percentual está subestimado. */
    const HORAS_DIA = 8
    let salasAtivas = 0
    try {
      const salas = $app.findRecordsByFilter('sala', 'tenant_id = "' + tenant + '"', '', 100, 0)
      for (const s of salas) if (s.get('ativo') !== false && s.get('ativa') !== false) salasAtivas++
    } catch (_) {}
    if (salasAtivas === 0) salasAtivas = 1

    const dIni = new Date(de + 'T00:00:00Z')
    const dFim = new Date(ate + 'T00:00:00Z')
    let diasUteis = 0
    for (let d = new Date(dIni); d <= dFim; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay() // 0 = domingo
      if (dow !== 0) diasUteis++
    }
    const horasDisponiveis = diasUteis * salasAtivas * HORAS_DIA
    const horasAgendadas = minutosAgendados / 60
    const ocupacao = horasDisponiveis > 0 ? (horasAgendadas / horasDisponiveis) * 100 : 0

    // ---------------- FATURAMENTO (competência) ----------------
    /* Faturamento = títulos com competência no período. Mesma base do DRE, para
       o número bater. Não uso data de pagamento: faturamento não é caixa. */
    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' +
          tenant +
          '" && data_competencia >= "' +
          iniIso +
          '" && data_competencia <= "' +
          fimIso +
          '" && status != "cancelado"',
        '',
        5000,
        0,
      )
    } catch (_) {}

    let receitaBruta = 0
    let deducoes = 0
    let recebido = 0
    let inadimplente = 0
    const hojeIso = new Date().toISOString().slice(0, 10)

    for (const t of titulos) {
      const v = t.getInt('valor_centavos') || 0
      const pago = t.getInt('valor_pago_centavos') || 0
      let tipo = 'receita'
      try {
        tipo = $app.findRecordById('plano_contas', t.getString('plano_contas_id')).getString('tipo')
      } catch (_) {}
      if (tipo === 'deducao') deducoes += v
      else receitaBruta += v

      recebido += pago
      // inadimplente: saldo de título cuja data de vencimento já passou
      const saldo = v - pago
      const venc = String(t.getString('vencimento')).slice(0, 10)
      if (saldo > 0 && venc && venc < hojeIso) inadimplente += saldo
    }

    // ---------------- RESULTADO (mesma conta do DRE) ----------------
    let despesas = []
    try {
      despesas = $app.findRecordsByFilter(
        'despesa',
        'tenant_id = "' +
          tenant +
          '" && data_competencia >= "' +
          iniIso +
          '" && data_competencia <= "' +
          fimIso +
          '"',
        '',
        5000,
        0,
      )
    } catch (_) {}

    let custosDiretos = 0
    let despesasFixas = 0
    for (const d of despesas) {
      let tipo = 'despesa'
      try {
        tipo = $app.findRecordById('plano_contas', d.getString('plano_contas_id')).getString('tipo')
      } catch (_) {}
      const v = d.getInt('valor_centavos') || 0
      if (tipo === 'custo') custosDiretos += v
      else despesasFixas += v
    }

    const receitaLiquida = receitaBruta - deducoes
    const margemContribuicao = receitaLiquida - custosDiretos
    const resultado = margemContribuicao - despesasFixas

    // ---------------- PASSIVO CLÍNICO (versão corrente, como na E9) ----------------
    let passivo = 0
    let passivoItens = 0
    try {
      const planos = $app.findRecordsByFilter(
        'plano_tratamento',
        'tenant_id = "' + tenant + '"',
        '-created',
        500,
        0,
      )
      for (const p of planos) {
        if (p.getString('status') === 'cancelado') continue
        // resolve a versão corrente: só ela conta
        let corrente = p
        let g = 0
        while (g < 50) {
          g++
          let filho = []
          try {
            filho = $app.findRecordsByFilter(
              'plano_tratamento',
              'plano_anterior_id = "' + corrente.id + '"',
              '-versao',
              1,
              0,
            )
          } catch (_) {
            break
          }
          if (filho.length === 0) break
          corrente = filho[0]
        }
        if (corrente.id !== p.id) continue
        if (corrente.getString('status') === 'cancelado') continue

        let fs = []
        try {
          fs = $app.findRecordsByFilter(
            'fase',
            'plano_tratamento_id = "' + corrente.id + '"',
            '',
            100,
            0,
          )
        } catch (_) {}
        for (const f of fs) {
          let its = []
          try {
            its = $app.findRecordsByFilter(
              'item_tratamento',
              'fase_id = "' + f.id + '"',
              '',
              500,
              0,
            )
          } catch (_) {}
          for (const it of its) {
            if (it.getString('status') !== 'proposto') continue
            passivo += (it.getInt('valor_unitario_centavos') || 0) * (it.getInt('quantidade') || 1)
            passivoItens++
          }
        }
      }
    } catch (_) {}

    // ---------------- PRODUÇÃO REALIZADA ----------------
    let realizados = []
    try {
      realizados = $app.findRecordsByFilter(
        'procedimento_realizado',
        'tenant_id = "' +
          tenant +
          '" && created >= "' +
          iniIso +
          '" && created <= "' +
          fimIso +
          '"',
        '',
        5000,
        0,
      )
    } catch (_) {}
    let produzido = 0
    for (const r of realizados) produzido += r.getInt('valor_centavos') || 0

    // ---------------- PACIENTES ATENDIDOS ----------------
    const pacientesUnicos = {}
    for (const a of agendamentos) {
      if (a.getString('status') === 'atendido') pacientesUnicos[a.getString('paciente_id')] = true
    }

    const totalAgendados = agendamentos.length
    const taxaFalta =
      totalAgendados > 0 ? Math.round((porStatus.faltou / totalAgendados) * 1000) / 10 : 0

    return e.json(200, {
      periodo: { de: de, ate: ate },
      agenda: {
        total: totalAgendados,
        por_status: porStatus,
        horas_agendadas: Math.round(horasAgendadas * 10) / 10,
        horas_disponiveis: Math.round(horasDisponiveis * 10) / 10,
        ocupacao_percentual: Math.round(ocupacao * 10) / 10,
        // premissa da conta, para a tela poder mostrar em vez de esconder
        premissa: { horas_por_dia: HORAS_DIA, salas_ativas: salasAtivas, dias_uteis: diasUteis },
        taxa_falta_percentual: taxaFalta,
        pacientes_atendidos: Object.keys(pacientesUnicos).length,
      },
      financeiro: {
        receita_bruta_centavos: receitaBruta,
        deducoes_centavos: deducoes,
        receita_liquida_centavos: receitaLiquida,
        custos_diretos_centavos: custosDiretos,
        margem_contribuicao_centavos: margemContribuicao,
        despesas_fixas_centavos: despesasFixas,
        resultado_operacional_centavos: resultado,
        recebido_centavos: recebido,
        inadimplente_centavos: inadimplente,
        faturado_centavos: receitaBruta,
        titulos: titulos.length,
      },
      clinico: {
        passivo_centavos: passivo,
        passivo_itens: passivoItens,
        produzido_centavos: produzido,
        procedimentos_realizados: realizados.length,
      },
    })
  },
  $apis.requireAuth(),
)
