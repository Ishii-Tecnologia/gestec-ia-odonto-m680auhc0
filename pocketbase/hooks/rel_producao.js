/* Produção e exportações operacionais (Etapa 12)

   GET /backend/v1/relatorios/producao?de=&ate=
   GET /backend/v1/exportar-recebimentos?de=&ate=
   GET /backend/v1/prontuario-pdf?paciente_id=

   PRODUÇÃO é LETURA, não comissão. O plano diz explicitamente "base do futuro
   repasse; nesta etapa é só leitura", e eu não calculo repasse aqui. A razão de
   negócio: repasse envolve regra acordada entre clínica e profissional
   (percentual sobre o quê? sobre recebido ou produzido? desconta material?), e
   inventar uma dessas regras produziria número que o dono usaria para pagar
   errado. Mostro o que foi executado e por quem; o cálculo é da Etapa 14+.

   Uso `procedimento_realizado` (Etapa 9), que guarda EXECUTANTE e SOLICITANTE
   separados — é a diferença entre quem indicou e quem fez. Produção conta pelo
   EXECUTANTE: um especialista que realiza o que outro indicou produz aquilo. */

routerAdd(
  'GET',
  '/backend/v1/relatorios/producao',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa a producao.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const agora = new Date()
    const de = String(
      q.get('de') ||
        agora.getUTCFullYear() + '-' + String(agora.getUTCMonth() + 1).padStart(2, '0') + '-01',
    ).slice(0, 10)
    const ate = String(q.get('ate') || agora.toISOString().slice(0, 10)).slice(0, 10)

    let realizados = []
    try {
      realizados = $app.findRecordsByFilter(
        'procedimento_realizado',
        'tenant_id = "' +
          tenant +
          '" && created >= "' +
          de +
          ' 00:00:00.000Z" && created <= "' +
          ate +
          ' 23:59:59.999Z"',
        'created',
        5000,
        0,
      )
    } catch (_) {}

    // resolve nomes uma vez só (evita N+1 numa lista de 5000)
    const nomesProf = {}
    function nomeProf(id) {
      if (!id) return '(sem profissional)'
      if (nomesProf[id] !== undefined) return nomesProf[id]
      try {
        nomesProf[id] = $app.findRecordById('profissional', id).getString('nome')
      } catch (_) {
        nomesProf[id] = '—'
      }
      return nomesProf[id]
    }

    const nomesEsp = {}
    const nomesProc = {}
    function dadosProc(id) {
      if (nomesProc[id]) return nomesProc[id]
      let nome = '—'
      let espId = ''
      let espNome = 'Sem especialidade'
      try {
        const p = $app.findRecordById('procedimento', id)
        nome = p.getString('nome')
        espId = p.getString('especialidade_id')
        if (espId) {
          if (nomesEsp[espId] === undefined) {
            try {
              nomesEsp[espId] = $app.findRecordById('especialidade', espId).getString('nome')
            } catch (_) {
              nomesEsp[espId] = 'Sem especialidade'
            }
          }
          espNome = nomesEsp[espId]
        }
      } catch (_) {}
      nomesProc[id] = { nome: nome, espId: espId, espNome: espNome }
      return nomesProc[id]
    }

    const porProf = {}
    const porEsp = {}
    const porSolicitante = {}
    let total = 0
    let totalProcedimentos = 0

    for (const r of realizados) {
      const v = r.getInt('valor_centavos') || 0
      total += v
      totalProcedimentos++

      const execId = r.getString('profissional_executante_id')
      const solId = r.getString('profissional_solicitante_id')
      const proc = dadosProc(r.getString('procedimento_id'))

      if (!porProf[execId]) {
        porProf[execId] = { id: execId, nome: nomeProf(execId), valor_centavos: 0, quantidade: 0 }
      }
      porProf[execId].valor_centavos += v
      porProf[execId].quantidade++

      const chaveEsp = proc.espId || 'sem'
      if (!porEsp[chaveEsp]) {
        porEsp[chaveEsp] = { id: chaveEsp, nome: proc.espNome, valor_centavos: 0, quantidade: 0 }
      }
      porEsp[chaveEsp].valor_centavos += v
      porEsp[chaveEsp].quantidade++

      /* Solicitado x executado: quando o profissional A indica e B realiza, a
         produção é de B, mas o mérito clínico da indicação é de A. Mostro os
         dois lados porque o dono precisa saber as duas coisas. */
      if (!porSolicitante[solId]) {
        porSolicitante[solId] = {
          id: solId,
          nome: nomeProf(solId),
          valor_centavos: 0,
          quantidade: 0,
        }
      }
      porSolicitante[solId].valor_centavos += v
      porSolicitante[solId].quantidade++

      // detalhe por procedimento
      if (!porProf['__itens__']) porProf['__itens__'] = {}
      const it = porProf['__itens__']
      const chaveIt = proc.nome
      if (!it[chaveIt]) it[chaveIt] = { nome: proc.nome, quantidade: 0, valor_centavos: 0 }
      it[chaveIt].quantidade++
      it[chaveIt].valor_centavos += v
    }

    const itens = porProf['__itens__'] || {}
    delete porProf['__itens__']

    function ordenar(m) {
      return Object.keys(m)
        .map((k) => m[k])
        .sort((a, b) => b.valor_centavos - a.valor_centavos)
    }

    return e.json(200, {
      periodo: { de: de, ate: ate },
      resumo: {
        total_centavos: total,
        procedimentos: totalProcedimentos,
        profissionais: Object.keys(porProf).length,
      },
      por_profissional: ordenar(porProf),
      por_especialidade: ordenar(porEsp),
      por_solicitante: ordenar(porSolicitante),
      por_procedimento: Object.keys(itens)
        .map((k) => itens[k])
        .sort((a, b) => b.valor_centavos - a.valor_centavos)
        .slice(0, 50),
      aviso:
        'Valores executados, apenas para leitura. Nao e calculo de comissao nem de repasse: essa regra e acordada com cada profissional e entra depois.',
    })
  },
  $apis.requireAuth(),
)

