/* Hook de guarda do item executado + leitura do plano completo (Etapa 9)

   1. GUARDA (onRecordUpdateRequest em item_tratamento)
      Item já 'executado' não pode mudar de procedimento, dente, valor nem
      quantidade. Só `status` e `observacao` podem mudar.

      Por que no servidor e não na tela: a tela é conveniência, a API é o
      contrato. Quem chamar direto (um script, um app futuro, um bug no front)
      mudaria o procedimento de algo que já foi feito e pago, e o histórico
      passaria a dizer outra coisa. Numa etapa que existe para resolver
      "passivo clínico" e "o que foi vendido x entregue", isso é corrupção de
      dado contábil, não erro de digitação.

   2. ROTA GET /backend/v1/plano-completo?plano_id=X
      Devolve o plano com fases, itens, orçamentos e execução — já resolvido,
      para a tela não ter de juntar 5 coleções e acabar mostrando número
      diferente do passivo clínico. */

onRecordUpdateRequest((e) => {
  if (e.collection.name !== 'item_tratamento') return e.next()

  let anterior
  try {
    anterior = $app.findRecordById('item_tratamento', e.record.id)
  } catch (_) {
    return e.next()
  }

  // só interessa se JÁ era executado
  if (anterior.getString('status') !== 'executado') return e.next()

  const campos = ['procedimento_id', 'dente', 'valor_unitario_centavos', 'quantidade']
  const mudou = []
  for (const c of campos) {
    const antes = String(anterior.get(c) ?? '')
    const depois = String(e.record.get(c) ?? '')
    if (antes !== depois) mudou.push(c)
  }

  if (mudou.length > 0) {
    return e.badRequestError(
      'Item ja executado nao pode ser alterado (' +
        mudou.join(', ') +
        '). Para corrigir, cancele o tratamento com credito ou estorno e monte um plano novo.',
    )
  }

  return e.next()
})

