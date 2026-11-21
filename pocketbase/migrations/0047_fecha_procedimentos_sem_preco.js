/* Migration 0047 — restaura a vigência e fecha os procedimentos sem preço

   Esta migration desfaz o cenário da 0046 (que venceu a tabela de propósito
   para provar o aviso) e corrige o que o aviso encontrou de verdade:

   DOIS PROCEDIMENTOS SEM PREÇO EM NENHUMA TABELA VIGENTE:
   - Coroas totais em porcelana
   - Selante de fissura

   Achado pelo próprio aviso que acabei de construir — prova que ele serve.
   Estes dois existem só no "Particular 2026", que estava vencida; o
   particular vigente é outro registro e não os tinha. Como o aviso mostrou,
   eles não podiam entrar em orçamento.

   O QUE FAÇO: copio o preço da tabela vencida para a vigente. É a única
   referência de valor que existe, e o dono ajusta na tela. Deixar sem preço
   significa o procedimento existir no catálogo e não poder ser vendido. */

migrate(
  (app) => {
    const log = (m) => console.log('[fecha-preco] ' + m)

    // ---------- 1. restaura a vigência ----------
    let restauradas = 0
    try {
      const tabs = app.findRecordsByFilter('tabela_preco', 'convenio_id = ""', '', 10, 0)
      for (const t of tabs) {
        t.set('vigencia_fim', '2027-12-31 00:00:00.000Z')
        app.save(t)
        restauradas++
        log('vigencia restaurada: ' + t.getString('nome'))
      }
    } catch (err) {
      log('restaurar: ' + String(err).slice(0, 120))
    }
    log('tabelas restauradas: ' + restauradas)

    // ---------- 2. preenche os sem preço ----------
    let particular = null
    try {
      const tabs = app.findRecordsByFilter('tabela_preco', 'convenio_id = ""', '', 10, 0)
      for (const t of tabs) {
        const fim = String(t.getString('vigencia_fim') || '').slice(0, 10)
        if (!fim || fim >= '2026-11-21') particular = t
      }
    } catch (_) {}

    if (!particular) {
      log('sem tabela particular vigente')
      return
    }

    const ALVO = ['Coroas totais em porcelana', 'Selante de fissura']
    for (const nome of ALVO) {
      let proc = null
      try {
        proc = app.findFirstRecordByData('procedimento', 'nome', nome)
      } catch (_) {
        log('procedimento nao encontrado: ' + nome)
        continue
      }

      // já tem preço no particular vigente?
      try {
        app.findFirstRecordByFilter(
          'tabela_preco_item',
          'tabela_preco_id = "' + particular.id + '" && procedimento_id = "' + proc.id + '"',
        )
        log('ja tinha preco: ' + nome)
        continue
      } catch (_) {}

      /* Busca o valor em QUALQUER tabela, inclusive vencida: é a única
         referência de preço que o sistema tem para este item. */
      let valor = proc.getInt('valor_particular_centavos') || 0
      if (!valor) {
        try {
          const qualquer = app.findFirstRecordByFilter(
            'tabela_preco_item',
            'procedimento_id = "' + proc.id + '"',
          )
          valor = qualquer.getInt('valor_centavos') || 0
          log('valor herdado de outra tabela: ' + nome + ' = ' + valor)
        } catch (_) {}
      }
      if (!valor) {
        log('SEM nenhuma referencia de preco: ' + nome + ' (precisa definicao manual)')
        continue
      }

      const item = new Record(app.findCollectionByNameOrId('tabela_preco_item'))
      item.set('tabela_preco_id', particular.id)
      item.set('procedimento_id', proc.id)
      item.set('valor_centavos', valor)
      try {
        app.save(item)
        log('preco criado: ' + nome + ' = R$ ' + (valor / 100).toFixed(2))
      } catch (err) {
        log('falhou ' + nome + ': ' + String(err).slice(0, 90))
      }
    }
  },
  (app) => {
    // não reversível: o estado anterior era defeito
  },
)
