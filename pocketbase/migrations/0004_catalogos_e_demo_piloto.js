/* Migration 0004 - Catálogos e dados de demonstração da Etapa 3

   1. Catálogo das 25 especialidades reconhecidas pelo CFO (global, vale para
      todos os tenants). Fonte: Consolidação das Normas (Res. CFO-63/2005,
      art. 39) + resoluções que criaram as demais:
      Res. 160/2015 (Acupuntura, Homeopatia, Odontologia do Esporte),
      Res. 198/2019 (Harmonização Orofacial),
      Res. 262/2024 (Odontologia Hospitalar),
      Res. 286/2026 (Cirurgia Estética Orofacial).
      O catálogo é dado de referência: se o CFO criar outra especialidade,
      basta uma nova migration inserindo a linha.

   2. Catálogo de módulos vendáveis, com preço em centavos.

   3. Estrutura do cliente piloto no tenant demo Alfa: 3 dentistas, 4 cadeiras
      e 3 especialidades, para a Etapa 6 (agenda) já ter com o que trabalhar.

   Tudo idempotente: rodar de novo não duplica. Os finders de registro único
   lançam erro quando não acham, então cada um fica em try/catch. */

migrate(
  (app) => {
    // Procura exato por campo: devolve true se existe.
    const existe = (colecao, filtro) => {
      try {
        app.findFirstRecordByFilter(colecao, filtro)
        return true
      } catch (_) {
        return false
      }
    }

    // ===================== 1. especialidades =====================
    const ESPECIALIDADES = [
      ['ACU', 'Acupuntura', 'Res. CFO-160/2015'],
      ['CTBMF', 'Cirurgia e Traumatologia Buco-Maxilo-Faciais', 'Consolidação, arts. 41-42'],
      ['CEOF', 'Cirurgia Estética Orofacial', 'Res. CFO-286/2026'],
      ['DENT', 'Dentística', 'Consolidação, arts. 51-52'],
      ['DTM', 'Disfunção Temporomandibular e Dor Orofacial', 'Consolidação, arts. 53-54'],
      ['ENDO', 'Endodontia', 'Consolidação, arts. 55-56'],
      ['ESTO', 'Estomatologia', 'Consolidação, arts. 57-58'],
      ['HOF', 'Harmonização Orofacial', 'Res. CFO-198/2019'],
      ['HOME', 'Homeopatia', 'Res. CFO-160/2015'],
      ['IMPL', 'Implantodontia', 'Consolidação, arts. 61-62'],
      ['GERO', 'Odontogeriatria', 'Consolidação, arts. 65-66'],
      ['ESPORTE', 'Odontologia do Esporte', 'Res. CFO-160/2015'],
      ['TRAB', 'Odontologia do Trabalho', 'Consolidação, arts. 67-68'],
      ['HOSP', 'Odontologia Hospitalar', 'Res. CFO-262/2024'],
      ['LEGAL', 'Odontologia Legal', 'Consolidação'],
      ['PNE', 'Odontologia para Pacientes com Necessidades Especiais', 'Consolidação'],
      ['ODPED', 'Odontopediatria', 'Consolidação'],
      ['ORTO', 'Ortodontia', 'Consolidação'],
      ['OFM', 'Ortopedia Funcional dos Maxilares', 'Consolidação'],
      ['PAT', 'Patologia Oral e Maxilo Facial', 'Consolidação'],
      ['PERIO', 'Periodontia', 'Consolidação'],
      ['PBMAX', 'Prótese Buco-Maxilo-Facial', 'Consolidação'],
      ['PROT', 'Prótese Dentária', 'Consolidação'],
      ['RADIO', 'Radiologia Odontológica e Imaginologia', 'Consolidação'],
      ['SAUDE', 'Saúde Coletiva', 'Consolidação'],
    ]

    const espCol = app.findCollectionByNameOrId('especialidade')
    ESPECIALIDADES.forEach(([codigo, nome, norma], i) => {
      if (existe('especialidade', `codigo = "${codigo}"`)) return
      const r = new Record(espCol)
      r.set('codigo', codigo)
      r.set('nome', nome)
      r.set('norma', norma)
      r.set('ordem', i + 1)
      r.set('ativa', true)
      app.save(r)
    })

    // ===================== 2. módulos =====================
    const MODULOS = [
      [
        'AGENDA',
        'Agenda',
        'Agendamento por profissional e cadeira, com bloqueio de conflito.',
        4900,
        1,
      ],
      [
        'PRONTUARIO',
        'Prontuário',
        'Evolução clínica, odontograma e anexos, com sigilo por profissional.',
        4900,
        2,
      ],
      ['FINANCEIRO', 'Financeiro', 'Recebíveis, despesas, DRE e fluxo de caixa.', 5900, 3],
      ['CONVENIO', 'Convênios', 'Tabelas por convênio, faturamento e guias TISS.', 6900, 4],
      [
        'RELATORIOS',
        'Relatórios',
        'Produção, faltas, ocupação da agenda e inadimplência.',
        2900,
        5,
      ],
      ['COMUNICACAO', 'Comunicação', 'Lembretes de consulta, retorno e aniversário.', 2900, 6],
    ]

    const modCol = app.findCollectionByNameOrId('modulo')
    MODULOS.forEach(([codigo, nome, descricao, preco, ordem]) => {
      if (existe('modulo', `codigo = "${codigo}"`)) return
      const r = new Record(modCol)
      r.set('codigo', codigo)
      r.set('nome', nome)
      r.set('descricao', descricao)
      r.set('preco_centavos', preco)
      r.set('ordem', ordem)
      r.set('disponivel', true)
      app.save(r)
    })

    // ===================== 3. estrutura do piloto (demo Alfa) =====================
    const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')

    // unidade
    const uniCol = app.findCollectionByNameOrId('unidade')
    let unidadeAlfa
    if (existe('unidade', `tenant_id = "${alfa.id}" && nome = "Unidade Centro"`)) {
      unidadeAlfa = app.findFirstRecordByFilter(
        'unidade',
        `tenant_id = "${alfa.id}" && nome = "Unidade Centro"`,
      )
    } else {
      unidadeAlfa = new Record(uniCol)
      unidadeAlfa.set('tenant_id', alfa.id)
      unidadeAlfa.set('nome', 'Unidade Centro')
      unidadeAlfa.set('municipio', 'Curitiba')
      unidadeAlfa.set('uf', 'PR')
      unidadeAlfa.set('ativo', true)
      app.save(unidadeAlfa)
    }

    // 4 cadeiras
    const salaCol = app.findCollectionByNameOrId('sala')
    for (let i = 1; i <= 4; i++) {
      const nome = `Cadeira ${i}`
      if (existe('sala', `unidade_id = "${unidadeAlfa.id}" && nome = "${nome}"`)) continue
      const s = new Record(salaCol)
      s.set('tenant_id', alfa.id)
      s.set('unidade_id', unidadeAlfa.id)
      s.set('nome', nome)
      s.set('tipo', 'cadeira')
      s.set('ativa', true)
      app.save(s)
    }

    // 3 dentistas — 3 especialidades em uso: Endodontia, Ortodontia e
    // clínica geral (o terceiro fica sem especialidade registrada).
    const idEsp = (codigo) => {
      try {
        return app.findFirstRecordByData('especialidade', 'codigo', codigo).id
      } catch (_) {
        return null
      }
    }

    const profCol = app.findCollectionByNameOrId('profissional')
    const PROFISSIONAIS = [
      { nome: 'Dra. Ana Demo', cro: '12345', esp: ['ENDO'], cor: '#1668C9' },
      { nome: 'Dr. Bruno Demo', cro: '23456', esp: ['ORTO'], cor: '#1FB47A' },
      { nome: 'Dra. Carla Demo', cro: '34567', esp: [], cor: '#7C5CD6' },
    ]

    PROFISSIONAIS.forEach((p) => {
      if (existe('profissional', `tenant_id = "${alfa.id}" && cro_numero = "${p.cro}"`)) return
      const r = new Record(profCol)
      r.set('tenant_id', alfa.id)
      r.set('unidade_id', unidadeAlfa.id)
      r.set('nome', p.nome)
      r.set('cro_numero', p.cro)
      r.set('cro_uf', 'PR')
      r.set('ativo', true)
      r.set('cor_agenda', p.cor)
      const ids = p.esp.map(idEsp).filter((x) => !!x)
      if (ids.length > 0) r.set('especialidades', ids)
      app.save(r)
    })

    // módulos contratados no piloto
    const tmCol = app.findCollectionByNameOrId('tenant_modulo')
    const agora = new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z'
    ;['AGENDA', 'PRONTUARIO', 'FINANCEIRO', 'RELATORIOS'].forEach((codigo) => {
      let mod
      try {
        mod = app.findFirstRecordByData('modulo', 'codigo', codigo)
      } catch (_) {
        return
      }
      if (existe('tenant_modulo', `tenant_id = "${alfa.id}" && modulo_id = "${mod.id}"`)) return
      const r = new Record(tmCol)
      r.set('tenant_id', alfa.id)
      r.set('modulo_id', mod.id)
      r.set('status', 'ativo')
      r.set('preco_centavos', mod.getInt('preco_centavos'))
      r.set('contratado_em', agora)
      app.save(r)
    })
  },
  (app) => {
    // Down: os catálogos são globais e reconstruídos pela própria migration.
    ;['tenant_modulo', 'modulo', 'especialidade', 'profissional', 'sala', 'unidade'].forEach(
      (n) => {
        try {
          app.db().newQuery(`DELETE FROM ${n}`).execute()
        } catch (_) {}
      },
    )
  },
)
