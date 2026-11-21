/* Aviso de tabela de preço vencendo / vencida (Etapa 8 — pendência P1 da auditoria)

   GET /backend/v1/avisos-operacionais

   POR QUE ESTA ROTA EXISTE:

   A auditoria encontrou a tabela "Particular 2026" vencida em 31/05/2026 e
   ninguém sabia. O sintoma só apareceu quando a recepção tentou vender e levou
   "Item sem preco definido". Numa clínica, isso é a paciente no balcão e o
   orçamento que não fecha.

   Preço não é dado estático: a tabela vence, o reajuste anual chega, o convênio
   muda. O sistema precisa avisar ANTES, no lugar onde a gestão olha — não
   esperar a falha na hora da venda.

   O QUE COMPÕE O AVISO:
   1. tabela de preço vencida (crítico: não dá para vender);
   2. tabela vencendo em 30 dias (atenção: dá tempo de reajustar);
   3. procedimento sem preço em nenhuma tabela vigente (crítico: item do
      catálogo que não pode ser orçado);
   4. convênio sem tabela vigente (atenção: paciente do convênio sem preço).

   Devolvo `severidade` junto de cada item para a tela poder ordenar. Sem isso,
   "5 avisos" não diz o que resolver primeiro. */

routerAdd(
  'GET',
  '/backend/v1/avisos-operacionais',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao ve avisos operacionais.')
    }

    const tenant = e.auth.getString('tenant_id')
    const hoje = new Date()
    const hojeIso = hoje.toISOString().slice(0, 10)
    const em30 = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10)

    const avisos = []

    function dataCurta(v) {
      const s = String(v || '').slice(0, 10)
      if (s.length < 10) return ''
      const p = s.split('-')
      return p[2] + '/' + p[1] + '/' + p[0]
    }

    // ---------- 1 e 2: vigência das tabelas ----------
    let tabelas = []
    try {
      tabelas = $app.findRecordsByFilter('tabela_preco', '', 'nome', 100, 0)
    } catch (_) {}

    const vencidas = []
    const vencendo = []
    const vigentes = []

    for (const t of tabelas) {
      const fim = String(t.getString('vigencia_fim') || '').slice(0, 10)
      const ini = String(t.getString('vigencia_inicio') || '').slice(0, 10)
      let nomeConvenio = 'Particular'
      const conv = t.getString('convenio_id')
      if (conv) {
        try {
          nomeConvenio = $app.findRecordById('convenio', conv).getString('nome')
        } catch (_) {}
      }
      const item = {
        tabela: t.getString('nome'),
        convenio: nomeConvenio,
        vigencia_inicio: ini,
        vigencia_fim: fim,
        id: t.id,
      }

      const foraDoInicio = ini && ini > hojeIso
      if (fim && fim < hojeIso) {
        vencidas.push(item)
      } else if (foraDoInicio) {
        // ainda não começou: não é aviso, é futuro
      } else {
        vigentes.push(item)
        if (fim && fim <= em30) vencendo.push(item)
      }
    }

    for (const v of vencidas) {
      avisos.push({
        tipo: 'tabela_vencida',
        severidade: 'critico',
        titulo: 'Tabela de preço vencida: ' + v.tabela,
        detalhe:
          (v.convenio === 'Particular' ? 'Paciente particular' : 'Convênio ' + v.convenio) +
          ' está sem preço desde ' +
          dataCurta(v.vigencia_fim) +
          '. Não é possível montar orçamento por esta tabela.',
        acao: 'Reabra a vigência ou crie uma tabela nova em Tabelas de preço.',
        referencia: v.id,
      })
    }

    for (const v of vencendo) {
      avisos.push({
        tipo: 'tabela_vencendo',
        severidade: 'atencao',
        titulo: 'Tabela de preço vence em breve: ' + v.tabela,
        detalhe:
          'Vigente até ' +
          dataCurta(v.vigencia_fim) +
          '. Depois dessa data, orçamentos por esta tabela param de funcionar.',
        acao: 'Revise os valores e prorrogue a vigência antes do vencimento.',
        referencia: v.id,
      })
    }

    // ---------- 3: procedimento sem preço em tabela vigente ----------
    /* Só faz sentido checar se existe ao menos uma tabela vigente; com todas
       vencidas, o aviso 1 já cobre e listar 10 procedimentos seria ruído. */
    if (vigentes.length > 0) {
      let semPreco = []
      try {
        const procs = $app.findRecordsByFilter('procedimento', '', 'nome', 500, 0)
        for (const p of procs) {
          let tem = false
          for (const v of vigentes) {
            try {
              $app.findFirstRecordByFilter(
                'tabela_preco_item',
                'tabela_preco_id = "' + v.id + '" && procedimento_id = "' + p.id + '"',
              )
              tem = true
              break
            } catch (_) {}
          }
          if (!tem) semPreco.push(p.getString('nome'))
        }
      } catch (_) {}

      if (semPreco.length > 0) {
        avisos.push({
          tipo: 'procedimento_sem_preco',
          severidade: 'critico',
          titulo: semPreco.length + ' procedimento(s) sem preço nas tabelas vigentes',
          detalhe:
            semPreco.slice(0, 8).join(', ') +
            (semPreco.length > 8 ? ' e outros ' + (semPreco.length - 8) : '') +
            '. Estes itens não podem entrar em orçamento.',
          acao: 'Defina o valor destes procedimentos em Tabelas de preço.',
        })
      }
    }

    // ---------- 4: convênio sem tabela vigente ----------
    try {
      const convenios = $app.findRecordsByFilter('convenio', '', 'nome', 100, 0)
      for (const c of convenios) {
        if (c.get('ativo') === false) continue
        let temVigente = false
        for (const v of vigentes) {
          const t = tabelas.find(function (x) {
            return x.id === v.id
          })
          if (t && t.getString('convenio_id') === c.id) {
            temVigente = true
            break
          }
        }
        if (!temVigente) {
          avisos.push({
            tipo: 'convenio_sem_tabela',
            severidade: 'atencao',
            titulo: 'Convênio sem tabela vigente: ' + c.getString('nome'),
            detalhe: 'Paciente deste convênio fica sem preço e o orçamento cai no particular.',
            acao: 'Crie ou reative a tabela de preço deste convênio.',
            referencia: c.id,
          })
        }
      }
    } catch (_) {}

    const criticos = avisos.filter(function (a) {
      return a.severidade === 'critico'
    }).length

    return e.json(200, {
      dia: hojeIso,
      total: avisos.length,
      criticos: criticos,
      avisos: avisos,
      resumo:
        avisos.length === 0
          ? 'Nenhum aviso. Preços e vigências em ordem.'
          : criticos > 0
            ? criticos + ' ponto(s) bloqueando venda. Resolva primeiro.'
            : 'Nada bloqueando venda, mas há itens para revisar.',
    })
  },
  $apis.requireAuth(),
)
