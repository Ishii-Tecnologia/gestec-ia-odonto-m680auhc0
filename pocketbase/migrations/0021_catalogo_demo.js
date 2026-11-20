/* Migration 0021 - Catálogo demo (Etapa 8)

   O critério 1 pede "10 procedimentos com preço em duas tabelas". Este seed
   cria exatamente isso para o tenant demo Alfa:

   - 10 procedimentos reais de clínica geral/odontopediatria;
   - 2 convênios (Odonto Prev Demo, Amil Dental Demo) — nomes marcados como
     demo porque registro ANS real não deve ser inventado;
   - 3 tabelas: Particular (convenio nulo), Odonto Prev Demo e Amil Dental Demo.
     As duas do convênio NÃO têm todos os procedimentos de propósito: é assim
     que o fallback para o particular fica testável de verdade.

   Preços em CENTAVOS. Os valores abaixo são fictícios e servem só para
   demonstração — não são tabela de mercado e não devem ser copiados para
   operação.

   Também vinculo a paciente Maria ao convênio Odonto Prev Demo, para o
   critério 2 ("valor muda entre particular e convênio") ser verificável com um
   paciente real. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-catalogo] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo, saindo')
      return
    }
    const tenant = alfa.id

    // idempotência: se já rodou, sai
    try {
      const ja = app.findRecordsByFilter('procedimento', 'tenant_id = "' + tenant + '"', '', 1, 0)
      if (ja.length >= 10) {
        log('catalogo ja existe (' + ja.length + ' procedimentos), saindo')
        return
      }
    } catch (_) {}

    // ---------- especialidades existentes ----------
    const espId = (codigo) => {
      try {
        return app.findFirstRecordByData('especialidade', 'codigo', codigo).id
      } catch (_) {
        return ''
      }
    }

    // ---------- convênios ----------
    const convenios = {}
    const criaConvenio = (nome, ans) => {
      try {
        return app.findFirstRecordByFilter(
          'convenio',
          'tenant_id = "' + tenant + '" && nome = "' + nome + '"',
        ).id
      } catch (_) {}
      const c = new Record(app.findCollectionByNameOrId('convenio'))
      c.set('tenant_id', tenant)
      c.set('nome', nome)
      c.set('registro_ans', ans)
      c.set('ativo', true)
      app.save(c)
      return c.id
    }
    convenios.prev = criaConvenio('Odonto Prev Demo', '000000')
    convenios.amil = criaConvenio('Amil Dental Demo', '000001')
    log('convenios criados')

    // ---------- procedimentos ----------
    // codigo, nome, especialidade CFO, por_dente, valor particular, valor prev
    const lista = [
      ['PROF-001', 'Consulta de avaliacao inicial', 'CLINICA', false, 15000, 9000],
      ['PROF-002', 'Profilaxia com jato e escovacao', 'CLINICA', false, 12000, 7000],
      ['PROF-003', 'Aplicacao de fluor', 'CLINICA', false, 8000, 5000],
      ['PROF-004', 'Restauracao em resina composta - face unica', 'DENTISTICA', true, 18000, 12000],
      [
        'PROF-005',
        'Restauracao em resina composta - multiplas faces',
        'DENTISTICA',
        true,
        25000,
        17000,
      ],
      ['PROF-006', 'Extracao de dente permanente', 'CIRURGIA', true, 22000, 15000],
      ['PROF-007', 'Tratamento endodontico unirradicular', 'ENDODONTIA', true, 60000, 42000],
      ['PROF-008', 'Raspagem periodontal por sextante', 'PERIODONTIA', true, 20000, 13000],
      ['PROF-009', 'Selante de fissura', 'ODONTOPEDIATRIA', true, 9000, 6000],
      ['PROF-010', 'Coroas totais em porcelana', 'PROTESE', true, 90000, 68000],
    ]

    const procIds = {}
    for (const [codigo, nome, esp, porDente, vPart, vPrev] of lista) {
      let id = ''
      try {
        id = app.findFirstRecordByFilter(
          'procedimento',
          'tenant_id = "' + tenant + '" && codigo = "' + codigo + '"',
        ).id
      } catch (_) {
        const p = new Record(app.findCollectionByNameOrId('procedimento'))
        p.set('tenant_id', tenant)
        p.set('codigo', codigo)
        p.set('nome', nome)
        const e = espId(esp)
        if (e) p.set('especialidade_id', e)
        p.set('por_dente', porDente)
        p.set('ativo', true)
        app.save(p)
        id = p.id
      }
      procIds[codigo] = { id, vPart, vPrev }
    }
    log('procedimentos criados: ' + Object.keys(procIds).length)

    // ---------- tabelas ----------
    const criaTabela = (nome, convenioId, inicio) => {
      try {
        return app.findFirstRecordByFilter(
          'tabela_preco',
          'tenant_id = "' +
            tenant +
            '" && nome = "' +
            nome +
            '" && convenio_id = "' +
            (convenioId || '') +
            '"',
        ).id
      } catch (_) {}
      const t = new Record(app.findCollectionByNameOrId('tabela_preco'))
      t.set('tenant_id', tenant)
      t.set('nome', nome)
      t.set('convenio_id', convenioId || '')
      t.set('vigencia_inicio', inicio)
      t.set('ativa', true)
      app.save(t)
      return t.id
    }

    const inicio = '2026-01-01 00:00:00.000Z'
    const tPart = criaTabela('Particular 2026', '', inicio)
    const tPrev = criaTabela('Odonto Prev Demo 2026', convenios.prev, inicio)
    // Amil NÃO tem todos os itens: só 4. O resto cai no particular (fallback).
    const tAmil = criaTabela('Amil Dental Demo 2026', convenios.amil, inicio)
    log('tabelas criadas')

    const criaItem = (tabelaId, procId, valor) => {
      try {
        app.findFirstRecordByFilter(
          'tabela_preco_item',
          'tabela_preco_id = "' + tabelaId + '" && procedimento_id = "' + procId + '"',
        )
        return
      } catch (_) {}
      const i = new Record(app.findCollectionByNameOrId('tabela_preco_item'))
      i.set('tenant_id', tenant)
      i.set('tabela_preco_id', tabelaId)
      i.set('procedimento_id', procId)
      i.set('valor_centavos', valor)
      app.save(i)
    }

    let nItens = 0
    for (const codigo of Object.keys(procIds)) {
      const p = procIds[codigo]
      criaItem(tPart, p.id, p.vPart)
      nItens++
      // Prev cobre 8 dos 10: deixo PROF-009 e PROF-010 sem preço de convênio
      if (codigo !== 'PROF-009' && codigo !== 'PROF-010') {
        criaItem(tPrev, p.id, p.vPrev)
        nItens++
      }
    }
    // Amil: só 4 procedimentos, para exercitar o fallback
    for (const codigo of ['PROF-001', 'PROF-002', 'PROF-004', 'PROF-006']) {
      criaItem(tAmil, procIds[codigo].id, procIds[codigo].vPrev)
      nItens++
    }
    log('itens de preco: ' + nItens)

    // ---------- paciente Maria com convênio ----------
    try {
      const maria = app.findFirstRecordByFilter('paciente', 'cpf = "11122233344"')
      maria.set('convenio_id', convenios.prev)
      app.save(maria)
      log('Maria vinculada ao convenio Odonto Prev Demo')
    } catch (_) {
      log('nao achei a paciente Maria')
    }
  },
  (app) => {
    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      return
    }
    const t = alfa.id
    try {
      app
        .db()
        .newQuery(
          'DELETE FROM tabela_preco_item WHERE tenant_id = {:t}; DELETE FROM tabela_preco WHERE tenant_id = {:t}; DELETE FROM procedimento WHERE tenant_id = {:t}; DELETE FROM convenio WHERE tenant_id = {:t};',
        )
        .bind({ t: t })
        .execute()
    } catch (_) {}
  },
)
