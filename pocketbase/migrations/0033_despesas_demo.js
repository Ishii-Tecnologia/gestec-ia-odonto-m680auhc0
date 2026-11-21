/* Migration 0033 - Despesas, centros de custo e retiradas demo (Etapa 11)

   Cenário para os cinco critérios:

   - CENTROS DE CUSTO: um por profissional e um da unidade, para o DRE
     filtrável funcionar.
   - DESPESAS do mês corrente com competência no mês, misturando:
       * receita (não é despesa, servirá de contraste)
       * custo direto: material, laboratório, repasse  → margem de contribuição
       * despesa fixa: aluguel, folha, energia, software, taxas
     E algumas com vencimento no FUTURO, para o fluxo projetado ter saída.
   - Uma despesa RECORRENTE provisionada (13º), reconhecida no mês e ainda não
     paga — o caso que a marca `recorrente` existe para representar.
   - RETIRADA de sócio (pró-labore) no mês, FORA do resultado operacional.

   Os valores são redondos de propósito, para o critério 1 ser conferível à mão:
   se o DRE mostrar outro número, alguma conta está errada. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-gerencial] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    try {
      const ja = app.findRecordsByFilter('despesa', 'tenant_id = "' + tenant + '"', '', 1, 0)
      if (ja.length > 0) {
        log('ja existem despesas, saindo')
        return
      }
    } catch (_) {}

    const agora = new Date()
    const ano = agora.getUTCFullYear()
    const mes = agora.getUTCMonth() // 0-based
    const dia = 86400000

    function isoComp(offsetDias) {
      // competência no 1º dia do mês corrente, para o DRE do mês pegar
      const d = new Date(Date.UTC(ano, mes, 1))
      d.setUTCDate(d.getUTCDate() + (offsetDias || 0))
      return d.toISOString().replace('T', ' ').slice(0, 23) + 'Z'
    }
    function isoVenc(diasFrente) {
      const d = new Date(Date.UTC(ano, mes, 1))
      d.setUTCDate(d.getUTCDate() + diasFrente)
      return d.toISOString().replace('T', ' ').slice(0, 23) + 'Z'
    }

    let unidade, ana, bruno
    try {
      unidade = app.findFirstRecordByFilter('unidade', 'tenant_id = "' + tenant + '"')
      ana = app.findFirstRecordByFilter(
        'profissional',
        'tenant_id = "' + tenant + '" && nome ~ "Ana"',
      )
      bruno = app.findFirstRecordByFilter(
        'profissional',
        'tenant_id = "' + tenant + '" && nome ~ "Bruno"',
      )
    } catch (err) {
      log('faltou dado base: ' + String(err))
      return
    }

    // ---------- centros de custo ----------
    const colCC = app.findCollectionByNameOrId('centro_custo')
    function centro(nome, profId, uniId) {
      try {
        return app.findFirstRecordByFilter(
          'centro_custo',
          'tenant_id = "' + tenant + '" && nome = "' + nome + '"',
        ).id
      } catch (_) {}
      const r = new Record(colCC)
      r.set('tenant_id', tenant)
      r.set('nome', nome)
      r.set('ativo', true)
      if (profId) r.set('profissional_id', profId)
      if (uniId) r.set('unidade_id', uniId)
      app.save(r)
      return r.id
    }

    const ccGeral = centro('Geral - Unidade Centro', '', unidade.id)
    const ccAna = centro('Dra. Ana', ana.id, unidade.id)
    const ccBruno = centro('Dr. Bruno', bruno.id, unidade.id)
    log('3 centros de custo')

    // ---------- categorias do plano de contas ----------
    function conta(codigo) {
      try {
        return app.findFirstRecordByData('plano_contas', 'codigo', codigo).id
      } catch (_) {
        return ''
      }
    }

    const col = app.findCollectionByNameOrId('despesa')
    let n = 0

    function despesa(
      fornecedor,
      descricao,
      catCodigo,
      ccId,
      valor,
      compDias,
      vencDias,
      pagoDias,
      recorrente,
    ) {
      const catId = conta(catCodigo)
      if (!catId) {
        log(
          'ATENCAO: categoria ' +
            catCodigo +
            ' nao existe; despesa \"' +
            fornecedor +
            '\" ignorada',
        )
        return
      }
      const r = new Record(col)
      r.set('tenant_id', tenant)
      r.set('fornecedor', fornecedor)
      r.set('descricao', descricao)
      r.set('plano_contas_id', catId)
      if (ccId) r.set('centro_custo_id', ccId)
      r.set('valor_centavos', valor)
      r.set('data_competencia', isoComp(compDias))
      r.set('vencimento', isoVenc(vencDias))
      if (pagoDias !== null && pagoDias !== undefined) {
        r.set('pago_em', isoVenc(pagoDias))
      }
      r.set('recorrente', !!recorrente)
      app.save(r)
      n++
    }

    /* CUSTOS DIRETOS (variam com o atendimento)
       materiais 1.200,00 + laboratório 1.500,00 + repasse 2.400,00 = 5.100,00 */
    despesa(
      'Dental Cremer',
      'Materiais de consumo do mes',
      '5.1',
      ccAna.id,
      120000,
      0,
      10,
      8,
      false,
    )
    despesa(
      'Laboratorio Sorriso',
      'Protese - coroas e laminados',
      '5.2',
      ccBruno.id,
      150000,
      0,
      20,
      18,
      false,
    )
    despesa(
      'Repasse Dra. Ana',
      'Repasse 30% sobre producao',
      '5.3',
      ccAna.id,
      240000,
      0,
      5,
      4,
      false,
    )

    /* DESPESAS FIXAS (existem sem paciente)
       aluguel 4.500 + folha 8.000 + energia 620 + software 890 + contabilidade 450 = 14.460,00 */
    despesa('Imobiliaria Central', 'Aluguel do consultorio', '6.2', ccGeral, 450000, 0, 5, 3, true)
    despesa('Folha de pagamento', 'Salarios e encargos', '6.1', ccGeral, 800000, 0, 5, 4, true)
    despesa('Enel', 'Energia eletrica', '6.3', ccGeral, 62000, 0, 15, null, false)
    despesa('GesTec Softwares', 'Sistema de gestao', '6.4', ccGeral, 89000, 0, 8, 7, true)
    despesa('Contabilidade Silva', 'Honorarios contabeis', '6.6', ccGeral, 45000, 0, 10, 9, true)

    /* RECORRENTE PROVISIONADA: 13º reconhecido no mês, pago em dezembro.
       Entra no DRE do mês corrente e aparece como A PAGAR no fluxo. */
    despesa(
      'Provisao 13o',
      'Provisao de 13o salario (12 meses)',
      '6.1',
      ccGeral,
      66666,
      0,
      330,
      null,
      true,
    )
    log('provisao de 13o criada (recorrente, nao paga)')

    // despesa do próximo mês, para o fluxo ter saída futura
    despesa(
      'Imobiliaria Central',
      'Aluguel do proximo mes',
      '6.2',
      ccGeral,
      450000,
      0,
      35,
      null,
      true,
    )

    log('despesas: ' + n)

    // ---------- retirada de sócio ----------
    try {
      const colR = app.findCollectionByNameOrId('retirada_socio')
      const r = new Record(colR)
      r.set('tenant_id', tenant)
      r.set('valor_centavos', 800000)
      r.set('tipo', 'prolabore')
      r.set('data_competencia', isoComp(0))
      r.set('observacao', 'Pro-labore do socio administrador')
      app.save(r)

      const r2 = new Record(colR)
      r2.set('tenant_id', tenant)
      r2.set('valor_centavos', 200000)
      r2.set('tipo', 'distribuicao')
      r2.set('data_competencia', isoComp(0))
      r2.set('observacao', 'Distribuicao de lucros do trimestre')
      app.save(r2)
      log('2 retiradas: 8.000 pro-labore + 2.000 distribuicao')
    } catch (err) {
      log('FALHOU retiradas: ' + String(err))
    }

    // conferência: o DRE deve somar 5.100 de custo e 14.460 de despesa fixa
    log('esperado no DRE: custos 5.100,00 | despesas fixas 14.460,00 (sem a provisao do 13o)')
  },
  (app) => {
    try {
      const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
      app
        .db()
        .newQuery(
          'DELETE FROM despesa WHERE tenant_id = {:t};' +
            'DELETE FROM retirada_socio WHERE tenant_id = {:t};' +
            'DELETE FROM fechamento_caixa WHERE tenant_id = {:t};' +
            'DELETE FROM centro_custo WHERE tenant_id = {:t};',
        )
        .bind({ t: alfa.id })
        .execute()
    } catch (_) {}
  },
)
