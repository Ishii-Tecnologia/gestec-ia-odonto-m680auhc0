/* Rota de bloqueio de agenda (Etapa 6)

   POST /backend/v1/bloquear-agenda
   Corpo: { profissional_id?, sala_id?, inicio, duracao_minutos ou data_fim, motivo }

   Bloqueio (almoço, folga, feriado, manutenção da cadeira) também OCUPA
   horário: se não criar slots, alguém marca consulta em cima do almoço do
   dentista. Por isso bloqueio usa a mesma tabela de slots.

   Pelo menos um dos dois (profissional ou sala) é obrigatório; os dois juntos
   é o caso mais restritivo (bloqueia o dentista E a cadeira). */

routerAdd(
  'POST',
  '/backend/v1/bloquear-agenda',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const PAPEIS_OK = ['proprietario', 'gestor', 'recepcao', 'dentista']
    if (PAPEIS_OK.indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao pode bloquear a agenda.')
    }

    const body = e.requestInfo().body || {}
    const profissionalId = String(body.profissional_id || '')
    const salaId = String(body.sala_id || '')
    const inicioTexto = String(body.inicio || '')
    const motivo = String(body.motivo || 'Bloqueio').trim()
    const offset = typeof body.offset_minutos === 'number' ? body.offset_minutos : -180
    const duracao = parseInt(body.duracao_minutos, 10)

    if (!profissionalId && !salaId) {
      return e.badRequestError('Informe o profissional e/ou a sala a bloquear.')
    }
    if (!inicioTexto) return e.badRequestError('Informe o inicio do bloqueio.')
    if (!duracao || duracao < 15 || duracao > 1440 || duracao % 15 !== 0) {
      return e.badRequestError('A duracao deve ser multiplo de 15 minutos, entre 15 e 1440.')
    }

    // confere tenant dos alvos
    if (profissionalId) {
      let p
      try {
        p = $app.findRecordById('profissional', profissionalId)
      } catch (_) {
        return e.badRequestError('Profissional nao encontrado.')
      }
      if (p.getString('tenant_id') !== tenant) {
        return e.forbiddenError('Profissional nao pertence a sua clinica.')
      }
    }
    if (salaId) {
      let s
      try {
        s = $app.findRecordById('sala', salaId)
      } catch (_) {
        return e.badRequestError('Sala nao encontrada.')
      }
      if (s.getString('tenant_id') !== tenant) {
        return e.forbiddenError('Sala nao pertence a sua clinica.')
      }
    }

    const inicioMs = Date.parse(inicioTexto)
    if (isNaN(inicioMs)) return e.badRequestError('Horario invalido.')

    const BLOCO_MS = 15 * 60 * 1000
    const localMs = inicioMs + offset * 60 * 1000
    if (((localMs % BLOCO_MS) + BLOCO_MS) % BLOCO_MS !== 0) {
      return e.badRequestError('O horario deve ser multiplo de 15 minutos.')
    }

    const formatar = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

    // Um slot exige profissional E sala (ambos required na coleção). Quando o
    // bloqueio é só de um dos dois, uso o outro do agendamento existente? Não:
    // uso a própria referência e, se faltar, uso o primeiro registro para
    // satisfazer o required. Na prática a tela sempre manda os dois.
    if (!profissionalId || !salaId) {
      return e.badRequestError(
        'Informe profissional E sala: o bloqueio ocupa o par, para nao deixar o horario meio-reservado.',
      )
    }

    // cria o bloqueio
    let bloqueio
    try {
      const col = $app.findCollectionByNameOrId('bloqueio_agenda')
      bloqueio = new Record(col)
      bloqueio.set('tenant_id', tenant)
      bloqueio.set('profissional_id', profissionalId)
      bloqueio.set('sala_id', salaId)
      bloqueio.set('inicio', formatar(inicioMs))
      bloqueio.set('fim', formatar(inicioMs + duracao * 60 * 1000))
      bloqueio.set('motivo', motivo.slice(0, 200))
      bloqueio.set('created_by', e.auth.id)
      $app.save(bloqueio)
    } catch (err) {
      return e.badRequestError('Nao foi possivel criar o bloqueio: ' + String(err))
    }

    // cria os slots
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
        slot.set('bloqueio_id', bloqueio.id)
        $app.save(slot)
        criados.push(slot.id)
      }
    } catch (err) {
      // desfaz bloqueio e slots parciais
      for (const id of criados) {
        try {
          $app.delete($app.findRecordById('agenda_slot', id))
        } catch (_) {}
      }
      try {
        $app.delete(bloqueio)
      } catch (_) {}

      const texto = String(err)
      if (texto.indexOf('UNIQUE') >= 0 || texto.indexOf('idx_slot') >= 0) {
        return e.badRequestError(
          'Esse periodo tem atendimento marcado ou outro bloqueio. Cancele antes de bloquear.',
        )
      }
      return e.badRequestError('Nao foi possivel bloquear: ' + texto)
    }

    return e.json(200, {
      ok: true,
      id: bloqueio.id,
      slots: criados.length,
    })
  },
  $apis.requireAuth(),
)
