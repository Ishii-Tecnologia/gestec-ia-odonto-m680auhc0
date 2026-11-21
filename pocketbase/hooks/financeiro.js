/* Rotas financeiras do paciente (Etapa 10)

   POST /backend/v1/gerar-titulos        — a partir de um orçamento aprovado
   POST /backend/v1/baixar-titulo        — recebimento (uma ou várias formas)
   POST /backend/v1/estornar-pagamento   — estorno como lançamento novo
   POST /backend/v1/reagendar-vencimento — em LOTE, uma confirmação
   GET  /backend/v1/contas-receber        — lista com filtros e totais
   GET  /backend/v1/extrato-paciente     — extrato com saldo
   GET  /backend/v1/exportar-contador    — CSV para o contador

   A REGRA QUE MANDA EM TUDO: status e valor pago são DERIVADOS.
   Nenhuma rota aceita `status` nem `valor_pago_centavos` do cliente. A cada
   pagamento ou estorno, a rota recalcula do zero, somando os lançamentos:

       valor_pago = soma(recebimentos) - soma(estornos)

   status:
       cancelado  -> 'cancelado'
       pago       -> valor_pago >= valor
       valor_pago > 0 -> 'parcial'
       'vencido' se a data passou, senão 'aberto'

   Derivar em vez de digitar é o que impede o estado impossível clássico:
   título marcado 'pago' sem nenhum pagamento, ou 'aberto' com saldo zero.

   NOTA: o JSVM do PocketBase executa cada callback em pool separado e não
   enxerga funções de topo. Por isso o recálculo é repetido inline. */

