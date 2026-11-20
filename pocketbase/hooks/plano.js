/* Rotas de plano de tratamento (Etapa 9)

   POST /backend/v1/salvar-plano      — cria plano novo (v1) ou nova VERSÃO
   GET  /backend/v1/plano-completo    — plano com fases, itens, orçamento e execução
   GET  /backend/v1/lista-planos      — lista com versão corrente marcada

   REGRA CENTRAL: alterar plano NUNCA edita o registro existente. Cria uma
   versão nova (versao + 1) apontando para a anterior, e copia o que já foi
   executado. O plano antigo continua consultável com o orçamento dele — é o
   que permite provar o que foi combinado e quando.

   O que é copiado para a nova versão:
   - itens 'executado' e 'substituido': SEMPRE (são fatos consumados; apagar
     seria perder o registro do que já foi feito e pago);
   - itens 'proposto': só os que o usuário manda manter (a tela mostra e ele
     escolhe — mudar o plano costuma ser justamente tirar/trocar propostos);
   - itens 'cancelado': não voltam.

   `substituido_por_item_id` liga o item antigo ao novo quando o procedimento
   muda. É a diferença entre "trocamos a restauração por uma coroa" e "não
   temos ideia do porquê este item sumiu". */

function hoje(offsets) {
  const d = new Date()
  if (offsets) d.setUTCDate(d.getUTCDate() + offsets)
  return d.toISOString().replace('T', ' ').slice(0, 23) + 'Z'
}

function exigirClinico(e) {
  if (e.hasSuperuserAuth()) return 'superuser'
  if (!e.auth) return 'sem-auth'
  const papel = e.auth.getString('papel')
  if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) return 'sem-papel'
  return 'ok'
}

function proximaVersao(app, planoId) {
  // sobe a cadeia até a raiz e devolve o maior número
  let atual = null
  try {
    atual = app.findRecordById('plano_tratamento', planoId)
  } catch (_) {
    return null
  }
  let maior = atual.getInt('versao') || 1
  let cursor = atual
  let guarda = 0
  while (guarda < 50) {
    guarda++
    const ant = cursor.getString('plano_anterior_id')
    if (!ant) break
    try {
      cursor = app.findRecordById('plano_tratamento', ant)
      const v = cursor.getInt('versao') || 1
      if (v > maior) maior = v
    } catch (_) {
      break
    }
  }
  // e desce a cadeia para achar descendentes (caso o id passado seja antigo)
  try {
    let desc = app.findRecordsByFilter(
      'plano_tratamento',
      'plano_anterior_id = "' + planoId + '"',
      '',
      1,
      0,
    )
    let g2 = 0
    while (desc.length > 0 && g2 < 50) {
      g2++
      const v = desc[0].getInt('versao') || 1
      if (v > maior) maior = v
      desc = app.findRecordsByFilter(
        'plano_tratamento',
        'plano_anterior_id = "' + desc[0].id + '"',
        '',
        1,
        0,
      )
    }
  } catch (_) {}

  return { versao: maior + 1, raiz: atual }
}

/* Versão CORRENTE de um plano: desce a cadeia de plano_anterior_id até o
   último. Toda soma de realizado/pendente usa isto — se somasse todas as
   versões, o item executado copiado para a v2 contaria duas vezes. */
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

