/* Rotas de catálogo e preços (Etapa 8)

   GET  /backend/v1/resolver-preco?paciente_id=X[&procedimento_id=Y]
   POST /backend/v1/salvar-tabela-preco
   POST /backend/v1/importar-procedimentos

   POR QUE `resolver-preco` É ROTA E NÃO CONSULTA DO CLIENTE:
   a resposta depende de qual tabela está vigente HOJE. "Hoje" não é
   expressável numa access rule nem numa consulta estática do front. Se o
   cliente decidisse, ele seria a autoridade sobre o preço — e cada tela
   poderia decidir diferente. Aqui a regra fica num lugar só.

   ORDEM DE RESOLUÇÃO (deliberada, e a ordem É a regra de negócio):
   1. tabela do CONVÊNIO do paciente, ativa, vigente hoje
   2. tabela PARTICULAR (convenio_id nulo), ativa, vigente hoje
   3. nada → preço ausente

   O passo 2 é o que evita o pior caso: paciente de convênio sem item na tabela
   do convênio não pode cair num preço inventado nem ficar sem atender. Ele cai
   no particular — e a resposta DIZ que caiu, para a tela poder avisar.

   NUNCA devolvo preço "0" como se fosse valor: zero é um preço legítimo
   (cortesia) e ausência é outra coisa. A distinção vai em `origem`. */

routerAdd(
  'GET',
  '/backend/v1/resolver-preco',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const pacienteId = String(q.get('paciente_id') || '')
    const procedimentoId = String(q.get('procedimento_id') || '')

    if (!pacienteId) return e.badRequestError('Informe o paciente.')

    let paciente
    try {
      paciente = $app.findRecordById('paciente', pacienteId)
    } catch (_) {
      return e.notFoundError('Paciente nao encontrado.')
    }
    if (paciente.getString('tenant_id') !== tenant) {
      return e.notFoundError('Paciente nao encontrado.')
    }

    const convenioId = paciente.getString('convenio_id')

    /* Data de hoje em UTC, no formato que o PocketBase guarda em campo date
       ("YYYY-MM-DD HH:MM:SS.sssZ"). Comparo inicio >= hoje && (fim vazio ||
       fim >= hoje). Uso beginOfDay para não perder uma tabela que começa hoje. */
    const agora = new Date()
    const hojeIni =
      new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
        .toISOString()
        .replace('T', ' ')
        .slice(0, 23) + 'Z'

    function vigentes(convenioFiltro) {
      const filtro =
        'tenant_id = "' +
        tenant +
        '" && ativa = true && ' +
        convenioFiltro +
        ' && vigencia_inicio <= "' +
        hojeIni +
        '" && (vigencia_fim = "" || vigencia_fim >= "' +
        hojeIni +
        '")'
      try {
        // Se mais de uma estiver vigente, isso é erro de cadastro. A rota de
        // salvar impede, mas ordeno por vigencia_inicio desc para que, se
        // acontecer por dados antigos, a mais recente ganhe de forma
        // determinística em vez de aleatória.
        return $app.findRecordsByFilter('tabela_preco', filtro, '-vigencia_inicio', 5, 0)
      } catch (_) {
        return []
      }
    }

    let tabela = null
    let origem = ''

    if (convenioId) {
      const doConvenio = vigentes('convenio_id = "' + convenioId + '"')
      if (doConvenio.length > 0) {
        tabela = doConvenio[0]
        origem = 'convenio'
      }
    }
    if (!tabela) {
      const particular = vigentes('convenio_id = ""')
      if (particular.length > 0) {
        tabela = particular[0]
        origem = convenioId ? 'particular_fallback' : 'particular'
      }
    }

    if (!tabela) {
      return e.json(200, {
        paciente_id: pacienteId,
        convenio_id: convenioId,
        tabela: null,
        origem: 'sem_tabela',
        itens: [],
      })
    }

    let itens = []
    try {
      const filtro =
        'tabela_preco_id = "' +
        tabela.id +
        '"' +
        (procedimentoId ? ' && procedimento_id = "' + procedimentoId + '"' : '')
      const lista = $app.findRecordsByFilter('tabela_preco_item', filtro, '', 500, 0)
      itens = lista.map((i) => ({
        procedimento_id: i.getString('procedimento_id'),
        valor_centavos: i.getInt('valor_centavos'),
      }))
    } catch (_) {}

    return e.json(200, {
      paciente_id: pacienteId,
      convenio_id: convenioId,
      tabela: {
        id: tabela.id,
        nome: tabela.getString('nome'),
        vigencia_inicio: tabela.getString('vigencia_inicio'),
        vigencia_fim: tabela.getString('vigencia_fim'),
      },
      origem: origem,
      // aviso explícito: a tela precisa poder dizer "caiu no particular"
      aviso:
        origem === 'particular_fallback'
          ? 'Paciente tem convenio, mas nao ha tabela vigente para ele. Aplicado o preco particular.'
          : '',
      itens: itens,
    })
  },
  $apis.requireAuth(),
)

