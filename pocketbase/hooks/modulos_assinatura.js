/* Módulos e assinatura — rotas (Etapa 14)

   GET  /backend/v1/meus-modulos        → o que esta clínica pode usar AGORA
   POST /backend/v1/contratar-modulo    { codigo }
   POST /backend/v1/cancelar-modulo     { codigo }
   POST /backend/v1/reativar-modulo     { codigo }
   GET  /backend/v1/assinaturas         → contratos + eventos

   POR QUE TUDO ISSO PASSA POR ROTA, e não por escrita direta na coleção: as
   regras de create/update/delete de `assinatura` são NULAS de propósito. Se o
   próprio tenant pudesse escrever em `assinatura`, contratar o módulo de IA sem
   pagar seria um POST. O `$app.save()` das rotas roda como admin e ignora as
   regras; o cliente HTTP não.

   STATUS DERIVADO: uma assinatura "ativa" cujo `fim` já passou está vencida de
   fato. Em vez de confiar só na coluna `status`, a leitura cruza os dois. É o
   tipo de divergência que aparece meses depois ("o menu mostra o módulo mas a
   cobrança parou") e ninguém sabe qual dos dois está certo.

   CANCELAMENTO COM DEPENDENTE: `orcamento` exige `prontuario`, `relatorios`
   exige `financeiro`. Cancelar o pré-requisito com o dependente ativo deixaria a
   clínica com um módulo que não funciona — pior que recusar. A rota recusa e
   diz qual módulo está segurando. */

