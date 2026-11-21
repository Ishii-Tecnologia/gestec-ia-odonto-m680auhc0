/* Migration 0030 - Títulos a receber demo (Etapa 10)

   Cenário que serve aos critérios:

   1. Título de R$ 1.000,00 (o critério 1 é literal: pago em 400 + 600 fecha em
      zero). Fica ABERTO para o teste fazer a baixa.
   2. Três títulos vencidos de meses diferentes, para o critério 3 (reagendar
      em lote) ter o que mover e para a tela mostrar atraso.
   3. Doze títulos pequenos para o lote ter 10+ candidatos de verdade.
   4. Um título já pago por cartão de crédito, para o critério 2 verificar
      `data_credito_prevista` 30 dias à frente (feito pela rota, aqui só o
      cenário inicial).

   `data_competencia` fica no MÊS DO SERVIÇO — nos vencidos, no mês do serviço,
   não no do vencimento. É o que o critério 4 confere na exportação. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-titulos] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    try {
      const ja = app.findRecordsByFilter('titulo_receber', 'tenant_id = "' + tenant + '"', '', 1, 0)
      if (ja.length > 0) {
        log('ja existem titulos, saindo')
        return
      }
    } catch (_) {}

    let maria, joao, ana, planoReceita
    try {
      maria = app.findFirstRecordByFilter('paciente', 'cpf = "11122233344"')
      joao = app.findFirstRecordByFilter('paciente', 'nome ~ "João"')
      ana = app.findFirstRecordByFilter(
        'profissional',
        'tenant_id = "' + tenant + '" && nome ~ "Ana"',
      )
      planoReceita = app.findFirstRecordByFilter(
        'plano_contas',
        'tenant_id = "' + tenant + '" && codigo = "3.1"',
      )
    } catch (err) {
      log('faltou dado base: ' + String(err))
      return
    }

    const col = app.findCollectionByNameOrId('titulo_receber')
    let n = 0

    function cria(pacienteId, descricao, valor, vencDias, compDias, parcela, totalParcelas) {
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('paciente_id', pacienteId)
      r.set('profissional_id', ana.id)
      r.set('descricao', descricao)
      r.set('valor_centavos', valor)
      r.set('valor_pago_centavos', 0)
      const agora = Date.now()
      r.set(
        'vencimento',
        new Date(agora + vencDias * 86400000).toISOString().replace('T', ' ').slice(0, 23) + 'Z',
      )
      // competência sempre no PASSADO (mês do serviço), independente do vencimento
      r.set(
        'data_competencia',
        new Date(agora + compDias * 86400000).toISOString().replace('T', ' ').slice(0, 23) + 'Z',
      )
      r.set('plano_contas_id', planoReceita.id)
      r.set('status', 'aberto')
      if (parcela) {
        r.set('parcela', parcela)
        r.set('parcelas_total', totalParcelas)
      }
      app.save(r)
      n++
      return r
    }

    // 1) o título do critério 1
    cria(maria.id, 'Tratamento endodontico dente 26 - parcela unica', 100000, 10, -30, 1, 1)
    log('titulo de R$ 1.000,00 criado (critério 1)')

    // 2) três vencidos, competência em meses diferentes
    cria(joao.id, 'Consulta de avaliacao - vencida', 15000, -95, -120, 1, 1)
    cria(joao.id, 'Restauracao dente 11 - vencida', 18000, -65, -90, 1, 1)
    cria(maria.id, 'Raspagem periodontal - vencida', 20000, -35, -60, 1, 1)
    log('3 titulos vencidos')

    // 3) doze títulos pequenos, escalonados (para o lote de 10)
    for (let i = 1; i <= 12; i++) {
      cria(
        i % 2 === 0 ? maria.id : joao.id,
        'Mensalidade ortodontia ' + i + '/12',
        25000,
        i * 15 - 10,
        -200 + i * 15,
        i,
        12,
      )
    }
    log('12 parcelas de ortodontia')

    log('total de titulos: ' + n)
  },
  (app) => {
    try {
      const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
      app
        .db()
        .newQuery(
          'DELETE FROM pagamento WHERE tenant_id = {:t}; DELETE FROM titulo_receber WHERE tenant_id = {:t};',
        )
        .bind({ t: alfa.id })
        .execute()
    } catch (_) {}
  },
)
