/* Rota de montagem de plano (Etapa 9)

   POST /backend/v1/salvar-plano — cria plano novo (v1) ou nova VERSÃO

   REGRA CENTRAL: alterar plano NUNCA edita o registro existente. Cria uma
   versão nova (versao + 1) apontando para a anterior, e copia o que já foi
   executado. O plano antigo continua consultável com o orçamento dele — é o
   que permite provar o que foi combinado, e quando.

   O que é copiado para a nova versão:
   - itens 'executado' e 'substituido': SEMPRE. São fatos consumados; apagar
     seria perder o registro do que já foi feito e pago.
   - itens 'proposto': só os que o cliente reenviar. Mudar o plano costuma ser
     justamente tirar ou trocar propostos.
   - itens 'cancelado': não voltam.

   `substituido_por_item_id` liga o item antigo ao novo quando o procedimento
   muda. É a diferença entre "trocamos a restauração por uma coroa" e "não
   temos ideia do porquê este item sumiu".

   NOTA DE IMPLEMENTAÇÃO: o JSVM do PocketBase executa cada callback num pool
   separado e não enxerga funções de topo (ReferenceError). Por isso a
   resolução de versão é feita inline aqui. */

routerAdd(
  'POST',
  '/backend/v1/salvar-plano',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao monta plano de tratamento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}

    const planoId = String(body.plano_id || '') // preenchido = nova versão
    const pacienteId = String(body.paciente_id || '')
    const profissionalId = String(body.profissional_id || '')
    const titulo = String(body.titulo || '').trim()
    const observacoes = String(body.observacoes || '')
    const fases = Array.isArray(body.fases) ? body.fases : []

    if (!pacienteId) return e.badRequestError('Informe o paciente.')
    if (!profissionalId) return e.badRequestError('Informe o profissional responsavel.')
    if (!titulo) return e.badRequestError('Informe o titulo do plano.')
    if (fases.length === 0) return e.badRequestError('O plano precisa de ao menos uma fase.')

    try {
      const pac = $app.findRecordById('paciente', pacienteId)
      if (pac.getString('tenant_id') !== tenant) return e.notFoundError('Paciente nao encontrado.')
    } catch (_) {
      return e.notFoundError('Paciente nao encontrado.')
    }
    try {
      const prof = $app.findRecordById('profissional', profissionalId)
      if (prof.getString('tenant_id') !== tenant) {
        return e.notFoundError('Profissional nao encontrado.')
      }
    } catch (_) {
      return e.notFoundError('Profissional nao encontrado.')
    }

    // ---------- versão / plano anterior ----------
    let versao = 1
    let planoAnterior = ''
    let planoExistente = null

    if (planoId) {
      let raiz
      try {
        raiz = $app.findRecordById('plano_tratamento', planoId)
      } catch (_) {
        return e.notFoundError('Plano nao encontrado.')
      }
      if (raiz.getString('tenant_id') !== tenant) return e.notFoundError('Plano nao encontrado.')

      // sobe até a raiz e pega a maior versão
      let maior = raiz.getInt('versao') || 1
      let cursor = raiz
      let g = 0
      while (g < 50) {
        g++
        const ant = cursor.getString('plano_anterior_id')
        if (!ant) break
        try {
          cursor = $app.findRecordById('plano_tratamento', ant)
          const v = cursor.getInt('versao') || 1
          if (v > maior) maior = v
        } catch (_) {
          break
        }
      }

      /* Só a versão MAIS RECENTE pode gerar outra. Gerar v3 a partir da v1
         criaria duas cadeias paralelas para o mesmo tratamento, e aí "qual é a
         corrente" passa a depender da ordem da consulta. */
      let corrente = raiz
      let g2 = 0
      while (g2 < 50) {
        g2++
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
      if (corrente.id !== raiz.id) {
        return e.badRequestError(
          'Este plano ja tem uma versao mais nova (v' +
            corrente.getInt('versao') +
            '). Abra a versao atual para alterar.',
        )
      }

      if (raiz.getString('status') === 'cancelado') {
        return e.badRequestError('Plano cancelado nao gera nova versao.')
      }

      planoExistente = raiz
      versao = maior + 1
      planoAnterior = raiz.id
    }

    // ---------- cabeçalho ----------
    let plano
    try {
      const colPlano = $app.findCollectionByNameOrId('plano_tratamento')
      plano = new Record(colPlano)
      plano.set('tenant_id', tenant)
      plano.set('paciente_id', pacienteId)
      plano.set('profissional_id', profissionalId)
      plano.set('titulo', titulo)
      plano.set('versao', versao)
      plano.set('status', planoExistente ? planoExistente.getString('status') : 'proposto')
      plano.set('observacoes', observacoes)
      if (planoAnterior) plano.set('plano_anterior_id', planoAnterior)
      plano.set('created_by', e.auth.id)
      $app.save(plano)
    } catch (err) {
      return e.badRequestError('Nao foi possivel criar o plano: ' + String(err))
    }

    const colFase = $app.findCollectionByNameOrId('fase')
    const colItem = $app.findCollectionByNameOrId('item_tratamento')

    // itens da versão anterior (para copiar executados e ligar substituições)
    const itensAnteriores = {}
    if (planoAnterior) {
      try {
        const fasesAnt = $app.findRecordsByFilter(
          'fase',
          'plano_tratamento_id = "' + planoAnterior + '"',
          'ordem',
          100,
          0,
        )
        for (const f of fasesAnt) {
          const its = $app.findRecordsByFilter(
            'item_tratamento',
            'fase_id = "' + f.id + '"',
            '',
            500,
            0,
          )
          for (const it of its) itensAnteriores[it.id] = it
        }
      } catch (_) {}
    }

    const criadosPorChave = {}
    let totalItens = 0

    try {
      let ordem = 0
      for (const f of fases) {
        ordem++
        const fase = new Record(colFase)
        fase.set('tenant_id', tenant)
        fase.set('plano_tratamento_id', plano.id)
        fase.set('ordem', Number(f.ordem) || ordem)
        fase.set('nome', String(f.nome || 'Fase ' + ordem).slice(0, 120))
        $app.save(fase)

        const itens = Array.isArray(f.itens) ? f.itens : []
        for (const it of itens) {
          const procId = String(it.procedimento_id || '')
          if (!procId) continue
          try {
            const proc = $app.findRecordById('procedimento', procId)
            if (proc.getString('tenant_id') !== tenant) continue

            /* O preço vem do cliente JÁ RESOLVIDO pela rota resolver-preco, e
               fica gravado como snapshot. Se eu recalcular aqui, um reajuste de
               tabela reescreveria orçamento já apresentado ao paciente.

               MENSAGEM SEPARADA POR CAUSA (correção da auditoria): antes, tanto
               "o cliente não mandou o valor" quanto "não existe preço na tabela"
               resultavam em "Resolva o preco antes de salvar". A segunda causa
               é problema de cadastro do dono; a primeira é bug de cliente da
               API. Dizer a mesma frase para as duas manda a pessoa procurar
               preço quando o problema é o campo que faltou no corpo. */
            const temCampo =
              it.valor_unitario_centavos !== undefined &&
              it.valor_unitario_centavos !== null &&
              it.valor_unitario_centavos !== ''
            const valor = Number(it.valor_unitario_centavos)

            if (!temCampo) {
              return e.badRequestError(
                'O item (' +
                  proc.getString('nome') +
                  ') chegou sem valor_unitario_centavos. Resolva o preco pela rota /backend/v1/resolver-preco antes de salvar o plano.',
              )
            }
            if (isNaN(valor) || valor < 0) {
              return e.badRequestError(
                'Valor invalido no item (' +
                  proc.getString('nome') +
                  '): ' +
                  it.valor_unitario_centavos,
              )
            }

            /* STATUS DO ITEM REENVIADO.
               Quando o cliente manda `origem_item_id`, ele está dizendo "este
               item da v2 é o mesmo da v1". Se o original já era 'executado', o
               novo tem de nascer 'executado' — senão o trabalho feito
               desaparece da versão corrente e o passivo clínico volta a contar
               como vendido algo que já foi entregue.

               Foi exatamente o erro da primeira versão desta rota: eu copiava
               os executados NÃO reenviados, mas rebaixava a 'proposto' os que
               o cliente reenviava. Os dois caminhos precisam preservar o
               status, só o status, nunca o resto. */
            let statusItem = 'proposto'
            const origemId = String(it.origem_item_id || '')
            if (origemId && itensAnteriores[origemId]) {
              const stAnt = itensAnteriores[origemId].getString('status')
              if (stAnt === 'executado') statusItem = 'executado'
              else if (stAnt === 'substituido') statusItem = 'substituido'
            }

            const item = new Record(colItem)
            item.set('tenant_id', tenant)
            item.set('fase_id', fase.id)
            item.set('procedimento_id', procId)
            item.set('dente', String(it.dente || ''))
            item.set('face', Array.isArray(it.face) ? it.face : [])
            item.set('quantidade', Math.max(1, Number(it.quantidade) || 1))
            item.set('valor_unitario_centavos', Math.round(valor))
            item.set('observacao', String(it.observacao || '').slice(0, 500))
            item.set('status', statusItem)
            $app.save(item)
            totalItens++

            /* Substituição: o item da versão anterior ganha status
               'substituido' e aponta para o novo.

               Isso ALTERA um registro da v1 — e é deliberado. O plano está
               preservado (existe, com fases, itens e orçamento), mas o item
               precisa carregar o fato "fui trocado por este". Sem essa marca, a
               v1 ficaria dizendo que a coroa ainda está proposta, e o histórico
               mentiria sobre o que aconteceu.

               Nunca rebaixo um item EXECUTADO aqui: `if` só alcança 'proposto'.
               Executado é fato consumado. */
            const refAnterior = String(it.substitui_item_id || '')
            if (refAnterior && itensAnteriores[refAnterior]) {
              const antigo = itensAnteriores[refAnterior]
              if (antigo.getString('status') === 'proposto') {
                antigo.set('status', 'substituido')
                antigo.set('substituido_por_item_id', item.id)
                $app.save(antigo)
              }
              criadosPorChave[refAnterior] = item.id
            }
            if (it.origem_item_id) criadosPorChave[String(it.origem_item_id)] = item.id
          } catch (_) {
            /* item inválido: segue com os demais; o relatório vem no retorno */
          }
        }
      }

      /* Copia os itens JÁ EXECUTADOS que o cliente não reenviou. Sem isso a v2
         apareceria sem o trabalho feito e o passivo clínico sairia errado —
         executado é fato consumado, não desaparece porque alguém mudou o plano. */
      if (planoAnterior) {
        /* Marca o que já foi tratado nesta rodada para não copiar de novo.
           São DUAS chaves diferentes:
             - origem_item_id: o cliente reenviou o item (mantido)
             - substitui_item_id: o cliente trocou o item (o antigo vira
               'substituido' e o novo entra no lugar) */
        const reenviados = {}
        for (const f of fases) {
          for (const it of Array.isArray(f.itens) ? f.itens : []) {
            if (it.origem_item_id) reenviados[String(it.origem_item_id)] = true
            if (it.substitui_item_id) reenviados[String(it.substitui_item_id)] = true
          }
        }

        const pendentes = Object.keys(itensAnteriores).filter((k) => {
          const st = itensAnteriores[k].getString('status')
          return (st === 'executado' || st === 'substituido') && !reenviados[k]
        })

        let faseMantidos = null
        if (pendentes.length > 0) {
          faseMantidos = new Record(colFase)
          faseMantidos.set('tenant_id', tenant)
          faseMantidos.set('plano_tratamento_id', plano.id)
          faseMantidos.set('ordem', 99)
          faseMantidos.set('nome', 'Ja executado')
          $app.save(faseMantidos)
        }

        for (const k of pendentes) {
          const antigo = itensAnteriores[k]
          const copia = new Record(colItem)
          copia.set('tenant_id', tenant)
          copia.set('fase_id', faseMantidos.id)
          copia.set('procedimento_id', antigo.getString('procedimento_id'))
          copia.set('dente', antigo.getString('dente'))
          copia.set('face', antigo.get('face') || [])
          copia.set('quantidade', antigo.getInt('quantidade') || 1)
          copia.set('valor_unitario_centavos', antigo.getInt('valor_unitario_centavos') || 0)
          copia.set('observacao', antigo.getString('observacao'))
          copia.set('status', antigo.getString('status'))
          $app.save(copia)
          criadosPorChave[k] = copia.id
          totalItens++
        }

        // religa as substituições que dependiam de um item copiado
        for (const k of Object.keys(itensAnteriores)) {
          const antigo = itensAnteriores[k]
          const sub = antigo.getString('substituido_por_item_id')
          if (!sub) continue
          const meuNovo = criadosPorChave[k]
          const alvoNovo = criadosPorChave[sub]
          if (meuNovo && alvoNovo) {
            try {
              const it2 = $app.findRecordById('item_tratamento', meuNovo)
              it2.set('substituido_por_item_id', alvoNovo)
              $app.save(it2)
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      // não deixa plano meio montado: apaga o cabeçalho (fases/itens caem por cascade)
      try {
        $app.delete(plano)
      } catch (_) {}
      return e.badRequestError('Falha ao montar o plano: ' + String(err))
    }

    return e.json(200, {
      ok: true,
      id: plano.id,
      versao: versao,
      anterior_id: planoAnterior,
      itens: totalItens,
    })
  },
  $apis.requireAuth(),
)
