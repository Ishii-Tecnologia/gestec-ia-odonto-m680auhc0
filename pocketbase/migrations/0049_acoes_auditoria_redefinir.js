/* Migration 0049 - Acoes de auditoria da redefinicao de acesso

   BUG CORRIGIDO: o hook `redefinir_acesso.js` grava
       acao = 'redefinir_2fa'   ou   'redefinir_senha'
   mas NENHUM dos dois valores existe no select de `auditoria_acesso`.

   Consequencia real: o `$app.save` da auditoria falha com erro de validacao do
   select, e o `try/catch` em volta — que existe para nao derrubar a acao
   principal — engole o erro. Resultado:

     - o proprietario desliga o 2FA de um funcionario (acao sensivel, de
       seguranca) e a operacao da certo;
     - a trilha diz que NADA aconteceu.

   Ou seja: a unica acao que serve para investigar "quem desligou o 2FA de
   quem, e quando" nao deixava rastro. E o mesmo tipo de falha da 0010
   (ativar/desativar gravando o mesmo valor), com uma diferenca: ali o registro
   saia errado, aqui nao saia nenhum.

   A licao que a 0016 ja tinha escrito: acao nova em hook precisa de migration
   que a adicione ao select. Conferir o select faz parte de escrever o hook.

   Idempotente: so adiciona o que falta. */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('auditoria_acesso')
    const campo = col.fields.getByName('acao')
    const valores = (campo.values || []).slice()
    let mudou = false

    const novos = ['redefinir_2fa', 'redefinir_senha']
    for (const v of novos) {
      if (valores.indexOf(v) < 0) {
        valores.push(v)
        mudou = true
      }
    }

    if (mudou) {
      campo.values = valores
      app.save(col)
      console.log('[auditoria-acao] acoes adicionadas: ' + novos.join(', '))
    } else {
      console.log('[auditoria-acao] ja existiam')
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('auditoria_acesso')
    const campo = col.fields.getByName('acao')
    campo.values = (campo.values || []).filter(
      (v) => ['redefinir_2fa', 'redefinir_senha'].indexOf(v) < 0,
    )
    app.save(col)
  },
)
