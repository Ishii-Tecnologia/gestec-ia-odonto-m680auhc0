/* Migration 0019 - Acesso vencido de demonstração (Etapa 7) — retry

   A 0018 não criou nada: ela procurava evolução no paciente errado (por CPF
   fixo, a Maria) quando a evolução de teste estava na Ana Demo Costa. Falhou
   em silêncio porque migrations não gritam quando um `return` cedo acontece.

   Lição aplicada aqui: em vez de adivinhar o paciente, tomo o paciente DA
   PRÓPRIA EVOLUÇÃO registrada. E, se algo faltar, gravo no log em vez de sair
   mudo — assim a próxima falha aparece na primeira olhada nos logs.

   Este registro existe para provar o critério de pronto 2 na parte que diz
   "após expirar, deixa de ler": acesso com ativo = true e expira_em no
   passado. A rota de leitura confere a data, então deve recusar. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-vencido] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo, saindo')
      return
    }

    let bruno, ana
    try {
      bruno = app.findAuthRecordByEmail('_pb_users_auth_', 'alfa.dentista2@demo.gestec.local')
    } catch (_) {
      log('sem usuario dentista2, saindo')
      return
    }
    try {
      ana = app.findAuthRecordByEmail('_pb_users_auth_', 'alfa.dentista@demo.gestec.local')
    } catch (_) {
      log('sem usuario dentista, saindo')
      return
    }

    let evolucao
    try {
      const lista = app.findRecordsByFilter(
        'evolucao',
        'usuario_autor_id = "' + ana.id + '"',
        '-created',
        1,
        0,
      )
      if (lista.length === 0) {
        log('Ana nao tem evolucao registrada, saindo')
        return
      }
      evolucao = lista[0]
    } catch (err) {
      log('erro buscando evolucao: ' + String(err))
      return
    }

    const pacienteId = evolucao.getString('paciente_id')
    log('paciente da evolucao: ' + pacienteId)

    // já existe um vencido para este par?
    try {
      app.findFirstRecordByFilter(
        'acesso_prontuario',
        'paciente_id = "' +
          pacienteId +
          '" && concedido_para = "' +
          bruno.id +
          '" && justificativa ~ "VENCIDO"',
      )
      log('ja existe, saindo')
      return
    } catch (_) {}

    try {
      const col = app.findCollectionByNameOrId('acesso_prontuario')
      const r = new Record(col)
      r.set('tenant_id', alfa.id)
      r.set('paciente_id', pacienteId)
      r.set('concedido_por', ana.id)
      r.set('concedido_para', bruno.id)
      const ontem =
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 23) +
        'Z'
      r.set('expira_em', ontem)
      r.set('justificativa', 'VENCIDO - registro de teste de expiracao')
      r.set('ativo', true) // ativo DE PROPÓSITO: prova que a data manda
      app.save(r)
      log('criado id=' + r.id + ' expira=' + ontem)
    } catch (err) {
      log('FALHOU ao criar: ' + String(err))
    }
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
