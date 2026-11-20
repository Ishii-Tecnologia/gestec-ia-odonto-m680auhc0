/* Rota de reagendamento (Etapa 6)

   POST /backend/v1/reagendar
   Corpo: { agendamento_id, inicio (ISO), duracao_minutos?, sala_id?, profissional_id? }

   O CUIDADO CENTRAL: reagendar tem de LIBERAR o horário antigo. Se eu só
   criasse os slots novos e mudasse as datas do agendamento, os slots antigos
   continuariam no banco apontando para o agendamento — o horário ficaria
   "ocupado" por um atendimento que não acontece mais ali. O plano chama isso
   de slot órfão, e o critério de pronto 4 é justamente não deixá-lo.

   ORDEM: apago os slots antigos, tento criar os novos, e restauro os antigos
   se os novos colidirem. Só então atualizo o agendamento. Assim nunca existe
   um instante em que o horário antigo está livre E o novo está tomado por um
   agendamento que ainda aponta para o lugar errado. */

routerAdd(
  'POST',
  '/backend/v1/reagendar',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const PAPEIS_OK = ['proprietario', 'gestor', 'recepcao', 'dentista']
    if (PAPEIS_OK.indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao pode reagendar.')
    }

    const body = e.requestInfo().body || {}
    const agendamentoId = String(body.agendamento_id || '')
    const inicioTexto = String(body.inicio || '')
    const offset = typeof body.offset_minutos === 'number' ? body.offset_minutos : -180

    if (!agendamentoId || !inicioTexto) {
      return e.badRequestError('Informe o agendamento e o novo horario.')
    }

    let ag
    try {
      ag = $app.findRecordById('agendamento', agendamentoId)
    } catch (_) {
      return e.notFoundError('Agendamento nao encontrado.')
    }
    if (ag.getString('tenant_id') !== tenant) {
      return e.notFoundError('Agendamento nao encontrado.')
    }
    if (ag.getString('status') === 'cancelado' || ag.getString('status') === 'atendido') {
      return e.badRequestError('Agendamento cancelado ou ja atendido nao pode ser reagendado.')
    }

    const salaId = String(body.sala_id || ag.getString('sala_id'))
    const profissionalId = String(body.profissional_id || ag.getString('profissional_id'))

    // duração: mantém a atual se não vier nova
    const inicioAntigoMs = Date.parse(String(ag.getString('inicio')).replace(' ', 'T'))
    const fimAntigoMs = Date.parse(String(ag.getString('fim')).replace(' ', 'T'))
    const duracaoAtualMin = Math.round((fimAntigoMs - inicioAntigoMs) / 60000)
    const duracao = parseInt(body.duracao_minutos, 10) || duracaoAtualMin

    if (duracao % 15 !== 0 || duracao < 15 || duracao > 480) {
      return e.badRequestError('A duracao deve ser multiplo de 15, entre 15 e 480 minutos.')
    }

    const inicioMs = Date.parse(inicioTexto)
    if (isNaN(inicioMs)) return e.badRequestError('Horario invalido.')
    if (inicioMs < Date.now() - 24 * 60 * 60 * 1000) {
      return e.badRequestError('Nao e possivel reagendar para o passado.')
    }

    const BLOCO_MS = 15 * 60 * 1000
    const localMs = inicioMs + offset * 60 * 1000
    if (((localMs % BLOCO_MS) + BLOCO_MS) % BLOCO_MS !== 0) {
      return e.badRequestError('O horario deve ser multiplo de 15 minutos.')
    }

    const formatar = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

    // confere sala/profissional do tenant
    let sala, prof
    try {
      sala = $app.findRecordById('sala', salaId)
      prof = $app.findRecordById('profissional', profissionalId)
    } catch (_) {
      return e.badRequestError('Sala ou profissional nao encontrado.')
    }
    if (sala.getString('tenant_id') !== tenant || prof.getString('tenant_id') !== tenant) {
      return e.forbiddenError('Sala ou profissional nao pertence a sua clinica.')
    }

    // ---- guarda os slots antigos para poder restaurar ----
    let antigos = []
    try {
      antigos = $app.findRecordsByFilter(
        'agenda_slot',
        'agendamento_id = "' + agendamentoId + '"',
        'inicio',
        500,
        0,
      )
    } catch (_) {
      antigos = []
    }
    const backup = antigos.map((s) => ({
      profissional_id: s.getString('profissional_id'),
      sala_id: s.getString('sala_id'),
      inicio: s.getString('inicio'),
    }))

    // ---- 1) libera os antigos ----
    for (const s of antigos) {
      try {
        $app.delete(s)
      } catch (_) {}
    }

    // ---- 2) reserva os novos ----
    const slotCol = $app.findCollectionByNameOrId('agenda_slot')
    const criados = []
    const quantidade = duracao / 15

    try {
      for (let i = 0; i < quantidade; i++) {
        const slot = new Record(slotCol)
        slot.set('tenant_id', tenant)
        slot.set('profissional_id', profissionalId)
        slot.set('sala_id', salaId)
        slot.set('inicio', formatar(inicioMs + i * BLOCO_MS))
        slot.set('agendamento_id', agendamentoId)
        $app.save(slot)
        criados.push(slot.id)
      }
    } catch (err) {
      // desfaz os novos e devolve os antigos: a agenda volta ao estado anterior
      for (const id of criados) {
        try {
          $app.delete($app.findRecordById('agenda_slot', id))
        } catch (_) {}
      }
      for (const b of backup) {
        try {
          const s = new Record(slotCol)
          s.set('tenant_id', tenant)
          s.set('profissional_id', b.profissional_id)
          s.set('sala_id', b.sala_id)
          s.set('inicio', b.inicio)
          s.set('agendamento_id', agendamentoId)
          $app.save(s)
        } catch (_) {}
      }

      const texto = String(err)
      if (texto.indexOf('UNIQUE') >= 0 || texto.indexOf('idx_slot') >= 0) {
        return e.badRequestError('Novo horario indisponivel: ja existe atendimento nesse bloco.')
      }
      return e.badRequestError('Nao foi possivel reservar o novo horario: ' + texto)
    }

    // ---- 3) atualiza o agendamento ----
    try {
      ag.set('sala_id', salaId)
      ag.set('profissional_id', profissionalId)
      ag.set('inicio', formatar(inicioMs))
      ag.set('fim', formatar(inicioMs + duracao * 60 * 1000))
      $app.save(ag)
    } catch (err) {
      // devolve tudo ao estado anterior
      for (const id of criados) {
        try {
          $app.delete($app.findRecordById('agenda_slot', id))
        } catch (_) {}
      }
      for (const b of backup) {
        try {
          const s = new Record(slotCol)
          s.set('tenant_id', tenant)
          s.set('profissional_id', b.profissional_id)
          s.set('sala_id', b.sala_id)
          s.set('inicio', b.inicio)
          s.set('agendamento_id', agendamentoId)
          $app.save(s)
        } catch (_) {}
      }
      return e.badRequestError('Nao foi possivel reagendar: ' + String(err))
    }

    return e.json(200, {
      ok: true,
      id: agendamentoId,
      inicio: formatar(inicioMs),
      fim: formatar(inicioMs + duracao * 60 * 1000),
      slots: criados.length,
      slots_liberados: backup.length,
    })
  },
  $apis.requireAuth(),
)
