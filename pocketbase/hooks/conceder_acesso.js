/* Rota de concessão de acesso ao prontuário (Etapa 7)

   POST /backend/v1/conceder-acesso
   Corpo: { paciente_id, concedido_para (usuario_id), horas, justificativa }

   POR QUE UMA ROTA (a coleção tem createRule nulo):
   se o cliente pudesse criar direto, o dentista B se concederia acesso ao
   prontuário do paciente do dentista A — que é exatamente o que o sigilo
   desta etapa existe para impedir. Aqui se confere que QUEM CONCEDE realmente
   tem acesso ao prontuário do paciente: só quem já pode ler pode autorizar
   outro a ler.

   Quem tem acesso hoje:
   - o usuário autor de alguma evolução daquele paciente (o responsável);
   - o profissional_responsavel_id de um atendimento do paciente vinculado ao
     usuário logado (via usuario_profissional) — na prática, o mesmo caso.
   Simplifico: o dono do prontuário é quem já registrou evolução ou é o
   responsável do atendimento. Se não é nenhum dos dois, não pode conceder.

   Revogação e expiração: revogar é update de `ativo` aqui, porque a coleção
   proíbe update direto. Expirado o prazo, a leitura cai sozinha — a validação
   de prazo acontece na ROTA DE LEITURA, não na regra, e isso está explicado
   no hook de leitura. */

routerAdd(
  'POST',
  '/backend/v1/conceder-acesso',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const CLINICOS = ['proprietario', 'gestor', 'dentista']
    if (CLINICOS.indexOf(papel) < 0) {
      return e.forbiddenError('Somente profissional de saude concede acesso clinico.')
    }

    const body = e.requestInfo().body || {}
    const pacienteId = String(body.paciente_id || '')
    const paraUsuarioId = String(body.concedido_para || '')
    const horas = parseInt(body.horas, 10) || 24
    const justificativa = String(body.justificativa || '').trim()

    if (!pacienteId) return e.badRequestError('Informe o paciente.')
    if (!paraUsuarioId) return e.badRequestError('Informe para quem conceder.')
    if (paraUsuarioId === e.auth.id)
      return e.badRequestError('Voce ja tem acesso ao seu proprio registro.')
    if (!justificativa) return e.badRequestError('A justificativa e obrigatoria.')
    if (horas < 1 || horas > 720)
      return e.badRequestError('O prazo deve ficar entre 1 e 720 horas.')

    // paciente do tenant
    try {
      const pac = $app.findRecordById('paciente', pacienteId)
      if (pac.getString('tenant_id') !== tenant) {
        return e.notFoundError('Paciente nao encontrado.')
      }
    } catch (_) {
      return e.notFoundError('Paciente nao encontrado.')
    }

    // quem recebe: usuário do mesmo tenant e com papel clínico
    let alvo
    try {
      alvo = $app.findRecordById('_pb_users_auth_', paraUsuarioId)
    } catch (_) {
      return e.badRequestError('Usuario nao encontrado.')
    }
    if (alvo.getString('tenant_id') !== tenant) {
      return e.notFoundError('Usuario nao encontrado.')
    }
    if (alvo.get('ativo') === false) {
      return e.badRequestError('Usuario desativado.')
    }
    if (CLINICOS.indexOf(alvo.getString('papel')) < 0) {
      return e.badRequestError('So e possivel conceder acesso a um profissional de saude.')
    }

    // QUEM CONCEDE precisa ter acesso ao prontuário deste paciente.
    let temAcesso = false
    try {
      const minhas = $app.findRecordsByFilter(
        'evolucao',
        'paciente_id = "' + pacienteId + '" && usuario_autor_id = "' + e.auth.id + '"',
        '-created',
        1,
        0,
      )
      if (minhas.length > 0) temAcesso = true
    } catch (_) {}

    if (!temAcesso) {
      // fallback: é o profissional responsável por algum atendimento do paciente?
      try {
        const vinculos = $app.findRecordsByFilter(
          'usuario_profissional',
          'usuario_id = "' + e.auth.id + '"',
          '',
          50,
          0,
        )
        for (const v of vinculos) {
          const profId = v.getString('profissional_id')
          const ats = $app.findRecordsByFilter(
            'atendimento',
            'paciente_id = "' + pacienteId + '" && profissional_responsavel_id = "' + profId + '"',
            '',
            1,
            0,
          )
          if (ats.length > 0) {
            temAcesso = true
            break
          }
        }
      } catch (_) {}
    }

    if (!temAcesso) {
      return e.forbiddenError(
        'Voce nao tem acesso ao prontuario deste paciente, entao nao pode conceder esse acesso a outra pessoa.',
      )
    }

    // cria a concessão
    const expira =
      new Date(Date.now() + horas * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 23) +
      'Z'

    let registro
    try {
      const col = $app.findCollectionByNameOrId('acesso_prontuario')
      registro = new Record(col)
      registro.set('tenant_id', tenant)
      registro.set('paciente_id', pacienteId)
      registro.set('concedido_por', e.auth.id)
      registro.set('concedido_para', paraUsuarioId)
      registro.set('expira_em', expira)
      registro.set('justificativa', justificativa.slice(0, 1000))
      registro.set('ativo', true)
      $app.save(registro)
    } catch (err) {
      return e.badRequestError('Nao foi possivel conceder: ' + String(err))
    }

    try {
      const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
      aud.set('tenant_id', tenant)
      aud.set('usuario_id', e.auth.id)
      aud.set('paciente_id', pacienteId)
      aud.set('acao', 'conceder_acesso')
      aud.set(
        'motivo',
        'concedeu acesso a ' + alvo.getString('email') + ' por ' + horas + 'h: ' + justificativa,
      )
      aud.set('rota', '/backend/v1/conceder-acesso')
      $app.save(aud)
    } catch (_) {}

    return e.json(200, { ok: true, id: registro.id, expira_em: expira })
  },
  $apis.requireAuth(),
)