routerAdd(
  'POST',
  '/backend/v1/salvar-plano',
  (e) => {
    const permissao = exigirClinico(e)
    if (permissao === 'sem-auth') return e.unauthorizedError('Autenticacao obrigatoria.')
    if (permissao !== 'ok') return e.forbiddenError('Seu perfil nao monta plano de tratamento.')

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

    // paciente e profissional do tenant
    try {
      const pac = $app.findRecordById('paciente', pacienteId)
      if (pac.getString('tenant_id') !== tenant) return e.notFoundError('Paciente nao encontrado.')
    } catch (_) {
      return e.notFoundError('Paciente nao encontrado.')
    }
    try {
      const prof = $app.findRecordById('profissional', profissionalId)
      if (prof.getString('tenant_id') !== tenant)
        return e.notFoundError('Profissional nao encontrado.')
    } catch (_) {
      return e.notFoundError('Profissional nao encontrado.')
    }

    // ---------- versão / plano ----------
    let versao = 1
    let planoAnterior = ''
    let planoExistente = null

    if (planoId) {
      const info = proximaVersao($app, planoId)
      if (!info || !info.raiz) return e.notFoundError('Plano nao encontrado.')
      if (info.raiz.getString('tenant_id') !== tenant)
        return e.notFoundError('Plano nao encontrado.')

      // Só a versão mais recente pode gerar outra. Gerar v3 a partir da v1
      // criaria duas cadeias paralelas para o mesmo tratamento.
      const corrente = versaoCorrente($app, info.raiz.id)
      if (corrente && corrente.id !== info.raiz.id) {
        return e.badRequestError(
          'Este plano ja tem uma versao mais nova (v' +
            corrente.getInt('versao') +
            '). Abra a versao atual para alterar.',
        )
      }

      planoExistente = info.raiz
      versao = info.versao
      planoAnterior = info.raiz.id

      if (planoExistente.getString('status') === 'cancelado') {
        return e.badRequestError('Plano cancelado nao gera nova versao.')
      }
    }

    // ---------- cria/atualiza o cabeçalho ----------
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

    // ---------- fase e itens ----------
    const colFase = $app.findCollectionByNameOrId('fase')
    const colItem = $app.findCollectionByNameOrId('item_tratamento')

    // mapa do que veio do plano anterior (para ligar substituições e copiar
    // executados). Chave: id do item na versão anterior.
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

    let totalItens = 0
    const criadosPorChave = {}

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
          let proc
          try {
            proc = $app.findRecordById('procedimento', procId)
            if (proc.getString('tenant_id') !== tenant) continue
          } catch (_) {
            continue
          }

          // preço: usa o que o cliente mandou (snapshot já resolvido pela rota
          // resolver-preco); se não veio, cai no preço do nada → recusa
          const valor = Number(it.valor_unitario_centavos)
          if (isNaN(valor) || valor < 0) {
            return e.badRequestError(
              'Item sem preco definido (' +
                proc.getString('nome') +
                '). Resolva o preco antes de salvar.',
            )
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
          item.set('status', 'proposto')
          $app.save(item)
          totalItens++

          // item novo que substitui um executado da versão anterior
          const refAnterior = String(it.substitui_item_id || '')
          if (refAnterior && itensAnteriores[refAnterior]) {
            item.set('status', 'proposto')
            $app.save(item)
            const antigo = itensAnteriores[refAnterior]
            if (antigo.getString('status') === 'proposto') {
              antigo.set('status', 'substituido')
            }
            antigo.set('substituido_por_item_id', item.id)
            $app.save(antigo)
            criadosPorChave[refAnterior] = item.id
          }
        }
      }

      /* Copia os itens EXECUTADOS (e os já substituídos) da versão anterior que
         o cliente NÃO reenviou. Sem isso, a v2 apareceria sem o trabalho feito —
         e o passivo clínico sairia errado. Executado é fato consumado: não
         desaparece por alguém ter mudado o plano. */
      if (planoAnterior) {
        const reenviados = {}
        // itens que o cliente mandou (por id de origem, se ele informou)
        for (const f of fases) {
          for (const it of Array.isArray(f.itens) ? f.itens : []) {
            if (it.origem_item_id) reenviados[String(it.origem_item_id)] = true
          }
        }

        // fase de "mantidos" na nova versão
        let faseMantidos = null
        const pendentes = Object.keys(itensAnteriores).filter((k) => {
          const st = itensAnteriores[k].getString('status')
          return (st === 'executado' || st === 'substituido') && !reenviados[k]
        })

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
          // mantém a ligação de substituição quando havia
          const sub = antigo.getString('substituido_por_item_id')
          if (sub) {
            copia.set('substituido_por_item_id', criadosPorChave[sub] || '')
            $app.save(copia)
          }
          criadosPorChave[k] = copia.id
          totalItens++
        }
      }
    } catch (err) {
      // não deixa plano meio montado: apaga o cabeçalho criado agora
      // (fases e itens caem por cascade)
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
