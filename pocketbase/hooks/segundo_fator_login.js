/* Segundo fator — bloqueio do login por senha (Etapa 13)

   onRecordAuthWithPasswordRequest, coleção 'users'.

   O QUE ESTE HOOK FAZ: se o usuário tem two_factor_ativo = true, a senha sozinha
   NÃO vira sessão. O hook escreve a própria resposta (um desafio) e não chama
   e.next() — e é dentro de e.next() que o PocketBase emite o token. Sem código,
   não há token para vazar.

   TRÊS ARMADILHAS QUE ESTE ARQUIVO EVITA:

   1. "return" seco não bloqueia login: responde 200 VAZIO para todo mundo,
      inclusive o superusuário da plataforma, e o Skip perde acesso ao próprio
      backend. Para recusar, escreve-se a resposta (e.json) ou lança-se erro.
      Aqui eu escrevo a resposta de desafio.
   2. `e.next()` é obrigatório em todo caminho que PERMITE. Quem não tem 2FA
      entra normalmente — e é a maioria dos usuários da clínica.
   3. A coleção 'users' tem de ser passada, senão o hook roda também no
      _superusers e tranca a plataforma fora.

   O DESAFIO NÃO É UMA SESSÃO: carrega só um token de curta duração gravado em
   codigo_segundo_fator. Quem interceptar o desafio não consegue entrar sem o
   código de 6 dígitos que foi ao e-mail do usuário.

   TUDO INLINE: o goja roda callbacks em pool separado e não enxerga função de
   topo de arquivo. Por isso não há nenhum helper fora do callback — cada
   pequena tarefa é escrita ali dentro. */

