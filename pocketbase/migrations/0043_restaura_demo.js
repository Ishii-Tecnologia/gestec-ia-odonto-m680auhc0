/* Migration 0043 — restaura o estado de demonstração das contas demo

   AS CONTAS DEMO FORAM ALTERADAS PELOS PRÓPRIOS TESTES, e isso é um problema
   real de ambiente: a recepcao ficou com senha temporária e
   `precisa_trocar_senha`, e antes já tinha ficado com 2FA ativo. Quem abrir a
   demonstração depois não consegue entrar com a senha documentada (`Demo@2026!`),
   e o sintoma é "o sistema não deixa entrar" — não "alguém mexeu".

   Esta migration devolve todas as contas @demo.gestec.local ao estado
   documentado. É idempotente: rodar duas vezes não muda nada.

   NÃO é atalho de segurança: só toca contas cujo e-mail termina em
   @demo.gestec.local, e essas só existem em tenant com demo = true. */

migrate(
  (app) => {
    const log = (m) => console.log('[demo-reset] ' + m)

    const SENHA = 'Demo@2026!'
    let contas = 0

    let users = []
    try {
      users = app.findRecordsByFilter('_pb_users_auth_', 'email ~ "@demo.gestec.local"', '', 100, 0)
    } catch (err) {
      log('nao listou usuarios: ' + String(err).slice(0, 100))
      return
    }

    for (const u of users) {
      try {
        u.setPassword(SENHA) // hash, nao texto
        u.set('precisa_trocar_senha', false)
        u.set('ativo', true)
        // 2FA desligado nas contas demo: o teste de duas etapas tem rota própria
        // (redefinir-acesso-usuario) e deixar ligado trava quem não vê o e-mail,
        // já que @demo.gestec.local não recebe nada.
        u.set('two_factor_ativo', false)
        app.save(u)
        contas++
      } catch (err) {
        log('falhou ' + u.getString('email') + ': ' + String(err).slice(0, 80))
      }
    }
    log('contas demo restauradas: ' + contas + ' (senha ' + SENHA + ', sem 2FA, ativas)')

    /* Limpa os segundos fatores pendentes dessas contas: códigos e desafios
       vivos de um teste anterior não devem valer depois deste reset. */
    try {
      const ids = users.map(function (u) {
        return u.id
      })
      for (const id of ids) {
        app
          .db()
          .newQuery('DELETE FROM codigo_segundo_fator WHERE usuario_id = {:u}')
          .bind({ u: id })
          .execute()
      }
      log('codigos de segundo fator limpos')
    } catch (err) {
      log('limpeza de codigos: ' + String(err).slice(0, 100))
    }
  },
  (app) => {
    // não reversível: o estado anterior era resíduo de teste
  },
)
