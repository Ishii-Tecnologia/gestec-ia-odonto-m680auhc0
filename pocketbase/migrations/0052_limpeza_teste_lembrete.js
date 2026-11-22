/* Migration 0052 - Limpeza dos testes de lembrete no 80533

   Remove o paciente de teste e o registro em `comunicacao` que ele gerou.

   IMPORTANTE: NAO toco no modelo de mensagem (pode ter sido reativado por mim,
   mas um modelo ativo e o estado desejado — desativar seria piorar), nem em
   qualquer outro dado da demo.

   Mesmo padrao de sempre: apagar o arquivo do seed nao roda o `down`, entao a
   limpeza e migration, e ela CONFERE em vez de supor. */

migrate(
  (app) => {
    const log = (m) => console.log('[limpeza-lembrete-80533] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('tenant Alfa nao existe — nada a limpar')
      return
    }

    // 1. o paciente de teste
    try {
      const p = app.findFirstRecordByFilter(
        'paciente',
        "tenant_id = '" + alfa.id + "' && nome = 'Paciente Teste Lembrete Corrigido'",
      )
      const id = p.id
      app.delete(p)
      log('paciente de teste removido: ' + id)
    } catch (_) {
      log('paciente de teste ja nao existia')
    }

    // 2. a comunicacao gerada por ele (chave do teste)
    try {
      const cs = app.findRecordsByFilter(
        'comunicacao',
        "tenant_id = '" + alfa.id + "' && chave_dia ~ 'aniversario|'",
        '',
        100,
        0,
      )
      let n = 0
      for (const c of cs) {
        // remove so as que apontam para o paciente de teste
        let pacId = c.getString('paciente_id')
        if (!pacId) continue
        try {
          const p = app.findRecordById('paciente', pacId)
          if (p.getString('nome') === 'Paciente Teste Lembrete Corrigido') {
            app.delete(c)
            n++
          }
        } catch (_) {
          // paciente ja removido: a comunicacao fica orfa; apago
          app.delete(c)
          n++
        }
      }
      log('comunicacao de teste removida: ' + n)
    } catch (_) {}

    // 3. conferencia: o paciente de teste nao pode existir
    try {
      let existe = 0
      try {
        app.findFirstRecordByFilter(
          'paciente',
          "tenant_id = '" + alfa.id + "' && nome = 'Paciente Teste Lembrete Corrigido'",
        )
        existe = 1
      } catch (_) {}
      log(existe === 0 ? 'CONFERIDO: paciente de teste ausente' : 'PROBLEMA: paciente ainda existe')
    } catch (_) {}
  },
  (app) => {
    // nao reversivel
  },
)