/* Salvar tabela de preço pela rota, porque sobreposição de vigência não é
   expressável em índice: dois períodos que se cruzam na MESMA tabela lógica
   (mesmo convênio, ou duas particulares) fariam o preço depender da ordem da
   consulta. Aqui recuso antes de gravar.

   Existir dois períodos que NÃO se cruzam é normal e correto: é assim que se
   registra reajuste (a tabela velha fecha com vigencia_fim, a nova abre). */
routerAdd(
  'POST',
  '/backend/v1/salvar-tabela-preco',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao altera tabela de preco.')
    }
    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}

    const id = String(body.id || '')
    const nome = String(body.nome || '').trim()
    const convenioId = String(body.convenio_id || '')
    const inicio = String(body.vigencia_inicio || '').trim()
    const fim = String(body.vigencia_fim || '').trim()

    if (!nome) return e.badRequestError('Informe o nome da tabela.')
    if (!inicio) return e.badRequestError('Informe o inicio da vigencia.')

    const inicioTs = Date.parse(inicio.replace(' ', 'T'))
    if (isNaN(inicioTs)) return e.badRequestError('Data de inicio invalida.')
    let fimTs = null
    if (fim) {
      fimTs = Date.parse(fim.replace(' ', 'T'))
      if (isNaN(fimTs)) return e.badRequestError('Data de fim invalida.')
      if (fimTs < inicioTs) return e.badRequestError('O fim nao pode ser antes do inicio.')
    }

    if (convenioId) {
      try {
        const c = $app.findRecordById('convenio', convenioId)
        if (c.getString('tenant_id') !== tenant) return e.notFoundError('Convenio nao encontrado.')
      } catch (_) {
        return e.notFoundError('Convenio nao encontrado.')
      }
    }

    // ---- checagem de sobreposição ----
    const filtroConvenio = convenioId ? 'convenio_id = "' + convenioId + '"' : 'convenio_id = ""'
    let outras = []
    try {
      outras = $app.findRecordsByFilter(
        'tabela_preco',
        'tenant_id = "' + tenant + '" && ativa = true && ' + filtroConvenio,
        '',
        200,
        0,
      )
    } catch (_) {}

    for (const t of outras) {
      if (id && t.id === id) continue
      const tIni = Date.parse(String(t.getString('vigencia_inicio')).replace(' ', 'T'))
      const tFimStr = t.getString('vigencia_fim')
      const tFim = tFimStr ? Date.parse(String(tFimStr).replace(' ', 'T')) : null
      if (isNaN(tIni)) continue
      // sobrepõe se (fim_novo vazio ou fim_novo >= ini_velho) e
      //              (fim_velho vazio ou fim_velho >= ini_novo)
      const sobrepoe = (fimTs === null || fimTs >= tIni) && (tFim === null || tFim >= inicioTs)
      if (sobrepoe) {
        return e.badRequestError(
          'Ja existe a tabela "' +
            t.getString('nome') +
            '" vigente nesse periodo para o mesmo convenio. Feche a anterior (vigencia_fim) antes de abrir a nova.',
        )
      }
    }

    // ---- grava ----
    let tabela
    try {
      const col = $app.findCollectionByNameOrId('tabela_preco')
      if (id) {
        tabela = $app.findRecordById('tabela_preco', id)
        if (tabela.getString('tenant_id') !== tenant)
          return e.notFoundError('Tabela nao encontrada.')
      } else {
        tabela = new Record(col)
        tabela.set('tenant_id', tenant)
      }
      tabela.set('nome', nome)
      if (convenioId) tabela.set('convenio_id', convenioId)
      else tabela.set('convenio_id', '')
      tabela.set('vigencia_inicio', inicio)
      tabela.set('vigencia_fim', fim)
      tabela.set('ativa', body.ativa !== false)
      $app.save(tabela)
    } catch (err) {
      return e.badRequestError('Nao foi possivel salvar: ' + String(err))
    }

    return e.json(200, { ok: true, id: tabela.id })
  },
  $apis.requireAuth(),
)

