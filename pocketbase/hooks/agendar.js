/* Rota de agendamento (Etapa 6) — a única porta para criar horário

   POST /backend/v1/agendar
   Corpo: {
     unidade_id, sala_id, profissional_id, paciente_id,
     inicio (ISO), duracao_minutos, tipo?, observacoes?
   }

   POR QUE UMA ROTA E NÃO createRule NO AGENDAMENTO:
   criar um agendamento e NÃO criar seus slots deixaria o horário "livre" para
   outro paciente — o índice único não teria o que recusar. Como a coleção
   `agendamento` tem createRule nulo, o único caminho é esta rota, que grava o
   agendamento e os slots juntos. Se qualquer slot colidir, o agendamento
   inteiro é recusado.

   POR QUE ANTES APAGAR OS SLOTS: a ordem importa. Gravo os slots PRIMEIRO
   (que é onde a colisão estoura) e só depois o agendamento. Se eu criasse o
   agendamento antes e a colisão acontecesse, sobraria um agendamento sem
   slots — e ele apareceria na tela ocupando horário que o banco não protege.
   Assim, se os slots falharem, nada foi criado.

   GARANTIA EM ENVIO SIMULTÂNEO: dois pedidos que disputem o mesmo bloco
   tentam inserir o mesmo (profissional_id, inicio). O SQLite serializa a
   escrita e o índice UNIQUE derruba o segundo com erro de constraint. Não é
   verificação "antes de gravar" (que teria corrida) — é a gravação que falha.

   FUSO: a grade é do consultório, no horário local. O PocketBase guarda date
   em UTC. O offset vem no corpo (`offset_minutos`, ex.: -180 para UTC-3) para
   o cálculo do bloco ser feito no relógio local e o slot cair no minuto certo. */

