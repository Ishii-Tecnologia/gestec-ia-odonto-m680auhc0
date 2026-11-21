/* Despesa, fechamento de caixa e retirada (Etapa 11)

   POST /backend/v1/pagar-despesa       — marca como paga
   POST /backend/v1/fechar-caixa        — calcula o valor do SISTEMA e a diferença
   GET  /backend/v1/caixa-do-dia        — quanto o sistema espera por forma
   POST /backend/v1/retirada-socio      — pró-labore / distribuição
   GET  /backend/v1/exportar-despesas   — CSV de despesas para o contador

   O FECHAMENTO É O PONTO DELICADO DESTA ETAPA.

   `valor_sistema` NÃO é digitado: é a soma dos pagamentos recebidos naquela
   forma, naquele dia. Se fosse digitável, o operador digitaria o valor do
   caixa e a diferença sairia zero sempre — o fechamento perderia a única
   função que tem, que é revelar quebra de caixa.

   `diferenca = conferido − sistema`. Positivo = sobrou; negativo = faltou.
   O sinal importa: "sobra" costuma ser troco errado ou venda não lançada,
   "falta" costuma ser desvio ou erro de troco. Mostrar só o módulo esconde
   qual dos dois casos aconteceu.

   E `responsavel` é obrigatório: fechamento sem nome não serve para nada. */

