/* Consultas financeiras (Etapa 10)

   GET /backend/v1/contas-receber      — lista + totais, com filtros
   GET /backend/v1/extrato-paciente    — extrato com saldo devedor
   GET /backend/v1/exportar-contador   — CSV (competência, categoria, forma)

   POR QUE UMA ROTA E NÃO CONSULTA DIRETA DO CLIENTE:

   Os TOTAIS precisam sair do mesmo conjunto filtrado que as linhas. Se a tela
   somasse no navegador, o total de "vencidos" poderia divergir da lista quando
   houvesse mais registros que o limite de página — e aí o dono da clínica cobra
   um número e o extrato mostra outro.

   Aqui os três totais que importam (a receber, recebido, vencido) são calculados
   sobre TODOS os títulos que casam com o filtro, e a lista devolve até 500
   linhas com o aviso de quantas ficaram de fora.

   SOBRE O VENCIDO: `status = 'vencido'` só é gravado na virada do dia pela
   rota. Para a tela não mostrar "aberto" num título atrasado desde ontem, o
   cálculo de vencido aqui é por DATA, não por status gravado. Status gravado
   serve para filtro histórico; a verdade do atraso é a data. */

routerAdd(
  'GET',
  '/backend/v1/contas-receber',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa contas a receber.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const fStatus = String(q.get('status') || '')
    const fPaciente = String(q.get('paciente_id') || '')
    const fPlano = String(q.get('plano_contas_id') || '')
    const fDe = String(q.get('de') || '')
    const fAte = String(q.get('ate') || '')
    const fBusca = String(q.get('busca') || '')
      .trim()
      .toLowerCase()

    // ---- monta o filtro do PocketBase ----
    const partes = ['tenant_id = "' + tenant + '"']
    if (fPaciente) partes.push('paciente_id = "' + fPaciente + '"')
    if (fPlano) partes.push('plano_contas_id = "' + fPlano + '"')
    if (fDe) partes.push('vencimento >= "' + fDe + ' 00:00:00.000Z"')
    if (fAte) partes.push('vencimento <= "' + fAte + ' 23:59:59.999Z"')

    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        partes.join(' && '),
        'vencimento',
        2000,
        0,
      )
    } catch (err) {
      return e.json(200, { itens: [], totais: {}, erro: String(err) })
    }

    const hojeIso = new Date().toISOString().replace('T', ' ').slice(0, 10)

    // enriquece com nome do paciente (evita N+1 na tela)
    const nomesPaciente = {}
    function nomePac(id) {
      if (!id) return ''
      if (nomesPaciente[id] !== undefined) return nomesPaciente[id]
      try {
        nomesPaciente[id] = $app.findRecordById('paciente', id).getString('nome')
      } catch (_) {
        nomesPaciente[id] = ''
      }
      return nomesPaciente[id]
    }
    const nomesPlano = {}
    function nomePlano(id) {
      if (!id) return ''
      if (nomesPlano[id] !== undefined) return nomesPlano[id]
      try {
        nomesPlano[id] = $app.findRecordById('plano_contas', id).getString('nome')
      } catch (_) {
        nomesPlano[id] = ''
      }
      return nomesPlano[id]
    }
    const nomesForma = {}
    function nomeForma(id) {
      if (!id) return ''
      if (nomesForma[id] !== undefined) return nomesForma[id]
      try {
        nomesForma[id] = $app.findRecordById('forma_pagamento', id).getString('nome')
      } catch (_) {
        nomesForma[id] = ''
      }
      return nomesForma[id]
    }

    const itens = []
    const totais = {
      total_centavos: 0,
      pago_centavos: 0,
      aberto_centavos: 0,
      vencido_centavos: 0,
      n: 0,
      n_vencidos: 0,
    }

    for (const t of titulos) {
      const total = t.getInt('valor_centavos') || 0
      const pago = t.getInt('valor_pago_centavos') || 0
      const saldo = Math.max(0, total - pago)
      const st = t.getString('status')
      const venc = String(t.getString('vencimento')).slice(0, 10)
      const cancelado = st === 'cancelado'

      // vencido por DATA, não por status gravado
      const vencido = !cancelado && saldo > 0 && venc && venc < hojeIso
      const efetivo = cancelado
        ? 'cancelado'
        : saldo <= 0
          ? 'pago'
          : pago > 0
            ? 'parcial'
            : vencido
              ? 'vencido'
              : 'aberto'

      if (fStatus && efetivo !== fStatus) continue

      const nome = nomePac(t.getString('paciente_id'))
      if (
        fBusca &&
        nome.toLowerCase().indexOf(fBusca) < 0 &&
        t.getString('descricao').toLowerCase().indexOf(fBusca) < 0
      ) {
        continue
      }

      if (!cancelado) {
        totais.total_centavos += total
        totais.pago_centavos += pago
        totais.aberto_centavos += saldo
        if (vencido) {
          totais.vencido_centavos += saldo
          totais.n_vencidos++
        }
        totais.n++
      }

      // formas usadas neste título (para a tela não precisar de outra chamada)
      let formas = []
      try {
        const pags = $app.findRecordsByFilter(
          'pagamento',
          'titulo_receber_id = "' + t.id + '"',
          'data_pagamento',
          50,
          0,
        )
        formas = pags.map((p) => ({
          tipo: p.getString('tipo'),
          valor_centavos: p.getInt('valor_centavos'),
          forma: nomeForma(p.getString('forma_pagamento_id')),
          data: String(p.getString('data_pagamento')).slice(0, 10),
          credito_previsto: String(p.getString('data_credito_prevista') || '').slice(0, 10),
        }))
      } catch (_) {}

      itens.push({
        id: t.id,
        paciente_id: t.getString('paciente_id'),
        paciente_nome: nome,
        descricao: t.getString('descricao'),
        valor_centavos: total,
        valor_pago_centavos: pago,
        saldo_centavos: saldo,
        vencimento: venc,
        status: efetivo,
        status_gravado: st,
        vencido: vencido,
        dias_atraso: vencido ? Math.round((Date.parse(hojeIso) - Date.parse(venc)) / 86400000) : 0,
        data_competencia: String(t.getString('data_competencia')).slice(0, 10),
        data_liquidacao: String(t.getString('data_liquidacao') || '').slice(0, 10),
        plano_contas_id: t.getString('plano_contas_id'),
        plano_contas_nome: nomePlano(t.getString('plano_contas_id')),
        parcela: t.getInt('parcela'),
        parcelas_total: t.getInt('parcelas_total'),
        formas: formas,
      })
    }

    // lista devolve até 500; o total acima é de TODOS os que casaram
    const limite = 500
    return e.json(200, {
      itens: itens.slice(0, limite),
      total_itens: itens.length,
      truncado: itens.length > limite,
      totais: totais,
      hoje: hojeIso,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/extrato-paciente',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa extrato.')
    }

    const tenant = e.auth.getString('tenant_id')
    const pacienteId = String(e.request.url.query().get('paciente_id') || '')
    if (!pacienteId) return e.badRequestError('Informe o paciente.')

    let paciente
    try {
      paciente = $app.findRecordById('paciente', pacienteId)
    } catch (_) {
      return e.notFoundError('Paciente nao encontrado.')
    }
    if (paciente.getString('tenant_id') !== tenant)
      return e.notFoundError('Paciente nao encontrado.')

    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' +
          tenant +
          '" && paciente_id = "' +
          pacienteId +
          '" && status != "cancelado"',
        'vencimento',
        500,
        0,
      )
    } catch (_) {}

    const hojeIso = new Date().toISOString().replace('T', ' ').slice(0, 10)
    let total = 0
    let pago = 0
    let vencido = 0
    const linhas = []

    for (const t of titulos) {
      const v = t.getInt('valor_centavos') || 0
      const p = t.getInt('valor_pago_centavos') || 0
      const saldo = Math.max(0, v - p)
      const venc = String(t.getString('vencimento')).slice(0, 10)
      total += v
      pago += p
      if (saldo > 0 && venc && venc < hojeIso) vencido += saldo

      let pags = []
      try {
        const ps = $app.findRecordsByFilter(
          'pagamento',
          'titulo_receber_id = "' + t.id + '"',
          'data_pagamento',
          50,
          0,
        )
        pags = ps.map((x) => {
          let fn = ''
          try {
            fn = $app
              .findRecordById('forma_pagamento', x.getString('forma_pagamento_id'))
              .getString('nome')
          } catch (_) {}
          return {
            id: x.id,
            tipo: x.getString('tipo'),
            valor_centavos: x.getInt('valor_centavos'),
            forma: fn,
            data_pagamento: String(x.getString('data_pagamento')).slice(0, 10),
            data_credito_prevista: String(x.getString('data_credito_prevista') || '').slice(0, 10),
          }
        })
      } catch (_) {}

      linhas.push({
        id: t.id,
        descricao: t.getString('descricao'),
        valor_centavos: v,
        valor_pago_centavos: p,
        saldo_centavos: saldo,
        vencimento: venc,
        status: t.getString('status'),
        vencido: saldo > 0 && venc && venc < hojeIso,
        data_competencia: String(t.getString('data_competencia')).slice(0, 10),
        data_liquidacao: String(t.getString('data_liquidacao') || '').slice(0, 10),
        parcelas: pags,
      })
    }

    // créditos a favor do paciente (do cancelamento com crédito, Etapa 9)
    let creditos = []
    let saldoCredito = 0
    try {
      const cs = $app.findRecordsByFilter(
        'credito_paciente',
        'tenant_id = "' + tenant + '" && paciente_id = "' + pacienteId + '"',
        '-created',
        100,
        0,
      )
      creditos = cs.map((c) => {
        const v = c.getInt('valor_centavos') || 0
        const u = c.getInt('utilizado_centavos') || 0
        saldoCredito += v - u
        return {
          id: c.id,
          valor_centavos: v,
          utilizado_centavos: u,
          disponivel_centavos: v - u,
          origem: c.getString('origem'),
          observacao: c.getString('observacao'),
          created: String(c.getString('created')).slice(0, 10),
        }
      })
    } catch (_) {}

    return e.json(200, {
      paciente: { id: paciente.id, nome: paciente.getString('nome') },
      resumo: {
        total_centavos: total,
        pago_centavos: pago,
        saldo_devedor_centavos: Math.max(0, total - pago),
        vencido_centavos: vencido,
        credito_disponivel_centavos: saldoCredito,
        // o que o paciente deve, já descontando o crédito a favor
        posicao_liquida_centavos: Math.max(0, total - pago) - saldoCredito,
      },
      titulos: linhas,
      creditos: creditos,
    })
  },
  $apis.requireAuth(),
)