/* ----------------------------------------------------------------- baixa */
routerAdd(
  'POST',
  '/backend/v1/baixar-titulo',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao registra recebimento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const tituloId = String(body.titulo_id || '')
    const pagamentos = Array.isArray(body.pagamentos) ? body.pagamentos : []

    if (!tituloId) return e.badRequestError('Informe o titulo.')
    if (pagamentos.length === 0)
      return e.badRequestError('Informe ao menos uma forma de pagamento.')

    let titulo
    try {
      titulo = $app.findRecordById('titulo_receber', tituloId)
    } catch (_) {
      return e.notFoundError('Titulo nao encontrado.')
    }
    if (titulo.getString('tenant_id') !== tenant) return e.notFoundError('Titulo nao encontrado.')
    if (titulo.getString('status') === 'cancelado') {
      return e.badRequestError('Titulo cancelado nao recebe baixa.')
    }

    /* data_pagamento comum a todos os lançamentos desta baixa: é uma operação,
       um dia. Aceitar datas diferentes no mesmo ato tornaria o comprovante
       ambíguo. */
    const dataPag = String(body.data_pagamento || '').trim()
    if (!dataPag) return e.badRequestError('Informe a data do pagamento.')
    const dataTs = Date.parse(dataPag.replace(' ', 'T'))
    if (isNaN(dataTs)) return e.badRequestError('Data de pagamento invalida.')
    const dataIso = new Date(dataTs).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

    // valida formas e calcula crédito previsto de cada uma
    const lancamentos = []
    for (const p of pagamentos) {
      const formaId = String(p.forma_pagamento_id || '')
      const valor = Math.round(Number(p.valor_centavos) || 0)
      if (!formaId) return e.badRequestError('Informe a forma de pagamento.')
      if (valor <= 0) return e.badRequestError('Valor tem de ser maior que zero.')

      let forma
      try {
        forma = $app.findRecordById('forma_pagamento', formaId)
      } catch (_) {
        return e.notFoundError('Forma de pagamento nao encontrada.')
      }
      if (forma.getString('tenant_id') !== tenant) {
        return e.notFoundError('Forma de pagamento nao encontrada.')
      }

      /* data_credito_prevista = data_pagamento + prazo da forma.
         GRAVADA, não calculada na leitura: se o prazo da forma mudar amanhã
         (a maquininha renegociou), o pagamento de hoje não pode mudar junto. */
      const prazo = forma.getInt('prazo_compensacao_dias') || 0
      const credito =
        new Date(dataTs + prazo * 24 * 60 * 60 * 1000)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 23) + 'Z'

      lancamentos.push({ forma, valor, credito })
    }

    // soma do que já foi pago (derivada)
    let jaPago = 0
    try {
      const anteriores = $app.findRecordsByFilter(
        'pagamento',
        'titulo_receber_id = "' + tituloId + '"',
        '',
        500,
        0,
      )
      for (const a of anteriores) {
        const v = a.getInt('valor_centavos') || 0
        jaPago += a.getString('tipo') === 'estorno' ? -v : v
      }
    } catch (_) {}

    const total = titulo.getInt('valor_centavos') || 0
    const novoTotal = lancamentos.reduce((acc, l) => acc + l.valor, 0)
    if (jaPago + novoTotal > total) {
      return e.badRequestError(
        'O total recebido passaria do valor do titulo. Falta ' +
          ((total - jaPago) / 100).toFixed(2) +
          ', e voce informou ' +
          (novoTotal / 100).toFixed(2) +
          '.',
      )
    }

    // grava os lançamentos
    const colPag = $app.findCollectionByNameOrId('pagamento')
    try {
      for (const l of lancamentos) {
        const r = new Record(colPag)
        r.set('tenant_id', tenant)
        r.set('titulo_receber_id', tituloId)
        r.set('tipo', 'recebimento')
        r.set('valor_centavos', l.valor)
        r.set('forma_pagamento_id', l.forma.id)
        r.set('data_pagamento', dataIso)
        r.set('data_credito_prevista', l.credito)
        r.set('observacao', String(body.observacao || '').slice(0, 500))
        r.set('registrado_por', e.auth.id)
        $app.save(r)
      }
    } catch (err) {
      return e.badRequestError('Nao foi possivel registrar o pagamento: ' + String(err))
    }

    // ---- recálculo derivado (inline) ----
    let pago = 0
    let ultimaLiquidacao = ''
    try {
      const todos = $app.findRecordsByFilter(
        'pagamento',
        'titulo_receber_id = "' + tituloId + '"',
        'data_pagamento',
        500,
        0,
      )
      for (const a of todos) {
        const v = a.getInt('valor_centavos') || 0
        pago += a.getString('tipo') === 'estorno' ? -v : v
      }
      if (todos.length > 0) ultimaLiquidacao = todos[todos.length - 1].getString('data_pagamento')
    } catch (_) {}

    const hojeIso = new Date().toISOString().replace('T', ' ').slice(0, 10)
    const venc = String(titulo.getString('vencimento')).slice(0, 10)
    let status
    if (pago >= total) status = 'pago'
    else if (pago > 0) status = 'parcial'
    else status = venc && venc < hojeIso ? 'vencido' : 'aberto'

    try {
      titulo.set('valor_pago_centavos', pago)
      titulo.set('status', status)
      /* data_liquidacao é o dia em que o dinheiro entrou. Seto quando o título
         fica quitado; num pagamento parcial o caixa já entrou, mas o título
         ainda não liquidou — então a data fica vazia e o parcial aparece pela
         coluna valor_pago. */
      if (pago >= total && ultimaLiquidacao) titulo.set('data_liquidacao', ultimaLiquidacao)
      else if (pago < total) titulo.set('data_liquidacao', '')
      $app.save(titulo)
    } catch (err) {
      return e.badRequestError(
        'Pagamento registrado, mas falhou atualizar o titulo: ' + String(err),
      )
    }

    return e.json(200, {
      ok: true,
      valor_pago_centavos: pago,
      saldo_centavos: total - pago,
      status: status,
      lancamentos: lancamentos.length,
    })
  },
  $apis.requireAuth(),
)

