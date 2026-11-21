/* Guarda de escrita por módulo contratado (Etapa 14)

   Recusa escrita direta na API em coleção cujo módulo a clínica não tem.

   POR QUE SÓ NO HOOK DE *REQUEST*, e não no de modelo: as rotas internas
   (`/backend/v1/agendar`, `/registrar-evolucao`, `/baixar-titulo`…) gravam com
   `$app.save()`. Um hook de modelo pegaria essas gravações legítimas e quebraria
   a agenda e o prontuário de quem pagou. O hook de request roda apenas quando
   alguém chama a API HTTP direto — que é exatamente o caminho que precisa de
   guarda.

   LIMITE CONHECIDO, e é honesto declarar: isto não impede a leitura do dado de
   um módulo cancelado (o critério 2 exige que o dado continue acessível). A
   guarda é sobre ESCREVER sem contratar, não sobre esconder o passado.

   MAPA COLEÇÃO → MÓDULO. Só entram as coleções cujo módulo é vendido à parte. As
   de identidade, paciente e catálogo ficam de fora porque não dependem de
   módulo: uma clínica sem nenhum módulo contratado ainda precisa conseguir
   cadastrar paciente. */

onRecordCreateRequest(
  (e) => {
    /* O MAPA FICA DENTRO DO CALLBACK, e não no topo do arquivo.
       O goja roda cada callback em pool separado e NÃO enxerga `const`/`function`
       de topo: uma referência ali vira `ReferenceError` em RUNTIME, não em load.
       O sintoma é cruel — o arquivo passa no deploy e a guarda nunca funciona,
       sem erro visível. Cada callback leva sua própria cópia. */
    const COLECOES_POR_MODULO = {
      evolucao: 'prontuario',
      odontograma_snapshot: 'prontuario',
      acesso_prontuario: 'prontuario',
      anamnese: 'prontuario',
      alerta_clinico: 'prontuario',
      plano_tratamento: 'orcamento',
      fase: 'orcamento',
      item_tratamento: 'orcamento',
      orcamento: 'orcamento',
      procedimento_realizado: 'orcamento',
      titulo_receber: 'financeiro',
      pagamento: 'financeiro',
      despesa: 'financeiro',
      centro_custo: 'financeiro',
      fechamento_caixa: 'financeiro',
      retirada_socio: 'financeiro',
    }

    if (e.hasSuperuserAuth()) return e.next() // a plataforma administra
    if (!e.auth) return e.next() // sem auth a própria regra da coleção recusa

    const tenantId = e.auth.getString('tenant_id')
    if (!tenantId) return e.next()

    // nome da coleção em que a gravação acontece
    let nome = ''
    try {
      nome = String(e.collection && e.collection.name ? e.collection.name : '')
    } catch (_) {}
    if (!nome) {
      try {
        nome = String(e.record.collection().name)
      } catch (_) {}
    }

    const modulo = COLECOES_POR_MODULO[nome]
    if (!modulo) return e.next()

    let ativo = false
    try {
      const m = $app.findFirstRecordByData('modulo', 'codigo', modulo)
      const a = $app.findFirstRecordByFilter(
        'assinatura',
        'tenant_id = "' + tenantId + '" && modulo_id = "' + m.id + '" && status = "ativa"',
      )
      // vencimento pela data, além do status (mesma regra de /meus-modulos)
      const fim = String(a.getString('fim') || '')
      if (fim) {
        const ts = Date.parse(fim.replace(' ', 'T'))
        ativo = isNaN(ts) || ts > Date.now()
      } else {
        ativo = true
      }
    } catch (_) {
      ativo = false
    }

    if (!ativo) {
      return e.forbiddenError(
        'O modulo ' +
          modulo +
          ' nao esta contratado nesta clinica. Contrate em Modulos para voltar a registrar.',
      )
    }

    return e.next()
  },
  'evolucao',
  'odontograma_snapshot',
  'acesso_prontuario',
  'anamnese',
  'alerta_clinico',
  'plano_tratamento',
  'fase',
  'item_tratamento',
  'orcamento',
  'procedimento_realizado',
  'titulo_receber',
  'pagamento',
  'despesa',
  'centro_custo',
  'fechamento_caixa',
  'retirada_socio',
)
