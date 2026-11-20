/* Migration 0018 - Acesso temporário VENCIDO de demonstração (Etapa 7)

   Por que este registro existe:
   o critério de pronto 2 é "com acesso temporário ativo, B lê; após expirar,
   deixa de ler". A parte do "após expirar" não pode ser testada esperando uma
   hora passar — e a rota de concessão valida prazo mínimo de 1 hora, então
   também não dá para conceder já vencido pela API.

   Este seed cria a linha com `expira_em` no passado, para provar que a ROTA DE
   LEITURA confere a data a cada acesso e recusa. É o teste que importa: mostra
   que a expiração não depende de alguém lembrar de desligar o acesso.

   O usuário alvo é o dentista2 (Bruno), que não é responsável pelo paciente. */

migrate(
  (app) => {
    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      return
    }

    let bruno, ana, paciente
    try {
      bruno = app.findAuthRecordByEmail('_pb_users_auth_', 'alfa.dentista2@demo.gestec.local')
      ana = app.findAuthRecordByEmail('_pb_users_auth_', 'alfa.dentista@demo.gestec.local')
      // paciente com evolução registrada (a Maria, do seed da Etapa 5)
      paciente = app.findFirstRecordByFilter('paciente', 'cpf = "11122233344"')
    } catch (_) {
      return
    }

    // só faz sentido se a Ana já tiver evolução nesse paciente
    try {
      app.findFirstRecordByFilter('evolucao', 'paciente_id = "' + paciente.id + '"')
    } catch (_) {
      return
    }

    try {
      app.findFirstRecordByFilter(
        'acesso_prontuario',
        'paciente_id = "' +
          paciente.id +
          '" && concedido_para = "' +
          bruno.id +
          '" && justificativa ~ "VENCIDO"',
      )
      return // já existe
    } catch (_) {}

    const col = app.findCollectionByNameOrId('acesso_prontuario')
    const r = new Record(col)
    r.set('tenant_id', alfa.id)
    r.set('paciente_id', paciente.id)
    r.set('concedido_por', ana.id)
    r.set('concedido_para', bruno.id)
    // vencido de propósito: ontem
    const ontem =
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 23) + 'Z'
    r.set('expira_em', ontem)
    r.set('justificativa', 'VENCIDO - registro de teste de expiracao')
    r.set('ativo', true) // ativo = true DE PROPÓSITO: prova que a data manda
    app.save(r)
  },
  (app) => {
    try {
      app
        .db()
        .newQuery("DELETE FROM acesso_prontuario WHERE justificativa LIKE 'VENCIDO%'")
        .execute()
    } catch (_) {}
  },
)