routerAdd(
  'POST',
  '/backend/v1/agendar',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    const PAPEIS_OK = ['proprietario', 'gestor', 'recepcao', 'dentista']
    if (PAPEIS_OK.indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao pode criar agendamento.')
    }

    const tenant = e.auth.getString('tenant_id')
    if (!tenant) return e.badRequestError('Usuario sem clinica vinculada.')

    const body = e.requestInfo().body || {}
    const unidadeId = String(body.unidade_id || '')
    const salaId = String(body.sala_id || '')
    const profissionalId = String(body.profissional_id || '')
    const pacienteId = String(body.paciente_id || '')
    const inicioTexto = String(body.inicio || '')
    const duracao = parseInt(body.duracao_minutos, 10)
    const tipo = String(body.tipo || 'procedimento')
    const observacoes = String(body.observacoes || '')
    const offset = typeof body.offset_minutos === 'number' ? body.offset_minutos : -180

    if (!salaId || !profissionalId || !pacienteId || !inicioTexto) {
      return e.badRequestError('Informe sala, profissional, paciente e horario.')
    }
    if (!duracao || duracao < 15 || duracao > 480) {
      return e.badRequestError('A duracao deve ficar entre 15 e 480 minutos.')
    }
    if (duracao % 15 !== 0) {
      return e.badRequestError('A duracao deve ser multiplo de 15 minutos.')
    }

    // ---- confere que sala, profissional e paciente são do MESMO tenant ----
    // Sem isso, alguém agenda o paciente de outra clínica na própria agenda.
    let sala, prof, pac, uni
    try {
      sala = $app.findRecordById('sala', salaId)
    } catch (_) {
      return e.badRequestError('Sala nao encontrada.')
    }
    try {
      prof = $app.findRecordById('profissional', profissionalId)
    } catch (_) {
      return e.badRequestError('Profissional nao encontrado.')
    }
    try {
      pac = $app.findRecordById('paciente', pacienteId)
    } catch (_) {
      return e.badRequestError('Paciente nao encontrado.')
    }
    try {
      uni = unidadeId ? $app.findRecordById('unidade', unidadeId) : null
    } catch (_) {
      uni = null
    }

    if (
      sala.getString('tenant_id') !== tenant ||
      prof.getString('tenant_id') !== tenant ||
      pac.getString('tenant_id') !== tenant
    ) {
      return e.forbiddenError('Sala, profissional ou paciente nao pertence a sua clinica.')
    }
    if (uni && uni.getString('tenant_id') !== tenant) {
      return e.forbiddenError('Unidade nao pertence a sua clinica.')
    }
    // Cuidado com getBool: ele devolve false tanto para `false` quanto para
    // campo nulo/ausente. Aqui a intenção é recusar só quem foi DESATIVADO de
    // propósito, então leio o valor bruto e comparo com false.
    if (sala.get('ativo') === false || prof.get('ativo') === false) {
      return e.badRequestError('Sala ou profissional inativo.')
    }
    if (pac.get('ativo') === false) {
      return e.badRequestError('Paciente inativo.')
    }

    // ---- calcula inicio e blocos ----
    const inicioMs = Date.parse(inicioTexto)
    if (isNaN(inicioMs)) return e.badRequestError('Horario invalido.')
    if (inicioMs < Date.now() - 24 * 60 * 60 * 1000) {
      return e.badRequestError('Nao e possivel agendar no passado.')
    }

    const BLOCO_MS = 15 * 60 * 1000
    const quantidade = duracao / 15
    const fimMs = inicioMs + duracao * 60 * 1000

    // Alinha o primeiro bloco ao quarto de hora local.
    // (inicioMs + offset) dá o relógio local; o resto por 15 min é o desalinhamento.
    const localMs = inicioMs + offset * 60 * 1000
    const desalinhamento = ((localMs % BLOCO_MS) + BLOCO_MS) % BLOCO_MS
    if (desalinhamento !== 0) {
      return e.badRequestError('O horario deve ser multiplo de 15 minutos.')
    }

    const formatar = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

    const agendamentoCol = $app.findCollectionByNameOrId('agendamento')
    const slotCol = $app.findCollectionByNameOrId('agenda_slot')

    // ---- 1) tenta gravar os slots ----
    // Guarda os ids criados para desfazer se um do meio falhar.
    const criados = []

    try {
      for (let i = 0; i < quantidade; i++) {
        const slot = new Record(slotCol)
        slot.set('tenant_id', tenant)
        slot.set('profissional_id', profissionalId)
        slot.set('sala_id', salaId)
        slot.set('inicio', formatar(inicioMs + i * BLOCO_MS))
        $app.save(slot)
        criados.push(slot.id)
      }
    } catch (err) {
      // Colisão de índice: desfaz o que já entrou e devolve mensagem clara.
      for (const id of criados) {
        try {
          $app.delete($app.findRecordById('agenda_slot', id))
        } catch (_) {}
      }

      const texto = String(err)
      if (texto.indexOf('UNIQUE') >= 0 || texto.indexOf('idx_slot') >= 0) {
        // Descubro QUAL eixo colidiu, para a mensagem ser útil.
        let colideProf = false
        let colideSala = false
        try {
          $app.findFirstRecordByFilter(
            'agenda_slot',
            'profissional_id = "' + profissionalId + '" && inicio = "' + formatar(inicioMs) + '"',
          )
          colideProf = true
        } catch (_) {}
        try {
          $app.findFirstRecordByFilter(
            'agenda_slot',
            'sala_id = "' + salaId + '" && inicio = "' + formatar(inicioMs) + '"',
          )
          colideSala = true
        } catch (_) {}

        let msg = 'Horario ja ocupado.'
        if (colideProf && colideSala)
          msg = 'Horario ja ocupado para este profissional e para esta sala.'
        else if (colideProf) msg = 'Profissional ja tem atendimento neste horario.'
        else if (colideSala) msg = 'Sala ja esta ocupada neste horario.'
        return e.badRequestError(msg)
      }

      return e.badRequestError('Nao foi possivel reservar o horario: ' + texto)
    }

    // ---- 2) grava o agendamento ----
    let agendamento
    try {
      agendamento = new Record(agendamentoCol)
      agendamento.set('tenant_id', tenant)
      if (unidadeId) agendamento.set('unidade_id', unidadeId)
      else agendamento.set('unidade_id', sala.getString('unidade_id'))
      agendamento.set('sala_id', salaId)
      agendamento.set('profissional_id', profissionalId)
      agendamento.set('paciente_id', pacienteId)
      agendamento.set('inicio', formatar(inicioMs))
      agendamento.set('fim', formatar(fimMs))
      agendamento.set('tipo', tipo)
      agendamento.set('status', 'agendado')
      agendamento.set('origem', 'recepcao')
      agendamento.set('created_by', e.auth.id)
      if (observacoes) agendamento.set('observacoes', observacoes)
      $app.save(agendamento)
    } catch (err) {
      // Sem agendamento, os slots não podem ficar: desfaz tudo.
      for (const id of criados) {
        try {
          $app.delete($app.findRecordById('agenda_slot', id))
        } catch (_) {}
      }
      return e.badRequestError('Nao foi possivel criar o agendamento: ' + String(err))
    }

    // ---- 3) liga os slots ao agendamento ----
    for (const id of criados) {
      try {
        const s = $app.findRecordById('agenda_slot', id)
        s.set('agendamento_id', agendamento.id)
        $app.save(s)
      } catch (_) {}
    }

    return e.json(200, {
      ok: true,
      id: agendamento.id,
      inicio: formatar(inicioMs),
      fim: formatar(fimMs),
      slots: criados.length,
    })
  },
  $apis.requireAuth(),
)
