/* Migration 0046 — prova que o aviso de tabela vencida dispara

   Por que uma migration de teste que roda e desfaz: a tabela de preço tem
   updateRule nulo (escrita só por superusuário — correto), então não há como
   vencer uma tabela pela API do tenant para testar o aviso. Sem provocar o
   cenário, o aviso ficaria "implementado e nunca verificado", que é o mesmo
   que não existir.

   Esta migration:
   1. vence temporariamente a tabela particular;
   2. (o teste roda fora, chamando a rota);
   3. a 0047 restaura.

   Duas migrations em vez de uma para o estado vencido existir entre elas. Se
   eu vencesse e restaurasse no mesmo arquivo, o teste nunca veria o cenário. */

migrate(
  (app) => {
    const log = (m) => console.log('[teste-aviso] ' + m)
    try {
      const tabs = app.findRecordsByFilter('tabela_preco', 'convenio_id = ""', '', 10, 0)
      for (const t of tabs) {
        t.set('vigencia_fim', '2026-06-30 00:00:00.000Z') // passado: vencida
        app.save(t)
        log('vencida para teste: ' + t.getString('nome'))
      }
    } catch (err) {
      log('falhou: ' + String(err).slice(0, 120))
    }
  },
  (app) => {
    // reversão desta migration de teste não é necessária: a 0047 restaura
  },
)
