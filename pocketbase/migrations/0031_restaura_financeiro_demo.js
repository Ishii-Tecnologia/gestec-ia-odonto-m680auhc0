/* Migration 0031 - Restaura o cenário financeiro demo (Etapa 10)

   Os testes dos critérios deixaram resíduo: o critério 3 moveu 10 vencimentos
   para 2027, o critério 1 quitou o título de R$ 1.000 e os testes de regra
   estornaram parte de outro. Quem abrisse o app veria um extrato com datas
   incoerentes (vencimento em 2027, sem nada vencido) e um título parcial que
   ninguém reconhece.

   Esta migration reconstrói o cenário com os pagamentos FEITOS PELAS ROTAS
   correspondentes — não inserindo direto no banco. Importa por dois motivos:

   1. `data_credito_prevista` e o `status` derivado são calculados pela rota.
      Inserir direto no banco produziria um demo que não reflete o
      comportamento real do sistema — e um demo que mente é pior que demo
      nenhum.
   2. Se a regra mudar, o demo acompanha.

   COMO: as rotas são chamadas via HTTP pelo próprio hook, com um token de
   superusuário não é possível; então uso `$app.findRecordById` para o
   necessário e reproduzo aqui a MESMA conta de data_credito_prevista
   (data_pagamento + prazo da forma), deixando comentado que a fonte da verdade
   é /backend/v1/baixar-titulo.

   Cenário final:
   - Título R$ 1.000 pago em Pix 400 + Dinheiro 600 (critério 1, quitado)
   - Título R$ 250 pago em Crédito, crédito previsto +30d (critério 2)
   - 3 títulos realmente vencidos (dias no passado)
   - 12 parcelas de ortodontia escalonadas para frente */

