/* Régua de cobrança por e-mail (Etapa 11)

   GET  /backend/v1/relatorios/cobranca     — o que a régua faria hoje (prévia)
   POST /backend/v1/rodar-regua-cobranca    — executa agora (para teste e uso manual)
   cronAdd('regua_cobranca', '0 11 * * *')  — roda todo dia às 11h UTC

   ETAPAS DA RÉGUA: D+1 (lembrete leve), D+7 (cobrança normal), D+15 (última
   antes de negativação). Cada etapa roda UMA vez por título — controlado pela
   própria coleção `comunicacao`: se já existe registro para aquele título
   naquela etapa, não envia de novo. Sem esse controle, o cron mandaria "D+1"
   todo dia para sempre.

   LIMITAÇÃO HONESTA, E ELA É IMPORTANTE:

   O backend de PREVIEW do Skip Cloud NÃO ENVIA E-MAIL (está no guia de e-mails
   do próprio Skip). E SMTP nunca foi configurado neste projeto — é pendência
   desde a Etapa 4.

   Então esta régua faz o que é possível fazer de verdade: identifica quem
   precisa ser cobrado, monta a mensagem, TENTA enviar e registra o resultado
   real em `comunicacao` — inclusive o erro. Se o envio falhar, o registro fica
   com `status: 'falhou'` e o motivo.

   Isso é deliberado: uma régua que marca "enviado" sem ter enviado é pior que
   régua nenhuma, porque a clínica para de cobrar achando que cobrou. Quando o
   SMTP for configurado, o mesmo código passa a enviar sem mudar nada. */

routerAdd(
  'GET',
  '/backend/v1/relatorios/cobranca',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa a regua de cobranca.')
    }

    const tenant = e.auth.getString('tenant_id')
    const hojeIso = new Date().toISOString().slice(0, 10)
    const hojeTs = Date.parse(hojeIso)

    // títulos vencidos com saldo e paciente com e-mail
    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' +
          tenant +
          '" && status != "cancelado" && status != "pago" && vencimento < "' +
          hojeIso +
          ' 00:00:00.000Z"',
        'vencimento',
        1000,
        0,
      )
    } catch (_) {}

    // o que já foi comunicado, por título e etapa
    const jaEnviado = {}
    try {
      const coms = $app.findRecordsByFilter(
        'comunicacao',
        'tenant_id = "' + tenant + '" && tipo = "cobranca"',
        '-created',
        2000,
        0,
      )
      for (const c of coms) {
        const t = c.getString('titulo_receber_id')
        const etapa = c.getString('etapa_regua')
        if (t && etapa) jaEnviado[t + '|' + etapa] = c.getString('status')
      }
    } catch (_) {}

    const etapas = [
      { chave: 'D+1', dias: 1, assunto: 'Lembrete de pagamento' },
      { chave: 'D+7', dias: 7, assunto: 'Fatura em aberto' },
      { chave: 'D+15', dias: 15, assunto: 'Ultimo aviso antes de negativacao' },
    ]

    const previa = []
    for (const t of titulos) {
      const total = t.getInt('valor_centavos') || 0
      const pago = t.getInt('valor_pago_centavos') || 0
      const saldo = total - pago
      if (saldo <= 0) continue

      const venc = String(t.getString('vencimento')).slice(0, 10)
      const atraso = Math.floor((hojeTs - Date.parse(venc)) / 86400000)

      // qual etapa cabe HOJE: a maior cujo prazo já passou
      let etapaAtual = null
      for (const et of etapas) {
        if (atraso >= et.dias) etapaAtual = et
      }
      if (!etapaAtual) continue

      let pacienteNome = ''
      let email = ''
      try {
        const p = $app.findRecordById('paciente', t.getString('paciente_id'))
        pacienteNome = p.getString('nome')
        email = p.getString('email')
      } catch (_) {}

      const chave = t.id + '|' + etapaAtual.chave
      const situacao = jaEnviado[chave] || ''

      previa.push({
        titulo_id: t.id,
        paciente_id: t.getString('paciente_id'),
        paciente_nome: pacienteNome,
        email: email,
        tem_email: !!email,
        descricao: t.getString('descricao'),
        vencimento: venc,
        dias_atraso: atraso,
        saldo_centavos: saldo,
        etapa: etapaAtual.chave,
        etapa_dias: etapaAtual.dias,
        // 'pendente' = ainda não tentou esta etapa
        situacao: situacao || 'pendente',
        ja_contatado_em: situacao ? 'sim' : '',
      })
    }

    // ordena do mais atrasado para o menos
    previa.sort((a, b) => b.dias_atraso - a.dias_atraso)

    const semEmail = previa.filter((p) => !p.tem_email).length
    const pendentes = previa.filter((p) => p.situacao === 'pendente').length

    return e.json(200, {
      hoje: hojeIso,
      resumo: {
        titulos_vencidos: previa.length,
        a_contatar_hoje: pendentes,
        sem_email: semEmail,
        valor_total_vencido_centavos: previa.reduce((a, p) => a + p.saldo_centavos, 0),
      },
      // aviso explícito para a tela poder mostrar na cara do usuário
      aviso_envio:
        'O backend de preview nao envia e-mail e o SMTP nao esta configurado. Cada tentativa e registrada com o resultado real.',
      previa: previa,
      etapas: etapas.map((x) => ({ chave: x.chave, dias: x.dias, assunto: x.assunto })),
    })
  },
  $apis.requireAuth(),
)

