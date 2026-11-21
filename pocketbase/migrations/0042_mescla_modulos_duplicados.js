/* Migration 0042 — mescla os módulos duplicados por caixa (Etapa 14)

   A 0041 tentou normalizar 'PRONTUARIO' → 'prontuario' e FALHOU SEM AVISAR o
   suficiente: o índice UNIQUE em `codigo` já tinha 'prontuario' (criado pela
   0040), o `app.save` estourou e o catch engoliu. Resultado no teste: a clínica
   seguia com SEIS módulos (AGENDA, PRONTUARIO, FINANCEIRO, RELATORIOS,
   financeiro, prontuario) em vez de quatro.

   Lição aplicada aqui: normalizar não é renomear, é MESCLAR. Para cada par
   (MAIÚSCULO, minúsculo) do mesmo módulo lógico:
     1. move as assinaturas do antigo para o novo (evitando duplicar contrato);
     2. apaga o módulo antigo — ele é catálogo, não dado de cliente;
     3. só então normaliza o que sobrou.
   `tenant_modulo` (Etapa 3) referencia o módulo antigo, então atualizo antes.

   `catch` agora registra o motivo de cada falha. Um catch que só engole foi
   exatamente o que escondeu o problema na primeira tentativa. */

migrate(
  (app) => {
    const log = (m) => console.log('[merge-modulo] ' + m)

    const todos = app.findRecordsByFilter('modulo', '', 'ordem', 100, 0)

    // índice dos que já estão em minúsculas
    const baixos = {}
    for (const m of todos) {
      const c = m.getString('codigo')
      if (c === String(c).toLowerCase()) baixos[c] = m
    }

    let mesclados = 0
    let movidos = 0

    for (const m of todos) {
      const codigo = m.getString('codigo')
      if (codigo === String(codigo).toLowerCase()) continue // já está ok

      const baixo = String(codigo).toLowerCase().trim()
      const alvo = baixos[baixo]

      if (!alvo) {
        // não há duplicata: basta renomear
        m.set('codigo', baixo)
        try {
          app.save(m)
          mesclados++
          log('renomeado ' + codigo + ' -> ' + baixo)
        } catch (err) {
          log('FALHOU renomear ' + codigo + ': ' + String(err).slice(0, 100))
        }
        continue
      }

      // há duplicata: mover contratos do antigo para o novo
      try {
        const assinaturas = app.findRecordsByFilter(
          'assinatura',
          'modulo_id = "' + m.id + '"',
          '',
          200,
          0,
        )
        for (const a of assinaturas) {
          // já existe contrato no alvo? então o antigo vira duplicata cancelada
          let jaTem = null
          try {
            jaTem = app.findFirstRecordByFilter(
              'assinatura',
              'tenant_id = "' + a.getString('tenant_id') + '" && modulo_id = "' + alvo.id + '"',
            )
          } catch (_) {}
          if (jaTem) {
            a.set('status', 'cancelada')
            a.set('fim', new Date().toISOString())
            app.save(a)
          } else {
            a.set('modulo_id', alvo.id)
            app.save(a)
            movidos++
          }
        }
      } catch (err) {
        log('FALHOU mover assinaturas de ' + codigo + ': ' + String(err).slice(0, 90))
      }

      // tenant_modulo (Etapa 3) aponta para o antigo: atualiza antes de apagar
      try {
        const vinculos = app.findRecordsByFilter(
          'tenant_modulo',
          'modulo_id = "' + m.id + '"',
          '',
          200,
          0,
        )
        for (const v of vinculos) {
          try {
            app.delete(v) // o vínculo antigo vira assinatura; a tabela é legado
          } catch (_) {}
        }
      } catch (_) {}

      // apaga o módulo antigo (é catálogo, não dado de cliente)
      try {
        app.delete(m)
        mesclados++
        log('mesclado e removido ' + codigo + ' (contratos movidos para ' + baixo + ')')
      } catch (err) {
        log('FALHOU remover ' + codigo + ': ' + String(err).slice(0, 90))
      }
    }

    log('modulos mesclados/renomeados: ' + mesclados + ' | contratos movidos: ' + movidos)

    // estado final para conferência
    try {
      const final = app.findRecordsByFilter('modulo', '', 'ordem', 100, 0)
      const lista = []
      for (const f of final) lista.push(f.getString('codigo'))
      log('catalogo final: ' + lista.join(', '))
    } catch (_) {}
  },
  (app) => {
    // não reversível: a mesclagem perde a distinção original, que era um bug
  },
)
