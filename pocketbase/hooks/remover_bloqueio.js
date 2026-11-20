/* Rota de remoção de bloqueio (Etapa 6)

   POST /backend/v1/remover-bloqueio
   Corpo: { bloqueio_id }

   Remover o bloqueio tem de apagar os slots dele. Se o bloqueio sumisse e os
   slots ficassem, o horário continuaria ocupado por algo que não existe mais —
   o mesmo slot órfão do reagendamento, pelo outro lado. */

routerAdd(
  'POST',
  '/backend/v1/remover-bloqueio',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const PAPEIS_OK = ['proprietario', 'gestor', 'recepcao', 'dentista']
    if (PAPEIS_OK.indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao pode remover bloqueio.')
    }

    const body = e.requestInfo().body || {}
    const bloqueioId = String(body.bloqueio_id || '')
    if (!bloqueioId) return e.badRequestError('Informe o bloqueio.')

    let b
    try {
      b = $app.findRecordById('bloqueio_agenda', bloqueioId)
    } catch (_) {
      return e.notFoundError('Bloqueio nao encontrado.')
    }
    if (b.getString('tenant_id') !== tenant) {
      return e.notFoundError('Bloqueio nao encontrado.')
    }

    let removidos = 0
    try {
      const slots = $app.findRecordsByFilter(
        'agenda_slot',
        'bloqueio_id = "' + bloqueioId + '"',
        '',
        500,
        0,
      )
      for (const s of slots) {
        try {
          $app.delete(s)
          removidos++
        } catch (_) {}
      }
    } catch (_) {}

    try {
      $app.delete(b)
    } catch (err) {
      return e.badRequestError('Nao foi possivel remover o bloqueio: ' + String(err))
    }

    return e.json(200, { ok: true, slots_removidos: removidos })
  },
  $apis.requireAuth(),
)
