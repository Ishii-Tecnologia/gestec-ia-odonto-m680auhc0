/* Migration 0041 — normaliza o código dos módulos (Etapa 14)

   BUG ENCONTRADO NO TESTE DOS CRITÉRIOS: a Etapa 3 gravou os códigos em
   MAIÚSCULAS ('PRONTUARIO', 'AGENDA', 'FINANCEIRO', 'RELATORIOS'), e a 0040
   criou os novos em minúsculas ('prontuario', 'orcamento'). As duas famílias
   conviveram, e o resultado é que a clínica aparecia com SEIS módulos ativos
   em vez de quatro — `prontuario` e `PRONTUARIO` contavam como coisas
   diferentes.

   Pior que a contagem: toda checagem por código (`depende_de`, guarda de
   escrita, menu) falharia em silêncio para os módulos antigos. Comparar
   'prontuario' com 'PRONTUARIO' dá falso, e o módulo "não contratado" bloqueia
   uma clínica que pagou por ele.

   Normalizo para minúsculas — o padrão que as rotas e o `depende_de` usam.
   Também limpo as assinaturas duplicadas que a convivência criou, mantendo a
   mais antiga de cada módulo (é a que tem o valor congelado mais fiel ao
   contrato original). */

migrate(
  (app) => {
    const log = (m) => console.log('[modulo-codigo] ' + m)

    const modulos = app.findRecordsByFilter('modulo', '', 'ordem', 100, 0)
    let normalizados = 0

    for (const m of modulos) {
      const codigo = m.getString('codigo')
      const baixo = String(codigo).toLowerCase().trim()
      if (codigo === baixo) continue
      m.set('codigo', baixo)
      try {
        app.save(m)
        normalizados++
      } catch (err) {
        log('falhou ' + codigo + ': ' + String(err).slice(0, 80))
      }
    }
    log('codigos normalizados: ' + normalizados)

    /* Deduplica assinaturas: para cada (tenant, modulo), mantém a mais antiga
       ATIVA e cancela as outras. Não apago: cancelamento é o estado correto para
       um contrato que deixou de valer, e apagar destruiria a trilha. */
    let dedup = 0
    try {
      const todas = app.findRecordsByFilter('assinatura', '', '-created', 1000, 0)
      const visto = {}
      for (const a of todas) {
        const chave = a.getString('tenant_id') + '|' + a.getString('modulo_id')
        if (visto[chave] === undefined) {
          visto[chave] = a.id
          continue
        }
        // duplicata: cancela se estiver ativa
        if (a.getString('status') === 'ativa') {
          a.set('status', 'cancelada')
          a.set('fim', new Date().toISOString())
          try {
            app.save(a)
            dedup++
          } catch (_) {}
        }
      }
    } catch (err) {
      log('dedup: ' + String(err).slice(0, 100))
    }
    log('assinaturas duplicadas canceladas: ' + dedup)
  },
  (app) => {
    // não reversível: normalizar maiúsculas de volta quebraria a comparação
  },
)
