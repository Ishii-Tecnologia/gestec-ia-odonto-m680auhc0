/* Migration 0036 - Agendamentos demo com faltas (Etapa 12)

   O critério 3 é "relatório de faltas coerente com os dados de teste". Para
   provar isso preciso de dados que TENHAM padrão — faltas aleatórias não
   permitem dizer se o relatório está certo ou só barulhento.

   Padrão escolhido, com motivo clínico real:
   - Segunda 7h concentra as faltas (é o horário que mais falta: começo de
     semana, cedo, chuva, trânsito);
   - Um paciente (João) falta mais que os outros (é o caso que a recepção
     reconhece e o relatório precisa apontar);
   - Quartas e quintas à tarde quase não faltam.

   São 40 agendamentos espalhados nos últimos ~60 dias, todos com status
   resolvido (atendido/faltou/cancelado), porque agendamento futuro não entra na
   taxa de falta.

   Os agendamentos precisam de SLOTS (agenda_slot tem o UNIQUE da Etapa 6), então
   gravo slot + agendamento juntos, como a rota /agendar faz. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-faltas] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    // idempotência: se já há agendamentos com faltou, sai
    try {
      const ja = app.findRecordsByFilter(
        'agendamento',
        'tenant_id = "' + tenant + '" && status = "faltou"',
        '',
        1,
        0,
      )
      if (ja.length > 0) {
        log('ja existem faltas, saindo')
        return
      }
    } catch (_) {}

    let unidade, prof, sala, maria, joao, ana
    try {
      unidade = app.findFirstRecordByFilter('unidade', 'tenant_id = "' + tenant + '"')
      prof = app.findFirstRecordByFilter(
        'profissional',
        'tenant_id = "' + tenant + '" && nome ~ "Ana"',
      )
      ana = app.findRecordById(
        '_pb_users_auth_',
        app.findFirstRecordByFilter('_pb_users_auth_', 'email = "alfa.dentista@demo.gestec.local"')
          .id,
      )
      maria = app.findFirstRecordByFilter('paciente', 'cpf = "11122233344"')
      joao = app.findFirstRecordByFilter('paciente', 'nome ~ "João"')
    } catch (err) {
      log('faltou dado base: ' + String(err))
      return
    }

    // sala: a primeira ativa
    try {
      const salas = app.findRecordsByFilter('sala', 'tenant_id = "' + tenant + '"', 'nome', 5, 0)
      sala = salas.length > 0 ? salas[0] : null
    } catch (_) {}
    if (!sala) {
      log('sem sala, saindo')
      return
    }

    const colAg = app.findCollectionByNameOrId('agendamento')
    const colSlot = app.findCollectionByNameOrId('agenda_slot')

    let criados = 0
    let faltas = 0
    let cancelados = 0
    let atendidos = 0

    /* Gera agendamentos em dias úteis passados. `dow` = 1 (seg) ... 6 (sáb).
       A hora 7 concentra faltas de propósito. */
    function cria(diasAtras, hora, pacienteId, status) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - diasAtras)
      d.setUTCHours(hora, 0, 0, 0)
      const inicio = d.toISOString().replace('T', ' ').slice(0, 23) + 'Z'
      const fim =
        new Date(d.getTime() + 30 * 60000).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

      // 2 slots de 15 min por agendamento de 30 min (regra da Etapa 6)
      const slots = []
      for (let k = 0; k < 2; k++) {
        const sd = new Date(d.getTime() + k * 15 * 60000)
        const sIni = sd.toISOString().replace('T', ' ').slice(0, 23) + 'Z'
        const slot = new Record(colSlot)
        slot.set('tenant_id', tenant)
        slot.set('profissional_id', prof.id)
        slot.set('sala_id', sala.id)
        slot.set('inicio', sIni)
        try {
          app.save(slot)
          slots.push(slot)
        } catch (_) {
          // colisão de slot: pula este agendamento
          for (const s of slots) {
            try {
              app.delete(s)
            } catch (_) {}
          }
          return false
        }
      }

      const ag = new Record(colAg)
      ag.set('tenant_id', tenant)
      ag.set('unidade_id', unidade.id)
      ag.set('sala_id', sala.id)
      ag.set('profissional_id', prof.id)
      ag.set('paciente_id', pacienteId)
      ag.set('inicio', inicio)
      ag.set('fim', fim)
      ag.set('tipo', 'procedimento')
      ag.set('status', status)
      ag.set('origem', 'recepcao')
      try {
        app.save(ag)
      } catch (_) {
        for (const s of slots) {
          try {
            app.delete(s)
          } catch (_) {}
        }
        return false
      }

      for (const s of slots) {
        s.set('agendamento_id', ag.id)
        try {
          app.save(s)
        } catch (_) {}
      }

      criados++
      if (status === 'faltou') faltas++
      else if (status === 'cancelado') cancelados++
      else atendidos++
      return true
    }

    /* Percorre 60 dias atrás. Segunda-feira (dow 1) às 7h = falta quase certa.
       João falta mais que Maria. */
    let n = 0
    for (let dias = 60; dias >= 1; dias--) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - dias)
      const dow = d.getUTCDay()
      if (dow === 0) continue // domingo não abre

      // um agendamento de manhã por dia útil
      n++
      const seg = dow === 1
      const pacienteManha = n % 3 === 0 ? joao.id : maria.id
      let statusManha = 'atendido'
      if (seg && n % 2 === 0)
        statusManha = 'faltou' // segunda 7h falta
      else if (n % 11 === 0)
        statusManha = 'faltou' // falta esporádica
      else if (n % 13 === 0) statusManha = 'cancelado'
      // João tem uma falta extra de vez em quando, fora da segunda
      else if (pacienteManha === joao.id && n % 7 === 0) statusManha = 'faltou'

      cria(dias, 7, pacienteManha, statusManha)

      // um segundo horário em dois dias da semana, à tarde (quase sem falta)
      if (dow === 3 || dow === 4) {
        n++
        cria(dias, 14, n % 2 === 0 ? maria.id : joao.id, 'atendido')
      }
      // quinta à noite, para a faixa 17h-19h ter dado
      if (dow === 5) {
        n++
        cria(dias, 17, joao.id, n % 9 === 0 ? 'cancelado' : 'atendido')
      }
    }

    log(
      'agendamentos: ' +
        criados +
        ' | atendidos ' +
        atendidos +
        ' | faltas ' +
        faltas +
        ' | cancelados ' +
        cancelados,
    )
    log('esperado: faltas concentradas na segunda 7h e no paciente Joao')
  },
  (app) => {
    try {
      const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
      app
        .db()
        .newQuery(
          'DELETE FROM agenda_slot WHERE tenant_id = {:t} AND agendamento_id IS NOT NULL;' +
            'DELETE FROM agendamento WHERE tenant_id = {:t};',
        )
        .bind({ t: alfa.id })
        .execute()
    } catch (_) {}
  },
)
