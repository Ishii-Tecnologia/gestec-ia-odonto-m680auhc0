/* Paciente nasce ativo (Etapa 5 — bug encontrado na auditoria de qualidade)

   O BUG, e por que ele é grave:

   O campo `paciente.ativo` nasce com valor zero (`false`) quando o cliente não
   o envia — e a tela de cadastro NÃO envia. Só que o hook de agendamento
   (`agendar.js`, Etapa 6) recusa com "Paciente inativo." justamente quem tem
   `ativo === false`, para não agendar em paciente desligado.

   Resultado no fluxo real, reproduzido: a recepção cadastra a paciente nova,
   vai marcar a consulta dela e recebe "Paciente inativo". O caminho de cadastro
   nunca levou ao agendamento — o elo entre a Etapa 5 e a Etapa 6 estava
   quebrado, e nenhum teste de etapa isolada pegaria isso.

   POR QUE CORRIGIR NO SERVIDOR, e não na tela:

   1. A tela é um dos caminhos. Importação CSV, script, outro cliente da API —
      todos criariam paciente inativo. O padrão tem de estar no modelo.
   2. `ativo` não é escolha do usuário no cadastro: quem acabou de chegar está
      ativo por definição. Desativar é ação posterior e deliberada.

   `onRecordCreate` (model hook) roda em qualquer `$app.save()` de criação,
   então cobre todos os caminhos de uma vez.

   CUIDADO COM A DIFERENÇA DE `false` EXPLÍCITO: se o cliente mandar
   `ativo: false` de propósito, respeito. Uso `get('ativo') === undefined` para
   distinguir "não informado" de "informado como falso" — `getBool` devolveria
   false nos dois casos e eu sobrescreveria uma decisão legítima. */

onRecordCreate((e) => {
  // Só age quando o campo não veio: `get` devolve undefined para ausente.
  if (e.record.get('ativo') === undefined) {
    e.record.set('ativo', true)
  }
  return e.next()
}, 'paciente')

/* Mesmo problema, mesmo raciocínio, nas outras entidades operacionais que têm
   campo de ativação: profissional, sala e usuário convidado. Um profissional
   criado sem `ativo` também não poderia ser agendado (o agendar.js recusa
   `prof.ativo === false`), e uma sala sem `ativa` seria recusada igual.

   Fica em arquivo separado? Não: mesmo assunto, mesmo arquivo, hooks distintos.
   O guia recomenda um hook por arquivo por causa do isolamento de escopo do
   JSVM, mas múltiplos registros no topo do arquivo são permitidos — cada
   callback é autocontido, sem helper compartilhado. */

onRecordCreate((e) => {
  if (e.record.get('ativo') === undefined) e.record.set('ativo', true)
  return e.next()
}, 'profissional')

/* `sala` usa o campo `ativa` (feminino) — inconsistência da Etapa 3, registrada
   como dívida. Corrigir o nome agora quebraria consultas existentes; o certo é
   conviver e tratar os dois no código, como o agendar.js já faz. */
onRecordCreate((e) => {
  if (e.record.get('ativa') === undefined) e.record.set('ativa', true)
  return e.next()
}, 'sala')

onRecordCreate((e) => {
  if (e.record.get('ativo') === undefined) e.record.set('ativo', true)
  return e.next()
}, 'users')

/* E os que JÁ foram criados errados: a recepção tem pacientes inativos criados
   antes desta correção, e eles continuam impossíveis de agendar. O backfill
   fica numa migration (0044), não aqui — hook de criação não corrige o
   passado. */
