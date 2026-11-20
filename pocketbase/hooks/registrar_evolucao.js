/* Rota de registro de evolução (Etapa 7)

   POST /backend/v1/registrar-evolucao
   Corpo: { paciente_id, atendimento_id?, profissional_id, texto,
            tipo?, referencia_evolucao_id?, motivo_retificacao? }

   POR QUE UMA ROTA (a coleção tem createRule nulo):
   três coisas precisam ser feitas juntas, e nenhuma delas pode vir do cliente:
   1. FIXAR O AUTOR. `usuario_autor_id` = quem está logado, tirado do token.
      É esse campo que a regra de leitura compara. Se o cliente escolhesse,
      ele se declararia autor de evolução alheia.
   2. CADEIA DE HASH. Cada registro guarda o hash do anterior e o próprio
      hash. Isso não é criptografia forte contra quem tem o banco — é
      detecção de alteração: se alguém mexer numa linha direto no SQLite,
      a cadeia quebra e a adulteração fica evidenciada.
   3. COERÊNCIA DA RETIFICAÇÃO. Retificar exige referência a um registro
      existente do MESMO paciente e motivo preenchido.

   Cuidado com o hash: ele cobre os campos que dão sentido clínico ao registro
   (paciente, autor, texto, tipo, referência). `created` fica de fora porque é
   gerado pelo banco na hora de gravar e não estaria disponível antes. */

routerAdd(
  'POST',
  '/backend/v1/registrar-evolucao',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const CLINICOS = ['proprietario', 'gestor', 'dentista']
    if (CLINICOS.indexOf(papel) < 0) {
      return e.forbiddenError('Somente profissional de saude registra evolucao.')
    }

    const body = e.requestInfo().body || {}
    const pacienteId = String(body.paciente_id || '')
    const atendimentoId = String(body.atendimento_id || '')
    const profissionalId = String(body.profissional_id || '')
    const texto = String(body.texto || '').trim()
    const tipo = String(body.tipo || 'evolucao')
    const referenciaId = String(body.referencia_evolucao_id || '')
    const motivo = String(body.motivo_retificacao || '').trim()

    if (!pacienteId) return e.badRequestError('Informe o paciente.')
    if (!profissionalId) return e.badRequestError('Informe o profissional responsavel.')
    if (!texto) return e.badRequestError('A evolucao nao pode ficar vazia.')
    if (texto.length > 20000) return e.badRequestError('Texto muito longo (maximo 20.000).')
    if (tipo !== 'evolucao' && tipo !== 'retificacao') {
      return e.badRequestError('Tipo invalido.')
    }
    if (tipo === 'retificacao') {
      if (!referenciaId) return e.badRequestError('Retificacao exige o registro de referencia.')
      if (!motivo) return e.badRequestError('Retificacao exige o motivo.')
    }

    // paciente e profissional do mesmo tenant
    let pac, prof
    try {
      pac = $app.findRecordById('paciente', pacienteId)
    } catch (_) {
      return e.badRequestError('Paciente nao encontrado.')
    }
    try {
      prof = $app.findRecordById('profissional', profissionalId)
    } catch (_) {
      return e.badRequestError('Profissional nao encontrado.')
    }
    if (pac.getString('tenant_id') !== tenant || prof.getString('tenant_id') !== tenant) {
      return e.forbiddenError('Paciente ou profissional nao pertence a sua clinica.')
    }

    if (atendimentoId) {
      try {
        const at = $app.findRecordById('atendimento', atendimentoId)
        if (at.getString('tenant_id') !== tenant || at.getString('paciente_id') !== pacienteId) {
          return e.forbiddenError('Atendimento nao corresponde a este paciente.')
        }
      } catch (_) {
        return e.badRequestError('Atendimento nao encontrado.')
      }
    }

    if (referenciaId) {
      try {
        const ref = $app.findRecordById('evolucao', referenciaId)
        if (ref.getString('tenant_id') !== tenant || ref.getString('paciente_id') !== pacienteId) {
          return e.forbiddenError('O registro de referencia nao e deste paciente.')
        }
      } catch (_) {
        return e.badRequestError('Registro de referencia nao encontrado.')
      }
    }

    // última evolução do paciente, para encadear o hash
    let hashAnterior = ''
    try {
      const ultimas = $app.findRecordsByFilter(
        'evolucao',
        'paciente_id = "' + pacienteId + '"',
        '-created',
        1,
        0,
      )
      if (ultimas.length > 0) {
        hashAnterior = ultimas[0].getString('hash_registro')
      }
    } catch (_) {
      hashAnterior = ''
    }

    // hash do registro: cobre o que dá sentido clínico, não o timestamp
    const conteudo =
      pacienteId +
      '|' +
      e.auth.id +
      '|' +
      profissionalId +
      '|' +
      tipo +
      '|' +
      referenciaId +
      '|' +
      hashAnterior +
      '|' +
      texto
    const hashRegistro = $security.sha256(conteudo)

    try {
      const col = $app.findCollectionByNameOrId('evolucao')
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('paciente_id', pacienteId)
      r.set('profissional_id', profissionalId)
      r.set('usuario_autor_id', e.auth.id)
      r.set('texto', texto)
      r.set('tipo', tipo)
      if (atendimentoId) r.set('atendimento_id', atendimentoId)
      if (referenciaId) r.set('referencia_evolucao_id', referenciaId)
      if (motivo) r.set('motivo_retificacao', motivo)
      r.set('hash_anterior', hashAnterior)
      r.set('hash_registro', hashRegistro)
      $app.save(r)

      // auditoria da escrita
      try {
        const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
        aud.set('tenant_id', tenant)
        aud.set('usuario_id', e.auth.id)
        aud.set('paciente_id', pacienteId)
        aud.set('acao', 'editar_prontuario')
        aud.set('motivo', tipo === 'retificacao' ? 'retificou evolucao' : 'registrou evolucao')
        aud.set('rota', '/backend/v1/registrar-evolucao')
        $app.save(aud)
      } catch (_) {}

      return e.json(200, { ok: true, id: r.id, hash: hashRegistro })
    } catch (err) {
      return e.badRequestError('Nao foi possivel registrar: ' + String(err))
    }
  },
  $apis.requireAuth(),
)
