/* Migration 0034 - Corrige a competência da despesa do próximo mês (Etapa 11)

   ERRO MEU no seed 0033: criei a despesa "Aluguel do proximo mes" com
   `isoComp(0)`, que devolve SEMPRE o primeiro dia do mês corrente. Resultado:
   ela caiu no DRE de novembro, inflando as despesas fixas em 4.500 e fazendo o
   resultado operacional parecer 4.500 pior do que é.

   É exatamente o tipo de erro que o DRE precisa não ter: uma despesa com
   competência no mês errado desloca o resultado entre meses, e o dono da
   clínica compara dois meses que na verdade estão trocados.

   Correção: competência no primeiro dia do PRÓXIMO mês, mantendo o vencimento
   em +35 dias — que é o caso real (contrato de aluguel fecha no fim do mês,
   vence no começo do seguinte).

   Aproveito para conferir o total esperado do DRE e gravar no log, para que a
   próxima falha apareça na primeira olhada em vez de eu descobrir por acaso. */

migrate(
  (app) => {
    const log = (m) => console.log('[fix-competencia] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    const agora = new Date()
    const ano = agora.getUTCFullYear()
    const mes = agora.getUTCMonth()

    // primeiro dia do próximo mês
    const proximo = new Date(Date.UTC(mes === 11 ? ano + 1 : ano, mes === 11 ? 0 : mes + 1, 1))
    const proximoIso = proximo.toISOString().replace('T', ' ').slice(0, 23) + 'Z'

    let corrigidas = 0
    try {
      const lista = app.findRecordsByFilter(
        'despesa',
        'tenant_id = "' + tenant + '" && descricao ~ "proximo mes"',
        '',
        10,
        0,
      )
      for (const d of lista) {
        const atual = String(d.getString('data_competencia')).slice(0, 7)
        const atualEsperado = agora.toISOString().slice(0, 7)
        if (atual === atualEsperado) {
          d.set('data_competencia', proximoIso)
          app.save(d)
          corrigidas++
          log(
            'corrigida: ' +
              d.getString('fornecedor') +
              ' -> competencia ' +
              proximoIso.slice(0, 10),
          )
        }
      }
    } catch (err) {
      log('falha: ' + String(err))
    }
    log('corrigidas: ' + corrigidas)

    /* Conferência: recalcula o que o DRE do mês corrente deve mostrar e grava
       no log. Se um dia o número mudar sem explicação, está registrado. */
    try {
      const inicio = agora.toISOString().slice(0, 7) + '-01 00:00:00.000Z'
      const fimMes =
        new Date(Date.UTC(mes === 11 ? ano + 1 : ano, mes === 11 ? 0 : mes + 1, 1))
          .toISOString()
          .replace('T', ' ')
          .slice(0, 23) + 'Z'

      const ds = app.findRecordsByFilter(
        'despesa',
        'tenant_id = "' +
          tenant +
          '" && data_competencia >= "' +
          inicio +
          '" && data_competencia < "' +
          fimMes +
          '"',
        '',
        500,
        0,
      )
      let custo = 0
      let desp = 0
      for (const d of ds) {
        let tipo = 'despesa'
        try {
          tipo = app
            .findRecordById('plano_contas', d.getString('plano_contas_id'))
            .getString('tipo')
        } catch (_) {}
        const v = d.getInt('valor_centavos') || 0
        if (tipo === 'custo') custo += v
        else desp += v
      }
      log('DRE do mes corrente: custos diretos=' + custo + ' despesas fixas=' + desp)
    } catch (err) {
      log('falha na conferencia: ' + String(err))
    }
  },
  (app) => {},
)
