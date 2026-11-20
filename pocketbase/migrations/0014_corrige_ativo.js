/* Migration 0014 - Preenche `ativo` nas salas (Etapa 6)

   Ao testar a agenda, toda tentativa de agendar voltava "Sala ou profissional
   inativo". Causa: as salas do piloto foram criadas na 0004, ANTES de o campo
   `ativo` existir na tela, e ficaram com `ativo` gravado como 0/nulo. A
   checagem `getBool('ativo') === false` as considerava inativas.

   Esta migration marca como ativas as salas que nunca tiveram o campo
   preenchido — não sobrescreve escolha de ninguém, porque campo nulo não é
   escolha, é ausência de dado. Sala desativada de propósito continua como
   está (ativo = 0 só aparece se alguém desativou, e o piloto não desativou).

   Aproveito para normalizar unidade e profissional pelo mesmo motivo. */

migrate(
  (app) => {
    // Sala: campo novo em coleção antiga nasce 0. As do piloto nunca foram
    // desativadas, então estão ativas por definição do seed.
    app.db().newQuery('UPDATE sala SET ativo = 1 WHERE ativo IS NULL OR ativo = 0').execute()
    app.db().newQuery('UPDATE unidade SET ativo = 1 WHERE ativo IS NULL OR ativo = 0').execute()
    app
      .db()
      .newQuery('UPDATE profissional SET ativo = 1 WHERE ativo IS NULL OR ativo = 0')
      .execute()
    app.db().newQuery('UPDATE paciente SET ativo = 1 WHERE ativo IS NULL OR ativo = 0').execute()
  },
  (app) => {
    // Reverter não faz sentido: era ausência de dado, não decisão.
  },
)