/* ------------------------------------------------- exportação para o contador
   CSV com as colunas que o contador precisa: competência (regime de
   competência), descrição, valor, categoria, forma e liquidação (regime de
   caixa). As duas datas juntas é o que permite ele fechar os dois relatórios
   sem pedir nada de volta.

   Exporto por PAGAMENTO, não por título: um título pago em duas formas precisa
   aparecer em duas linhas, com a forma certa em cada uma. Exportar por título
   obrigaria a escolher uma forma só — e ficaria errado. */
routerAdd(
  'GET',
  '/backend/v1/exportar-contador',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('Somente proprietario ou gestor exporta para o contador.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const de = String(q.get('de') || '')
    const ate = String(q.get('ate') || '')

    if (!de || !ate) return e.badRequestError('Informe o periodo (de e ate).')

    // pagaamentos no período, por data de pagamento
    let pags = []
    try {
      pags = $app.findRecordsByFilter(
        'pagamento',
        'tenant_id = "' +
          tenant +
          '" && data_pagamento >= "' +
          de +
          ' 00:00:00.000Z" && data_pagamento <= "' +
          ate +
          ' 23:59:59.999Z"',
        'data_pagamento',
        5000,
        0,
      )
    } catch (err) {
      return e.json(200, { csv: '', linhas: 0 })
    }

    function esc(v) {
      const s = String(v === undefined || v === null ? '' : v)
      if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }

    const cabecalho = [
      'data_competencia',
      'data_pagamento',
      'data_liquidacao',
      'descricao',
      'paciente',
      'categoria',
      'tipo_categoria',
      'forma_pagamento',
      'valor',
      'natureza',
    ].join(';')

    const linhas = []
    let totalReceb = 0
    let totalEstorno = 0

    for (const p of pags) {
      let t = null
      try {
        t = $app.findRecordById('titulo_receber', p.getString('titulo_receber_id'))
      } catch (_) {}
      if (!t) continue

      let pacienteNome = ''
      try {
        pacienteNome = $app.findRecordById('paciente', t.getString('paciente_id')).getString('nome')
      } catch (_) {}
      let catNome = ''
      let catTipo = ''
      try {
        const pc = $app.findRecordById('plano_contas', t.getString('plano_contas_id'))
        catNome = pc.getString('nome')
        catTipo = pc.getString('tipo')
      } catch (_) {}
      let formaNome = ''
      try {
        formaNome = $app
          .findRecordById('forma_pagamento', p.getString('forma_pagamento_id'))
          .getString('nome')
      } catch (_) {}

      const valor = p.getInt('valor_centavos') || 0
      const ehEstorno = p.getString('tipo') === 'estorno'
      if (ehEstorno) totalEstorno += valor
      else totalReceb += valor

      linhas.push(
        [
          String(t.getString('data_competencia')).slice(0, 10),
          String(p.getString('data_pagamento')).slice(0, 10),
          String(t.getString('data_liquidacao') || '').slice(0, 10),
          esc(t.getString('descricao')),
          esc(pacienteNome),
          esc(catNome),
          esc(catTipo),
          esc(formaNome),
          // valor em reais com vírgula: é o que planilha brasileira lê como número
          (valor / 100).toFixed(2).replace('.', ','),
          ehEstorno ? 'estorno' : 'recebimento',
        ].join(';'),
      )
    }

    // BOM para o Excel abrir UTF-8 sem virar "Ã§"
    const csv = '\ufeff' + cabecalho + '\n' + linhas.join('\n') + '\n'

    return e.json(200, {
      csv: csv,
      linhas: linhas.length,
      total_recebido_centavos: totalReceb,
      total_estornado_centavos: totalEstorno,
      liquido_centavos: totalReceb - totalEstorno,
      periodo: { de: de, ate: ate },
    })
  },
  $apis.requireAuth(),
)
