/* Exportação do prontuário em PDF (Etapa 12)

   GET /backend/v1/prontuario-pdf?paciente_id=X

   Dois requisitos que o critério 2 exige, e o segundo é o que importa:

   1. Gerar o PDF com o conteúdo clínico.
   2. REGISTRAR em `auditoria_acesso` quem exportou e quando.

   O registro não é burocracia. O prontuário é o dado mais sensível do produto e
   a exportação é o momento em que ele SAI do controle do sistema — vira arquivo
   no computador do dentista, anexo de e-mail, pen drive. A trilha é a única
   prova de que aquele dado foi retirado, por quem e sob qual justificativa. Por
   isso a auditoria é gravada ANTES de devolver o arquivo: se falhar, não
   exporta (falhar fechado, não aberto).

   SOBRE A GERAÇÃO: uso pdf-lib via require dentro do callback (o JSVM permite
   npm desde que o require fique no corpo do callback). Monto o PDF à mão porque
   o layout é clínico e precisa ser estável — relatório de prontuário não pode
   mudar de forma a cada versão de biblioteca de template.

   O PDF segue a mesma regra de sigilo da Etapa 7: quem não tem acesso ao
   prontuário recebe 403, e a tentativa vai para a auditoria como negada. */

routerAdd(
  'GET',
  '/backend/v1/prontuario-pdf',
  // `async`: pdf-lib é assíncrona (create/embedFont/save devolvem Promise).
  // Sem o async, o hook nem carrega — o deploy recusa com erro de sintaxe.
  async (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    if (['proprietario', 'gestor', 'dentista'].indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao acessa prontuario.')
    }

    const pacienteId = String(e.request.url.query().get('paciente_id') || '')
    if (!pacienteId) return e.badRequestError('Informe o paciente.')

    function auditar(acao, motivo) {
      try {
        const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
        aud.set('tenant_id', tenant)
        aud.set('usuario_id', e.auth.id)
        aud.set('paciente_id', pacienteId)
        aud.set('acao', acao)
        aud.set('motivo', motivo)
        aud.set('rota', '/backend/v1/prontuario-pdf')
        $app.save(aud)
        return true
      } catch (_) {
        return false
      }
    }

    let paciente
    try {
      paciente = $app.findRecordById('paciente', pacienteId)
    } catch (_) {
      return e.notFoundError('Paciente nao encontrado.')
    }
    if (paciente.getString('tenant_id') !== tenant)
      return e.notFoundError('Paciente nao encontrado.')

    /* ---- mesma regra de sigilo da Etapa 7 ----
       Ser autor de evolução, ou responsável por atendimento, ou ter acesso
       temporário ativo e não expirado. Reimplementado inline porque o JSVM não
       enxerga função de outro arquivo, e a alternativa — exportar sem checar —
       vazaria justamente o dado que a Etapa 7 protege. */
    let autorDeEvolucao = false
    try {
      const minhas = $app.findRecordsByFilter(
        'evolucao',
        'paciente_id = "' + pacienteId + '" && usuario_autor_id = "' + e.auth.id + '"',
        '-created',
        1,
        0,
      )
      autorDeEvolucao = minhas.length > 0
    } catch (_) {}

    let ehResponsavel = false
    if (!autorDeEvolucao) {
      try {
        const vinculos = $app.findRecordsByFilter(
          'usuario_profissional',
          'usuario_id = "' + e.auth.id + '"',
          '',
          50,
          0,
        )
        for (const v of vinculos) {
          const profId = v.getString('profissional_id')
          const ats = $app.findRecordsByFilter(
            'atendimento',
            'paciente_id = "' + pacienteId + '" && profissional_responsavel_id = "' + profId + '"',
            '',
            1,
            0,
          )
          if (ats.length > 0) {
            ehResponsavel = true
            break
          }
        }
      } catch (_) {}
    }

    let acessoTemporario = false
    if (!autorDeEvolucao && !ehResponsavel) {
      try {
        const acessos = $app.findRecordsByFilter(
          'acesso_prontuario',
          'paciente_id = "' +
            pacienteId +
            '" && concedido_para = "' +
            e.auth.id +
            '" && ativo = true',
          '-created',
          20,
          0,
        )
        const agoraTs = Date.now()
        for (const a of acessos) {
          const exp = Date.parse(String(a.getString('expira_em')).replace(' ', 'T'))
          if (!isNaN(exp) && exp > agoraTs) {
            acessoTemporario = true
            break
          }
        }
      } catch (_) {}
    }

    if (!autorDeEvolucao && !ehResponsavel && !acessoTemporario) {
      auditar('tentativa_negada', 'tentou exportar prontuario sem autorizacao')
      return e.forbiddenError(
        'Voce nao tem acesso ao prontuario deste paciente. Peca uma concessao temporaria ao responsavel.',
      )
    }

    // ---- conteúdo ----
    let evolucoes = []
    try {
      evolucoes = $app.findRecordsByFilter(
        'evolucao',
        'paciente_id = "' + pacienteId + '"',
        'created',
        500,
        0,
      )
    } catch (_) {}

    let alertas = []
    try {
      alertas = $app.findRecordsByFilter(
        'alerta_clinico',
        'paciente_id = "' + pacienteId + '" && ativo = true',
        '',
        50,
        0,
      )
    } catch (_) {}

    let odontogramas = []
    try {
      odontogramas = $app.findRecordsByFilter(
        'odontograma_snapshot',
        'paciente_id = "' + pacienteId + '"',
        '-created',
        5,
        0,
      )
    } catch (_) {}

    let tenantRec = null
    try {
      tenantRec = $app.findRecordById('tenant', tenant)
    } catch (_) {}

    /* ---- PDF ----
       require DENTRO do callback, como o guia manda. pdf-lib é pura JS, então
       roda no goja. */
    let bytes = null
    try {
      const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')

      const pdf = await PDFDocument.create()
      const fonte = await pdf.embedFont(StandardFonts.Helvetica)
      const negrito = await pdf.embedFont(StandardFonts.HelveticaBold)

      const A4 = [595.28, 841.89]
      let pagina = pdf.addPage(A4)
      const M = 50
      const LARGURA = A4[0] - M * 2
      let y = A4[1] - M

      function novaPagina() {
        pagina = pdf.addPage(A4)
        y = A4[1] - M
      }
      function precisa(altura) {
        if (y - altura < M) novaPagina()
      }
      function texto(t, opts) {
        const tam = (opts && opts.tam) || 10
        const f = opts && opts.negrito ? negrito : fonte
        const cor = (opts && opts.cor) || rgb(0, 0, 0)
        const linha = String(t === undefined || t === null ? '' : t)
        precisa(tam + 4)
        pagina.drawText(linha, {
          x: M + ((opts && opts.x) || 0),
          y: y,
          size: tam,
          font: f,
          color: cor,
        })
        y -= tam + 4
      }
      function espaco(h) {
        y -= h || 8
      }
      function linhaHorizontal() {
        precisa(10)
        pagina.drawLine({
          start: { x: M, y: y },
          end: { x: M + LARGURA, y: y },
          thickness: 0.5,
          color: rgb(0.75, 0.75, 0.75),
        })
        y -= 10
      }
      /* quebra de linha manual: pdf-lib não quebra sozinho, e texto clínico
         longo sairia da página. Aproximação por largura de caractere é
         suficiente para Helvetica 9-10pt. */
      function paragrafo(t, tam) {
        const tamanho = tam || 9
        const maxChars = Math.floor(LARGURA / (tamanho * 0.5))
        const palavras = String(t || '')
          .replace(/\r/g, '')
          .split(/\s+/)
        let linhaAtual = ''
        for (const p of palavras) {
          const tentativa = linhaAtual ? linhaAtual + ' ' + p : p
          if (tentativa.length > maxChars) {
            precisa(tamanho + 4)
            pagina.drawText(linhaAtual, { x: M, y: y, size: tamanho, font: fonte })
            y -= tamanho + 3
            linhaAtual = p
          } else {
            linhaAtual = tentativa
          }
        }
        if (linhaAtual) {
          precisa(tamanho + 4)
          pagina.drawText(linhaAtual, { x: M, y: y, size: tamanho, font: fonte })
          y -= tamanho + 3
        }
      }
      function dataHora(iso) {
        if (!iso) return '—'
        const d = new Date(String(iso).replace(' ', 'T'))
        if (isNaN(d.getTime())) return String(iso)
        return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      }

      // cabeçalho
      texto(tenantRec ? tenantRec.getString('nome') : 'GesTec-IA-Odonto', {
        tam: 14,
        negrito: true,
      })
      texto('Prontuario odontologico', { tam: 11, negrito: true, cor: rgb(0.3, 0.3, 0.3) })
      espaco(6)
      linhaHorizontal()

      // identificação
      texto('Paciente', { tam: 9, negrito: true })
      texto(paciente.getString('nome'), { tam: 12, negrito: true })
      const nasc = String(paciente.getString('data_nascimento') || '').slice(0, 10)
      const cpf = paciente.getString('cpf')
      const linhasId = []
      if (nasc) {
        const anos = Math.floor((Date.now() - Date.parse(nasc)) / (365.25 * 86400000))
        linhasId.push('Nascimento: ' + nasc.split('-').reverse().join('/') + ' (' + anos + ' anos)')
      }
      if (cpf) linhasId.push('CPF: ' + cpf)
      if (linhasId.length > 0) texto(linhasId.join('    '), { tam: 9, cor: rgb(0.35, 0.35, 0.35) })
      espaco(4)

      // alertas clínicos — em destaque, porque é o que não pode ser esquecido
      if (alertas.length > 0) {
        const caixaAltura = 16 + alertas.length * 13
        precisa(caixaAltura + 10)
        pagina.drawRectangle({
          x: M,
          y: y - caixaAltura + 10,
          width: LARGURA,
          height: caixaAltura,
          color: rgb(1, 0.94, 0.94),
          borderColor: rgb(0.85, 0.3, 0.3),
          borderWidth: 1,
        })
        y -= 4
        texto('ALERTAS CLINICOS', { tam: 9, negrito: true, cor: rgb(0.7, 0.1, 0.1), x: 6 })
        for (const a of alertas) {
          const grav = a.getString('gravidade')
          const desc = a.getString('descricao') || a.getString('tipo') || ''
          texto('  [' + (grav || 'info').toUpperCase() + '] ' + desc, { tam: 8.5, x: 6 })
        }
        y -= 6
      }

      espaco(4)
      linhaHorizontal()

      // evolução
      texto('Evolucao clinica', { tam: 11, negrito: true })
      texto('Registro imutavel, em cadeia de hash. Correcoes sao retificacoes, nunca edicao.', {
        tam: 8,
        cor: rgb(0.4, 0.4, 0.4),
      })
      espaco(4)

      if (evolucoes.length === 0) {
        texto('Nenhum registro clinico.', { tam: 9, cor: rgb(0.4, 0.4, 0.4) })
      } else {
        for (const ev of evolucoes) {
          precisa(50)
          const tipo = ev.getString('tipo') === 'retificacao' ? 'RETIFICACAO' : 'Evolucao'
          texto(tipo + ' — ' + dataHora(ev.getString('created')), { tam: 9, negrito: true })
          const prof = ev.getString('profissional_id')
          if (prof) {
            try {
              const nomeP = $app.findRecordById('profissional', prof).getString('nome')
              texto('Profissional: ' + nomeP, { tam: 8, cor: rgb(0.4, 0.4, 0.4) })
            } catch (_) {}
          }
          paragrafo(ev.getString('texto'), 9)
          if (ev.getString('motivo_retificacao')) {
            texto('Motivo da retificacao: ' + ev.getString('motivo_retificacao'), {
              tam: 8,
              cor: rgb(0.45, 0.45, 0.45),
            })
          }
          const h = ev.getString('hash_registro')
          if (h) texto('Hash: ' + h.slice(0, 32) + '...', { tam: 7, cor: rgb(0.6, 0.6, 0.6) })
          espaco(6)
        }
      }

      // odontograma (último snapshot)
      if (odontogramas.length > 0) {
        linhaHorizontal()
        texto('Odontograma — ultimo registro', { tam: 11, negrito: true })
        texto(dataHora(odontogramas[0].getString('created')), {
          tam: 8,
          cor: rgb(0.4, 0.4, 0.4),
        })
        espaco(4)
        const dentes = odontogramas[0].get('dentes') || {}
        const marcados = Object.keys(dentes).filter(function (k) {
          return dentes[k] && dentes[k] !== 'higido'
        })
        if (marcados.length === 0) {
          texto('Nenhuma alteracao registrada.', { tam: 9, cor: rgb(0.4, 0.4, 0.4) })
        } else {
          const ROT = {
            cariado: 'cariado',
            restaurado: 'restaurado',
            ausente: 'ausente',
            coroa: 'coroa',
            endodontia: 'endo',
            implante: 'implante',
            fratura: 'fratura',
          }
          // agrupa por condição: 18 dentes na mesma linha é ilegível
          const porCond = {}
          for (const d of marcados) {
            const cond = dentes[d]
            if (!porCond[cond]) porCond[cond] = []
            porCond[cond].push(d)
          }
          for (const cond of Object.keys(porCond)) {
            texto((ROT[cond] || cond) + ': ' + porCond[cond].sort().join(', '), { tam: 8.5 })
          }
        }
      }

      // rodapé em todas as páginas
      const totalPag = pdf.getPageCount()
      for (let i = 0; i < totalPag; i++) {
        const pg = pdf.getPage(i)
        pg.drawText(
          'Exportado por ' +
            (e.auth.getString('nome') || e.auth.getString('email') || 'usuario') +
            ' em ' +
            dataHora(new Date().toISOString()) +
            '  ·  pagina ' +
            (i + 1) +
            ' de ' +
            totalPag,
          { x: M, y: 28, size: 7, font: fonte, color: rgb(0.55, 0.55, 0.55) },
        )
      }

      bytes = await pdf.save()
    } catch (err) {
      // falhar a geração não pode passar como sucesso
      auditar('tentativa_negada', 'falha ao gerar PDF: ' + String(err).slice(0, 300))
      return e.badRequestError('Nao foi possivel gerar o PDF: ' + String(err).slice(0, 300))
    }

    /* AUDITORIA ANTES DE ENTREGAR.
       Se o registro falhar, não devolvo o arquivo: falhar fechado. Exportar sem
       trilha é justamente o que a etapa quer impedir. */
    const auditou = auditar(
      'ver_prontuario',
      'EXPORTACAO EM PDF' +
        (acessoTemporario ? ' (acesso temporario)' : ehResponsavel ? ' (responsavel)' : ' (autor)'),
    )
    if (!auditou) {
      return e.badRequestError(
        'Nao foi possivel registrar a exportacao na auditoria; o arquivo nao foi gerado.',
      )
    }

    const nomeArquivo =
      'prontuario-' +
      String(paciente.getString('nome') || 'paciente')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .toLowerCase() +
      '.pdf'

    /* CONVERSÃO PARA BASE64.
       `bytes.toString('base64')` NÃO funciona no goja: o argumento é ignorado e
       o retorno é a lista de bytes separada por vírgula ("37,80,68,70,...").
       O cliente recebia algo que parecia base64 e falhava ao decodificar — o
       PDF existia, o transporte estava errado.

       Aqui leio os bytes um a um e monto o base64 à mão, que é o único caminho
       confiável neste runtime. */
    let base64 = ''
    try {
      const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      const total = bytes.length
      for (let i = 0; i < total; i += 3) {
        const b0 = bytes[i]
        const b1 = i + 1 < total ? bytes[i + 1] : 0
        const b2 = i + 2 < total ? bytes[i + 2] : 0
        base64 += T.charAt(b0 >> 2)
        base64 += T.charAt(((b0 & 3) << 4) | (b1 >> 4))
        base64 += i + 1 < total ? T.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '='
        base64 += i + 2 < total ? T.charAt(b2 & 63) : '='
      }
    } catch (err) {
      return e.badRequestError('PDF gerado, mas falhou codificar: ' + String(err).slice(0, 200))
    }

    return e.json(200, {
      ok: true,
      nome_arquivo: nomeArquivo,
      // base64: o cliente baixa e o registro em auditoria já existe
      pdf_base64: base64,
      pdf_bytes: bytes.length,
      evolucoes: evolucoes.length,
      alertas: alertas.length,
      auditado: true,
    })
  },
  $apis.requireAuth(),
)