/* --------------------------------------------------------------- estorno */
routerAdd(
  'POST',
  '/backend/v1/estornar-pagamento',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    /* Estorno é dinheiro voltando: só gestão. Recepção dá baixa, mas não
       desfaz sozinha — é o tipo de operação que precisa de alguém responsável
       com o nome registrado. */
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('Somente proprietario ou gestor estorna pagamento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const pagamentoId = String(body.pagamento_id || '')
    const motivo = String(body.motivo || '').trim()

    if (!pagamentoId) return e.badRequestError('Informe o pagamento.')
    if (!motivo) return e.badRequestError('O motivo do estorno e obrigatorio.')

    let pag
    try {
      pag = $app.findRecordById('pagamento', pagamentoId)
    } catch (_) {
      return e.notFoundError('Pagamento nao encontrado.')
    }
    if (pag.getString('tenant_id') !== tenant) return e.notFoundError('Pagamento nao encontrado.')
    if (pag.getString('tipo') === 'estorno') {
      return e.badRequestError('Este lancamento ja e um estorno.')
    }

    // já existe estorno para este pagamento? (evita estorno duplo)
    try {
      const ja = $app.findRecordsByFilter(
        'pagamento',
        'titulo_receber_id = "' +
          pag.getString('titulo_receber_id') +
          '" && tipo = "estorno" && valor_centavos = ' +
          pag.getInt('valor_centavos') +
          ' && observacao ~ "' +
          pag.id +
          '"',
        '',
        1,
        0,
      )
      if (ja.length > 0) return e.badRequestError('Este pagamento ja foi estornado.')
    } catch (_) {}

    const col = $app.findCollectionByNameOrId('pagamento')
    try {
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('titulo_receber_id', pag.getString('titulo_receber_id'))
      r.set('tipo', 'estorno')
      r.set('valor_centavos', pag.getInt('valor_centavos'))
      r.set('forma_pagamento_id', pag.getString('forma_pagamento_id'))
      r.set('data_pagamento', new Date().toISOString().replace('T', ' ').slice(0, 23) + 'Z')
      /* Referencio o pagamento original na observação porque não há campo de
         relação para isso — e um estorno sem saber a QUE se refere não serve
         para auditoria. */
      r.set('observacao', ('Estorno de ' + pag.id + ': ' + motivo).slice(0, 500))
      r.set('registrado_por', e.auth.id)
      $app.save(r)
    } catch (err) {
      return e.badRequestError('Nao foi possivel estornar: ' + String(err))
    }

    // recálculo do título (inline)
    const tituloId = pag.getString('titulo_receber_id')
    let pago = 0
    let ultimaLiquidacao = ''
    try {
      const todos = $app.findRecordsByFilter(
        'pagamento',
        'titulo_receber_id = "' + tituloId + '"',
        'data_pagamento',
        500,
        0,
      )
      for (const a of todos) {
        const v = a.getInt('valor_centavos') || 0
        pago += a.getString('tipo') === 'estorno' ? -v : v
      }
      if (todos.length > 0) ultimaLiquidacao = todos[todos.length - 1].getString('data_pagamento')
    } catch (_) {}

    let titulo
    try {
      titulo = $app.findRecordById('titulo_receber', tituloId)
    } catch (_) {
      return e.badRequestError('Estorno gravado, mas o titulo nao foi encontrado.')
    }

    const total = titulo.getInt('valor_centavos') || 0
    const hojeIso = new Date().toISOString().replace('T', ' ').slice(0, 10)
    const venc = String(titulo.getString('vencimento')).slice(0, 10)
    let status
    if (titulo.getString('status') === 'cancelado') status = 'cancelado'
    else if (pago >= total) status = 'pago'
    else if (pago > 0) status = 'parcial'
    else status = venc && venc < hojeIso ? 'vencido' : 'aberto'

    try {
      titulo.set('valor_pago_centavos', pago)
      titulo.set('status', status)
      if (pago >= total && ultimaLiquidacao) titulo.set('data_liquidacao', ultimaLiquidacao)
      else titulo.set('data_liquidacao', '')
      $app.save(titulo)
    } catch (err) {
      return e.badRequestError('Estorno gravado, mas falhou atualizar o titulo: ' + String(err))
    }

    return e.json(200, {
      ok: true,
      valor_pago_centavos: pago,
      saldo_centavos: total - pago,
      status: status,
    })
  },
  $apis.requireAuth(),
)

