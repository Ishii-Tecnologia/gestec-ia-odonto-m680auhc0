/* Rotas de orçamento, execução, cancelamento e passivo (Etapa 9)

   POST /backend/v1/gerar-orcamento      — orçamento da versão corrente
   POST /backend/v1/decidir-orcamento    — aprovar / recusar com motivo
   POST /backend/v1/registrar-realizado  — executa um item na cadeira
   POST /backend/v1/cancelar-tratamento  — cancelar com crédito ou estorno
   GET  /backend/v1/execucao-plano       — realizado x pendente de um plano
   GET  /backend/v1/passivo-clinico      — vendido e não executado

   A CONTA MAIS IMPORTANTE DESTA ETAPA está em `execucao-plano` e
   `passivo-clinico`: ambas somam SOMENTE a versão corrente do plano. Somar
   todas as versões contaria duas vezes o item executado que foi copiado para a
   v2 — e o passivo clínico, que é a tela de primeira classe desta etapa,
   passaria a mentir para mais ou para menos.

   PASSIVO CLÍNICO = valor dos itens 'proposto' na versão corrente de planos
   não cancelados. É o que a clínica vendeu e ainda não entregou. Item
   'substituido' não conta (foi trocado, o novo assume); 'cancelado' não conta;
   'executado' não conta. */

function exigirClinico(e) {
  if (e.hasSuperuserAuth()) return 'superuser'
  if (!e.auth) return 'sem-auth'
  const papel = e.auth.getString('papel')
  if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) return 'sem-papel'
  return 'ok'
}

function versaoCorrente(app, planoId) {
  let atual
  try {
    atual = app.findRecordById('plano_tratamento', planoId)
  } catch (_) {
    return null
  }
  let guarda = 0
  while (guarda < 50) {
    guarda++
    try {
      const filho = app.findRecordsByFilter(
        'plano_tratamento',
        'plano_anterior_id = "' + atual.id + '"',
        '-versao',
        1,
        0,
      )
      if (filho.length === 0) break
      atual = filho[0]
    } catch (_) {
      break
    }
  }
  return atual
}

/* Itens da versão corrente de um plano */
function itensDaVersao(app, planoCorrenteId) {
  const itens = []
  try {
    const fases = app.findRecordsByFilter(
      'fase',
      'plano_tratamento_id = "' + planoCorrenteId + '"',
      'ordem',
      100,
      0,
    )
    for (const f of fases) {
      const its = app.findRecordsByFilter('item_tratamento', 'fase_id = "' + f.id + '"', '', 500, 0)
      for (const it of its) {
        itens.push({ fase: f, item: it })
      }
    }
  } catch (_) {}
  return itens
}

/* Valores de um conjunto de itens */
function somar(itens) {
  let bruto = 0
  let executado = 0
  let pendente = 0
  let substituido = 0
  let cancelado = 0
  for (const { item } of itens) {
    const v = (item.getInt('valor_unitario_centavos') || 0) * (item.getInt('quantidade') || 1)
    const st = item.getString('status')
    if (st === 'executado') {
      executado += v
      bruto += v
    } else if (st === 'proposto') {
      pendente += v
      bruto += v
    } else if (st === 'substituido') {
      substituido += v
      bruto += v
    } else {
      cancelado += v
    }
  }
  return { bruto, executado, pendente, substituido, cancelado }
}

