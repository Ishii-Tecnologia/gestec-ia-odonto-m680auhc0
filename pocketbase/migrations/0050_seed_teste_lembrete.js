/* Migration 0050 - SEED TEMPORARIO no 80533: provar a correcao do lembrete

   CUIDADO: este projeto e PRODUCAO (tem a demo, mas e o projeto publicado).
   Nada aqui toca dado de clinica real — o 80533 nao tem clinica real, so a
   demo Alfa/Beta. Mesmo assim, tudo que eu criar sera removido pela migration
   seguinte, no mesmo padrao usado no 80914.

   O QUE QUERO PROVAR: o `registrar` devolvia `false` para QUALQUER erro de
   gravação, e o chamador entendia "ja enviado hoje". Um erro que NAO e de
   unicidade virava lembrete pulado em silencio.

   COMO INDUZIR: `comunicacao.destinatario` e text com max 200. Um e-mail de
   260 caracteres faz o save falhar por TAMANHO — erro de validacao, nao de
   indice. O `emailValido` da rota rejeitaria esse endereco, mas ele roda depois
   do `registrar` no fluxo, entao o erro de save acontece primeiro: exatamente
   o caminho que quero exercitar.

   O seed:
   1. cria um paciente no tenant Alfa com e-mail de 260 chars e aniversario HOJE;
   2. garante um modelo de mensagem de aniversario ativo para o Alfa.

   Removido pela migration seguinte. */

migrate(
  (app) => {
    const log = (m) => console.log('[seed-lembrete-teste] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('tenant Alfa nao existe — abortando')
      return
    }

    const NOME = 'Paciente Teste Lembrete Corrigido'

    let pac
    try {
      pac = app.findFirstRecordByFilter(
        'paciente',
        "tenant_id = '" + alfa.id + "' && nome = '" + NOME + "'",
      )
      log('paciente de teste ja existe')
    } catch (_) {
      const hoje = new Date().toISOString().slice(5, 10) // MM-DD
      const longo = 'a'.repeat(250) + '@teste.invalid'

      const p = new Record(app.findCollectionByNameOrId('paciente'))
      p.set('tenant_id', alfa.id)
      p.set('nome', NOME)
      p.set('ativo', true)
      p.set('email', longo)
      p.set('data_nascimento', '1990-' + hoje + ' 00:00:00.000Z')
      app.save(p)
      pac = p
      log('paciente criado com email de ' + longo.length + ' chars (max do campo: 200)')
    }

    // modelo de aniversario ativo para o Alfa
    try {
      const m = app.findFirstRecordByFilter(
        'modelo_mensagem',
        "tenant_id = '" + alfa.id + "' && tipo = 'aniversario'",
      )
      if (m.get('ativo') !== true) {
        m.set('ativo', true)
        app.save(m)
        log('modelo de aniversario reativado')
      } else {
        log('modelo de aniversario ja ativo')
      }
    } catch (_) {
      const m = new Record(app.findCollectionByNameOrId('modelo_mensagem'))
      m.set('tenant_id', alfa.id)
      m.set('tipo', 'aniversario')
      m.set('assunto', 'Feliz aniversario, {paciente}!')
      m.set('corpo', 'Ola, {paciente}! A equipe da {clinica} deseja parabens.')
      m.set('ativo', true)
      app.save(m)
      log('modelo de aniversario criado')
    }

    log('paciente de teste: ' + pac.id)
  },
  (app) => {
    try {
      const alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
      const p = app.findFirstRecordByFilter(
        'paciente',
        "tenant_id = '" + alfa.id + "' && nome = 'Paciente Teste Lembrete Corrigido'",
      )
      app.delete(p)
    } catch (_) {}
  },
)
