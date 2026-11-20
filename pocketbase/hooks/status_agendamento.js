/* Rota de status do agendamento (Etapa 6)

   POST /backend/v1/status-agendamento
   Corpo: { agendamento_id, status }

   Por que uma rota e nao updateRule: a coleção `agendamento` tem update nulo
   (senão alguém mudaria início/fim pela API e driblaria os slots). Mudar
   STATUS, porém, é rotina da recepção — chegou, confirmou, faltou, atendeu.

   Ao marcar 'faltou' ou 'atendido', o horário já passou: mantenho os slots
   (é histórico de que a cadeira estava reservada). Ao marcar 'cancelado' pelo
   status, delego para a mesma lógica do cancelamento e LIBERO o horário —
   senão a cadeira fica presa por um atendimento que não vai acontecer. */

routerAdd(
  'POST',
  '/backend/v1/status-agendamento',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const PAPEIS_OK = ['proprietario', 'gestor', 'recepcao', 'dentista']
    if (PAPEIS_OK.indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao pode alterar o status.')
    }

    const body = e.requestInfo().body || {}
    const agendamentoId = String(body.agendamento_id || '')
    const status = String(body.status || '')
    const VALIDOS = ['agendado', 'confirmado', 'atendido', 'faltou', 'cancelado']

    if (!agendamentoId) return e.badRequestError('Informe o agendamento.')
    if (VALIDOS.indexOf(status) < 0) return e.badRequestError('Status invalido.')

    let ag
    try {
      ag = $app.findRecordById('agendamento', agendamentoId)
    } catch (_) {
      return e.notFoundError('Agendamento nao encontrado.')
    }
    if (ag.getString('tenant_id') !== tenant) {
      return e.notFoundError('Agendamento nao encontrado.')
    }

    // cancelar por aqui libera o horario
    if (status === 'cancelado') {
      let liberados = 0
      try {
        const slots = $app.findRecordsByFilter(
          'agenda_slot',
          'agendamento_id = "' + agendamentoId + '"',
          '',
          500,
          0,
        )
        for (const s of slots) {
          try {
            $app.delete(s)
            liberados++
          } catch (_) {}
        }
      } catch (_) {}

      ag.set('status', 'cancelado')
      const motivo = String(body.motivo || '').trim()
      if (motivo) ag.set('motivo_cancelamento', motivo)
      $app.save(ag)
      return e.json(200, { ok: true, status: 'cancelado', slots_liberados: liberados })
    }

    ag.set('status', status)
    $app.save(ag)
    return e.json(200, { ok: true, status: status })
  },
  $apis.requireAuth(),
)
