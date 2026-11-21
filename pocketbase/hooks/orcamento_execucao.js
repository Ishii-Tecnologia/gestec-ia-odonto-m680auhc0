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
   passaria a mentir.

   PASSIVO CLÍNICO = valor dos itens 'proposto' na versão corrente de planos
   não cancelados. É o que a clínica vendeu e ainda não entregou.

   NOTA DE IMPLEMENTAÇÃO: o JSVM do PocketBase roda cada callback num pool
   separado, então funções declaradas no topo do arquivo NÃO existem em tempo
   de execução (ReferenceError). Por isso a resolução da versão corrente é
   repetida inline em cada callback. É duplicação — e é a única forma que
   funciona aqui. */

// ---------------------------------------------------------------- orçamento
routerAdd(
  'POST',
  '/backend/v1/gerar-orcamento',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao gera orcamento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const planoId = String(body.plano_id || '')
    const desconto = Math.max(0, Number(body.desconto_centavos) || 0)
    const parcelas = Math.max(1, Number(body.parcelas) || 1)
    const diasValidade = Number(body.dias_validade) || 30

    if (!planoId) return e.badRequestError('Informe o plano.')

    let plano
    try {
      plano = $app.findRecordById('plano_tratamento', planoId)
    } catch (_) {
      return e.notFoundError('Plano nao encontrado.')
    }
    if (plano.getString('tenant_id') !== tenant) return e.notFoundError('Plano nao encontrado.')

    // resolve a versão CORRENTE (desce a cadeia de plano_anterior_id)
    let corrente = plano
    let guarda = 0
    while (guarda < 50) {
      guarda++
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

    if (corrente.getString('status') === 'cancelado') {
      return e.badRequestError('Plano cancelado nao gera orcamento.')
    }

    const itens = []
    try {
      const fs = $app.findRecordsByFilter(
        'fase',
        'plano_tratamento_id = "' + corrente.id + '"',
        'ordem',
        100,
        0,
      )
      for (const f of fs) {
        const its = $app.findRecordsByFilter(
          'item_tratamento',
          'fase_id = "' + f.id + '"',
          '',
          500,
          0,
        )
        for (const it of its) itens.push(it)
      }
    } catch (_) {}

    if (itens.length === 0) return e.badRequestError('O plano nao tem itens.')

    let bruto = 0
    for (const it of itens) {
      const st = it.getString('status')
      if (st !== 'proposto' && st !== 'executado') continue
      bruto += (it.getInt('valor_unitario_centavos') || 0) * (it.getInt('quantidade') || 1)
    }

    if (desconto > bruto) {
      return e.badRequestError('O desconto nao pode passar do valor bruto.')
    }
    const final = bruto - desconto

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
      orc.set('valor_bruto_centavos', bruto)
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
      valor_bruto_centavos: bruto,
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
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao decide orcamento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const orcId = String(body.orcamento_id || '')
    const decisao = String(body.decisao || '')
    const motivo = String(body.motivo || '').trim()

    if (!orcId) return e.badRequestError('Informe o orcamento.')
    if (['aprovado', 'recusado'].indexOf(decisao) < 0) {
      return e.badRequestError('Decisao invalida.')
    }
    /* Recusa sem motivo não serve para nada: o valor de registrar a recusa é
       saber POR QUE o paciente disse não — preço, tempo, desconfiança. É essa
       informação que a clínica usa para ajustar a próxima proposta. */
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
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao registra procedimento.')
    }

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
    if (statusAtual === 'executado') return e.badRequestError('Este item ja foi executado.')
    if (statusAtual === 'cancelado')
      return e.badRequestError('Item cancelado nao pode ser executado.')

    const fase = $app.findRecordById('fase', item.getString('fase_id'))
    const plano = $app.findRecordById('plano_tratamento', fase.getString('plano_tratamento_id'))

    /* O item tem de estar na versão CORRENTE. Executar item de versão antiga
       criaria um realizado que não corresponde ao que o paciente aprovou — e o
       passivo, que soma só a corrente, ignoraria a execução. */
    let corrente = plano
    let guarda = 0
    while (guarda < 50) {
      guarda++
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
    if (corrente.id !== plano.id) {
      return e.badRequestError(
        'Este item pertence a uma versao antiga do plano. Execute pela versao atual.',
      )
    }

    const pacienteId = plano.getString('paciente_id')

    let executante = plano.getString('profissional_id')
    if (executanteId) {
      try {
        const p = $app.findRecordById('profissional', executanteId)
        if (p.getString('tenant_id') !== tenant)
          return e.notFoundError('Profissional nao encontrado.')
        executante = executanteId
      } catch (_) {
        return e.notFoundError('Profissional nao encontrado.')
      }
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
      // solicitante é quem MONTOU o plano: preserva a diferença entre quem
      // indicou e quem executou — é o que permite auditar produção por origem
      r.set('profissional_solicitante_id', plano.getString('profissional_id'))
      r.set('valor_centavos', valor)
      r.set('executado_por', e.auth.id)
      $app.save(r)

      item.set('status', 'executado')
      $app.save(item)

      const st = plano.getString('status')
      if (st === 'aprovado' || st === 'proposto') {
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
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao cancela tratamento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const planoId = String(body.plano_id || '')
    const destino = String(body.destino || '')
    const motivo = String(body.motivo || '').trim()

    if (!planoId) return e.badRequestError('Informe o plano.')
    if (!motivo) return e.badRequestError('O motivo do cancelamento e obrigatorio.')

    let plano
    try {
      plano = $app.findRecordById('plano_tratamento', planoId)
    } catch (_) {
      return e.notFoundError('Plano nao encontrado.')
    }
    if (plano.getString('tenant_id') !== tenant) return e.notFoundError('Plano nao encontrado.')

    let corrente = plano
    let guarda = 0
    while (guarda < 50) {
      guarda++
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
    if (corrente.getString('status') === 'cancelado') {
      return e.badRequestError('Este tratamento ja esta cancelado.')
    }

    const itens = []
    try {
      const fs = $app.findRecordsByFilter(
        'fase',
        'plano_tratamento_id = "' + corrente.id + '"',
        'ordem',
        100,
        0,
      )
      for (const f of fs) {
        const its = $app.findRecordsByFilter(
          'item_tratamento',
          'fase_id = "' + f.id + '"',
          '',
          500,
          0,
        )
        for (const it of its) itens.push(it)
      }
    } catch (_) {}

    let executado = 0
    let pendente = 0
    for (const it of itens) {
      const v = (it.getInt('valor_unitario_centavos') || 0) * (it.getInt('quantidade') || 1)
      const st = it.getString('status')
      if (st === 'executado') executado += v
      else if (st === 'proposto') pendente += v
    }
    const temExecucao = executado > 0

    /* A REGRA DA ETAPA: com execução, é OBRIGATÓRIO escolher entre crédito e
       estorno. A escolha não pode ser automática porque é decisão com
       consequência financeira e jurídica — e "o sistema decidiu" não é resposta
       aceitável nem para o paciente nem para o contador.

       O que se devolve é o PENDENTE (o que foi cobrado e não entregue), nunca o
       total: o que foi executado foi entregue. */
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
      corrente.set('status', 'cancelado')
      $app.save(corrente)

      // propostos viram cancelados (registro do que não será feito).
      // Executados FICAM executados: foram feitos.
      for (const it of itens) {
        if (it.getString('status') === 'proposto') {
          it.set('status', 'cancelado')
          $app.save(it)
        }
      }

      let creditoId = ''
      if (temExecucao && destino === 'credito' && pendente > 0) {
        const col = $app.findCollectionByNameOrId('credito_paciente')
        const credito = new Record(col)
        credito.set('tenant_id', tenant)
        credito.set('paciente_id', corrente.getString('paciente_id'))
        credito.set('valor_centavos', pendente)
        credito.set('origem', 'cancelamento_tratamento')
        credito.set('tratamento_id', corrente.id)
        credito.set('utilizado_centavos', 0)
        credito.set('observacao', 'Cancelamento: ' + motivo)
        credito.set('autor_id', e.auth.id)
        $app.save(credito)
        creditoId = credito.id
      }

      return e.json(200, {
        ok: true,
        destino: temExecucao ? destino : 'nada',
        executado_centavos: executado,
        pendente_centavos: pendente,
        credito_id: creditoId,
        credito_centavos: creditoId ? pendente : 0,
      })
    } catch (err) {
      return e.badRequestError('Nao foi possivel cancelar: ' + String(err))
    }
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------- execução por plano
routerAdd(
  'GET',
  '/backend/v1/execucao-plano',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa execucao.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const pacienteId = String(q.get('paciente_id') || '')
    const planoId = String(q.get('plano_id') || '')

    let planos = []
    try {
      const filtro = planoId
        ? 'tenant_id = "' + tenant + '" && id = "' + planoId + '"'
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
      let corrente = p
      let guarda = 0
      while (guarda < 50) {
        guarda++
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
      if (corrente.id !== p.id) continue // versão antiga: a corrente é listada à parte

      let bruto = 0
      let executado = 0
      let pendente = 0
      let substituido = 0
      let cancelado = 0
      let nItens = 0
      let nExec = 0
      let nPend = 0

      try {
        const fs = $app.findRecordsByFilter(
          'fase',
          'plano_tratamento_id = "' + corrente.id + '"',
          'ordem',
          100,
          0,
        )
        for (const f of fs) {
          const its = $app.findRecordsByFilter(
            'item_tratamento',
            'fase_id = "' + f.id + '"',
            '',
            500,
            0,
          )
          for (const it of its) {
            nItens++
            const v = (it.getInt('valor_unitario_centavos') || 0) * (it.getInt('quantidade') || 1)
            const st = it.getString('status')
            if (st === 'executado') {
              executado += v
              bruto += v
              nExec++
            } else if (st === 'proposto') {
              pendente += v
              bruto += v
              nPend++
            } else if (st === 'substituido') {
              substituido += v
              bruto += v
            } else {
              cancelado += v
            }
          }
        }
      } catch (_) {}

      saida.push({
        id: corrente.id,
        titulo: corrente.getString('titulo'),
        paciente_id: corrente.getString('paciente_id'),
        versao: corrente.getInt('versao'),
        status: corrente.getString('status'),
        bruto_centavos: bruto,
        executado_centavos: executado,
        pendente_centavos: pendente,
        substituido_centavos: substituido,
        cancelado_centavos: cancelado,
        total_itens: nItens,
        itens_executados: nExec,
        itens_pendentes: nPend,
      })
    }

    return e.json(200, { planos: saida })
  },
  $apis.requireAuth(),
)

// ------------------------------------------------------------ passivo clínico
routerAdd(
  'GET',
  '/backend/v1/passivo-clinico',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa o passivo clinico.')
    }

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
        total_itens: 0,
        itens: [],
        por_paciente: [],
        por_profissional: [],
        por_especialidade: [],
      })
    }

    const linhas = []
    let total = 0

    for (const p of planos) {
      if (p.getString('tenant_id') !== tenant) continue

      // resolve corrente; só ela conta
      let corrente = p
      let guarda = 0
      while (guarda < 50) {
        guarda++
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
          'ordem',
          100,
          0,
        )
      } catch (_) {}

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

      for (const f of fs) {
        let its = []
        try {
          its = $app.findRecordsByFilter('item_tratamento', 'fase_id = "' + f.id + '"', '', 500, 0)
        } catch (_) {}
        for (const it of its) {
          // passivo = vendido e NÃO entregue
          if (it.getString('status') !== 'proposto') continue
          if (filtroPaciente && corrente.getString('paciente_id') !== filtroPaciente) continue
          if (filtroProf && corrente.getString('profissional_id') !== filtroProf) continue

          let procNome = ''
          let procCod = ''
          let espId = ''
          let espNome = ''
          try {
            const pr = $app.findRecordById('procedimento', it.getString('procedimento_id'))
            procNome = pr.getString('nome')
            procCod = pr.getString('codigo')
            espId = pr.getString('especialidade_id')
            if (espId) {
              try {
                espNome = $app.findRecordById('especialidade', espId).getString('nome')
              } catch (_) {}
            }
          } catch (_) {}

          if (filtroEsp && espId !== filtroEsp) continue

          const v = (it.getInt('valor_unitario_centavos') || 0) * (it.getInt('quantidade') || 1)
          total += v

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
            procedimento_nome: procNome,
            procedimento_codigo: procCod,
            fase: f.getString('nome'),
            dente: it.getString('dente'),
            valor_centavos: v,
          })
        }
      }
    }

    const porPaciente = {}
    const porProf = {}
    const porEsp = {}
    for (const l of linhas) {
      if (!porPaciente[l.paciente_id]) {
        porPaciente[l.paciente_id] = {
          id: l.paciente_id,
          nome: l.paciente_nome,
          valor_centavos: 0,
          itens: 0,
        }
      }
      porPaciente[l.paciente_id].valor_centavos += l.valor_centavos
      porPaciente[l.paciente_id].itens++

      if (!porProf[l.profissional_id]) {
        porProf[l.profissional_id] = {
          id: l.profissional_id,
          nome: l.profissional_nome,
          valor_centavos: 0,
          itens: 0,
        }
      }
      porProf[l.profissional_id].valor_centavos += l.valor_centavos
      porProf[l.profissional_id].itens++

      const kEsp = l.especialidade_id || 'sem'
      if (!porEsp[kEsp]) {
        porEsp[kEsp] = {
          id: kEsp,
          nome: l.especialidade_nome || 'Sem especialidade',
          valor_centavos: 0,
          itens: 0,
        }
      }
      porEsp[kEsp].valor_centavos += l.valor_centavos
      porEsp[kEsp].itens++
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
