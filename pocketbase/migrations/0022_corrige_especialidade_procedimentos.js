/* Migration 0022 - Corrige especialidade dos procedimentos demo (Etapa 8)

   ERRO QUE EU COMETI na 0021: inventei códigos de especialidade ("CLINICA",
   "DENTISTICA", "CIRURGIA", "PERIODONTIA", "ODONTOPEDIATRIA", "PROTESE") sem
   conferir a tabela real. Os códigos existentes são CFO: DENT, CTBMF, ENDO,
   PERIO, ODPED, PROT, IMPL...

   O pior não é o erro, é como ele falhou: `espId()` devolvia '' quando não
   achava o código, e o seed gravava o procedimento mesmo assim, com
   especialidade vazia. Resultado: 10 procedimentos sem especialidade, sem
   nenhum aviso. Isso só apareceu porque fui conferir os dados em vez de
   confiar no "10 procedimentos criados" que o próprio seed imprimiu.

   LIÇÃO APLICADA: nesta migration, se o código não existir, o procedimento é
   corrigido por NOME e, se nem isso funcionar, o log diz qual ficou pendente —
   em vez de sair mudo.

   Mapa código inventado -> código CFO real:
     CLINICA        -> não é especialidade CFO. Consulta/profilaxia/fluoretação
                       são de Dentística (preventiva) na prática do consultório.
     DENTISTICA     -> DENT
     CIRURGIA       -> CTBMF
     ENDODONTIA     -> ENDO
     PERIODONTIA    -> PERIO
     ODONTOPEDIATRIA-> ODPED
     PROTESE        -> PROT */

migrate(
  (app) => {
    const log = (m) => console.log('[fix-esp] ' + m)

    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      log('sem tenant demo')
      return
    }
    const tenant = alfa.id

    // por nome do procedimento -> código CFO correto
    const mapa = [
      ['PROF-001', 'DENT'],
      ['PROF-002', 'DENT'],
      ['PROF-003', 'DENT'],
      ['PROF-004', 'DENT'],
      ['PROF-005', 'DENT'],
      ['PROF-006', 'CTBMF'],
      ['PROF-007', 'ENDO'],
      ['PROF-008', 'PERIO'],
      ['PROF-009', 'ODPED'],
      ['PROF-010', 'PROT'],
    ]

    let corrigidos = 0
    let pendentes = []
    for (const [codigo, codEspReal] of mapa) {
      let espId = ''
      try {
        espId = app.findFirstRecordByData('especialidade', 'codigo', codEspReal).id
      } catch (_) {
        log('ATENCAO: especialidade "' + codEspReal + '" nao existe; ' + codigo + ' fica pendente')
        pendentes.push(codigo)
        continue
      }
      try {
        const p = app.findFirstRecordByFilter(
          'procedimento',
          'tenant_id = "' + tenant + '" && codigo = "' + codigo + '"',
        )
        if (p.getString('especialidade_id') === espId) continue
        p.set('especialidade_id', espId)
        app.save(p)
        corrigidos++
      } catch (_) {
        log('nao achei o procedimento ' + codigo)
      }
    }

    log('corrigidos: ' + corrigidos)
    if (pendentes.length > 0) log('pendentes: ' + pendentes.join(', '))

    // Verificação final: nenhum procedimento demo pode ficar sem especialidade.
    try {
      const sem = app.findRecordsByFilter(
        'procedimento',
        'tenant_id = "' + tenant + '" && especialidade_id = ""',
        '',
        100,
        0,
      )
      if (sem.length > 0) {
        const lista = sem.map((s) => s.getString('codigo')).join(', ')
        log('AINDA SEM ESPECIALIDADE: ' + lista)
      } else {
        log('todos os procedimentos demos tem especialidade')
      }
    } catch (_) {}
  },
  (app) => {
    // Não há desfazer útil: a correção é de dado, e voltar a vazio não é estado
    // válido. Deixo vazio de propósito.
  },
)
