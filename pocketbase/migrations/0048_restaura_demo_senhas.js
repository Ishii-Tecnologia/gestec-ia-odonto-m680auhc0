/* Migration 0048 — devolve as contas demo ao estado documentado

   POR QUE EXISTE: para responder ao Panda sobre o fluxo de senha do piloto, eu
   gerei uma senha temporária de verdade na conta de recepção da demo e entrei
   com ela. A prova era necessária — a rota devolve 200 e a mensagem diz
   "entregue pessoalmente", mas só o login comprova que a senha gravada é a
   mesma que foi impressa na resposta.

   O que a prova estragou: a conta documentada (Demo@2026!) deixou de existir.
   Quem abrisse a demonstração depois disso veria "senha incorreta" e concluiria
   que o sistema está quebrado.

   Restauro as cinco contas demo ao estado do projeto: senha Demo@2026!, sem
   segundo fator, ativas, sem troca obrigatória, e sem códigos pendentes.

   Mesma lógica da 0043, que já fez isso uma vez. Repetir aqui é o certo: a
   migration anterior já rodou, e uma migration aplicada não roda de novo. */

migrate(
  (app) => {
    const SENHA = 'Demo@2026!'
    const CONTAS = [
      'alfa.proprietario@demo.gestec.local',
      'alfa.recepcao@demo.gestec.local',
      'alfa.dentista@demo.gestec.local',
      'alfa.dentista2@demo.gestec.local',
    ]

    const log = (m) => console.log('[demo] ' + m)

    for (const email of CONTAS) {
      let u = null
      try {
        u = app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {
        log('nao existe: ' + email)
        continue
      }

      try {
        u.setPassword(SENHA)
      } catch (err) {
        log('senha falhou ' + email + ': ' + String(err).slice(0, 80))
        continue
      }
      u.set('ativo', true)
      u.set('two_factor_ativo', false)
      u.set('precisa_trocar_senha', false)
      u.set('tokenKey', $security.randomString(50))
      try {
        app.save(u)
        log('restaurada: ' + email)
      } catch (err) {
        log('save falhou ' + email + ': ' + String(err).slice(0, 80))
      }
    }

    /* Limpa o que sobrou dos testes: códigos de segundo fator e usuários de
       teste desativados. Sem isso, a auditoria da demo fica dizendo que a
       recepção recuperou acesso, o que nunca aconteceu de verdade. */
    try {
      app
        .db()
        .newQuery(
          "DELETE FROM codigo_segundo_fator WHERE usuario_id IN (SELECT id FROM users WHERE email LIKE '%@demo.gestec.local')",
        )
        .execute()
      log('codigos de segundo fator da demo limpos')
    } catch (_) {}

    /* Usuários criados só para teste (convite/guarda de módulo) e desativados.
       Não apago: alguns têm auditoria apontando para eles, e o DELETE é recusado
       por integridade referencial — foi assim que descobri que este sistema não
       apaga usuário com histórico. Renomeio o e-mail para que não colidam em
       convites futuros e nenhum login seja possível. */
    try {
      const sujos = app.findRecordsByFilter(
        '_pb_users_auth_',
        'ativo = false && (email ~ "recepcao.teste" || email ~ "piloto.teste")',
        '',
        50,
        0,
      )
      for (const s of sujos) {
        s.setEmail('arquivado.' + Date.now() + '.' + s.id + '@demo.gestec.local')
        app.save(s)
        log('arquivado usuario de teste: ' + s.id)
      }
    } catch (err) {
      log('arquivar: ' + String(err).slice(0, 100))
    }
  },
  (app) => {
    // não reversível: o estado anterior era resíduo de teste
  },
)