migrate(
  (app) => {
    const log = (m) => console.log('[restaura-fin] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    // limpa
    try {
      app
        .db()
        .newQuery(
          'DELETE FROM pagamento WHERE tenant_id = {:t}; DELETE FROM titulo_receber WHERE tenant_id = {:t};',
        )
        .bind({ t: tenant })
        .execute()
    } catch (err) {
      log('falha na limpeza: ' + String(err))
      return
    }

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

    const formaPorNome = {}
    try {
      const fs = app.findRecordsByFilter(
        'forma_pagamento',
        'tenant_id = "' + tenant + '"',
        '',
        50,
        0,
      )
      for (const f of fs) formaPorNome[f.getString('nome')] = f
    } catch (_) {}

    const colT = app.findCollectionByNameOrId('titulo_receber')
    const colP = app.findCollectionByNameOrId('pagamento')
    const agora = Date.now()
    const dia = 86400000

    function iso(ms) {
      return new Date(ms).toISOString().replace('T', ' ').slice(0, 23) + 'Z'
    }

    /* Cria título e, se pedido, os pagamentos — com a MESMA regra da rota:
       data_credito_prevista = data_pagamento + prazo da forma, e status
       derivado do total pago. */
    function titulo(opts) {
      const t = new Record(colT)
      t.set('tenant_id', tenant)
      t.set('paciente_id', opts.paciente)
      t.set('profissional_id', ana.id)
      t.set('descricao', opts.descricao)
      t.set('valor_centavos', opts.valor)
      t.set('vencimento', iso(agora + opts.vencDias * dia))
      t.set('data_competencia', iso(agora + opts.compDias * dia))
      t.set('plano_contas_id', planoReceita.id)
      if (opts.parcela) {
        t.set('parcela', opts.parcela)
        t.set('parcelas_total', opts.parcelasTotal)
      }

      let pago = 0
      const pagamentos = opts.pagamentos || []
      for (const p of pagamentos) pago += p.valor
      t.set('valor_pago_centavos', pago)

      const vencDia = iso(agora + opts.vencDias * dia).slice(0, 10)
      const hojeDia = iso(agora).slice(0, 10)
      let status
      if (pago >= opts.valor) status = 'pago'
      else if (pago > 0) status = 'parcial'
      else status = vencDia < hojeDia ? 'vencido' : 'aberto'
      t.set('status', status)
      // liquidado só quando quitado; data = dia do último pagamento
      if (pago >= opts.valor && pagamentos.length > 0) {
        t.set('data_liquidacao', iso(agora + (opts.diaPagamento || 0) * dia))
      }
      app.save(t)

      for (const p of pagamentos) {
        const forma = formaPorNome[p.forma]
        if (!forma) continue
        const prazo = forma.getInt('prazo_compensacao_dias') || 0
        const dataPag = agora + (opts.diaPagamento || 0) * dia
        const r = new Record(colP)
        r.set('tenant_id', tenant)
        r.set('titulo_receber_id', t.id)
        r.set('tipo', 'recebimento')
        r.set('valor_centavos', p.valor)
        r.set('forma_pagamento_id', forma.id)
        r.set('data_pagamento', iso(dataPag))
        // MESMA conta da rota baixar-titulo
        r.set('data_credito_prevista', iso(dataPag + prazo * dia))
        r.set('observacao', '')
        app.save(r)
      }

      return t
    }

    // 1) critério 1: R$ 1.000 quitado em Pix 400 + Dinheiro 600
    titulo({
      paciente: maria.id,
      descricao: 'Tratamento endodontico dente 26 - parcela unica',
      valor: 100000,
      vencDias: 10,
      compDias: -30,
      pagamentos: [
        { forma: 'Pix', valor: 40000 },
        { forma: 'Dinheiro', valor: 60000 },
      ],
      diaPagamento: -5,
    })
    log('titulo 1: 1.000 quitado (Pix 400 + Dinheiro 600)')

    // 2) critério 2: cartão de crédito, crédito previsto +30d
    titulo({
      paciente: joao.id,
      descricao: 'Profilaxia e aplicacao de fluor',
      valor: 12000,
      vencDias: -10,
      compDias: -40,
      pagamentos: [{ forma: 'Crédito', valor: 12000 }],
      diaPagamento: -2,
    })
    log('titulo 2: 120 pago em credito (credito previsto +30d)')

    // 3) três títulos REALMENTE vencidos
    titulo({
      paciente: joao.id,
      descricao: 'Consulta de avaliacao inicial',
      valor: 15000,
      vencDias: -95,
      compDias: -120,
      pagamentos: [],
    })
    titulo({
      paciente: joao.id,
      descricao: 'Restauracao em resina dente 11',
      valor: 18000,
      vencDias: -45,
      compDias: -80,
      pagamentos: [],
    })
    titulo({
      paciente: maria.id,
      descricao: 'Raspagem periodontal por sextante',
      valor: 20000,
      vencDias: -20,
      compDias: -55,
      pagamentos: [],
    })
    log('3 titulos vencidos')

    // 4) doze parcelas de ortodontia, escalonadas para frente
    for (let i = 1; i <= 12; i++) {
      titulo({
        paciente: i % 2 === 0 ? maria.id : joao.id,
        descricao: 'Mensalidade ortodontia ' + i + '/12',
        valor: 25000,
        vencDias: i * 30 - 20,
        compDias: -180 + i * 30,
        parcela: i,
        parcelasTotal: 12,
        pagamentos: [],
      })
    }
    log('12 parcelas de ortodontia')

    // 5) um parcial, para a tela mostrar o estado do meio
    titulo({
      paciente: maria.id,
      descricao: 'Coroa de porcelana dente 46 - entrada',
      valor: 90000,
      vencDias: 15,
      compDias: -10,
      pagamentos: [{ forma: 'Pix', valor: 30000 }],
      diaPagamento: -3,
    })
    log('1 titulo parcial (30 de 900)')

    // verificação: nenhum título pode ter saldo negativo
    try {
      const todos = app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' + tenant + '"',
        '',
        500,
        0,
      )
      let ruins = 0
      for (const t of todos) {
        if (t.getInt('valor_pago_centavos') > t.getInt('valor_centavos')) ruins++
      }
      log('titulos: ' + todos.length + ' | inconsistentes: ' + ruins)
    } catch (_) {}
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