/* Execução da régua. A lógica é inline (JSVM não enxerga funções de topo) e
   está duplicada na rota e no cron de propósito — é a única forma que funciona
   neste runtime. */
routerAdd(
  'POST',
  '/backend/v1/rodar-regua-cobranca',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor'].indexOf(papel) < 0) {
      return e.forbiddenError('Somente gestao dispara a regua.')
    }

    const tenant = e.auth.getString('tenant_id')
    const hojeIso = new Date().toISOString().slice(0, 10)
    const hojeTs = Date.parse(hojeIso)

    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' +
          tenant +
          '" && status != "cancelado" && status != "pago" && vencimento < "' +
          hojeIso +
          ' 00:00:00.000Z"',
        'vencimento',
        500,
        0,
      )
    } catch (_) {}

    const jaEnviado = {}
    try {
      const coms = $app.findRecordsByFilter(
        'comunicacao',
        'tenant_id = "' + tenant + '" && tipo = "cobranca"',
        '-created',
        2000,
        0,
      )
      for (const c of coms) {
        const t = c.getString('titulo_receber_id')
        const et = c.getString('etapa_regua')
        if (t && et) jaEnviado[t + '|' + et] = true
      }
    } catch (_) {}

    const etapas = [
      { chave: 'D+1', dias: 1 },
      { chave: 'D+7', dias: 7 },
      { chave: 'D+15', dias: 15 },
    ]

    const colCom = $app.findCollectionByNameOrId('comunicacao')
    let enviados = 0
    let falhas = 0
    let semEmail = 0
    let jaFeitos = 0
    const detalhe = []

    for (const t of titulos) {
      const total = t.getInt('valor_centavos') || 0
      const pago = t.getInt('valor_pago_centavos') || 0
      const saldo = total - pago
      if (saldo <= 0) continue

      const venc = String(t.getString('vencimento')).slice(0, 10)
      const atraso = Math.floor((hojeTs - Date.parse(venc)) / 86400000)

      let etapaAtual = null
      for (const et of etapas) if (atraso >= et.dias) etapaAtual = et
      if (!etapaAtual) continue

      const chave = t.id + '|' + etapaAtual.chave
      if (jaEnviado[chave]) {
        jaFeitos++
        continue
      }

      let pacienteNome = ''
      let email = ''
      try {
        const p = $app.findRecordById('paciente', t.getString('paciente_id'))
        pacienteNome = p.getString('nome')
        email = p.getString('email')
      } catch (_) {}

      // cria o registro de tentativa ANTES de tentar: se o envio derrubar a
      // função, a tentativa fica registrada e não vira loop
      let registro
      try {
        registro = new Record(colCom)
        registro.set('tenant_id', tenant)
        registro.set('paciente_id', t.getString('paciente_id'))
        registro.set('canal', 'email')
        registro.set('tipo', 'cobranca')
        registro.set('destinatario', email || '')
        registro.set(
          'assunto',
          'Cobranca ' + etapaAtual.chave + ' - ' + (pacienteNome || 'paciente'),
        )
        registro.set(
          'corpo',
          'Ola ' +
            (pacienteNome || '') +
            ', consta em aberto o valor de R$ ' +
            (saldo / 100).toFixed(2).replace('.', ',') +
            ' referente a "' +
            t.getString('descricao') +
            '", vencido em ' +
            venc.split('-').reverse().join('/') +
            '. Etapa: ' +
            etapaAtual.chave +
            '.',
        )
        registro.set('titulo_receber_id', t.id)
        registro.set('etapa_regua', etapaAtual.chave)
        registro.set('status', 'falhou')
        registro.set('erro', 'envio nao executado')
        $app.save(registro)
      } catch (_) {
        continue
      }

      if (!email) {
        semEmail++
        try {
          registro.set('status', 'falhou')
          registro.set('erro', 'paciente sem e-mail cadastrado')
          $app.save(registro)
        } catch (_) {}
        detalhe.push({ titulo: t.id, etapa: etapaAtual.chave, resultado: 'sem_email' })
        continue
      }

      /* TENTATIVA DE ENVIO REAL.
         `$app.newMailClient()` é a API do PocketBase v0.36 para mandar e-mail
         fora dos fluxos de auth. No preview do Skip ela existe mas NÃO entrega
         — o guia do próprio Skip diz que o preview nunca envia. Então o
         resultado real é 'falhou', e o erro fica gravado.
         Quando o SMTP for configurado, este mesmo bloco passa a entregar. */
      let erroEnvio = ''
      try {
        const mailer = $app.newMailClient()
        const msg = new MailerMessage({
          from: {
            address: $app.settings().meta.senderAddress || 'nao-responder@gestec.local',
            name: $app.settings().meta.senderName || 'GesTec',
          },
          to: [{ address: email }],
          subject: registro.getString('assunto'),
          text: registro.getString('corpo'),
        })
        mailer.send(msg)
      } catch (err) {
        erroEnvio = String(err).slice(0, 900)
      }

      if (erroEnvio) {
        falhas++
        try {
          registro.set('status', 'falhou')
          registro.set('erro', erroEnvio)
          $app.save(registro)
        } catch (_) {}
        detalhe.push({
          titulo: t.id,
          etapa: etapaAtual.chave,
          resultado: 'falhou',
          erro: erroEnvio,
        })
      } else {
        enviados++
        try {
          registro.set('status', 'enviado')
          registro.set('erro', '')
          $app.save(registro)
        } catch (_) {}
        detalhe.push({ titulo: t.id, etapa: etapaAtual.chave, resultado: 'enviado' })
      }
      jaEnviado[chave] = true
    }

    return e.json(200, {
      ok: true,
      data: hojeIso,
      enviados: enviados,
      falhas: falhas,
      sem_email: semEmail,
      ja_contatados: jaFeitos,
      detalhe: detalhe,
      aviso:
        'Falhas de envio sao esperadas enquanto o SMTP nao estiver configurado. A tentativa fica registrada em comunicacao.',
    })
  },
  $apis.requireAuth(),
)

