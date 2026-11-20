/* Rotas de revogação e de odontograma (Etapa 7)

   Duas ações pequenas que só podem passar por rota porque as coleções
   correspondentes têm regras nulas de propósito:

   1. POST /backend/v1/revogar-acesso   { acesso_id }
      Revogar é desligar `ativo`. Só quem concedeu ou o proprietário revoga.
      Não apago a linha: histórico de concessão é auditoria — quem autorizou,
      quando, por quê, e que foi revogado.

   2. POST /backend/v1/registrar-odontograma
      { paciente_id, atendimento_id?, profissional_id, denticao, dentes }
      Grava um SNAPSHOT. Não é update do odontograma: é o estado dos dentes
      naquele atendimento. Assim o histórico mostra a evolução clínica de
      verdade, e não "o odontograma atual" reescrito por cima do anterior. */

routerAdd(
  'POST',
  '/backend/v1/revogar-acesso',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const acessoId = String(body.acesso_id || '')
    if (!acessoId) return e.badRequestError('Informe o acesso.')

    let a
    try {
      a = $app.findRecordById('acesso_prontuario', acessoId)
    } catch (_) {
      return e.notFoundError('Acesso nao encontrado.')
    }
    if (a.getString('tenant_id') !== tenant) {
      return e.notFoundError('Acesso nao encontrado.')
    }

    const papel = e.auth.getString('papel')
    const concedeu = a.getString('concedido_por') === e.auth.id
    if (!concedeu && papel !== 'proprietario') {
      return e.forbiddenError('Somente quem concedeu ou o proprietario pode revogar.')
    }

    a.set('ativo', false)
    $app.save(a)

    try {
      const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
      aud.set('tenant_id', tenant)
      aud.set('usuario_id', e.auth.id)
      aud.set('paciente_id', a.getString('paciente_id'))
      aud.set('acao', 'revogar_acesso')
      aud.set('motivo', 'revogou acesso concedido')
      aud.set('rota', '/backend/v1/revogar-acesso')
      $app.save(aud)
    } catch (_) {}

    return e.json(200, { ok: true })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/registrar-odontograma',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const CLINICOS = ['proprietario', 'gestor', 'dentista']
    if (CLINICOS.indexOf(papel) < 0) {
      return e.forbiddenError('Somente profissional de saude registra odontograma.')
    }

    const body = e.requestInfo().body || {}
    const pacienteId = String(body.paciente_id || '')
    const atendimentoId = String(body.atendimento_id || '')
    const profissionalId = String(body.profissional_id || '')
    const denticao = String(body.denticao || 'permanente')
    const dentes = body.dentes

    if (!pacienteId) return e.badRequestError('Informe o paciente.')
    if (!profissionalId) return e.badRequestError('Informe o profissional.')
    if (!dentes || typeof dentes !== 'object') return e.badRequestError('Informe os dentes.')

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

    try {
      const col = $app.findCollectionByNameOrId('odontograma_snapshot')
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('paciente_id', pacienteId)
      r.set('profissional_id', profissionalId)
      r.set('usuario_autor_id', e.auth.id)
      r.set('denticao', denticao)
      r.set('dentes', dentes)
      if (atendimentoId) r.set('atendimento_id', atendimentoId)
      $app.save(r)

      try {
        const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
        aud.set('tenant_id', tenant)
        aud.set('usuario_id', e.auth.id)
        aud.set('paciente_id', pacienteId)
        aud.set('acao', 'editar_prontuario')
        aud.set('motivo', 'registrou odontograma')
        aud.set('rota', '/backend/v1/registrar-odontograma')
        $app.save(aud)
      } catch (_) {}

      return e.json(200, { ok: true, id: r.id })
    } catch (err) {
      return e.badRequestError('Nao foi possivel registrar: ' + String(err))
    }
  },
  $apis.requireAuth(),
)
