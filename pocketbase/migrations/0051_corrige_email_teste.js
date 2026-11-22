/* Migration 0051 - Troca o e-mail do paciente de teste para um valido

   Ja provei o caso "erro que nao e unique" (migration 0050): a falha aparece
   com o motivo em vez de virar "ja enviado".

   Agora o caso OPOSTO: idempotencia legitima. Para isso o paciente tem de
   passar no `registrar` e cair no indice UNIQUE de `chave_dia` na segunda
   execucao. Troco o e-mail por um valido de tamanho normal.

   O dominio @teste.invalid e descartado pelo Skip (`recipient dropped`), entao
   nenhuma mensagem sai de verdade — o que estou medindo e o REGISTRO, que e
   onde mora a idempotencia. */

migrate(
  (app) => {
    const log = (m) => console.log('[fix-email-teste] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('tenant Alfa nao existe')
      return
    }

    try {
      const p = app.findFirstRecordByFilter(
        'paciente',
        "tenant_id = '" + alfa.id + "' && nome = 'Paciente Teste Lembrete Corrigido'",
      )
      p.set('email', 'paciente.teste.lembrete@teste.invalid')
      app.save(p)
      log('email trocado para um valido: ' + p.id)
    } catch (_) {
      log('paciente de teste nao encontrado')
    }
  },
  (app) => {
    // nao reversivel: o estado anterior era o defeito de teste
  },
)
