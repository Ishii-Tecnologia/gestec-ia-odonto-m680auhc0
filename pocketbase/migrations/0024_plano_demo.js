/* Migration 0024 - Plano demo com 3 itens e 2 executados (Etapa 9)

   O critério 1 é literal: "orçamento de 3 itens com 2 executados mostra valor
   realizado e pendente corretos". Este seed monta exatamente esse cenário, com
   valores escolhidos para que a conferência seja à mão:

     - Restauração face única (PROF-004) ..... 180,00  EXECUTADO
     - Raspagem periodontal (PROF-008) ....... 200,00  EXECUTADO
     - Coroa de porcelana (PROF-010) ......... 900,00  PROPOSTO

     bruto 1.280,00 | executado 380,00 | pendente 900,00

   Se a tela ou o passivo mostrarem outro número, a conta está errada — não há
   ambiguidade de arredondamento aqui de propósito.

   Usa a paciente Maria (a mesma do convênio) e o preço PARTICULAR, porque o
   plano guarda snapshot do preço e quero o número redondo acima. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-plano] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    // idempotência
    try {
      const ja = app.findRecordsByFilter(
        'plano_tratamento',
        'tenant_id = "' + tenant + '"',
        '',
        1,
        0,
      )
      if (ja.length > 0) {
        log('ja existe plano, saindo')
        return
      }
    } catch (_) {}

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

    // ---------- plano ----------
    let plano
    try {
      const col = app.findCollectionByNameOrId('plano_tratamento')
      plano = new Record(col)
      plano.set('tenant_id', tenant)
      plano.set('paciente_id', maria.id)
      plano.set('profissional_id', ana.id)
      plano.set('titulo', 'Reabilitacao dentes 26 e 36 + coroa 46')
      plano.set('versao', 1)
      plano.set('status', 'em_execucao')
      app.save(plano)
    } catch (err) {
      log('FALHOU plano: ' + String(err))
      return
    }

    // ---------- fases ----------
    const colFase = app.findCollectionByNameOrId('fase')
    const fase1 = new Record(colFase)
    fase1.set('tenant_id', tenant)
    fase1.set('plano_tratamento_id', plano.id)
    fase1.set('ordem', 1)
    fase1.set('nome', 'Fase 1 - Doenca periodontal e caries')
    app.save(fase1)

    const fase2 = new Record(colFase)
    fase2.set('tenant_id', tenant)
    fase2.set('plano_tratamento_id', plano.id)
    fase2.set('ordem', 2)
    fase2.set('nome', 'Fase 2 - Reabilitacao protetica')
    app.save(fase2)

    // ---------- itens ----------
    const colItem = app.findCollectionByNameOrId('item_tratamento')

    function criaItem(faseId, proc, dente, face, valor, status) {
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

    const item1 = criaItem(fase1.id, proc4, '26', ['oclusal'], 18000, 'executado')
    const item2 = criaItem(fase1.id, proc8, '36', [], 20000, 'executado')
    const item3 = criaItem(fase2.id, proc10, '46', [], 90000, 'proposto')
    log('itens: 2 executados (180+200) e 1 proposto (900) = bruto 1280')

    // ---------- procedimentos realizados ----------
    try {
      const colReal = app.findCollectionByNameOrId('procedimento_realizado')
      for (const [item, proc, dente, face, valor] of [
        [item1, proc4, '26', ['oclusal'], 18000],
        [item2, proc8, '36', [], 20000],
      ]) {
        const r = new Record(colReal)
        r.set('tenant_id', tenant)
        r.set('paciente_id', maria.id)
        r.set('procedimento_id', proc.id)
        r.set('item_tratamento_id', item.id)
        r.set('dente', dente)
        r.set('face', face)
        r.set('profissional_executante_id', ana.id)
        r.set('profissional_solicitante_id', ana.id)
        r.set('valor_centavos', valor)
        app.save(r)
      }
      log('2 procedimentos realizados gravados')
    } catch (err) {
      log('FALHOU realizados: ' + String(err))
    }

    // ---------- orçamento aprovado ----------
    try {
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
      const validade =
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 23) + 'Z'
      orc.set('validade', validade)
      orc.set('status', 'aprovado')
      orc.set('aprovado_em', new Date().toISOString().replace('T', ' ').slice(0, 23) + 'Z')
      app.save(orc)
      log('orcamento aprovado: bruto 1280,00 em 4x')
    } catch (err) {
      log('FALHOU orcamento: ' + String(err))
    }
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