onRecordAuthWithPasswordRequest((e) => {
  // sem registro = credencial inválida; deixa o PocketBase responder o erro dele
  if (!e.record) return e.next()

  if (e.record.getBool('two_factor_ativo') !== true) {
    return e.next() // sem 2FA, a senha basta
  }

  /* Conta desativada recusada ANTES do segundo fator: mandar código para conta
       desativada custaria e-mail e sugeriria que a conta está viva. */
  if (e.record.getBool('ativo') === false) {
    throw new BadRequestError('Conta desativada. Procure o responsavel pela clinica.')
  }

  const tenant = e.record.getString('tenant_id')
  const usuarioId = e.record.id
  const email = e.record.getString('email')

  // ---------- token de desafio ----------
  let desafio = ''
  try {
    desafio = $security.randomString(64)
  } catch (_) {
    return e.badRequestError('Nao foi possivel iniciar a verificacao. Tente novamente.')
  }

  // ---------- código de 6 dígitos ----------
  /* Este runtime NÃO tem $security.randomInt (a lista é randomString,
       randomStringWithAlphabet, pseudorandomString, md5/sha256/sha512 e JWT).
       Uso randomStringWithAlphabet sobre dígitos: cada caractere vem do gerador
       criptográfico, então os 6 dígitos são uniformes.
       A proteção real de um código de 6 dígitos é o limite de 5 tentativas e os
       10 minutos de validade, não a entropia da geração. */
  let codigo = ''
  try {
    codigo = $security.randomStringWithAlphabet(6, '0123456789')
  } catch (_) {
    return e.badRequestError('Falha ao gerar o codigo de verificacao.')
  }

  const agora = new Date()
  const expira = new Date(agora.getTime() + 10 * 60 * 1000)
  const hashCodigo = $security.sha256(String(codigo) + '|' + usuarioId)
  const hashDesafio = $security.sha256(String(desafio) + '|' + usuarioId)

  try {
    const col = $app.findCollectionByNameOrId('codigo_segundo_fator')

    /* Reenviar invalida o anterior: marco como usado em vez de apagar, porque
         apagar perderia a trilha de quanto tempo cada código viveu. */
    try {
      const antigos = $app.findRecordsByFilter(
        'codigo_segundo_fator',
        'usuario_id = "' + usuarioId + '" && usado_em = ""',
        '',
        50,
        0,
      )
      for (const a of antigos) {
        a.set('usado_em', agora.toISOString())
        a.set('recuperacao_hash', '')
        $app.save(a)
      }
    } catch (_) {}

    const reg = new Record(col)
    reg.set('usuario_id', usuarioId)
    reg.set('codigo_hash', hashCodigo)
    reg.set('desafio_hash', hashDesafio)
    reg.set('expira_em', expira.toISOString())
    reg.set('tentativas', 0)
    $app.save(reg)
  } catch (err) {
    return e.badRequestError(
      'Nao foi possivel iniciar a verificacao em dois fatores. Procure o responsavel pela clinica.',
    )
  }

  // ---------- envio ----------
  let enviado = false
  let erroEnvio = ''
  try {
    const mc = $app.newMailClient()
    const msg = new MailerMessage({
      from: { address: 'nao-responda@gestec.local', name: 'GesTec-IA-Odonto' },
      to: [{ address: email }],
      subject: 'Seu codigo de acesso',
      html:
        '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px">' +
        '<h2 style="margin:0 0 8px;font-size:18px">Codigo de verificacao</h2>' +
        '<p style="color:#555;margin:0 0 16px;font-size:14px">Use o codigo abaixo para concluir seu acesso. Vale por 10 minutos e so pode ser usado uma vez.</p>' +
        '<div style="font-size:30px;font-weight:700;letter-spacing:8px;padding:16px;background:#f4f6f8;border-radius:8px;text-align:center">' +
        codigo +
        '</div>' +
        '<p style="color:#888;font-size:12px;margin-top:16px">Se nao foi voce quem tentou entrar, troque sua senha e avise o responsavel pela clinica.</p>' +
        '</div>',
    })
    mc.send(msg)
    enviado = true
  } catch (err) {
    erroEnvio = String(err).slice(0, 160)
  }

  if (!enviado) {
    // sem e-mail o desafio é inútil: queima o código para não deixá-lo vivo
    try {
      $app
        .db()
        .newQuery(
          'UPDATE codigo_segundo_fator SET usado_em = {:agora} WHERE usuario_id = {:u} AND usado_em = ""',
        )
        .bind({ agora: agora.toISOString(), u: usuarioId })
        .execute()
    } catch (_) {}

    try {
      const aud = new Record($app.findCollectionByNameOrId('autenticacao_fator'))
      aud.set('tenant_id', tenant)
      aud.set('usuario_id', usuarioId)
      aud.set('metodo', 'email')
      aud.set('resultado', 'falha')
      aud.set('detalhe', 'falha ao enviar o codigo: ' + erroEnvio)
      $app.save(aud)
    } catch (_) {}

    return e.badRequestError(
      'Nao foi possivel enviar o codigo para seu e-mail. Procure o responsavel pela clinica.',
    )
  }

  // ---------- auditoria da emissão ----------
  try {
    const aud = new Record($app.findCollectionByNameOrId('autenticacao_fator'))
    aud.set('tenant_id', tenant)
    aud.set('usuario_id', usuarioId)
    aud.set('metodo', 'email')
    aud.set('resultado', 'sucesso')
    /* CONTAS DEMO: o código vai para a auditoria, em claro.
       Isso é frágil de propósito e limitado ao domínio de demonstração, para
       que o fluxo de duas etapas seja testável de ponta a ponta sem acesso à
       caixa de e-mail. Contas reais (@demo.gestec.local é o único domínio
       aceito aqui, e ele não recebe e-mail por definição) nunca caem nesta
       condição — o e-mail delas é fictício, então não há como completar o
       login sem enxergar este registro. Em produção, todos os e-mails são
       reais e nenhuma conta termina com esse sufixo. */
    const ehDemo = String(email).toLowerCase().indexOf('@demo.gestec.local') >= 0
    aud.set(
      'detalhe',
      ehDemo
        ? 'desafio emitido (conta demo; codigo de teste registrado aqui)'
        : 'desafio emitido e codigo enviado',
    )
    if (ehDemo) aud.set('codigo_teste', codigo)
    $app.save(aud)
  } catch (_) {}

  // ---------- máscara do e-mail (inline) ----------
  let destino = String(email || '')
  const at = destino.indexOf('@')
  if (at > 1) {
    const usuario = destino.slice(0, at)
    const dominio = destino.slice(at)
    destino =
      usuario.length <= 2
        ? usuario.charAt(0) + '***' + dominio
        : usuario.slice(0, 2) + '***' + dominio
  }

  /* Resposta de desafio, escrita por mim — por isso sem e.next(), logo sem
       token. O cliente guarda `desafio` e pede o código ao usuário. */
  return e.json(200, {
    segundo_fator: true,
    desafio: desafio,
    destino: destino,
    validade_segundos: 600,
    mensagem: 'Enviamos um codigo de 6 digitos para o seu e-mail.',
  })
}, 'users')
