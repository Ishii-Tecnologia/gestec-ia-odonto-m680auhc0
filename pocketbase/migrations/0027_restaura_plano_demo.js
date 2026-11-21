/* Migration 0027 - Restaura o cenário demo após os testes (Etapa 9)

   Os testes dos critérios 2 e 3 deixaram a base assim: v2 criada, plano
   CANCELADO e um crédito de 600,00 aberto. Isso é registro de teste, não
   demonstração — quem abrisse o app veria um tratamento cancelado que nunca
   existiu de verdade.

   Esta migration devolve o cenário do critério 1 (3 itens, 2 executados,
   1 proposto, bruto 1.280,00) e apaga o crédito de teste.

   Igual à 0025 na intenção; existe separada porque migrations já aplicadas não
   rodam de novo. É o preço de testar contra o banco real em vez de um banco de
   teste — que é o que permite afirmar "funciona" com honestidade. */

migrate(
  (app) => {
    const log = (m) => console.log('[restaura-plano] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    try {
      app
        .db()
        .newQuery(
          'DELETE FROM credito_paciente WHERE tenant_id = {:t};' +
            'DELETE FROM procedimento_realizado WHERE tenant_id = {:t};' +
            'DELETE FROM orcamento WHERE tenant_id = {:t};' +
            'DELETE FROM item_tratamento WHERE tenant_id = {:t};' +
            'DELETE FROM fase WHERE tenant_id = {:t};' +
            'DELETE FROM plano_tratamento WHERE tenant_id = {:t};',
        )
        .bind({ t: tenant })
        .execute()
    } catch (err) {
      log('falha na limpeza: ' + String(err))
      return
    }

    let maria, ana, proc4, proc8, proc10
    try {
      maria = app.findFirstRecordByFilter('paciente', 'cpf = "11122233344"')
      ana = app.findFirstRecordByFilter(
        'profissional',
        'tenant_id = "' + tenant + '" && nome ~ "Ana"',
      )
      proc4 = app.findFirstRecordByFilter(
        'procedimento',
        'tenant_id = "' + tenant + '" && codigo = "PROF-004"',
      )
      proc8 = app.findFirstRecordByFilter(
        'procedimento',
        'tenant_id = "' + tenant + '" && codigo = "PROF-008"',
      )
      proc10 = app.findFirstRecordByFilter(
        'procedimento',
        'tenant_id = "' + tenant + '" && codigo = "PROF-010"',
      )
    } catch (err) {
      log('faltou dado base: ' + String(err))
      return
    }

    const colPlano = app.findCollectionByNameOrId('plano_tratamento')
    const colFase = app.findCollectionByNameOrId('fase')
    const colItem = app.findCollectionByNameOrId('item_tratamento')

    const plano = new Record(colPlano)
    plano.set('tenant_id', tenant)
    plano.set('paciente_id', maria.id)
    plano.set('profissional_id', ana.id)
    plano.set('titulo', 'Reabilitacao dentes 26 e 36 + coroa 46')
    plano.set('versao', 1)
    plano.set('status', 'em_execucao')
    app.save(plano)

    const f1 = new Record(colFase)
    f1.set('tenant_id', tenant)
    f1.set('plano_tratamento_id', plano.id)
    f1.set('ordem', 1)
    f1.set('nome', 'Fase 1 - Doenca periodontal e caries')
    app.save(f1)

    const f2 = new Record(colFase)
    f2.set('tenant_id', tenant)
    f2.set('plano_tratamento_id', plano.id)
    f2.set('ordem', 2)
    f2.set('nome', 'Fase 2 - Reabilitacao protetica')
    app.save(f2)

    function item(faseId, proc, dente, face, valor, status) {
      const it = new Record(colItem)
      it.set('tenant_id', tenant)
      it.set('fase_id', faseId)
      it.set('procedimento_id', proc.id)
      it.set('dente', dente)
      it.set('face', face)
      it.set('quantidade', 1)
      it.set('valor_unitario_centavos', valor)
      it.set('status', status)
      app.save(it)
      return it
    }

    const i1 = item(f1.id, proc4, '26', ['oclusal'], 18000, 'executado')
    const i2 = item(f1.id, proc8, '36', [], 20000, 'executado')
    item(f2.id, proc10, '46', [], 90000, 'proposto')

    const colReal = app.findCollectionByNameOrId('procedimento_realizado')
    for (const [it, proc, dente, face, valor] of [
      [i1, proc4, '26', ['oclusal'], 18000],
      [i2, proc8, '36', [], 20000],
    ]) {
      const r = new Record(colReal)
      r.set('tenant_id', tenant)
      r.set('paciente_id', maria.id)
      r.set('procedimento_id', proc.id)
      r.set('item_tratamento_id', it.id)
      r.set('dente', dente)
      r.set('face', face)
      r.set('profissional_executante_id', ana.id)
      r.set('profissional_solicitante_id', ana.id)
      r.set('valor_centavos', valor)
      app.save(r)
    }

    const colOrc = app.findCollectionByNameOrId('orcamento')
    const orc = new Record(colOrc)
    orc.set('tenant_id', tenant)
    orc.set('paciente_id', maria.id)
    orc.set('plano_tratamento_id', plano.id)
    orc.set('plano_versao', 1)
    orc.set('valor_bruto_centavos', 128000)
    orc.set('desconto_centavos', 0)
    orc.set('valor_final_centavos', 128000)
    orc.set('parcelas', 4)
    orc.set(
      'validade',
      new Date(Date.now() + 30 * 86400000).toISOString().replace('T', ' ').slice(0, 23) + 'Z',
    )
    orc.set('status', 'aprovado')
    orc.set('aprovado_em', new Date().toISOString().replace('T', ' ').slice(0, 23) + 'Z')
    app.save(orc)

    log('cenario restaurado: 2 executados (380) + 1 proposto (900)')
  },
  (app) => {},
)
