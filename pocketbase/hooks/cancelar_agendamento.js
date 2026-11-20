/* Rota de cancelamento (Etapa 6)

   POST /backend/v1/cancelar-agendamento
   Corpo: { agendamento_id, motivo }

   Cancelar precisa LIBERAR o horário: apaga os slots do agendamento. O
   registro continua existindo com status 'cancelado' — histórico de que houve
   marcação é informação (falta de paciente, remarcação repetida), mas o
   horário volta a ficar disponível para outro paciente.

   Motivo é obrigatório: cancelamento sem motivo não serve para nada depois. */

routerAdd(
  'POST',
  '/backend/v1/cancelar-agendamento',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const PAPEIS_OK = ['proprietario', 'gestor', 'recepcao', 'dentista']
    if (PAPEIS_OK.indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao pode cancelar agendamento.')
    }

    const body = e.requestInfo().body || {}
    const agendamentoId = String(body.agendamento_id || '')
    const motivo = String(body.motivo || '').trim()

    if (!agendamentoId) return e.badRequestError('Informe o agendamento.')
    if (!motivo) return e.badRequestError('Informe o motivo do cancelamento.')

    let ag
    try {
      ag = $app.findRecordById('agendamento', agendamentoId)
    } catch (_) {
      return e.notFoundError('Agendamento nao encontrado.')
    }
    if (ag.getString('tenant_id') !== tenant) {
      return e.notFoundError('Agendamento nao encontrado.')
    }
    if (ag.getString('status') === 'cancelado') {
      return e.json(200, { ok: true, ja_cancelado: true })
    }

    // libera o horario
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
    ag.set('motivo_cancelamento', motivo)
    $app.save(ag)

    return e.json(200, { ok: true, slots_liberados: liberados })
  },
  $apis.requireAuth(),
)