// ---------------------------------------------------------------- orçamento
routerAdd(
  'POST',
  '/backend/v1/gerar-orcamento',
  (e) => {
    const permissao = exigirClinico(e)
    if (permissao === 'sem-auth') return e.unauthorizedError('Autenticacao obrigatoria.')
    if (permissao !== 'ok') return e.forbiddenError('Seu perfil nao gera orcamento.')

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const planoId = String(body.plano_id || '')
    const desconto = Math.max(0, Number(body.desconto_centavos) || 0)
    const parcelas = Math.max(1, Number(body.parcelas) || 1)
    const diasValidade = Number(body.dias_validade) || 30

    if (!planoId) return e.badRequestError('Informe o plano.')

    const corrente = versaoCorrente($app, planoId)
    if (!corrente) return e.notFoundError('Plano nao encontrado.')
    if (corrente.getString('tenant_id') !== tenant) return e.notFoundError('Plano nao encontrado.')
    if (corrente.getString('status') === 'cancelado') {
      return e.badRequestError('Plano cancelado nao gera orcamento.')
    }

    const itens = itensDaVersao($app, corrente.id)
    if (itens.length === 0) return e.badRequestError('O plano nao tem itens.')

    // orçar só o que faz sentido cobrar: proposto + executado (o executado
    // antes da aprovação é raro, mas existe em urgência)
    const considerados = itens.filter(({ item }) => {
      const st = item.getString('status')
      return st === 'proposto' || st === 'executado'
    })
    const s = somar(considerados)

    if (desconto > s.bruto) {
      return e.badRequestError('O desconto nao pode passar do valor bruto.')
    }
    const final = s.bruto - desconto

    const validade =
      new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 23) + 'Z'

    let orc
    try {
      const col = $app.findCollectionByNameOrId('orcamento')
      orc = new Record(col)
      orc.set('tenant_id', tenant)
      orc.set('paciente_id', corrente.getString('paciente_id'))
      orc.set('plano_tratamento_id', corrente.id)
      orc.set('plano_versao', corrente.getInt('versao') || 1)
      orc.set('valor_bruto_centavos', s.bruto)
      orc.set('desconto_centavos', desconto)
      orc.set('valor_final_centavos', final)
      orc.set('parcelas', parcelas)
      orc.set('validade', validade)
      orc.set('status', 'proposto')
      $app.save(orc)
    } catch (err) {
      return e.badRequestError('Nao foi possivel gerar o orcamento: ' + String(err))
    }

    return e.json(200, {
      ok: true,
      id: orc.id,
      plano_versao: corrente.getInt('versao'),
      valor_bruto_centavos: s.bruto,
      desconto_centavos: desconto,
      valor_final_centavos: final,
      parcela_centavos: Math.round(final / parcelas),
      parcelas: parcelas,
      validade: validade,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/decidir-orcamento',
  (e) => {
    const permissao = exigirClinico(e)
    if (permissao === 'sem-auth') return e.unauthorizedError('Autenticacao obrigatoria.')
    if (permissao !== 'ok') return e.forbiddenError('Seu perfil nao decide orcamento.')

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const orcId = String(body.orcamento_id || '')
    const decisao = String(body.decisao || '') // aprovado | recusado
    const motivo = String(body.motivo || '').trim()

    if (!orcId) return e.badRequestError('Informe o orcamento.')
    if (['aprovado', 'recusado'].indexOf(decisao) < 0) {
      return e.badRequestError('Decisao invalida.')
    }
    // recusa sem motivo não serve para nada: o valor de registrar a recusa é
    // saber por que o paciente disse não (preço? tempo? desconfiança?)
    if (decisao === 'recusado' && !motivo) {
      return e.badRequestError('Informe o motivo da recusa.')
    }

    let orc
    try {
      orc = $app.findRecordById('orcamento', orcId)
    } catch (_) {
      return e.notFoundError('Orcamento nao encontrado.')
    }
    if (orc.getString('tenant_id') !== tenant) return e.notFoundError('Orcamento nao encontrado.')
    if (orc.getString('status') !== 'proposto') {
      return e.badRequestError('Este orcamento ja foi decidido.')
    }

    try {
      orc.set('status', decisao)
      if (decisao === 'aprovado') {
        orc.set('aprovado_por', e.auth.id)
        orc.set('aprovado_em', new Date().toISOString().replace('T', ' ').slice(0, 23) + 'Z')
      } else {
        orc.set('motivo_recusa', motivo.slice(0, 1000))
      }
      $app.save(orc)

      // aprovação sobe o status do plano
      if (decisao === 'aprovado') {
        const plano = $app.findRecordById('plano_tratamento', orc.getString('plano_tratamento_id'))
        if (plano.getString('status') === 'proposto') {
          plano.set('status', 'aprovado')
          $app.save(plano)
        }
      }
    } catch (err) {
      return e.badRequestError('Nao foi possivel registrar a decisao: ' + String(err))
    }

    return e.json(200, { ok: true, status: decisao })
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------- execução
routerAdd(
  'POST',
  '/backend/v1/registrar-realizado',
  (e) => {
    const permissao = exigirClinico(e)
    if (permissao === 'sem-auth') return e.unauthorizedError('Autenticacao obrigatoria.')
    if (permissao !== 'ok') return e.forbiddenError('Seu perfil nao registra procedimento.')

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const itemId = String(body.item_tratamento_id || '')
    const atendimentoId = String(body.atendimento_id || '')
    const executanteId = String(body.profissional_executante_id || '')
    const dente = String(body.dente || '')

    if (!itemId) return e.badRequestError('Informe o item do plano.')

    let item
    try {
      item = $app.findRecordById('item_tratamento', itemId)
    } catch (_) {
      return e.notFoundError('Item nao encontrado.')
    }
    if (item.getString('tenant_id') !== tenant) return e.notFoundError('Item nao encontrado.')

    const statusAtual = item.getString('status')
    if (statusAtual === 'executado') {
      return e.badRequestError('Este item ja foi executado.')
    }
    if (statusAtual === 'cancelado') {
      return e.badRequestError('Item cancelado nao pode ser executado.')
    }

    const fase = $app.findRecordById('fase', item.getString('fase_id'))
    const plano = $app.findRecordById('plano_tratamento', fase.getString('plano_tratamento_id'))
    const pacienteId = plano.getString('paciente_id')

    // o item precisa estar na versão CORRENTE: executar item de versão antiga
    // criaria realizado que não corresponde ao que o paciente aprovou
    const corrente = versaoCorrente($app, plano.id)
    if (!corrente || corrente.id !== plano.id) {
      return e.badRequestError(
        'Este item pertence a uma versao antiga do plano. Execute pela versao atual.',
      )
    }

    let executante = ''
    if (executanteId) {
      try {
        const p = $app.findRecordById('profissional', executanteId)
        if (p.getString('tenant_id') !== tenant)
          return e.notFoundError('Profissional nao encontrado.')
        executante = executanteId
      } catch (_) {
        return e.notFoundError('Profissional nao encontrado.')
      }
    } else {
      executante = plano.getString('profissional_id')
    }

    const valor = (item.getInt('valor_unitario_centavos') || 0) * (item.getInt('quantidade') || 1)

    try {
      const col = $app.findCollectionByNameOrId('procedimento_realizado')
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('paciente_id', pacienteId)
      if (atendimentoId) r.set('atendimento_id', atendimentoId)
      r.set('procedimento_id', item.getString('procedimento_id'))
      r.set('item_tratamento_id', item.id)
      r.set('dente', dente || item.getString('dente'))
      r.set('face', item.get('face') || [])
      r.set('profissional_executante_id', executante)
      // solicitante é quem montou o plano — preserva a diferença entre quem
      // indicou e quem executou
      r.set('profissional_solicitante_id', plano.getString('profissional_id'))
      r.set('valor_centavos', valor)
      r.set('executado_por', e.auth.id)
      $app.save(r)

      // status: fato consumado. Não há caminho de volta por update direto.
      item.set('status', 'executado')
      $app.save(item)

      // o plano entra em execução
      if (plano.getString('status') === 'aprovado' || plano.getString('status') === 'proposto') {
        plano.set('status', 'em_execucao')
        $app.save(plano)
      }

      return e.json(200, { ok: true, id: r.id, valor_centavos: valor })
    } catch (err) {
      return e.badRequestError('Nao foi possivel registrar: ' + String(err))
    }
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------- cancelar
routerAdd(
  'POST',
  '/backend/v1/cancelar-tratamento',
  (e) => {
    const permissao = exigirClinico(e)
    if (permissao === 'sem-auth') return e.unauthorizedError('Autenticacao obrigatoria.')
    if (permissao !== 'ok') return e.forbiddenError('Seu perfil nao cancela tratamento.')

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const planoId = String(body.plano_id || '')
    const destino = String(body.destino || '') // credito | estorno | nada
    const motivo = String(body.motivo || '').trim()

    if (!planoId) return e.badRequestError('Informe o plano.')
    if (!motivo) return e.badRequestError('O motivo do cancelamento e obrigatorio.')

    const corrente = versaoCorrente($app, planoId)
    if (!corrente) return e.notFoundError('Plano nao encontrado.')
    if (corrente.getString('tenant_id') !== tenant) return e.notFoundError('Plano nao encontrado.')
    if (corrente.getString('status') === 'cancelado') {
      return e.badRequestError('Este tratamento ja esta cancelado.')
    }

    const itens = itensDaVersao($app, corrente.id)
    const s = somar(itens)
    const temExecucao = s.executado > 0

    /* A REGRA DA ETAPA: com execução, é OBRIGATÓRIO escolher entre crédito e
       estorno. A escolha não pode ser automática porque é decisão com
       consequência financeira e jurídica — e porque "o sistema decidiu" não é
       resposta aceitável para o paciente nem para o contador.

       O que sobra para devolver é o PENDENTE (o que ele pagou/foi cobrado e não
       recebeu), não o valor total: o que já foi executado foi entregue. */
    if (temExecucao) {
      if (['credito', 'estorno'].indexOf(destino) < 0) {
        return e.badRequestError(
          'Este tratamento ja tem procedimento executado. Escolha entre gerar credito ao paciente ou estorno, e informe o motivo.',
        )
      }
    } else if (destino && ['credito', 'estorno', 'nada'].indexOf(destino) < 0) {
      return e.badRequestError('Destino invalido.')
    }

    try {
      // cancela o plano; NÃO apaga nada
      corrente.set('status', 'cancelado')
      $app.save(corrente)

      // itens propostos passam a cancelados (registro do que não será feito).
      // Executados ficam executados: foram feitos.
      for (const { item } of itens) {
        const st = item.getString('status')
        if (st === 'proposto') {
          item.set('status', 'cancelado')
          $app.save(item)
        }
      }

      let credito = null
      if (temExecucao && destino === 'credito' && s.pendente > 0) {
        const col = $app.findCollectionByNameOrId('credito_paciente')
        credito = new Record(col)
        credito.set('tenant_id', tenant)
        credito.set('paciente_id', corrente.getString('paciente_id'))
        credito.set('valor_centavos', s.pendente)
        credito.set('origem', 'cancelamento_tratamento')
        credito.set('tratamento_id', corrente.id)
        credito.set('utilizado_centavos', 0)
        credito.set('observacao', 'Cancelamento: ' + motivo)
        credito.set('autor_id', e.auth.id)
        $app.save(credito)
      }

      return e.json(200, {
        ok: true,
        destino: temExecucao ? destino : 'nada',
        executado_centavos: s.executado,
        pendente_centavos: s.pendente,
        credito_id: credito ? credito.id : '',
        credito_centavos: credito ? s.pendente : 0,
      })
    } catch (err) {
      return e.badRequestError('Nao foi possivel cancelar: ' + String(err))
    }
  },
  $apis.requireAuth(),
)

// ---------------------------------------------------------------- consultas
routerAdd(
  'GET',
  '/backend/v1/execucao-plano',
  (e) => {
    const permissao = exigirClinico(e)
    if (permissao === 'sem-auth') return e.unauthorizedError('Autenticacao obrigatoria.')
    if (permissao !== 'ok') return e.forbiddenError('Seu perfil nao acessa execucao.')

    const pacienteId = String(e.request.url.query().get('paciente_id') || '')
    const planoId = String(e.request.url.query().get('plano_id') || '')
    const tenant = e.auth.getString('tenant_id')

    let planos = []
    try {
      const filtro = planoId
        ? 'id = "' + planoId + '"'
        : 'tenant_id = "' +
          tenant +
          '"' +
          (pacienteId ? ' && paciente_id = "' + pacienteId + '"' : '')
      planos = $app.findRecordsByFilter('plano_tratamento', filtro, '-created', 100, 0)
    } catch (_) {
      return e.json(200, { planos: [] })
    }

    const saida = []
    for (const p of planos) {
      if (p.getString('tenant_id') !== tenant) continue
      // SÓ a versão corrente: somar versões contaria 2x o executado copiado
      const corrente = versaoCorrente($app, p.id)
      if (!corrente || corrente.id !== p.id) continue

      const itens = itensDaVersao($app, corrente.id)
      const s = somar(itens)

      saida.push({
        id: corrente.id,
        titulo: corrente.getString('titulo'),
        versao: corrente.getInt('versao'),
        status: corrente.getString('status'),
        bruto_centavos: s.bruto,
        executado_centavos: s.executado,
        pendente_centavos: s.pendente,
        substituido_centavos: s.substituido,
        cancelado_centavos: s.cancelado,
        total_itens: itens.length,
        itens_executados: itens.filter(({ item }) => item.getString('status') === 'executado')
          .length,
        itens_pendentes: itens.filter(({ item }) => item.getString('status') === 'proposto').length,
      })
    }

    return e.json(200, { planos: saida })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/passivo-clinico',
  (e) => {
    const permissao = exigirClinico(e)
    if (permissao === 'sem-auth') return e.unauthorizedError('Autenticacao obrigatoria.')
    if (permissao !== 'ok') return e.forbiddenError('Seu perfil nao acessa o passivo clinico.')

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const filtroPaciente = String(q.get('paciente_id') || '')
    const filtroProf = String(q.get('profissional_id') || '')
    const filtroEsp = String(q.get('especialidade_id') || '')

    let planos = []
    try {
      planos = $app.findRecordsByFilter(
        'plano_tratamento',
        'tenant_id = "' + tenant + '"',
        '-created',
        500,
        0,
      )
    } catch (_) {
      return e.json(200, {
        total_centavos: 0,
        itens: [],
        por_paciente: [],
        por_profissional: [],
        por_especialidade: [],
      })
    }

    const linhas = []
    let total = 0

    for (const p of planos) {
      if (p.getString('status') === 'cancelado') continue
      const corrente = versaoCorrente($app, p.id)
      if (!corrente || corrente.id !== p.id) continue
      if (corrente.getString('status') === 'cancelado') continue

      const itens = itensDaVersao($app, corrente.id)
      for (const { fase, item } of itens) {
        // passivo = vendido e não entregue
        if (item.getString('status') !== 'proposto') continue

        if (filtroPaciente && corrente.getString('paciente_id') !== filtroPaciente) continue
        if (filtroProf && corrente.getString('profissional_id') !== filtroProf) continue

        let proc = null
        try {
          proc = $app.findRecordById('procedimento', item.getString('procedimento_id'))
        } catch (_) {}
        if (filtroEsp && (!proc || proc.getString('especialidade_id') !== filtroEsp)) continue

        const v = (item.getInt('valor_unitario_centavos') || 0) * (item.getInt('quantidade') || 1)
        total += v

        let pacienteNome = ''
        try {
          pacienteNome = $app
            .findRecordById('paciente', corrente.getString('paciente_id'))
            .getString('nome')
        } catch (_) {}
        let profNome = ''
        try {
          profNome = $app
            .findRecordById('profissional', corrente.getString('profissional_id'))
            .getString('nome')
        } catch (_) {}
        let espId = ''
        let espNome = ''
        if (proc) {
          espId = proc.getString('especialidade_id')
          if (espId) {
            try {
              espNome = $app.findRecordById('especialidade', espId).getString('nome')
            } catch (_) {}
          }
        }

        linhas.push({
          plano_id: corrente.id,
          plano_titulo: corrente.getString('titulo'),
          versao: corrente.getInt('versao'),
          plano_status: corrente.getString('status'),
          paciente_id: corrente.getString('paciente_id'),
          paciente_nome: pacienteNome,
          profissional_id: corrente.getString('profissional_id'),
          profissional_nome: profNome,
          especialidade_id: espId,
          especialidade_nome: espNome,
          procedimento_nome: proc ? proc.getString('nome') : '',
          procedimento_codigo: proc ? proc.getString('codigo') : '',
          fase: fase.getString('nome'),
          dente: item.getString('dente'),
          valor_centavos: v,
        })
      }
    }

    function agrupar(chave) {
      const mapa = {}
      for (const l of linhas) {
        const k = l[chave] || 'sem'
        if (!mapa[k]) mapa[k] = { chave: k, valor_centavos: 0, itens: 0 }
        mapa[k].valor_centavos += l.valor_centavos
        mapa[k].itens++
      }
      return Object.keys(mapa)
        .map((k) => mapa[k])
        .sort((a, b) => b.valor_centavos - a.valor_centavos)
    }

    const porPaciente = {}
    for (const l of linhas) {
      const k = l.paciente_id
      if (!porPaciente[k])
        porPaciente[k] = { id: k, nome: l.paciente_nome, valor_centavos: 0, itens: 0 }
      porPaciente[k].valor_centavos += l.valor_centavos
      porPaciente[k].itens++
    }
    const porProf = {}
    for (const l of linhas) {
      const k = l.profissional_id
      if (!porProf[k])
        porProf[k] = { id: k, nome: l.profissional_nome, valor_centavos: 0, itens: 0 }
      porProf[k].valor_centavos += l.valor_centavos
      porProf[k].itens++
    }
    const porEsp = {}
    for (const l of linhas) {
      const k = l.especialidade_id || 'sem'
      if (!porEsp[k])
        porEsp[k] = {
          id: k,
          nome: l.especialidade_nome || 'Sem especialidade',
          valor_centavos: 0,
          itens: 0,
        }
      porEsp[k].valor_centavos += l.valor_centavos
      porEsp[k].itens++
    }

    function ordenar(m) {
      return Object.keys(m)
        .map((k) => m[k])
        .sort((a, b) => b.valor_centavos - a.valor_centavos)
    }

    return e.json(200, {
      total_centavos: total,
      total_itens: linhas.length,
      itens: linhas.slice(0, 500),
      por_paciente: ordenar(porPaciente),
      por_profissional: ordenar(porProf),
      por_especialidade: ordenar(porEsp),
    })
  },
  $apis.requireAuth(),
)
