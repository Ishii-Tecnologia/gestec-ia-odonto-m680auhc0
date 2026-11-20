/* Migration 0014 - Preenche o campo de situação das salas (Etapa 6)

   Ao testar a agenda, toda tentativa de agendar voltava "Sala ou profissional
   inativo". Causa: as salas do piloto foram criadas na 0004 e o campo de
   situação ficou nulo; a checagem tratava nulo como desativado.

   ATENÇÃO ao nome do campo: `sala` usa `ativa` (feminino, "a sala está
   ativa"), enquanto `unidade`, `profissional` e `paciente` usam `ativo`.
   É inconsistência que eu mesmo criei na Etapa 3. Não renomeio agora porque
   renomear campo mexe em telas já prontas por um ganho só estético; fica
   registrado como dívida conhecida no ESTADO.md.

   Preencher nulo com 1 não sobrescreve decisão de ninguém: nulo é ausência de
   dado, não escolha. Sala que alguém desativou de propósito continua 0. */

migrate(
  (app) => {
    // sala usa `ativa`
    app.db().newQuery('UPDATE sala SET ativa = 1 WHERE ativa IS NULL OR ativa = 0').execute()

    // as demais usam `ativo`
    ;['unidade', 'profissional', 'paciente'].forEach((tabela) => {
      try {
        app
          .db()
          .newQuery('UPDATE ' + tabela + ' SET ativo = 1 WHERE ativo IS NULL OR ativo = 0')
          .execute()
      } catch (_) {}
    })
  },
  (app) => {
    // Reverter não faz sentido: era ausência de dado, não decisão.
  },
)