routerAdd(
  'GET',
  '/backend/v1/plano-completo',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa plano de tratamento.')
    }

    const tenant = e.auth.getString('tenant_id')
    const planoId = String(e.request.url.query().get('plano_id') || '')
    if (!planoId) return e.badRequestError('Informe o plano.')

    let plano
    try {
      plano = $app.findRecordById('plano_tratamento', planoId)
    } catch (_) {
      return e.notFoundError('Plano nao encontrado.')
    }
    if (plano.getString('tenant_id') !== tenant) return e.notFoundError('Plano nao encontrado.')

    /* Resolução da versão corrente, INLINE: o JSVM do PocketBase não enxerga
       funções declaradas fora do callback (ReferenceError em runtime).

       A rota aceita id de QUALQUER versão e resolve para a corrente. Assim a
       tela pode guardar o id que tinha e não mostrar dado velho sem avisar. */
    let corrente = plano
    let gv = 0
    while (gv < 50) {
      gv++
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
    const alvo = corrente

    const fases = []
    try {
      const fs = $app.findRecordsByFilter(
        'fase',
        'plano_tratamento_id = "' + alvo.id + '"',
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
        fases.push({
          id: f.id,
          ordem: f.getInt('ordem'),
          nome: f.getString('nome'),
          itens: its.map((i) => {
            let procNome = ''
            let procCodigo = ''
            try {
              const pr = $app.findRecordById('procedimento', i.getString('procedimento_id'))
              procNome = pr.getString('nome')
              procCodigo = pr.getString('codigo')
            } catch (_) {}
            return {
              id: i.id,
              procedimento_id: i.getString('procedimento_id'),
              procedimento_nome: procNome,
              procedimento_codigo: procCodigo,
              dente: i.getString('dente'),
              face: i.get('face') || [],
              quantidade: i.getInt('quantidade'),
              valor_unitario_centavos: i.getInt('valor_unitario_centavos'),
              valor_total_centavos:
                (i.getInt('valor_unitario_centavos') || 0) * (i.getInt('quantidade') || 1),
              status: i.getString('status'),
              substituido_por_item_id: i.getString('substituido_por_item_id'),
              observacao: i.getString('observacao'),
            }
          }),
        })
      }
    } catch (_) {}

    // totais da versão corrente
    let bruto = 0
    let executado = 0
    let pendente = 0
    for (const f of fases) {
      for (const i of f.itens) {
        const v = i.valor_total_centavos
        if (i.status === 'executado') {
          executado += v
          bruto += v
        } else if (i.status === 'proposto') {
          pendente += v
          bruto += v
        } else if (i.status === 'substituido') {
          bruto += v
        }
      }
    }

    // orçamentos da versão corrente
    let orcamentos = []
    try {
      const os = $app.findRecordsByFilter(
        'orcamento',
        'plano_tratamento_id = "' + alvo.id + '"',
        '-created',
        20,
        0,
      )
      orcamentos = os.map((o) => ({
        id: o.id,
        plano_versao: o.getInt('plano_versao'),
        valor_bruto_centavos: o.getInt('valor_bruto_centavos'),
        desconto_centavos: o.getInt('desconto_centavos'),
        valor_final_centavos: o.getInt('valor_final_centavos'),
        parcelas: o.getInt('parcelas'),
        status: o.getString('status'),
        validade: o.getString('validade'),
        aprovado_em: o.getString('aprovado_em'),
        motivo_recusa: o.getString('motivo_recusa'),
      }))
    } catch (_) {}

    // procedimentos realizados deste plano (pelo item)
    let realizados = []
    try {
      const ids = []
      for (const f of fases) for (const i of f.itens) ids.push(i.id)
      if (ids.length > 0) {
        const filtro = ids.map((x) => 'item_tratamento_id = "' + x + '"').join(' || ')
        const rs = $app.findRecordsByFilter('procedimento_realizado', filtro, '-created', 500, 0)
        realizados = rs.map((r) => ({
          id: r.id,
          item_tratamento_id: r.getString('item_tratamento_id'),
          valor_centavos: r.getInt('valor_centavos'),
          dente: r.getString('dente'),
          created: r.getString('created'),
        }))
      }
    } catch (_) {}

    // cadeia de versões (para a tela poder navegar)
    let versoes = []
    try {
      let raiz = alvo
      let guarda = 0
      while (guarda < 50) {
        guarda++
        const ant = raiz.getString('plano_anterior_id')
        if (!ant) break
        raiz = $app.findRecordById('plano_tratamento', ant)
      }
      let cursor = raiz
      let g2 = 0
      while (cursor && g2 < 50) {
        g2++
        versoes.push({
          id: cursor.id,
          versao: cursor.getInt('versao'),
          status: cursor.getString('status'),
          created: cursor.getString('created'),
        })
        const filho = $app.findRecordsByFilter(
          'plano_tratamento',
          'plano_anterior_id = "' + cursor.id + '"',
          '-versao',
          1,
          0,
        )
        cursor = filho.length > 0 ? filho[0] : null
      }
    } catch (_) {}

    return e.json(200, {
      plano: {
        id: alvo.id,
        titulo: alvo.getString('titulo'),
        versao: alvo.getInt('versao'),
        status: alvo.getString('status'),
        paciente_id: alvo.getString('paciente_id'),
        profissional_id: alvo.getString('profissional_id'),
        plano_anterior_id: alvo.getString('plano_anterior_id'),
        observacoes: alvo.getString('observacoes'),
      },
      solicitado_id: plano.id,
      eh_corrente: alvo.id === plano.id,
      fases: fases,
      totais: {
        bruto_centavos: bruto,
        executado_centavos: executado,
        pendente_centavos: pendente,
      },
      orcamentos: orcamentos,
      realizados: realizados,
      versoes: versoes,
    })
  },
  $apis.requireAuth(),
)
