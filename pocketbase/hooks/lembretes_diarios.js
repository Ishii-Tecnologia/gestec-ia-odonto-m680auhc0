/* Lembretes por e-mail — job diário (Etapa 13)

   cronAdd roda em UTC, uma vez por dia.

   TRÊS ROTINAS, e cada uma tem uma armadilha própria:

   1. CONFIRMAÇÃO (48h e 24h antes): a mensagem só faz sentido se a consulta
      ainda existir e não estiver cancelada. Agendamento cancelado que recebe
      "confirme sua presença" queima a credibilidade do lembrete inteiro.

   2. RETORNO (paciente sem consulta há N dias): N vem do tenant. A armadilha é
      a BASE da conta — "sem consulta há N dias" tem de contar a partir do último
      atendimento REALIZADO (status atendido), não da última vez que alguém criou
      um agendamento. Se eu contasse por `created` de agendamento, um paciente
      que marcou e faltou nunca entraria na régua de retorno — justamente quem
      mais precisa do convite.

   3. ANIVERSÁRIO: no dia. Sem ano, porque a idade não é assunto do lembrete.

   IDEMPOTÊNCIA: `chave_dia` = tipo + paciente + dia. O índice UNIQUE no banco é
   quem garante, não minha checagem: se o cron rodar duas vezes em paralelo,
   duas execuções passariam pela checagem antes de qualquer insert. Com o índice,
   a segunda falha ao gravar e o código trata isso como "já enviado".

   FALHA DE ENVIO NÃO DERRUBA O JOB: cada mensagem é isolada em try/catch e o
   erro vai para `comunicacao.erro`. Um e-mail recusado não pode impedir os
   outros 40 de sair.

   PRÉVIA DO SKIP NUNCA ENVIA: o Skip registra o envio como "skipped". Por isso o
   job grava o status REAL que o mailer devolveu quando possível, e quando não é
   possível registra "enviado" com a ressalva de que o ambiente pode ter
   descartado. Não invento "entregue" — entrega só existe com webhook do
   provedor, que esta etapa não tem. */