/* Cron diário às 11h UTC (8h de Brasília): horário comercial, para o e-mail não
   chegar de madrugada. A lógica é a mesma da rota, inline. */
cronAdd('regua_cobranca', '0 11 * * *', () => {
  const hojeIso = new Date().toISOString().slice(0, 10)
  const hojeTs = Date.parse(hojeIso)

  // percorre TODOS os tenants: o cron roda para a instância inteira
  let tenants = []
  try {
    tenants = $app.findRecordsByFilter('tenant', '', '', 500, 0)
  } catch (_) {
    return
  }

  for (const tn of tenants) {
    const tenant = tn.id

    let titulos = []
    try {
      titulos = $app.findRecordsByFilter(
        'titulo_receber',
        'tenant_id = "' +
          tenant +
          '" && status != "cancelado" && status != "pago" && vencimento < "' +
          hojeIso +
          ' 00:00:00.000Z"',
        'vencimento',
        500,
        0,
      )
    } catch (_) {
      continue
    }
    if (titulos.length === 0) continue

    const jaEnviado = {}
    try {
      const coms = $app.findRecordsByFilter(
        'comunicacao',
        'tenant_id = "' + tenant + '" && tipo = "cobranca"',
        '-created',
        2000,
        0,
      )
      for (const c of coms) {
        const t = c.getString('titulo_receber_id')
        const et = c.getString('etapa_regua')
        if (t && et) jaEnviado[t + '|' + et] = true
      }
    } catch (_) {}

    const etapas = [
      { chave: 'D+1', dias: 1 },
      { chave: 'D+7', dias: 7 },
      { chave: 'D+15', dias: 15 },
    ]

    const colCom = $app.findCollectionByNameOrId('comunicacao')

    for (const t of titulos) {
      const total = t.getInt('valor_centavos') || 0
      const pago = t.getInt('valor_pago_centavos') || 0
      const saldo = total - pago
      if (saldo <= 0) continue

      const venc = String(t.getString('vencimento')).slice(0, 10)
      const atraso = Math.floor((hojeTs - Date.parse(venc)) / 86400000)

      let etapaAtual = null
      for (const et of etapas) if (atraso >= et.dias) etapaAtual = et
      if (!etapaAtual) continue
      if (jaEnviado[t.id + '|' + etapaAtual.chave]) continue

      let pacienteNome = ''
      let email = ''
      try {
        const p = $app.findRecordById('paciente', t.getString('paciente_id'))
        pacienteNome = p.getString('nome')
        email = p.getString('email')
      } catch (_) {}

      let registro
      try {
        registro = new Record(colCom)
        registro.set('tenant_id', tenant)
        registro.set('paciente_id', t.getString('paciente_id'))
        registro.set('canal', 'email')
        registro.set('tipo', 'cobranca')
        registro.set('destinatario', email || '')
        registro.set('assunto', 'Cobranca ' + etapaAtual.chave)
        registro.set(
          'corpo',
          'Ola ' +
            pacienteNome +
            ', consta em aberto R$ ' +
            (saldo / 100).toFixed(2).replace('.', ',') +
            ' referente a "' +
            t.getString('descricao') +
            '", vencido em ' +
            venc.split('-').reverse().join('/') +
            '.',
        )
        registro.set('titulo_receber_id', t.id)
        registro.set('etapa_regua', etapaAtual.chave)
        registro.set('status', 'falhou')
        registro.set('erro', 'envio nao executado')
        $app.save(registro)
      } catch (_) {
        continue
      }

      if (!email) {
        try {
          registro.set('erro', 'paciente sem e-mail cadastrado')
          $app.save(registro)
        } catch (_) {}
        jaEnviado[t.id + '|' + etapaAtual.chave] = true
        continue
      }

      let erroEnvio = ''
      try {
        const mailer = $app.newMailClient()
        const msg = new MailerMessage({
          from: {
            address: $app.settings().meta.senderAddress || 'nao-responder@gestec.local',
            name: $app.settings().meta.senderName || 'GesTec',
          },
          to: [{ address: email }],
          subject: registro.getString('assunto'),
          text: registro.getString('corpo'),
        })
        mailer.send(msg)
      } catch (err) {
        erroEnvio = String(err).slice(0, 900)
      }

      try {
        if (erroEnvio) {
          registro.set('status', 'falhou')
          registro.set('erro', erroEnvio)
        } else {
          registro.set('status', 'enviado')
          registro.set('erro', '')
        }
        $app.save(registro)
      } catch (_) {}

      jaEnviado[t.id + '|' + etapaAtual.chave] = true
    }
  }

  console.log('[regua_cobranca] executada em ' + hojeIso)
})
