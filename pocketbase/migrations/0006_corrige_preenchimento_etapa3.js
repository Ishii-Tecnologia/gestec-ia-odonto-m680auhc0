/* Migration 0006 - Correção do preenchimento dos campos novos da Etapa 3

   A 0005 criou `especialidade.vigente` e `tenant_modulo.valor_mensal_centavos`
   e tentou copiar os valores antigos com:
     UPDATE ... SET vigente = ativa WHERE vigente IS NULL
     UPDATE ... SET valor = preco WHERE valor IS NULL

   O WHERE nunca casou: campo bool novo nasce com 0 (false) e campo number
   novo nasce com 0, não NULL. Resultado: as 25 especialidades ficaram com
   vigente = false e os módulos do piloto com valor = 0.

   Aqui o preenchimento é refeito a partir da fonte que ainda existe, e o
   teste de "já preenchido" passa a ser por valor, não por NULL. */

migrate(
  (app) => {
    // 1) especialidade.vigente <- todas as 25 do catálogo estão em vigor.
    //    O catálogo só contém especialidades reconhecidas: nenhuma é histórica.
    app.db().newQuery('UPDATE especialidade SET vigente = 1').execute()

    // 2) tenant_modulo.valor_mensal_centavos <- preço do módulo no catálogo.
    app
      .db()
      .newQuery(
        `UPDATE tenant_modulo
            SET valor_mensal_centavos = (
              SELECT m.preco_centavos FROM modulo m WHERE m.id = tenant_modulo.modulo_id
            )
          WHERE valor_mensal_centavos IS NULL OR valor_mensal_centavos = 0`,
      )
      .execute()
  },
  (app) => {
    // Reverter para o estado neutro; nada aqui é dado de negócio do usuário.
    app.db().newQuery('UPDATE especialidade SET vigente = 0').execute()
    app.db().newQuery('UPDATE tenant_modulo SET valor_mensal_centavos = 0').execute()
  },
)
