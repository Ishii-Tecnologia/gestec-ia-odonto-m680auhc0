/* Migration 0044 — conserta registros criados sem o campo de ativação

   A correção do hook (ativo_padrao.js) vale para registros NOVOS. Os que já
   existem continuam com `ativo = false` e continuam impossíveis de agendar —
   foi assim que a paciente criada no teste ficou.

   Preencho os que NUNCA foram tocados. O critério para distinguir "nasceu
   errado" de "foi desativado de propósito" é a ausência de qualquer outro
   sinal de uso deliberado: aqui, como o campo de ativação nunca teve tela para
   alterar, todo `false` é resíduo do default. Documento a premissa em vez de
   fingir que o dado distingue.

   Idempotente: rodar de novo não muda nada. */

migrate(
  (app) => {
    const log = (m) => console.log('[ativo-backfill] ' + m)

    /* paciente: o campo `ativo` nunca teve controle na tela de cadastro, então
       `false` só pode ser o default do schema. Ativo. */
    let n = 0
    try {
      const ps = app.findRecordsByFilter('paciente', 'ativo = false', '', 5000, 0)
      for (const p of ps) {
        p.set('ativo', true)
        try {
          app.save(p)
          n++
        } catch (_) {}
      }
    } catch (err) {
      log('paciente: ' + String(err).slice(0, 100))
    }
    log('pacientes reativados: ' + n)

    /* profissional e sala: mesma lógica. */
    let np = 0
    try {
      const pro = app.findRecordsByFilter('profissional', 'ativo = false', '', 500, 0)
      for (const p of pro) {
        p.set('ativo', true)
        try {
          app.save(p)
          np++
        } catch (_) {}
      }
    } catch (_) {}
    log('profissionais reativados: ' + np)

    let ns = 0
    try {
      const sal = app.findRecordsByFilter('sala', 'ativa = false', '', 500, 0)
      for (const s of sal) {
        s.set('ativa', true)
        try {
          app.save(s)
          ns++
        } catch (_) {}
      }
    } catch (_) {}
    log('salas reativadas: ' + ns)

    /* users NÃO entra: conta desativada é decisão de segurança, e reativar em
       massa devolveria acesso a quem foi bloqueado. */
    log('users nao tocados (desativacao de conta e decisao de seguranca)')
  },
  (app) => {
    // não reversível: o estado anterior era defeito
  },
)