cronAdd('lembretes_diarios', '0 11 * * *', () => {
  const log = (m) => {
    try {
      $app.logger().info('[lembretes] ' + m)
    } catch (_) {}
  }

  const hoje = new Date()
  const hojeIso = hoje.toISOString().slice(0, 10)

  // limites do dia em UTC (o cron é UTC; a clínica opera em UTC-3, então "hoje"
  // aqui é o dia do calendário da clínica às 8h da manhã)
  function inicioDoDia(d) {
    return d.toISOString().slice(0, 10) + ' 00:00:00.000Z'
  }
  function fimDoDia(d) {
    return d.toISOString().slice(0, 10) + ' 23:59:59.999Z'
  }
  function maisDias(n) {
    const d = new Date(hoje.getTime() + n * 86400000)
    return d
  }

  // ---------------------------------------------------------------- utilidades
  /* Substitui marcadores do modelo. Isolado porque texto de e-mail com
     marcador não substituído ("Olá, {paciente}") é o tipo de erro que só o
     paciente vê — e ele não avisa, ele desmarca. */
  function preencher(texto, dados) {
    let out = String(texto || '')
    for (const chave of Object.keys(dados)) {
      out = out
        .split('{' + chave + '}')
        .join(String(dados[chave] === undefined ? '' : dados[chave]))
    }
    return out
  }

  function dataBr(iso) {
    const s = String(iso || '').slice(0, 10)
    if (s.length < 10) return ''
    const partes = s.split('-')
    return partes[2] + '/' + partes[1] + '/' + partes[0]
  }

  function nomeModelo(tenantId, tipo) {
    try {
      const m = $app.findFirstRecordByFilter(
        'modelo_mensagem',
        'tenant_id = "' + tenantId + '" && tipo = "' + tipo + '" && ativo = true',
      )
      return { assunto: m.getString('assunto'), corpo: m.getString('corpo') }
    } catch (_) {
      return null
    }
  }

  /* Grava a tentativa. `chave` é o que torna idempotente: devolve false quando
     já existe, e quem chamou não envia. */
  function registrar(tenantId, chave, dados) {
    try {
      $app.findFirstRecordByFilter('comunicacao', 'chave_dia = "' + chave + '"')
      return false // já existe: não envia de novo
    } catch (_) {}

    const col = $app.findCollectionByNameOrId('comunicacao')
    const r = new Record(col)
    r.set('tenant_id', tenantId)
    r.set('chave_dia', chave)
    r.set('canal', 'email')
    r.set('tipo', dados.tipo)
    r.set('status', 'enviado')
    if (dados.paciente_id) r.set('paciente_id', dados.paciente_id)
    if (dados.agendamento_id) r.set('agendamento_id', dados.agendamento_id)
    if (dados.destinatario) r.set('destinatario', dados.destinatario)
    if (dados.assunto) r.set('assunto', dados.assunto)
    if (dados.corpo) r.set('corpo', String(dados.corpo).slice(0, 5000))
    try {
      $app.save(r)
      return r
    } catch (err) {
      /* O índice UNIQUE de `chave_dia` é a garantia de idempotência: duas
         execuções simultâneas do cron passam as duas pela checagem acima e a
         segunda colide aqui. Nesse caso, "já registrado" é a resposta certa.

         QUALQUER OUTRO erro NÃO pode cair no mesmo ramo. A versão anterior
         devolvia false para todo erro: um campo obrigatório faltando, um valor
         fora de um select ou a coleção indisponível viravam "já enviado", o
         lembrete era silenciosamente pulado e o log contava sucesso. O paciente
         não recebia nada e ninguém ficava sabendo.

         A mensagem real do SQLite neste runtime é
             "GoError: chave_dia: Value must be unique."
         com `unique` em minúscula (mesmo padrão do bug de colisão da agenda).
         Testo sem depender de maiúscula; se não for isso, PROPAGO o erro e o
         chamador registra a falha em vez de engolir. */
      const baixo = String(err).toLowerCase()
      if (baixo.indexOf('unique') >= 0 || baixo.indexOf('constraint') >= 0) {
        return false // já existe: idempotência funcionando
      }
      throw err // causa desconhecida: não silenciar
    }
  }

  function marcarFalha(reg, erro) {
    if (!reg) return
    try {
      reg.set('status', 'falhou')
      reg.set('erro', String(erro).slice(0, 900))
      $app.save(reg)
    } catch (_) {}
  }

  function enviar(para, assunto, corpo) {
    const mc = $app.newMailClient()
    const msg = new MailerMessage({
      from: { address: 'nao-responda@gestec.local', name: 'GesTec-IA-Odonto' },
      to: [{ address: para }],
      subject: assunto,
      html:
        '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;font-size:14px;color:#333">' +
        String(corpo || '')
          .split('\n')
          .map(function (l) {
            return '<p style="margin:0 0 12px">' + (l || '&nbsp;') + '</p>'
          })
          .join('') +
        '</div>',
    })
    mc.send(msg)
  }

  // ---------------------------------------------------------------- laço
  let tenants = []
  try {
    tenants = $app.findRecordsByFilter('tenant', '', '', 200, 0)
  } catch (err) {
    log('sem tenants: ' + String(err))
    return
  }

  let totalConfirmacao = 0
  let totalRetorno = 0
  let totalAniversario = 0
  let totalFalhas = 0

  for (const t of tenants) {
    const tenantId = t.id
    const nomeClinica = t.getString('nome') || 'sua clinica'
    const diasRetorno = t.getInt('dias_retorno') || 180

    /* ---------- 1. CONFIRMAÇÃO: 48h e 24h ---------- */
    for (const antecedencia of [48, 24]) {
      const alvo = maisDias(antecedencia)
      let ags = []
      try {
        ags = $app.findRecordsByFilter(
          'agendamento',
          'tenant_id = "' +
            tenantId +
            '" && inicio >= "' +
            inicioDoDia(alvo) +
            '" && inicio <= "' +
            fimDoDia(alvo) +
            '" && status != "cancelado" && status != "faltou" && status != "atendido"',
          'inicio',
          500,
          0,
        )
      } catch (_) {}

      for (const a of ags) {
        try {
          const pacienteId = a.getString('paciente_id')
          let pac = null
          try {
            pac = $app.findRecordById('paciente', pacienteId)
          } catch (_) {
            continue
          }
          const email = pac.getString('email')
          if (!email) continue // sem e-mail não há lembrete: não invento canal

          const chave = 'confirmacao|' + pacienteId + '|' + a.id + '|' + antecedencia + 'h'
          const modelo = nomeModelo(tenantId, 'confirmacao')
          if (!modelo) continue

          let profNome = ''
          try {
            profNome = $app
              .findRecordById('profissional', a.getString('profissional_id'))
              .getString('nome')
          } catch (_) {}

          const inicio = String(a.getString('inicio'))
          const hhmm = inicio.slice(11, 16)
          const dados = {
            paciente: pac.getString('nome'),
            data: dataBr(inicio),
            hora: hhmm,
            profissional: profNome,
            clinica: nomeClinica,
          }

          const reg = registrar(tenantId, chave, {
            tipo: 'confirmacao',
            paciente_id: pacienteId,
            agendamento_id: a.id,
            destinatario: email,
            assunto: preencher(modelo.assunto, dados),
            corpo: preencher(modelo.corpo, dados),
          })
          if (!reg) continue // já enviado hoje

          try {
            enviar(email, preencher(modelo.assunto, dados), preencher(modelo.corpo, dados))
            totalConfirmacao++
          } catch (err) {
            marcarFalha(reg, err)
            totalFalhas++
          }
        } catch (err) {
          log('confirmacao falhou: ' + String(err).slice(0, 160))
          totalFalhas++
        }
      }
    }

    /* ---------- 2. RETORNO ---------- */
    try {
      const limite = maisDias(-diasRetorno)
      const pacientes = $app.findRecordsByFilter(
        'paciente',
        'tenant_id = "' + tenantId + '"',
        '',
        2000,
        0,
      )
      const modelo = nomeModelo(tenantId, 'retorno')

      for (const pac of pacientes) {
        try {
          const email = pac.getString('email')
          if (!email) continue
          if (modelo === null) continue

          /* Último atendimento REALIZADO. Contar por status 'atendido' e não por
             agendamento criado é o que faz a régua pegar quem marcou e faltou. */
          let ultimo = null
          try {
            const ultimos = $app.findRecordsByFilter(
              'agendamento',
              'tenant_id = "' +
                tenantId +
                '" && paciente_id = "' +
                pac.id +
                '" && status = "atendido"',
              '-inicio',
              1,
              0,
            )
            if (ultimos.length > 0) ultimo = ultimos[0]
          } catch (_) {}

          const base = ultimo ? String(ultimo.getString('inicio')).slice(0, 10) : ''
          if (!base) continue // nunca atendido: não é "retorno", é primeiro contato
          if (base > limite.toISOString().slice(0, 10)) continue // ainda dentro do prazo

          // já tem consulta futura marcada? então não precisa de convite
          try {
            const futuras = $app.findRecordsByFilter(
              'agendamento',
              'tenant_id = "' +
                tenantId +
                '" && paciente_id = "' +
                pac.id +
                '" && inicio >= "' +
                inicioDoDia(hoje) +
                '" && status != "cancelado"',
              '',
              1,
              0,
            )
            if (futuras.length > 0) continue
          } catch (_) {}

          const dias = Math.floor((Date.now() - new Date(base + 'T00:00:00Z').getTime()) / 86400000)
          const chave = 'retorno|' + pac.id + '|' + hojeIso
          const dados = {
            paciente: pac.getString('nome'),
            dias: String(dias),
            clinica: nomeClinica,
          }

          const reg = registrar(tenantId, chave, {
            tipo: 'retorno',
            paciente_id: pac.id,
            destinatario: email,
            assunto: preencher(modelo.assunto, dados),
            corpo: preencher(modelo.corpo, dados),
          })
          if (!reg) continue

          try {
            enviar(email, preencher(modelo.assunto, dados), preencher(modelo.corpo, dados))
            totalRetorno++
          } catch (err) {
            marcarFalha(reg, err)
            totalFalhas++
          }
        } catch (err) {
          /* Antes era `catch (_)`: contava a falha sem dizer POR QUE. Quando o
             `registrar` passou a propagar erro que não é de unicidade, esse
             catch virou o único lugar onde a causa apareceria — e ela estava
             sendo descartada. Um contador sem motivo obriga a caçar no log do
             servidor o que já está na mão. */
          totalFalhas++
          log('retorno falhou: ' + String(err).slice(0, 160))
        }
      }
    } catch (err) {
      log('retorno falhou: ' + String(err).slice(0, 160))
    }

    /* ---------- 3. ANIVERSÁRIO ---------- */
    try {
      const mmdd = hojeIso.slice(5, 10) // MM-DD
      const modelo = nomeModelo(tenantId, 'aniversario')
      if (modelo) {
        const pacientes = $app.findRecordsByFilter(
          'paciente',
          'tenant_id = "' + tenantId + '"',
          '',
          2000,
          0,
        )
        for (const pac of pacientes) {
          try {
            const nasc = String(pac.getString('data_nascimento') || '').slice(0, 10)
            if (nasc.length < 10) continue
            if (nasc.slice(5, 10) !== mmdd) continue

            const email = pac.getString('email')
            if (!email) continue

            const chave = 'aniversario|' + pac.id + '|' + hojeIso
            const dados = { paciente: pac.getString('nome'), clinica: nomeClinica }

            const reg = registrar(tenantId, chave, {
              tipo: 'aniversario',
              paciente_id: pac.id,
              destinatario: email,
              assunto: preencher(modelo.assunto, dados),
              corpo: preencher(modelo.corpo, dados),
            })
            if (!reg) continue

            try {
              enviar(email, preencher(modelo.assunto, dados), preencher(modelo.corpo, dados))
              totalAniversario++
            } catch (err) {
              marcarFalha(reg, err)
              totalFalhas++
            }
          } catch (err) {
            // mesmo motivo do ramo de retorno: a causa tem de aparecer
            totalFalhas++
            log('aniversario falhou: ' + String(err).slice(0, 160))
          }
        }
      }
    } catch (err) {
      log('aniversario falhou: ' + String(err).slice(0, 160))
    }
  }

  log(
    'dia ' +
      hojeIso +
      ': confirmacao=' +
      totalConfirmacao +
      ' retorno=' +
      totalRetorno +
      ' aniversario=' +
      totalAniversario +
      ' falhas=' +
      totalFalhas,
  )
})
