/* Disparo manual dos lembretes (Etapa 13)

   POST /backend/v1/lembretes/executar   { tipo?: confirmacao|retorno|aniversario }

   POR QUE ESTA ROTA EXISTE, além do cron: a recepção precisa poder mandar o
   lembrete agora quando o paciente liga perguntando da consulta, sem esperar o
   job das 11h. E é ela que permite provar os critérios de pronto sem depender
   do relógio.

   A LÓGICA É A MESMA DO CRON, copiada de propósito: o goja roda cada callback
   em pool separado e não enxerga função de arquivo, então compartilhar código
   entre o cron e a rota é impossível. A duplicação é a única forma correta
   neste runtime — a alternativa (uma função de topo) falha em runtime com
   ReferenceError e só aparece quando alguém aperta o botão.

   IDEMPOTÊNCIA IGUAL À DO CRON: `chave_dia` + índice UNIQUE. Rodar duas vezes
   no mesmo dia não duplica, e é isso que o critério 3 cobra. */

routerAdd(
  'POST',
  '/backend/v1/lembretes/executar',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao dispara lembretes.')
    }

    const tenantId = e.auth.getString('tenant_id')
    const body = e.requestInfo().body || {}
    const filtroTipo = String(body.tipo || '')

    let tenant
    try {
      tenant = $app.findRecordById('tenant', tenantId)
    } catch (_) {
      return e.notFoundError('Clinica nao encontrada.')
    }
    const nomeClinica = tenant.getString('nome') || 'sua clinica'

    const hoje = new Date()
    const hojeIso = hoje.toISOString().slice(0, 10)

    const inicioDoDia = (d) => d.toISOString().slice(0, 10) + ' 00:00:00.000Z'
    const fimDoDia = (d) => d.toISOString().slice(0, 10) + ' 23:59:59.999Z'
    const maisDias = (n) => new Date(hoje.getTime() + n * 86400000)

    const preencher = (texto, dados) => {
      let out = String(texto || '')
      for (const chave of Object.keys(dados)) {
        out = out
          .split('{' + chave + '}')
          .join(String(dados[chave] === undefined ? '' : dados[chave]))
      }
      return out
    }

    const dataBr = (iso) => {
      const s = String(iso || '').slice(0, 10)
      if (s.length < 10) return ''
      const p = s.split('-')
      return p[2] + '/' + p[1] + '/' + p[0]
    }

    const modeloDe = (tipo) => {
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

    const registrar = (chave, dados) => {
      try {
        $app.findFirstRecordByFilter('comunicacao', 'chave_dia = "' + chave + '"')
        return false
      } catch (_) {}
      const r = new Record($app.findCollectionByNameOrId('comunicacao'))
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
      } catch (_) {
        return false
      }
    }

    const enviar = (para, assunto, corpo) => {
      const mc = $app.newMailClient()
      const msg = new MailerMessage({
        from: { address: 'nao-responda@gestec.local', name: 'GesTec-IA-Odonto' },
        to: [{ address: para }],
        subject: assunto,
        html:
          '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;font-size:14px;color:#333">' +
          String(corpo || '')
            .split('\n')
            .map((l) => '<p style="margin:0 0 12px">' + (l || '&nbsp;') + '</p>')
            .join('') +
          '</div>',
      })
      mc.send(msg)
    }

    const resultado = { confirmacao: 0, retorno: 0, aniversario: 0, falhas: 0, ja_enviados: 0 }
    const querTipo = (t) => !filtroTipo || filtroTipo === t

    // ---------------- confirmação ----------------
    if (querTipo('confirmacao')) {
      const modelo = modeloDe('confirmacao')
      if (modelo) {
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
              let pac
              try {
                pac = $app.findRecordById('paciente', pacienteId)
              } catch (_) {
                continue
              }
              const email = pac.getString('email')
              if (!email) continue

              let profNome = ''
              try {
                profNome = $app
                  .findRecordById('profissional', a.getString('profissional_id'))
                  .getString('nome')
              } catch (_) {}

              const inicio = String(a.getString('inicio'))
              const dados = {
                paciente: pac.getString('nome'),
                data: dataBr(inicio),
                hora: inicio.slice(11, 16),
                profissional: profNome,
                clinica: nomeClinica,
              }
              const chave = 'confirmacao|' + pacienteId + '|' + a.id + '|' + antecedencia + 'h'

              const reg = registrar(chave, {
                tipo: 'confirmacao',
                paciente_id: pacienteId,
                agendamento_id: a.id,
                destinatario: email,
                assunto: preencher(modelo.assunto, dados),
                corpo: preencher(modelo.corpo, dados),
              })
              if (!reg) {
                resultado.ja_enviados++
                continue
              }
              try {
                enviar(email, preencher(modelo.assunto, dados), preencher(modelo.corpo, dados))
                resultado.confirmacao++
              } catch (err) {
                reg.set('status', 'falhou')
                reg.set('erro', String(err).slice(0, 900))
                try {
                  $app.save(reg)
                } catch (_) {}
                resultado.falhas++
              }
            } catch (_) {
              resultado.falhas++
            }
          }
        }
      }
    }

    // ---------------- retorno ----------------
    if (querTipo('retorno')) {
      const modelo = modeloDe('retorno')
      const diasRetorno = tenant.getInt('dias_retorno') || 180
      if (modelo) {
        const limite = maisDias(-diasRetorno).toISOString().slice(0, 10)
        let pacientes = []
        try {
          pacientes = $app.findRecordsByFilter(
            'paciente',
            'tenant_id = "' + tenantId + '"',
            '',
            2000,
            0,
          )
        } catch (_) {}

        for (const pac of pacientes) {
          try {
            const email = pac.getString('email')
            if (!email) continue

            let ultimo = null
            try {
              const u = $app.findRecordsByFilter(
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
              if (u.length > 0) ultimo = u[0]
            } catch (_) {}

            const base = ultimo ? String(ultimo.getString('inicio')).slice(0, 10) : ''
            if (!base) continue
            if (base > limite) continue

            try {
              const fut = $app.findRecordsByFilter(
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
              if (fut.length > 0) continue
            } catch (_) {}

            const dias = Math.floor(
              (Date.now() - new Date(base + 'T00:00:00Z').getTime()) / 86400000,
            )
            const dados = {
              paciente: pac.getString('nome'),
              dias: String(dias),
              clinica: nomeClinica,
            }
            const reg = registrar('retorno|' + pac.id + '|' + hojeIso, {
              tipo: 'retorno',
              paciente_id: pac.id,
              destinatario: email,
              assunto: preencher(modelo.assunto, dados),
              corpo: preencher(modelo.corpo, dados),
            })
            if (!reg) {
              resultado.ja_enviados++
              continue
            }
            try {
              enviar(email, preencher(modelo.assunto, dados), preencher(modelo.corpo, dados))
              resultado.retorno++
            } catch (err) {
              reg.set('status', 'falhou')
              reg.set('erro', String(err).slice(0, 900))
              try {
                $app.save(reg)
              } catch (_) {}
              resultado.falhas++
            }
          } catch (_) {
            resultado.falhas++
          }
        }
      }
    }

    // ---------------- aniversário ----------------
    if (querTipo('aniversario')) {
      const modelo = modeloDe('aniversario')
      if (modelo) {
        const mmdd = hojeIso.slice(5, 10)
        let pacientes = []
        try {
          pacientes = $app.findRecordsByFilter(
            'paciente',
            'tenant_id = "' + tenantId + '"',
            '',
            2000,
            0,
          )
        } catch (_) {}

        for (const pac of pacientes) {
          try {
            const nasc = String(pac.getString('data_nascimento') || '').slice(0, 10)
            if (nasc.length < 10) continue
            if (nasc.slice(5, 10) !== mmdd) continue
            const email = pac.getString('email')
            if (!email) continue

            const dados = { paciente: pac.getString('nome'), clinica: nomeClinica }
            const reg = registrar('aniversario|' + pac.id + '|' + hojeIso, {
              tipo: 'aniversario',
              paciente_id: pac.id,
              destinatario: email,
              assunto: preencher(modelo.assunto, dados),
              corpo: preencher(modelo.corpo, dados),
            })
            if (!reg) {
              resultado.ja_enviados++
              continue
            }
            try {
              enviar(email, preencher(modelo.assunto, dados), preencher(modelo.corpo, dados))
              resultado.aniversario++
            } catch (err) {
              reg.set('status', 'falhou')
              reg.set('erro', String(err).slice(0, 900))
              try {
                $app.save(reg)
              } catch (_) {}
              resultado.falhas++
            }
          } catch (_) {
            resultado.falhas++
          }
        }
      }
    }

    return e.json(200, {
      ok: true,
      dia: hojeIso,
      enviados: resultado.confirmacao + resultado.retorno + resultado.aniversario,
      ja_enviados_hoje: resultado.ja_enviados,
      falhas: resultado.falhas,
      detalhe: resultado,
      aviso:
        'No ambiente de previa o Skip pode registrar o envio como "skipped"; o registro em comunicacao mostra o status real.',
    })
  },
  $apis.requireAuth(),
)