/* -------------------------------------------------- gerar títulos do orçamento */
routerAdd(
  'POST',
  '/backend/v1/gerar-titulos',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao gera titulo a receber.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const orcamentoId = String(body.orcamento_id || '')
    const parcelas = Math.max(1, Number(body.parcelas) || 1)
    const planoContasId = String(body.plano_contas_id || '')
    /* data_competencia é o MÊS DO SERVIÇO, não o mês do vencimento. Padrão:
       hoje. Quem gera título de serviço feito em julho e recebe em agosto tem
       de poder dizer isso — senão o DRE de julho sai vazio. */
    const competencia = String(body.data_competencia || '').trim()
    const primeiroVenc = String(body.primeiro_vencimento || '').trim()

    if (!orcamentoId) return e.badRequestError('Informe o orcamento.')
    if (!planoContasId) return e.badRequestError('Informe a categoria do plano de contas.')

    let orc
    try {
      orc = $app.findRecordById('orcamento', orcamentoId)
    } catch (_) {
      return e.notFoundError('Orcamento nao encontrado.')
    }
    if (orc.getString('tenant_id') !== tenant) return e.notFoundError('Orcamento nao encontrado.')
    if (orc.getString('status') !== 'aprovado') {
      return e.badRequestError('So orcamento aprovado gera titulo.')
    }

    // categoria do tenant
    try {
      const pc = $app.findRecordById('plano_contas', planoContasId)
      if (pc.getString('tenant_id') !== tenant) return e.notFoundError('Categoria nao encontrada.')
    } catch (_) {
      return e.notFoundError('Categoria nao encontrada.')
    }

    // já gerou? evita duplicar títulos a cada clique
    try {
      const ja = $app.findRecordsByFilter(
        'titulo_receber',
        'orcamento_id = "' + orcamentoId + '" && status != "cancelado"',
        '',
        1,
        0,
      )
      if (ja.length > 0) {
        return e.badRequestError('Este orcamento ja gerou titulos a receber.')
      }
    } catch (_) {}

    const totalFinal = orc.getInt('valor_final_centavos') || 0
    if (totalFinal <= 0) return e.badRequestError('Orcamento sem valor a receber.')

    const compTs = competencia ? Date.parse(competencia.replace(' ', 'T')) : Date.now()
    if (isNaN(compTs)) return e.badRequestError('Data de competencia invalida.')
    const compIso = new Date(compTs).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

    const vencBase = primeiroVenc ? Date.parse(primeiroVenc.replace(' ', 'T')) : compTs
    if (isNaN(vencBase)) return e.badRequestError('Vencimento invalido.')

    const plano = $app.findRecordById('plano_tratamento', orc.getString('plano_tratamento_id'))
    let descricaoBase = 'Tratamento odontologico'
    try {
      descricaoBase = plano.getString('titulo') || descricaoBase
    } catch (_) {}

    /* Divide em parcelas com sobra na PRIMEIRA — não na última.
       Mil em 3x: 333,34 / 333,33 / 333,33. A soma tem de dar exatamente o
       total; jogar a sobra na última é o que cria título de R$ 0,01 e a
       conciliação que não fecha. */
    const valorParcela = Math.floor(totalFinal / parcelas)
    const sobra = totalFinal - valorParcela * parcelas

    const col = $app.findCollectionByNameOrId('titulo_receber')
    const criados = []
    try {
      for (let i = 0; i < parcelas; i++) {
        const valor = i === 0 ? valorParcela + sobra : valorParcela
        const venc =
          new Date(vencBase + i * 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .replace('T', ' ')
            .slice(0, 23) + 'Z'

        const r = new Record(col)
        r.set('tenant_id', tenant)
        r.set('paciente_id', orc.getString('paciente_id'))
        r.set('orcamento_id', orcamentoId)
        r.set('profissional_id', plano.getString('profissional_id'))
        r.set(
          'descricao',
          (parcelas > 1
            ? descricaoBase + ' (' + (i + 1) + '/' + parcelas + ')'
            : descricaoBase
          ).slice(0, 300),
        )
        r.set('valor_centavos', valor)
        r.set('valor_pago_centavos', 0)
        r.set('vencimento', venc)
        r.set('data_competencia', compIso)
        r.set('plano_contas_id', planoContasId)
        r.set('status', 'aberto')
        r.set('parcela', i + 1)
        r.set('parcelas_total', parcelas)
        $app.save(r)
        criados.push({ id: r.id, valor_centavos: valor, vencimento: venc })
      }
    } catch (err) {
      return e.badRequestError('Nao foi possivel gerar os titulos: ' + String(err))
    }

    return e.json(200, {
      ok: true,
      titulos: criados,
      total_centavos: criados.reduce((a, c) => a + c.valor_centavos, 0),
      parcelas: parcelas,
    })
  },
  $apis.requireAuth(),
)

