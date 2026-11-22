/* Migration 0054 - Limpeza do agendamento de teste da colisao (producao)

   Criei um agendamento em 2027-06-10 08:00 no tenant Alfa (demo) para provocar
   a colisao e provar, EM PRODUCAO, que a mensagem amigavel aparece.

   Ele nao pode ficar: os slots ocupam a agenda e, sem agendamento visivel, o
   horario ficaria preso sem ninguem achar a causa — pior que o problema
   original.

   Apago o AGENDAMENTO e os SLOTS dele, e confiro os dois. */

migrate(
  (app) => {
    const log = (m) => console.log('[limpeza-prod] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('tenant Alfa nao existe — nada a limpar')
      return
    }

    // 1. slots do horario de teste
    try {
      const slots = app.findRecordsByFilter(
        'agenda_slot',
        "tenant_id = '" +
          alfa.id +
          "' && inicio >= '2027-06-10 08:00:00.000Z' && inicio <= '2027-06-10 08:30:00.000Z'",
        '',
        20,
        0,
      )
      for (const s of slots) {
        try {
          app.delete(s)
        } catch (_) {}
      }
      log('slots removidos: ' + slots.length)
    } catch (err) {
      log('falha nos slots: ' + String(err).slice(0, 100))
    }

    // 2. o agendamento
    try {
      const ags = app.findRecordsByFilter(
        'agendamento',
        "tenant_id = '" +
          alfa.id +
          "' && inicio >= '2027-06-10 00:00:00.000Z' && inicio <= '2027-06-10 23:59:59.999Z'",
        '',
        20,
        0,
      )
      for (const a of ags) {
        app.delete(a)
        log('agendamento removido: ' + a.id)
      }
      if (ags.length === 0) log('nenhum agendamento de teste encontrado')
    } catch (err) {
      log('falha no agendamento: ' + String(err).slice(0, 100))
    }

    // 3. conferencia nos DOIS sentidos
    try {
      const slotsRest = app.findRecordsByFilter(
        'agenda_slot',
        "tenant_id = '" +
          alfa.id +
          "' && inicio >= '2027-06-10 00:00:00.000Z' && inicio <= '2027-06-10 23:59:59.999Z'",
        '',
        50,
        0,
      )
      const agsRest = app.findRecordsByFilter(
        'agendamento',
        "tenant_id = '" +
          alfa.id +
          "' && inicio >= '2027-06-10 00:00:00.000Z' && inicio <= '2027-06-10 23:59:59.999Z'",
        '',
        50,
        0,
      )
      log(
        'CONFERIDO -> slots restantes: ' +
          slotsRest.length +
          ', agendamentos restantes: ' +
          agsRest.length,
      )
    } catch (_) {}

    // 4. a demo continua como estava?
    try {
      const pacs = app.findRecordsByFilter('paciente', "tenant_id = '" + alfa.id + "'", '', 200, 0)
      const profs = app.findRecordsByFilter(
        'profissional',
        "tenant_id = '" + alfa.id + "'",
        '',
        50,
        0,
      )
      const salas = app.findRecordsByFilter('sala', "tenant_id = '" + alfa.id + "'", '', 50, 0)
      log(
        'DEMO: ' +
          pacs.length +
          ' pacientes, ' +
          profs.length +
          ' profissionais, ' +
          salas.length +
          ' salas',
      )
    } catch (_) {}
  },
  (app) => {
    // nao reversivel
  },
)
