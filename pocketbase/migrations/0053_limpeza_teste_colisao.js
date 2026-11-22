/* Migration 0053 - Limpeza do agendamento de teste da colisao

   Criei um agendamento em 2027-01-06 10:00 no tenant Alfa (demo) para provocar
   a colisao e provar que a mensagem amigavel aparece. Ele nao deve ficar.

   Apago o AGENDAMENTO e os SLOTS dele — os slots sao a parte que ocupa a
   agenda, entao precisam sair junto; se ficassem, o horario continuaria preso
   sem nenhum agendamento visivel, que e pior que o problema original.

   Como nao ha campo que identifique "foi o teste", uso a data especifica
   (2027-01-06) que eu criei. Nenhum dado real existe nessa data. */

migrate(
  (app) => {
    const log = (m) => console.log('[limpeza-agendamento-80533] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('tenant Alfa nao existe')
      return
    }

    // 1. slots do agendamento de teste (pela data)
    let slotsRemovidos = 0
    try {
      const slots = app.findRecordsByFilter(
        'agenda_slot',
        "tenant_id = '" +
          alfa.id +
          "' && inicio >= '2027-01-06 10:00:00.000Z' && inicio <= '2027-01-06 10:30:00.000Z'",
        '',
        20,
        0,
      )
      for (const s of slots) {
        const agId = s.getString('agendamento_id')
        try {
          app.delete(s)
          slotsRemovidos++
        } catch (_) {}
      }
      log('slots removidos: ' + slotsRemovidos)
    } catch (err) {
      log('falha ao remover slots: ' + String(err).slice(0, 100))
    }

    // 2. o agendamento
    try {
      const ags = app.findRecordsByFilter(
        'agendamento',
        "tenant_id = '" +
          alfa.id +
          "' && inicio >= '2027-01-06 00:00:00.000Z' && inicio <= '2027-01-06 23:59:59.999Z'",
        '',
        20,
        0,
      )
      for (const a of ags) {
        app.delete(a)
        log('agendamento de teste removido: ' + a.id)
      }
      if (ags.length === 0) log('nenhum agendamento de teste encontrado')
    } catch (err) {
      log('falha ao remover agendamento: ' + String(err).slice(0, 100))
    }

    // 3. conferencia: nenhum slot orfao nessa data
    try {
      const restantes = app.findRecordsByFilter(
        'agenda_slot',
        "tenant_id = '" +
          alfa.id +
          "' && inicio >= '2027-01-06 00:00:00.000Z' && inicio <= '2027-01-06 23:59:59.999Z'",
        '',
        50,
        0,
      )
      log(
        restantes.length === 0
          ? 'CONFERIDO: nenhum slot sobrou em 2027-01-06'
          : 'PROBLEMA: ' + restantes.length + ' slot(s) ainda em 2027-01-06',
      )
    } catch (_) {}
  },
  (app) => {
    // nao reversivel
  },
)