/* CSV de recebimentos — a planilha operacional do dia a dia.
   Diferente da exportação do contador (Etapa 10), aqui a linha é o recebimento
   com o profissional responsável do título; serve para conferir produção e
   caixa por pessoa, não para o fechamento contábil. */
routerAdd(
  'GET',
  '/backend/v1/exportar-recebimentos',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao exporta recebimentos.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const agora = new Date()
    const de = String(
      q.get('de') ||
        agora.getUTCFullYear() + '-' + String(agora.getUTCMonth() + 1).padStart(2, '0') + '-01',
    ).slice(0, 10)
    const ate = String(q.get('ate') || agora.toISOString().slice(0, 10)).slice(0, 10)

    let pagamentos = []
    try {
      pagamentos = $app.findRecordsByFilter(
        'pagamento',
        'tenant_id = "' +
          tenant +
          '" && data_pagamento >= "' +
          de +
          ' 00:00:00.000Z" && data_pagamento <= "' +
          ate +
          ' 23:59:59.999Z"',
        'data_pagamento',
        10000,
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
      'data',
      'data_credito_prevista',
      'paciente',
      'descricao',
      'forma_pagamento',
      'profissional',
      'tipo',
      'valor',
    ].join(';')

    const linhas = []
    let recebido = 0
    let estornado = 0

    for (const p of pagamentos) {
      let titulo = null
      try {
        titulo = $app.findRecordById('titulo_receber', p.getString('titulo_receber_id'))
      } catch (_) {}
      if (!titulo) continue

      let pacienteNome = ''
      try {
        pacienteNome = $app
          .findRecordById('paciente', titulo.getString('paciente_id'))
          .getString('nome')
      } catch (_) {}
      let profNome = ''
      try {
        profNome = $app
          .findRecordById('profissional', titulo.getString('profissional_id'))
          .getString('nome')
      } catch (_) {}
      let formaNome = ''
      try {
        formaNome = $app
          .findRecordById('forma_pagamento', p.getString('forma_pagamento_id'))
          .getString('nome')
      } catch (_) {}

      const v = p.getInt('valor_centavos') || 0
      const ehEstorno = p.getString('tipo') === 'estorno'
      if (ehEstorno) estornado += v
      else recebido += v

      linhas.push(
        [
          String(p.getString('data_pagamento')).slice(0, 10),
          String(p.getString('data_credito_prevista') || '').slice(0, 10),
          esc(pacienteNome),
          esc(titulo.getString('descricao')),
          esc(formaNome),
          esc(profNome),
          ehEstorno ? 'estorno' : 'recebimento',
          (v / 100).toFixed(2).replace('.', ','),
        ].join(';'),
      )
    }

    return e.json(200, {
      csv: '\ufeff' + cabecalho + '\n' + linhas.join('\n') + '\n',
      linhas: linhas.length,
      recebido_centavos: recebido,
      estornado_centavos: estornado,
      liquido_centavos: recebido - estornado,
      periodo: { de: de, ate: ate },
    })
  },
  $apis.requireAuth(),
)
