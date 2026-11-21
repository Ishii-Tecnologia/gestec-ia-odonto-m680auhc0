/* Registros nascem ativos (Etapa 5 — bug grave encontrado na auditoria)

   O BUG, reproduzido em teste:

   `paciente.ativo` nasce `false` quando o cliente não envia o campo, e a tela
   de cadastro não envia. O hook de agendamento (`agendar.js`) recusa com
   "Paciente inativo." exatamente quem tem `ativo === false`. Resultado: a
   recepção cadastra a paciente, vai marcar a consulta e recebe "Paciente
   inativo" — o caminho de cadastro NUNCA leva ao agendamento. Nenhum teste de
   etapa isolada pega isso, porque cada etapa funciona sozinha.

   POR QUE `onRecordCreateRequest` E NÃO `onRecordCreate`:

   Tentei primeiro o hook de MODELO com `e.record.get('ativo') === undefined`.
   Não funciona: no hook de modelo o registro já passou pelo schema e um campo
   bool ausente vale `false`, não `undefined`. A condição nunca era verdadeira e
   o hook não fazia nada — silenciosamente.

   O hook de REQUEST tem o corpo da requisição (`e.requestInfo().body`), e ali
   sim dá para distinguir "não mandou o campo" de "mandou falso". Uso o corpo,
   não o record.

   POR QUE NO SERVIDOR E NÃO NA TELA: a tela é um caminho entre vários. CSV,
   script, integração — todos criariam paciente inativo. O padrão pertence ao
   modelo, não ao formulário. E `ativo` não é escolha no cadastro: quem acabou
   de chegar está ativo. Desativar é ação posterior e deliberada. */

onRecordCreateRequest(
  (e) => {
    /* `Object.prototype.hasOwnProperty` no corpo: se a chave não veio, o
       registro nasce ativo. Se veio `false`, é decisão do usuário e respeito. */
    let mandou = false
    try {
      const body = e.requestInfo().body || {}
      mandou = Object.prototype.hasOwnProperty.call(body, 'ativo')
    } catch (_) {
      mandou = false
    }
    /* `convenio` e `centro_custo` entraram aqui junto com as telas deles
       (21/11/2026). Mesma armadilha: criado sem o campo, nasce `false`, some da
       lista de escolha no lançamento, e o usuário cadastra sem conseguir usar —
       sem mensagem alguma explicando. Tratar a classe inteira de uma vez custa
       uma linha; descobrir coleção por coleção custa um chamado por vez. */
    if (!mandou) {
      e.record.set('ativo', true)
    }
    return e.next()
  },
  'paciente',
  'profissional',
  'users',
  'convenio',
  'centro_custo',
)

/* `sala` usa `ativa` (feminino) — inconsistência da Etapa 3, registrada como
   dívida. Corrigir o nome quebraria consultas existentes; o certo é conviver. */
onRecordCreateRequest((e) => {
  let mandou = false
  try {
    const body = e.requestInfo().body || {}
    mandou = Object.prototype.hasOwnProperty.call(body, 'ativa')
  } catch (_) {
    mandou = false
  }
  if (!mandou) e.record.set('ativa', true)
  return e.next()
}, 'sala')