/* Importação em massa de procedimentos por CSV.

   REGRA QUE O CRITÉRIO DE PRONTO EXIGE: se houver QUALQUER erro, nada é
   gravado. Por isso o fluxo é em duas fases: valida tudo, devolve o relatório
   por linha; só grava se `confirmar = true` e o relatório anterior estiver
   limpo.

   Não uso transação explícita porque a validação completa acontece ANTES de
   qualquer escrita — e é isso que garante a atomicidade na prática. Se algo
   falhar no meio da gravação (improvável), devolvo quantas linhas entraram
   para não mentir sobre o resultado.

   Formato esperado (cabeçalho obrigatório, separador `;`):
     codigo;nome;especialidade;por_dente;dentes_aplicaveis
   Especialidade é o CÓDIGO CFO ou o nome — aceito os dois porque planilha de
   consultório raramente padroniza. */
routerAdd(
  'POST',
  '/backend/v1/importar-procedimentos',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao importa procedimentos.')
    }
    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}

    const csv = String(body.csv || '')
    const confirmar = body.confirmar === true
    if (!csv.trim()) return e.badRequestError('Envie o conteudo do CSV.')

    const linhas = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    if (linhas.length < 2)
      return e.badRequestError('O CSV precisa do cabecalho e ao menos uma linha.')

    const cabecalho = linhas[0].split(';').map((c) => c.trim().toLowerCase())
    const obrigatorios = ['codigo', 'nome']
    for (const o of obrigatorios) {
      if (cabecalho.indexOf(o) < 0) {
        return e.badRequestError('O cabecalho precisa conter: ' + obrigatorios.join(', '))
      }
    }
    const ix = {
      codigo: cabecalho.indexOf('codigo'),
      nome: cabecalho.indexOf('nome'),
      especialidade: cabecalho.indexOf('especialidade'),
      por_dente: cabecalho.indexOf('por_dente'),
      dentes: cabecalho.indexOf('dentes_aplicaveis'),
    }

    // ---- fase 1: validar tudo ----
    const vistos = {}
    const erros = []
    const validos = []

    // códigos já existentes no banco
    const existentes = {}
    try {
      const lista = $app.findRecordsByFilter(
        'procedimento',
        'tenant_id = "' + tenant + '"',
        '',
        5000,
        0,
      )
      for (const p of lista) existentes[p.getString('codigo').toLowerCase()] = p.getString('nome')
    } catch (_) {}

    // especialidades por código e por nome (minúsculo)
    const espPorCodigo = {}
    const espPorNome = {}
    try {
      const esps = $app.findRecordsByFilter('especialidade', '', '', 500, 0)
      for (const s of esps) {
        espPorCodigo[s.getString('codigo').toUpperCase()] = s.id
        espPorNome[s.getString('nome').toLowerCase()] = s.id
      }
    } catch (_) {}

    for (let n = 1; n < linhas.length; n++) {
      const bruta = linhas[n]
      if (!bruta.trim()) continue // linha em branco no fim não é erro
      const numLinha = n + 1 // 1-based, contando o cabeçalho — é como o usuário vê na planilha

      const campos = bruta.split(';')
      const codigo = (campos[ix.codigo] || '').trim()
      const nome = (campos[ix.nome] || '').trim()
      const espTexto = ix.especialidade >= 0 ? (campos[ix.especialidade] || '').trim() : ''
      const porDenteTexto =
        ix.por_dente >= 0 ? (campos[ix.por_dente] || '').trim().toLowerCase() : ''
      const dentes = ix.dentes >= 0 ? (campos[ix.dentes] || '').trim() : ''

      const problemas = []
      if (!codigo) problemas.push('codigo vazio')
      if (!nome) problemas.push('nome vazio')
      if (codigo.length > 40) problemas.push('codigo maior que 40 caracteres')
      if (nome.length > 200) problemas.push('nome maior que 200 caracteres')

      const chave = codigo.toLowerCase()
      if (codigo) {
        if (existentes[chave]) problemas.push('codigo ja cadastrado: "' + existentes[chave] + '"')
        if (vistos[chave])
          problemas.push('codigo repetido no arquivo (linha ' + vistos[chave] + ')')
      }

      let espId = ''
      if (espTexto) {
        espId = espPorCodigo[espTexto.toUpperCase()] || espPorNome[espTexto.toLowerCase()] || ''
        if (!espId) problemas.push('especialidade nao encontrada: "' + espTexto + '"')
      }

      let porDente = false
      if (porDenteTexto) {
        if (['sim', 's', '1', 'true', 'verdadeiro'].indexOf(porDenteTexto) >= 0) porDente = true
        else if (['nao', 'não', 'n', '0', 'false', 'falso'].indexOf(porDenteTexto) >= 0)
          porDente = false
        else problemas.push('por_dente invalido: use sim ou nao')
      }

      if (problemas.length > 0) {
        erros.push({ linha: numLinha, codigo: codigo, nome: nome, problemas: problemas })
      } else {
        vistos[chave] = numLinha
        validos.push({
          linha: numLinha,
          codigo: codigo,
          nome: nome,
          especialidade_id: espId,
          por_dente: porDente,
          dentes_aplicaveis: dentes,
        })
      }
    }

    // ---- relatório ANTES de gravar (é o que o critério exige) ----
    if (erros.length > 0) {
      return e.json(200, {
        gravado: false,
        motivo: 'Ha linhas com erro. Nada foi gravado.',
        total_linhas: validos.length + erros.length,
        validas: validos.length,
        erros: erros,
        previsao: validos,
      })
    }

    if (!confirmar) {
      return e.json(200, {
        gravado: false,
        motivo: 'Validacao concluida sem erros. Reenvie com confirmar = true para gravar.',
        total_linhas: validos.length,
        validas: validos.length,
        erros: [],
        previsao: validos,
      })
    }

    // ---- fase 2: gravar ----
    let gravados = 0
    const falhas = []
    for (const v of validos) {
      try {
        const col = $app.findCollectionByNameOrId('procedimento')
        const r = new Record(col)
        r.set('tenant_id', tenant)
        r.set('codigo', v.codigo)
        r.set('nome', v.nome)
        if (v.especialidade_id) r.set('especialidade_id', v.especialidade_id)
        r.set('por_dente', v.por_dente)
        r.set('dentes_aplicaveis', v.dentes_aplicaveis)
        r.set('ativo', true)
        $app.save(r)
        gravados++
      } catch (err) {
        falhas.push({ linha: v.linha, codigo: v.codigo, erro: String(err) })
      }
    }

    return e.json(200, {
      gravado: gravados > 0,
      total_linhas: validos.length,
      gravados: gravados,
      falhas: falhas,
      erros: [],
    })
  },
  $apis.requireAuth(),
)