routerAdd(
  'GET',
  '/backend/v1/meus-modulos',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenantId = e.auth.getString('tenant_id')
    const agora = new Date()

    let assinaturas = []
    try {
      assinaturas = $app.findRecordsByFilter(
        'assinatura',
        'tenant_id = "' + tenantId + '"',
        '',
        200,
        0,
      )
    } catch (_) {}

    const ativos = {}
    const suspensos = {}
    const detalhe = []

    for (const a of assinaturas) {
      let modulo = null
      try {
        modulo = $app.findRecordById('modulo', a.getString('modulo_id'))
      } catch (_) {
        continue
      }
      const codigo = modulo.getString('codigo')
      const status = a.getString('status')

      // vencimento por data, além do status
      let vencida = false
      const fim = String(a.getString('fim') || '')
      if (fim) {
        const ts = Date.parse(fim.replace(' ', 'T'))
        if (!isNaN(ts) && ts < agora.getTime()) vencida = true
      }

      const vigente = status === 'ativa' && !vencida
      if (vigente) ativos[codigo] = true
      else if (status === 'suspensa') suspensos[codigo] = true

      detalhe.push({
        codigo: codigo,
        nome: modulo.getString('nome'),
        valor_centavos: a.getInt('valor_centavos') || 0,
        status: status,
        vencida: vencida,
        vigente: vigente,
        inicio: String(a.getString('inicio') || '').slice(0, 10),
        fim: fim.slice(0, 10),
        assinatura_id: a.id,
        // preço de catálogo HOJE, para comparar com o congelado
        preco_catalogo_centavos: modulo.getInt('preco_centavos') || 0,
      })
    }

    // catálogo completo, para a tela de contratação
    let catalogo = []
    try {
      const mods = $app.findRecordsByFilter('modulo', 'disponivel = true', 'ordem', 50, 0)
      for (const m of mods) {
        catalogo.push({
          codigo: m.getString('codigo'),
          nome: m.getString('nome'),
          descricao: m.getString('descricao'),
          preco_centavos: m.getInt('preco_centavos') || 0,
          depende_de: m.getString('depende_de'),
          contratado: ativos[m.getString('codigo')] === true,
        })
      }
    } catch (_) {}

    const totalMensal = detalhe
      .filter((d) => d.vigente)
      .reduce((soma, d) => soma + d.valor_centavos, 0)

    return e.json(200, {
      modulos_ativos: Object.keys(ativos),
      modulos_suspensos: Object.keys(suspensos),
      assinaturas: detalhe,
      catalogo: catalogo,
      total_mensal_centavos: totalMensal,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/contratar-modulo',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (papel !== 'proprietario' && papel !== 'gestor') {
      return e.forbiddenError('Somente o proprietario ou o gestor contrata modulos.')
    }

    const tenantId = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const codigo = String(body.codigo || '')
    if (!codigo) return e.badRequestError('Informe o modulo.')

    let modulo
    try {
      modulo = $app.findFirstRecordByData('modulo', 'codigo', codigo)
    } catch (_) {
      return e.notFoundError('Modulo nao encontrado.')
    }
    if (modulo.getBool('disponivel') === false) {
      return e.badRequestError('Este modulo nao esta disponivel para contratacao.')
    }

    // já existe?
    let existente = null
    try {
      existente = $app.findFirstRecordByFilter(
        'assinatura',
        'tenant_id = "' + tenantId + '" && modulo_id = "' + modulo.id + '"',
      )
    } catch (_) {}

    if (existente && existente.getString('status') === 'ativa') {
      return e.badRequestError('Este modulo ja esta contratado.')
    }

    /* Dependência: se o pré-requisito não está ativo, ofereço o pacote em vez de
       simplesmente recusar. "Você precisa do Prontuário" sozinho gera chamado;
       "contrate junto" resolve. */
    const dep = modulo.getString('depende_de')
    if (dep) {
      let depAtivo = false
      try {
        const dm = $app.findFirstRecordByData('modulo', 'codigo', dep)
        const da = $app.findFirstRecordByFilter(
          'assinatura',
          'tenant_id = "' + tenantId + '" && modulo_id = "' + dm.id + '" && status = "ativa"',
        )
        depAtivo = !!da
      } catch (_) {}
      if (!depAtivo) {
        return e.badRequestError(
          'O modulo ' +
            modulo.getString('nome') +
            ' depende de ' +
            dep +
            ', que esta clinica nao tem. Contrate ' +
            dep +
            ' antes (ou junto) e o pacote fica completo.',
        )
      }
    }

    const agora = new Date().toISOString()
    // VALOR CONGELADO: copia o preço do catálogo NESTE momento
    const valor = modulo.getInt('preco_centavos') || 0

    let assinaturaId = ''
    try {
      if (existente) {
        // reativação: mantém o id, atualiza valor para o de hoje (nova contratação)
        existente.set('status', 'ativa')
        existente.set('valor_centavos', valor)
        existente.set('inicio', agora)
        existente.set('fim', '')
        $app.save(existente)
        assinaturaId = existente.id
      } else {
        const a = new Record($app.findCollectionByNameOrId('assinatura'))
        a.set('tenant_id', tenantId)
        a.set('modulo_id', modulo.id)
        a.set('valor_centavos', valor)
        a.set('inicio', agora)
        a.set('status', 'ativa')
        $app.save(a)
        assinaturaId = a.id
      }
    } catch (err) {
      return e.badRequestError('Nao foi possivel contratar: ' + String(err).slice(0, 160))
    }

    try {
      const ev = new Record($app.findCollectionByNameOrId('assinatura_evento'))
      ev.set('tenant_id', tenantId)
      ev.set('assinatura_id', assinaturaId)
      ev.set('tipo', existente ? 'reativacao' : 'contratacao')
      ev.set('valor_novo_centavos', valor)
      ev.set('autor_id', e.auth.id)
      ev.set('observacao', 'modulo ' + codigo)
      $app.save(ev)
    } catch (_) {}

    return e.json(200, { ok: true, codigo: codigo, valor_centavos: valor })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/cancelar-modulo',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (papel !== 'proprietario' && papel !== 'gestor') {
      return e.forbiddenError('Somente o proprietario ou o gestor cancela modulos.')
    }

    const tenantId = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const codigo = String(body.codigo || '')
    if (!codigo) return e.badRequestError('Informe o modulo.')

    let modulo
    try {
      modulo = $app.findFirstRecordByData('modulo', 'codigo', codigo)
    } catch (_) {
      return e.notFoundError('Modulo nao encontrado.')
    }

    let assinatura = null
    try {
      assinatura = $app.findFirstRecordByFilter(
        'assinatura',
        'tenant_id = "' + tenantId + '" && modulo_id = "' + modulo.id + '" && status = "ativa"',
      )
    } catch (_) {
      return e.badRequestError('Este modulo nao esta contratado.')
    }

    /* Dependente ativo bloqueia. Fechar o prontuário com orçamento ativo deixaria
       um módulo que não abre — e o cliente descobriria isso depois de pagar. */
    let dependentes = []
    try {
      const mods = $app.findRecordsByFilter('modulo', '', 'ordem', 50, 0)
      for (const m of mods) {
        if (m.getString('depende_de') !== codigo) continue
        try {
          const dep = $app.findFirstRecordByFilter(
            'assinatura',
            'tenant_id = "' + tenantId + '" && modulo_id = "' + m.id + '" && status = "ativa"',
          )
          if (dep) dependentes.push(m.getString('codigo'))
        } catch (_) {}
      }
    } catch (_) {}

    if (dependentes.length > 0) {
      return e.badRequestError(
        'Nao e possivel cancelar ' +
          codigo +
          ' enquanto ' +
          dependentes.join(', ') +
          ' estiver ativo — esses modulos dependem dele. Cancele-os primeiro.',
      )
    }

    const anterior = assinatura.getInt('valor_centavos') || 0
    try {
      assinatura.set('status', 'cancelada')
      assinatura.set('fim', new Date().toISOString())
      $app.save(assinatura)
    } catch (err) {
      return e.badRequestError('Nao foi possivel cancelar: ' + String(err).slice(0, 120))
    }

    try {
      const ev = new Record($app.findCollectionByNameOrId('assinatura_evento'))
      ev.set('tenant_id', tenantId)
      ev.set('assinatura_id', assinatura.id)
      ev.set('tipo', 'cancelamento')
      ev.set('valor_anterior_centavos', anterior)
      ev.set('autor_id', e.auth.id)
      ev.set('observacao', 'modulo ' + codigo + ' cancelado; dados preservados')
      $app.save(ev)
    } catch (_) {}

    /* NÃO apago nada. O dado do módulo continua no banco e exportável — o
       critério 2 da etapa é exatamente esse. */
    return e.json(200, {
      ok: true,
      codigo: codigo,
      mensagem:
        'Modulo cancelado. Os dados continuam guardados e podem ser exportados; o modulo apenas deixa de aparecer e de aceitar novos registros.',
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/assinaturas',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (papel !== 'proprietario' && papel !== 'gestor') {
      return e.forbiddenError('Somente a gestao ve o contrato.')
    }

    const tenantId = e.auth.getString('tenant_id')

    let assinaturas = []
    try {
      assinaturas = $app.findRecordsByFilter(
        'assinatura',
        'tenant_id = "' + tenantId + '"',
        '-created',
        200,
        0,
      )
    } catch (_) {}

    let eventos = []
    try {
      eventos = $app.findRecordsByFilter(
        'assinatura_evento',
        'tenant_id = "' + tenantId + '"',
        '-created',
        100,
        0,
      )
    } catch (_) {}

    const lista = []
    for (const a of assinaturas) {
      let nome = ''
      let codigoMod = ''
      try {
        const m = $app.findRecordById('modulo', a.getString('modulo_id'))
        nome = m.getString('nome')
        codigoMod = m.getString('codigo')
      } catch (_) {}
      lista.push({
        id: a.id,
        modulo: codigoMod,
        nome: nome,
        valor_centavos: a.getInt('valor_centavos') || 0,
        status: a.getString('status'),
        inicio: String(a.getString('inicio') || '').slice(0, 10),
        fim: String(a.getString('fim') || '').slice(0, 10),
      })
    }

    const hist = []
    for (const ev of eventos) {
      let autor = ''
      try {
        autor = $app.findRecordById('_pb_users_auth_', ev.getString('autor_id')).getString('nome')
      } catch (_) {}
      hist.push({
        tipo: ev.getString('tipo'),
        valor_anterior_centavos: ev.getInt('valor_anterior_centavos') || null,
        valor_novo_centavos: ev.getInt('valor_novo_centavos') || null,
        autor: autor,
        observacao: ev.getString('observacao'),
        quando: String(ev.getString('created') || '')
          .slice(0, 16)
          .replace('T', ' '),
      })
    }

    return e.json(200, { assinaturas: lista, eventos: hist })
  },
  $apis.requireAuth(),
)
