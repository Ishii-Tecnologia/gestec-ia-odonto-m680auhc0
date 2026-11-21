/* Migration 0045 — vigência do particular e preço que não vence em silêncio

   DOIS PROBLEMAS ENCONTRADOS NA AUDITORIA:

   1. A tabela "Particular 2026" venceu em 31/05/2026. Desde então, paciente
      sem convênio não tem preço nenhum: criar plano de tratamento falha com
      "Item sem preco definido". O sistema não consegue cobrar particular — o
      que, numa clínica, é o caso mais comum.

      Isto é dado de demonstração desatualizado, mas o defeito de produto é
      real: uma tabela vence e NINGUÉM É AVISADO até a recepção tentar vender.

   2. Não existe tabela particular sem data de fim como padrão. O convênio tem
      vigência aberta; o particular não.

   O QUE ESTA MIGRATION FAZ:
   - reabre a vigência do particular para o fim de 2027 (dado demo);
   - garante que exista UMA tabela particular vigente como fallback.

   O QUE ELA **NÃO** FAZ, e precisa ser feito no produto: avisar antes de
   vencer. Sem isso, o problema volta em 2028 e a clínica descobre do mesmo
   jeito — na hora de cobrar. Registro como pendência no ESTADO. */

migrate(
  (app) => {
    const log = (m) => console.log('[vigencia] ' + m)

    const col = app.findCollectionByNameOrId('tabela_preco')

    // ---------- 1. reabre o particular ----------
    let achou = false
    try {
      const tabs = app.findRecordsByFilter('tabela_preco', 'convenio_id = ""', '', 50, 0)
      for (const t of tabs) {
        achou = true
        const fim = String(t.getString('vigencia_fim') || '')
        if (!fim || fim.slice(0, 10) < '2026-11-21') {
          t.set('vigencia_fim', '2027-12-31 00:00:00.000Z')
          app.save(t)
          log('particular reaberto ate 31/12/2027: ' + t.getString('nome'))
        }
      }
    } catch (err) {
      log('particular: ' + String(err).slice(0, 100))
    }

    if (!achou) {
      const t = new Record(col)
      t.set('nome', 'Particular')
      t.set('vigencia_inicio', '2026-01-01 00:00:00.000Z')
      t.set('vigencia_fim', '2027-12-31 00:00:00.000Z')
      app.save(t)
      log('tabela Particular criada (nao existia nenhuma sem convenio)')
    }

    /* ---------- 2. garante item para todo procedimento no particular ----------
       Procedimento sem item em nenhuma tabela vigente é procedimento que a
       clínica não consegue vender. Uso o preço do próprio procedimento como
       referência inicial — é a única informação de valor que existe no
       cadastro, e o dono ajusta depois na tela de tabelas. Melhor cobrar um
       valor aproximado, visível e editável, do que travar a venda. */
    let particular = null
    try {
      const tabs = app.findRecordsByFilter('tabela_preco', 'convenio_id = ""', '', 50, 0)
      for (const t of tabs) {
        const fim = String(t.getString('vigencia_fim') || '')
        if (!fim || fim.slice(0, 10) >= '2026-11-21') {
          particular = t
          break
        }
      }
    } catch (_) {}

    if (particular) {
      let criados = 0
      try {
        const procs = app.findRecordsByFilter('procedimento', '', 'nome', 500, 0)
        for (const p of procs) {
          let tem = null
          try {
            tem = app.findFirstRecordByFilter(
              'tabela_preco_item',
              'tabela_preco_id = "' + particular.id + '" && procedimento_id = "' + p.id + '"',
            )
          } catch (_) {}
          if (tem) continue

          // herda o preço de qualquer outra tabela, senão usa o do procedimento
          let valor = p.getInt('valor_particular_centavos') || p.getInt('preco_centavos') || 0
          if (!valor) {
            try {
              const outro = app.findFirstRecordByFilter(
                'tabela_preco_item',
                'procedimento_id = "' + p.id + '"',
              )
              valor = outro.getInt('valor_centavos') || 0
            } catch (_) {}
          }
          if (!valor) continue // sem nenhuma referência de preço: não invento

          const item = new Record(app.findCollectionByNameOrId('tabela_preco_item'))
          item.set('tabela_preco_id', particular.id)
          item.set('procedimento_id', p.id)
          item.set('valor_centavos', valor)
          try {
            app.save(item)
            criados++
          } catch (_) {}
        }
      } catch (err) {
        log('itens: ' + String(err).slice(0, 100))
      }
      log('itens criados no particular: ' + criados)
    }
  },
  (app) => {
    // não reversível: o estado anterior impedia vender
  },
)