/* -------------------------------------------------- reagendamento em LOTE */
routerAdd(
  'POST',
  '/backend/v1/reagendar-vencimento',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao reagenda vencimento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const ids = Array.isArray(body.titulo_ids) ? body.titulo_ids : []
    const novaData = String(body.nova_data || '').trim()
    const deslocamento = Number(body.deslocamento_dias)

    if (ids.length === 0) return e.badRequestError('Selecione ao menos um titulo.')

    /* Duas formas, nunca as duas juntas: data fixa (todos para o mesmo dia) ou
       deslocamento em dias (mantém o escalonamento das parcelas). Misturar as
       duas tornaria impossível saber o que o usuário quis. */
    const temData = !!novaData
    const temDeslocamento = !isNaN(deslocamento) && deslocamento !== 0
    if (temData === temDeslocamento) {
      return e.badRequestError('Informe a nova data OU o deslocamento em dias.')
    }

    let novaDataTs = 0
    if (temData) {
      novaDataTs = Date.parse(novaData.replace(' ', 'T'))
      if (isNaN(novaDataTs)) return e.badRequestError('Data invalida.')
    }

    const alterados = []
    const ignorados = []
    for (const id of ids) {
      let t
      try {
        t = $app.findRecordById('titulo_receber', String(id))
      } catch (_) {
        ignorados.push({ id: String(id), motivo: 'nao encontrado' })
        continue
      }
      if (t.getString('tenant_id') !== tenant) {
        ignorados.push({ id: t.id, motivo: 'nao encontrado' })
        continue
      }
      const st = t.getString('status')
      if (st === 'pago' || st === 'cancelado') {
        // não mexe em título quitado ou cancelado: mudar vencimento de algo já
        // pago reescreveria o histórico de atraso
        ignorados.push({ id: t.id, motivo: 'status ' + st })
        continue
      }

      const anterior = t.getString('vencimento')
      let novoVenc
      if (temData) {
        novoVenc = new Date(novaDataTs).toISOString().replace('T', ' ').slice(0, 23) + 'Z'
      } else {
        const base = Date.parse(String(anterior).replace(' ', 'T'))
        novoVenc =
          new Date(base + deslocamento * 24 * 60 * 60 * 1000)
            .toISOString()
            .replace('T', ' ')
            .slice(0, 23) + 'Z'
      }

      try {
        t.set('vencimento', novoVenc)
        // recalcula status: um título vencido que ganha data futura volta a aberto
        const pago = t.getInt('valor_pago_centavos') || 0
        const total = t.getInt('valor_centavos') || 0
        const hojeIso = new Date().toISOString().replace('T', ' ').slice(0, 10)
        const vencDia = novoVenc.slice(0, 10)
        if (pago >= total) t.set('status', 'pago')
        else if (pago > 0) t.set('status', 'parcial')
        else t.set('status', vencDia < hojeIso ? 'vencido' : 'aberto')
        $app.save(t)
        alterados.push({ id: t.id, de: anterior, para: novoVenc })
      } catch (err) {
        ignorados.push({ id: t.id, motivo: String(err) })
      }
    }

    return e.json(200, {
      ok: true,
      alterados: alterados.length,
      ignorados: ignorados.length,
      detalhe_ignorados: ignorados,
      detalhe: alterados,
    })
  },
  $apis.requireAuth(),
)
