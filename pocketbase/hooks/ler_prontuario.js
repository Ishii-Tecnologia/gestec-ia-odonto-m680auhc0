/* Rota de leitura do prontuário (Etapa 7) — o sigilo mora aqui

   GET /backend/v1/prontuario?paciente_id=xxx

   Por que a leitura NÃO pode ficar só na regra da coleção:
   a regra de `evolucao` é `usuario_autor_id = @request.auth.id`. Ela resolve
   o caso "só o autor lê", mas não consegue expressar "ou quando existe um
   acesso_prontuario ativo e não expirado deste paciente" — regra do
   PocketBase não faz consulta em outra coleção nem compara data com "agora".

   Então o acesso temporário é validado AQUI, a cada leitura. Consequência
   importante e deliberada: expirado o prazo, a leitura deixa de acontecer
   mesmo que a linha em acesso_prontuario continue com ativo = true. Não
   dependo de alguém lembrar de desativar.

   Toda abertura grava em auditoria_acesso, incluindo a negada: tentativa de
   ler prontuário alheio é informação de segurança, não ruído. */

routerAdd(
  'GET',
  '/backend/v1/prontuario',
  (e) => {
    if (e.hasSuperuserAuth()) return e.forbiddenError('Use o painel do Skip para manutencao.')
    if (!e.auth) return e.unauthorizedError('Autenticacao obrigatoria.')

    const tenant = e.auth.getString('tenant_id')
    const papel = e.auth.getString('papel')
    const CLINICOS = ['proprietario', 'gestor', 'dentista']
    if (CLINICOS.indexOf(papel) < 0) {
      return e.forbiddenError('Seu perfil nao tem acesso a prontuario.')
    }

    const pacienteId = String(e.request.url.query().get('paciente_id') || '')
    if (!pacienteId) return e.badRequestError('Informe o paciente.')

    let pac
    try {
      pac = $app.findRecordById('paciente', pacienteId)
    } catch (_) {
      return e.notFoundError('Paciente nao encontrado.')
    }
    if (pac.getString('tenant_id') !== tenant) {
      return e.notFoundError('Paciente nao encontrado.')
    }

    // ---- por qual título este usuário pode ler? ----
    // 1) é autor de alguma evolução do paciente (o responsável)
    let autor = false
    try {
      const minhas = $app.findRecordsByFilter(
        'evolucao',
        'paciente_id = "' + pacienteId + '" && usuario_autor_id = "' + e.auth.id + '"',
        '-created',
        1,
        0,
      )
      autor = minhas.length > 0
    } catch (_) {}

    // 2) ou é responsável por algum atendimento do paciente
    let responsavel = false
    if (!autor) {
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
            responsavel = true
            break
          }
        }
      } catch (_) {}
    }

    // 3) ou tem acesso temporário ATIVO e NÃO EXPIRADO
    let acessoId = ''
    if (!autor && !responsavel) {
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
        const agora = Date.now()
        for (const a of acessos) {
          const expira = Date.parse(String(a.getString('expira_em')).replace(' ', 'T'))
          if (!isNaN(expira) && expira > agora) {
            acessoId = a.id
            break
          }
        }
      } catch (_) {}
    }

    function auditar(acao, motivo) {
      try {
        const aud = new Record($app.findCollectionByNameOrId('auditoria_acesso'))
        aud.set('tenant_id', tenant)
        aud.set('usuario_id', e.auth.id)
        aud.set('paciente_id', pacienteId)
        aud.set('acao', acao)
        aud.set('motivo', motivo)
        aud.set('rota', '/backend/v1/prontuario')
        $app.save(aud)
      } catch (_) {}
    }

    if (!autor && !responsavel && !acessoId) {
      auditar('tentativa_negada', 'tentou abrir prontuario sem autorizacao')
      return e.forbiddenError(
        'Voce nao tem acesso ao prontuario deste paciente. Peca ao responsavel uma concessao temporaria.',
      )
    }

    // ---- entrega ----
    // O conteúdo integral (evoluções + odontograma) só para quem é autor ou
    // responsável. Acesso temporário recebe o mesmo conteúdo por definição do
    // plano ("com acesso temporário ativo, B lê"), então não filtro por autor.
    let evolucoes = []
    try {
      const lista = $app.findRecordsByFilter(
        'evolucao',
        'paciente_id = "' + pacienteId + '"',
        'created',
        500,
        0,
      )
      evolucoes = lista.map((r) => ({
        id: r.id,
        texto: r.getString('texto'),
        tipo: r.getString('tipo'),
        motivo_retificacao: r.getString('motivo_retificacao'),
        referencia_evolucao_id: r.getString('referencia_evolucao_id'),
        hash_anterior: r.getString('hash_anterior'),
        hash_registro: r.getString('hash_registro'),
        profissional_id: r.getString('profissional_id'),
        autor_id: r.getString('usuario_autor_id'),
        atendimento_id: r.getString('atendimento_id'),
        created: r.getString('created'),
      }))
    } catch (_) {}

    let odontogramas = []
    try {
      const lista = $app.findRecordsByFilter(
        'odontograma_snapshot',
        'paciente_id = "' + pacienteId + '"',
        'created',
        200,
        0,
      )
      odontogramas = lista.map((r) => ({
        id: r.id,
        dentes: r.get('dentes') || [],
        denticao: r.getString('denticao'),
        profissional_id: r.getString('profissional_id'),
        autor_id: r.getString('usuario_autor_id'),
        atendimento_id: r.getString('atendimento_id'),
        created: r.getString('created'),
      }))
    } catch (_) {}

    let resumo = null
    try {
      const lista = $app.findRecordsByFilter(
        'resumo_compartilhavel',
        'paciente_id = "' + pacienteId + '"',
        '',
        1,
        0,
      )
      if (lista.length > 0) {
        resumo = {
          id: lista[0].id,
          conteudo: lista[0].getString('conteudo'),
          revisado_em: lista[0].getString('revisado_em'),
        }
      }
    } catch (_) {}

    auditar(
      'ver_prontuario',
      autor
        ? 'autor do registro'
        : responsavel
          ? 'profissional responsavel'
          : 'acesso temporario ' + acessoId,
    )

    return e.json(200, {
      paciente: { id: pac.id, nome: pac.getString('nome') },
      titulo: autor ? 'autor' : responsavel ? 'responsavel' : 'temporario',
      evolucoes: evolucoes,
      odontogramas: odontogramas,
      resumo: resumo,
    })
  },
  $apis.requireAuth(),
)
