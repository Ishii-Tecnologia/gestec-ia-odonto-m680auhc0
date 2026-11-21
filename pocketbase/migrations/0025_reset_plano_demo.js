/* Migration 0025 - Recomeça o cenário demo de plano (Etapa 9)

   A 0024 já criou o plano v1, mas o teste do critério 2 gerou uma v2 e deixou o
   item da coroa marcado como 'substituido' na v1. Isso é estado de TESTE, não
   demonstração: quem abrir o app veria uma v2 que ninguém pediu.

   Esta migration limpa e recria o cenário limpo do critério 1:
     3 itens, 2 executados (380,00) e 1 proposto (900,00), bruto 1.280,00.

   Idempotente por desenho: apaga tudo do tenant demo antes de semear, então
   rodar em base limpa ou suja dá o mesmo resultado. */

migrate(
  (app) => {
    const log = (m) => console.log('[reset-plano] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    // ---------- limpeza ----------
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
      log('limpo')
    } catch (err) {
      log('falha na limpeza: ' + String(err))
      return
    }

    // ---------- dados base ----------
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
    log('plano v1: 2 executados (380) + 1 proposto (900)')

    // realizados
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

    // orçamento
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
    log('orcamento aprovado 1280,00 em 4x')
  },
  (app) => {
    try {
      const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
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
        .bind({ t: alfa.id })
        .execute()
    } catch (_) {}
  },
)