routerAdd(
  'GET',
  '/backend/v1/caixa-do-dia',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa o caixa.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const dia = String(q.get('data') || new Date().toISOString().slice(0, 10))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return e.badRequestError('Data invalida.')

    let pagamentos = []
    try {
      pagamentos = $app.findRecordsByFilter(
        'pagamento',
        'tenant_id = "' +
          tenant +
          '" && data_pagamento >= "' +
          dia +
          ' 00:00:00.000Z" && data_pagamento <= "' +
          dia +
          ' 23:59:59.999Z"',
        '',
        5000,
        0,
      )
    } catch (_) {}

    const porForma = {}
    for (const p of pagamentos) {
      const formaId = p.getString('forma_pagamento_id')
      const v = (p.getInt('valor_centavos') || 0) * (p.getString('tipo') === 'estorno' ? -1 : 1)
      if (!porForma[formaId]) {
        let nome = ''
        let prazo = 0
        try {
          const f = $app.findRecordById('forma_pagamento', formaId)
          nome = f.getString('nome')
          prazo = f.getInt('prazo_compensacao_dias') || 0
        } catch (_) {}
        porForma[formaId] = { id: formaId, nome: nome, prazo: prazo, sistema_centavos: 0, n: 0 }
      }
      porForma[formaId].sistema_centavos += v
      porForma[formaId].n++
    }

    // o que já foi fechado neste dia
    let fechados = []
    try {
      const fs = $app.findRecordsByFilter(
        'fechamento_caixa',
        'tenant_id = "' +
          tenant +
          '" && data >= "' +
          dia +
          ' 00:00:00.000Z" && data <= "' +
          dia +
          ' 23:59:59.999Z"',
        '',
        50,
        0,
      )
      fechados = fs.map((f) => ({
        id: f.id,
        forma_pagamento_id: f.getString('forma_pagamento_id'),
        valor_sistema_centavos: f.getInt('valor_sistema_centavos'),
        valor_conferido_centavos: f.getInt('valor_conferido_centavos'),
        diferenca_centavos: f.getInt('diferenca_centavos'),
        responsavel: f.getString('responsavel'),
        observacao: f.getString('observacao'),
      }))
    } catch (_) {}

    const lista = Object.keys(porForma).map((k) => {
      const f = porForma[k]
      const ja = fechados.find((x) => x.forma_pagamento_id === f.id)
      return {
        id: f.id,
        nome: f.nome,
        prazo_compensacao_dias: f.prazo,
        sistema_centavos: f.sistema_centavos,
        lancamentos: f.n,
        fechado: !!ja,
        fechamento: ja || null,
      }
    })

    return e.json(200, { data: dia, formas: lista.sort((a, b) => a.nome.localeCompare(b.nome)) })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/fechar-caixa',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao fecha o caixa.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const dia = String(body.data || '').slice(0, 10)
    const formaId = String(body.forma_pagamento_id || '')
    const conferido = Math.round(Number(body.valor_conferido_centavos) || 0)
    const observacao = String(body.observacao || '').slice(0, 1000)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return e.badRequestError('Data invalida.')
    if (!formaId) return e.badRequestError('Informe a forma de pagamento.')
    if (conferido < 0) return e.badRequestError('Valor conferido invalido.')

    try {
      const f = $app.findRecordById('forma_pagamento', formaId)
      if (f.getString('tenant_id') !== tenant) return e.notFoundError('Forma nao encontrada.')
    } catch (_) {
      return e.notFoundError('Forma nao encontrada.')
    }

    /* valor do sistema: soma dos pagamentos daquele dia naquela forma.
       NUNCA aceito do cliente — se aceitasse, a diferença seria sempre zero. */
    let sistema = 0
    try {
      const pags = $app.findRecordsByFilter(
        'pagamento',
        'tenant_id = "' +
          tenant +
          '" && forma_pagamento_id = "' +
          formaId +
          '" && data_pagamento >= "' +
          dia +
          ' 00:00:00.000Z" && data_pagamento <= "' +
          dia +
          ' 23:59:59.999Z"',
        '',
        5000,
        0,
      )
      for (const p of pags) {
        sistema += (p.getInt('valor_centavos') || 0) * (p.getString('tipo') === 'estorno' ? -1 : 1)
      }
    } catch (_) {}

    const diferenca = conferido - sistema

    let registro
    try {
      const col = $app.findCollectionByNameOrId('fechamento_caixa')
      // já existe fechamento deste dia/forma? então atualiza (o índice UNIQUE
      // impede duplicar, e refazer o fechamento é operação legítima)
      try {
        const existente = $app.findFirstRecordByFilter(
          'fechamento_caixa',
          'tenant_id = "' +
            tenant +
            '" && forma_pagamento_id = "' +
            formaId +
            '" && data >= "' +
            dia +
            ' 00:00:00.000Z" && data <= "' +
            dia +
            ' 23:59:59.999Z"',
        )
        registro = existente
      } catch (_) {
        registro = new Record(col)
        registro.set('tenant_id', tenant)
        registro.set('data', dia + ' 00:00:00.000Z')
        registro.set('forma_pagamento_id', formaId)
      }
      registro.set('valor_sistema_centavos', sistema)
      registro.set('valor_conferido_centavos', conferido)
      registro.set('diferenca_centavos', diferenca)
      registro.set('responsavel', e.auth.id)
      registro.set('observacao', observacao)
      $app.save(registro)
    } catch (err) {
      return e.badRequestError('Nao foi possivel fechar o caixa: ' + String(err))
    }

    return e.json(200, {
      ok: true,
      id: registro.id,
      valor_sistema_centavos: sistema,
      valor_conferido_centavos: conferido,
      diferenca_centavos: diferenca,
      // sinal explícito: sobra e falta são problemas diferentes
      situacao: diferenca === 0 ? 'confere' : diferenca > 0 ? 'sobra' : 'falta',
      responsavel: e.auth.id,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/pagar-despesa',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao paga despesa.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const id = String(body.despesa_id || '')
    const pagoEm = String(body.pago_em || '').slice(0, 10) || new Date().toISOString().slice(0, 10)

    if (!id) return e.badRequestError('Informe a despesa.')

    let d
    try {
      d = $app.findRecordById('despesa', id)
    } catch (_) {
      return e.notFoundError('Despesa nao encontrada.')
    }
    if (d.getString('tenant_id') !== tenant) return e.notFoundError('Despesa nao encontrada.')

    try {
      d.set('pago_em', pagoEm + ' 00:00:00.000Z')
      $app.save(d)
    } catch (err) {
      return e.badRequestError('Nao foi possivel pagar: ' + String(err))
    }

    return e.json(200, { ok: true, pago_em: pagoEm })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/retirada-socio',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    /* Só o proprietário registra retirada: é o dinheiro dele. Gestor que
       precisa fazer isso pede ao dono — e o nome fica na trilha. */
    if (papel !== 'proprietario') {
      return e.forbiddenError('Somente o proprietario registra retirada.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const valor = Math.round(Number(body.valor_centavos) || 0)
    const tipo = String(body.tipo || '')
    const comp = String(body.data_competencia || '').slice(0, 10)
    const obs = String(body.observacao || '').slice(0, 500)

    if (valor <= 0) return e.badRequestError('Informe o valor.')
    if (['prolabore', 'distribuicao'].indexOf(tipo) < 0) {
      return e.badRequestError('Tipo invalido: use prolabore ou distribuicao.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(comp)) return e.badRequestError('Informe a competencia.')

    try {
      const col = $app.findCollectionByNameOrId('retirada_socio')
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('valor_centavos', valor)
      r.set('tipo', tipo)
      r.set('data_competencia', comp + ' 00:00:00.000Z')
      r.set('observacao', obs)
      r.set('socio_id', e.auth.id)
      $app.save(r)
      return e.json(200, { ok: true, id: r.id })
    } catch (err) {
      return e.badRequestError('Nao foi possivel registrar: ' + String(err))
    }
  },
  $apis.requireAuth(),
)

/* Exportação de despesas para o contador — o critério 5.
   Mesmas colunas da exportação de recebimentos (Etapa 10) mais o fornecedor:
   competência, categoria, valor, e a data de pagamento. Duas exportações com
   formatos diferentes obrigam o contador a reconciliar na mão. */
routerAdd(
  'GET',
  '/backend/v1/exportar-despesas',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('Somente gestao exporta despesas.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const de = String(q.get('de') || '')
    const ate = String(q.get('ate') || '')
    if (!de || !ate) return e.badRequestError('Informe o periodo (de e ate).')

    let despesas = []
    try {
      despesas = $app.findRecordsByFilter(
        'despesa',
        'tenant_id = "' +
          tenant +
          '" && data_competencia >= "' +
          de +
          ' 00:00:00.000Z" && data_competencia <= "' +
          ate +
          ' 23:59:59.999Z"',
        'data_competencia',
        5000,
        0,
      )
    } catch (_) {}

    function esc(v) {
      const s = String(v === undefined || v === null ? '' : v)
      if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }

    const cabecalho = [
      'data_competencia',
      'vencimento',
      'pago_em',
      'fornecedor',
      'descricao',
      'categoria',
      'tipo_categoria',
      'centro_custo',
      'recorrente',
      'valor',
      'natureza',
    ].join(';')

    const linhas = []
    let total = 0
    let totalPago = 0

    for (const d of despesas) {
      const v = d.getInt('valor_centavos') || 0
      total += v
      const pagoEm = String(d.getString('pago_em') || '').slice(0, 10)
      if (pagoEm) totalPago += v

      let catNome = ''
      let catTipo = ''
      try {
        const pc = $app.findRecordById('plano_contas', d.getString('plano_contas_id'))
        catNome = pc.getString('nome')
        catTipo = pc.getString('tipo')
      } catch (_) {}
      let ccNome = ''
      try {
        ccNome = $app
          .findRecordById('centro_custo', d.getString('centro_custo_id'))
          .getString('nome')
      } catch (_) {}

      linhas.push(
        [
          String(d.getString('data_competencia')).slice(0, 10),
          String(d.getString('vencimento')).slice(0, 10),
          pagoEm,
          esc(d.getString('fornecedor')),
          esc(d.getString('descricao')),
          esc(catNome),
          esc(catTipo),
          esc(ccNome),
          d.get('recorrente') ? 'sim' : 'nao',
          (v / 100).toFixed(2).replace('.', ','),
          pagoEm ? 'pago' : 'a_pagar',
        ].join(';'),
      )
    }

    const csv = '\ufeff' + cabecalho + '\n' + linhas.join('\n') + '\n'

    return e.json(200, {
      csv: csv,
      linhas: linhas.length,
      total_centavos: total,
      total_pago_centavos: totalPago,
      total_a_pagar_centavos: total - totalPago,
      periodo: { de: de, ate: ate },
    })
  },
  $apis.requireAuth(),
)
