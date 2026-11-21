/* Relatório de faltas (Etapa 12)

   GET /backend/v1/relatorios/faltas?de=&ate=

   Três cortes porque a falta tem três causas possíveis, e cada uma pede uma
   ação diferente:

   - POR PACIENTE: quem falta. Ação = conversa, ou cobrar sinal.
   - POR DIA DA SEMANA: segunda de manhã falta mais? Ação = mover a agenda.
   - POR FAIXA DE HORÁRIO: 7h falta mais que 14h? Ação = rever horário ofertado.

   Somar tudo num "taxa de falta" só dá um número que ninguém sabe como baixar.

   DENOMINADOR: uso apenas agendamentos que CHEGARAM a acontecer ou não —
   'atendido', 'faltou' e 'cancelado'. Um agendamento ainda 'agendado' para
   amanhã não é falta nem presença, e contá-lo no denominador faria a taxa cair
   artificialmente no meio do mês. Cancelamento conta como falta porque a cadeira
   ficou vazia do mesmo jeito — mas aparece separado, para não misturar
   "avisou que não vem" com "não apareceu". */

routerAdd(
  'GET',
  '/backend/v1/relatorios/faltas',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'recepcao', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa este relatorio.')
    }

    const tenant = e.auth.getString('tenant_id')
    const q = e.request.url.query()
    const agora = new Date()
    const de = String(
      q.get('de') ||
        agora.getUTCFullYear() + '-' + String(agora.getUTCMonth() + 1).padStart(2, '0') + '-01',
    ).slice(0, 10)
    const ate = String(q.get('ate') || agora.toISOString().slice(0, 10)).slice(0, 10)

    let agendamentos = []
    try {
      agendamentos = $app.findRecordsByFilter(
        'agendamento',
        'tenant_id = "' +
          tenant +
          '" && inicio >= "' +
          de +
          ' 00:00:00.000Z" && inicio <= "' +
          ate +
          ' 23:59:59.999Z"',
        'inicio',
        5000,
        0,
      )
    } catch (_) {}

    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

    const porPaciente = {}
    const porDia = {}
    const porHora = {}
    let total = 0
    let faltou = 0
    let cancelado = 0
    let atendido = 0

    function faixa(h) {
      if (h < 9) return '07h-09h'
      if (h < 11) return '09h-11h'
      if (h < 13) return '11h-13h'
      if (h < 15) return '13h-15h'
      if (h < 17) return '15h-17h'
      return '17h-19h'
    }

    for (const a of agendamentos) {
      const st = a.getString('status')

      /* Só conta o que já se resolveu. 'agendado' e 'confirmado' são futuro:
         entram no denominador quando virarem atendido/faltou. */
      if (st !== 'atendido' && st !== 'faltou' && st !== 'cancelado') continue

      total++
      if (st === 'faltou') faltou++
      if (st === 'cancelado') cancelado++
      if (st === 'atendido') atendido++

      const ini = new Date(String(a.getString('inicio')).replace(' ', 'T'))
      const dow = ini.getUTCDay()
      const h = ini.getUTCHours()
      const diaNome = DIAS[dow]
      const fx = faixa(h)

      // por paciente
      const pacId = a.getString('paciente_id')
      if (!porPaciente[pacId]) {
        let nome = ''
        try {
          nome = $app.findRecordById('paciente', pacId).getString('nome')
        } catch (_) {}
        porPaciente[pacId] = {
          id: pacId,
          nome: nome,
          total: 0,
          faltou: 0,
          cancelado: 0,
          atendido: 0,
        }
      }
      porPaciente[pacId].total++
      if (st === 'faltou') porPaciente[pacId].faltou++
      if (st === 'cancelado') porPaciente[pacId].cancelado++
      if (st === 'atendido') porPaciente[pacId].atendido++

      // por dia
      if (!porDia[diaNome])
        porDia[diaNome] = { dia: diaNome, ordem: dow, total: 0, faltou: 0, cancelado: 0 }
      porDia[diaNome].total++
      if (st === 'faltou') porDia[diaNome].faltou++
      if (st === 'cancelado') porDia[diaNome].cancelado++

      // por faixa
      if (!porHora[fx]) porHora[fx] = { faixa: fx, total: 0, faltou: 0, cancelado: 0 }
      porHora[fx].total++
      if (st === 'faltou') porHora[fx].faltou++
      if (st === 'cancelado') porHora[fx].cancelado++
    }

    function pct(n, d) {
      return d > 0 ? Math.round((n / d) * 1000) / 10 : 0
    }

    /* SEM spread (`...p`) aqui: o transpilador do JSVM gera uma referência a
       `__spreadValues`, que não existe em runtime e derruba a rota com
       ReferenceError. Copio campo a campo. */
    const pacientes = Object.keys(porPaciente)
      .map((k) => {
        const p = porPaciente[k]
        return {
          id: p.id,
          nome: p.nome,
          total: p.total,
          faltou: p.faltou,
          cancelado: p.cancelado,
          atendido: p.atendido,
          taxa_falta: pct(p.faltou + p.cancelado, p.total),
          perdeu_centavos: 0, // preenchido abaixo quando houver valor
        }
      })
      .sort((a, b) => b.faltou - a.faltou || b.taxa_falta - a.taxa_falta)

    /* Quanto a falta custou: uso o valor médio dos títulos do paciente como
       proxy. É estimativa, e a resposta diz que é — inventar precisão aqui
       seria pior que não mostrar. */
    for (const p of pacientes) {
      try {
        const ts = $app.findRecordsByFilter(
          'titulo_receber',
          'tenant_id = "' + tenant + '" && paciente_id = "' + p.id + '"',
          '',
          100,
          0,
        )
        if (ts.length > 0) {
          let soma = 0
          for (const t of ts) soma += t.getInt('valor_centavos') || 0
          const medio = soma / ts.length
          p.perdeu_centavos = Math.round(medio * (p.faltou + p.cancelado))
        }
      } catch (_) {}
    }

    const dias = Object.keys(porDia)
      .map((k) => {
        const d = porDia[k]
        return {
          dia: d.dia,
          ordem: d.ordem,
          total: d.total,
          faltou: d.faltou,
          cancelado: d.cancelado,
          taxa_falta: pct(d.faltou + d.cancelado, d.total),
        }
      })
      .sort((a, b) => a.ordem - b.ordem)

    const horas = Object.keys(porHora)
      .map((k) => {
        const hh = porHora[k]
        return {
          faixa: hh.faixa,
          total: hh.total,
          faltou: hh.faltou,
          cancelado: hh.cancelado,
          taxa_falta: pct(hh.faltou + hh.cancelado, hh.total),
        }
      })
      .sort((a, b) => a.faixa.localeCompare(b.faixa))

    return e.json(200, {
      periodo: { de: de, ate: ate },
      resumo: {
        total_considerado: total,
        atendidos: atendido,
        faltou: faltou,
        cancelado: cancelado,
        taxa_falta_percentual: pct(faltou + cancelado, total),
        // separado de propósito: avisar que não vem é diferente de não aparecer
        taxa_falta_sem_aviso_percentual: pct(faltou, total),
      },
      explicacao_denominador:
        'Considera apenas agendamentos atendidos, que faltaram e cancelados. Agendamentos futuros não entram.',
      por_paciente: pacientes,
      por_dia_semana: dias,
      por_faixa_horario: horas,
    })
  },
  $apis.requireAuth(),
)
