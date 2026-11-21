/* Migration 0039 — e-mails nos pacientes demo (Etapa 13)

   Os lembretes só existem com destinatário. Os pacientes demo foram criados
   antes desta etapa e não têm e-mail; sem este passo, o job roda, não encontra
   ninguém e não prova nada — e "rodou sem erro" com zero envios parece sucesso.

   Uso um domínio real de teste (example.com), porque o preview do Skip recusa
   destinatário inválido e registra "skipped" — foi exatamente o que aconteceu
   na sondagem com @gestec.local. */

migrate(
  (app) => {
    const EMAILS = {
      11122233344: 'maria.demo@example.com',
      22233344455: 'joao.demo@example.com',
      33344455566: 'ana.demo@example.com',
    }

    let n = 0
    for (const cpf of Object.keys(EMAILS)) {
      try {
        const p = app.findFirstRecordByData('paciente', 'cpf', cpf)
        p.set('email', EMAILS[cpf])
        app.save(p)
        n++
      } catch (_) {}
    }
    console.log('[lembretes] e-mails demo definidos: ' + n)

    /* Um paciente com aniversário HOJE, para o critério 1 (lembrete enviado e
       registrado) ser provável sem esperar data futura. Uso Maria: a data é
       reescrita para hoje. Isso é dado de demonstração, não de paciente real. */
    try {
      const hoje = new Date()
      const mm = String(hoje.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(hoje.getUTCDate()).padStart(2, '0')
      const maria = app.findFirstRecordByData('paciente', 'cpf', '11122233344')
      maria.set('data_nascimento', '1996-' + mm + '-' + dd + ' 00:00:00.000Z')
      app.save(maria)
      console.log('[lembretes] aniversario da Maria movido para hoje: ' + mm + '-' + dd)
    } catch (_) {}

    /* Consulta daqui a 2 dias (janela de 48h) para a confirmação ter alvo. */
    try {
      const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
      const prof = app.findFirstRecordByFilter('profissional', 'tenant_id = "' + alfa.id + '"')
      const unidade = app.findFirstRecordByFilter('unidade', 'tenant_id = "' + alfa.id + '"')
      const salas = app.findRecordsByFilter('sala', 'tenant_id = "' + alfa.id + '"', 'nome', 1, 0)
      const maria = app.findFirstRecordByData('paciente', 'cpf', '11122233344')

      const alvo = new Date()
      alvo.setUTCDate(alvo.getUTCDate() + 2)
      alvo.setUTCHours(14, 0, 0, 0)

      const iniIso = alvo.toISOString().replace('T', ' ').slice(0, 23) + 'Z'
      const fimIso =
        new Date(alvo.getTime() + 30 * 60000).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

      const slotCol = app.findCollectionByNameOrId('agenda_slot')
      const slots = []
      let colidiu = false
      for (let k = 0; k < 2; k++) {
        const sd = new Date(alvo.getTime() + k * 15 * 60000)
        const s = new Record(slotCol)
        s.set('tenant_id', alfa.id)
        s.set('profissional_id', prof.id)
        s.set('sala_id', salas[0].id)
        s.set('inicio', sd.toISOString().replace('T', ' ').slice(0, 23) + 'Z')
        try {
          app.save(s)
          slots.push(s)
        } catch (_) {
          colidiu = true
          break
        }
      }
      if (!colidiu) {
        const ag = new Record(app.findCollectionByNameOrId('agendamento'))
        ag.set('tenant_id', alfa.id)
        ag.set('unidade_id', unidade.id)
        ag.set('sala_id', salas[0].id)
        ag.set('profissional_id', prof.id)
        ag.set('paciente_id', maria.id)
        ag.set('inicio', iniIso)
        ag.set('fim', fimIso)
        ag.set('tipo', 'retorno')
        ag.set('status', 'confirmado')
        ag.set('origem', 'recepcao')
        app.save(ag)
        for (const s of slots) {
          s.set('agendamento_id', ag.id)
          app.save(s)
        }
        console.log('[lembretes] consulta de demonstracao em 2 dias as 14h criada')
      }
    } catch (err) {
      console.log('[lembretes] consulta demo nao criada: ' + String(err).slice(0, 120))
    }
  },
  (app) => {
    try {
      const maria = app.findFirstRecordByData('paciente', 'cpf', '11122233344')
      maria.set('email', '')
      app.save(maria)
    } catch (_) {}
  },
)
