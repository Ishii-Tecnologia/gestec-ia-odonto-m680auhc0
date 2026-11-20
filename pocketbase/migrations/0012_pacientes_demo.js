/* Migration 0012 - Pacientes de demonstração (Etapa 5)

   Três pacientes no tenant demo Alfa, para as próximas etapas (agenda,
   prontuário, orçamento) já terem com o que trabalhar:

   - Maria Demo: alergia CRÍTICA (dipirona) — prova a faixa de destaque.
   - João Demo: menor de idade COM responsável legal — prova a regra.
   - Ana Demo: sem alertas, para contrastar.

   Todos marcados pelo tenant demo; saem junto com ele. Idempotente. */

migrate(
  (app) => {
    let alfa
    try {
      alfa = app.findFirstRecordByData('tenant', 'cnpj', '11222333000181')
    } catch (_) {
      return
    }

    const existe = (col, filtro) => {
      try {
        app.findFirstRecordByFilter(col, filtro)
        return true
      } catch (_) {
        return false
      }
    }

    const pacCol = app.findCollectionByNameOrId('paciente')
    const PACIENTES = [
      {
        nome: 'Maria Demo Silva',
        cpf: '11122233344',
        nasc: '1984-03-15 00:00:00.000Z',
        sexo: 'feminino',
        tel: '41988887777',
        email: 'maria.demo@exemplo.local',
      },
      {
        nome: 'João Demo Souza',
        cpf: '22233344455',
        nasc: '2014-08-02 00:00:00.000Z',
        sexo: 'masculino',
        tel: '41977776666',
        email: '',
      },
      {
        nome: 'Ana Demo Costa',
        cpf: '33344455566',
        nasc: '1996-11-27 00:00:00.000Z',
        sexo: 'feminino',
        tel: '41966665555',
        email: 'ana.demo@exemplo.local',
      },
    ]

    const ids = {}

    for (const p of PACIENTES) {
      if (existe('paciente', 'cpf = "' + p.cpf + '" && tenant_id = "' + alfa.id + '"')) {
        try {
          ids[p.cpf] = app.findFirstRecordByFilter(
            'paciente',
            'cpf = "' + p.cpf + '" && tenant_id = "' + alfa.id + '"',
          ).id
        } catch (_) {}
        continue
      }
      const r = new Record(pacCol)
      r.set('tenant_id', alfa.id)
      r.set('nome', p.nome)
      r.set('cpf', p.cpf)
      r.set('data_nascimento', p.nasc)
      r.set('sexo', p.sexo)
      r.set('telefone', p.tel)
      if (p.email) r.set('email', p.email)
      r.set('cidade', 'Curitiba')
      r.set('uf', 'PR')
      r.set('ativo', true)
      app.save(r)
      ids[p.cpf] = r.id
    }

    // alergia critica da Maria
    const alCol = app.findCollectionByNameOrId('alerta_clinico')
    if (ids['11122233344']) {
      const filtro =
        'paciente_id = "' + ids['11122233344'] + '" && descricao = "Alergia a dipirona"'
      if (!existe('alerta_clinico', filtro)) {
        const a = new Record(alCol)
        a.set('tenant_id', alfa.id)
        a.set('paciente_id', ids['11122233344'])
        a.set('tipo', 'alergia')
        a.set('descricao', 'Alergia a dipirona')
        a.set('gravidade', 'critica')
        a.set('ativo', true)
        app.save(a)
      }
      if (
        !existe(
          'alerta_clinico',
          'paciente_id = "' + ids['11122233344'] + '" && descricao = "Hipertensao controlada"',
        )
      ) {
        const b = new Record(alCol)
        b.set('tenant_id', alfa.id)
        b.set('paciente_id', ids['11122233344'])
        b.set('tipo', 'condicao_sistemica')
        b.set('descricao', 'Hipertensao controlada')
        b.set('gravidade', 'media')
        b.set('ativo', true)
        app.save(b)
      }
    }

    // responsavel legal do Joao (menor)
    const respCol = app.findCollectionByNameOrId('responsavel_legal')
    if (ids['22233344455']) {
      const filtro = 'paciente_id = "' + ids['22233344455'] + '"'
      if (!existe('responsavel_legal', filtro)) {
        const rl = new Record(respCol)
        rl.set('tenant_id', alfa.id)
        rl.set('paciente_id', ids['22233344455'])
        rl.set('nome', 'Carla Demo Souza')
        rl.set('cpf', '44455566677')
        rl.set('parentesco', 'mae')
        rl.set('telefone', '41977776666')
        app.save(rl)
      }
    }

    // anamnese v1 da Maria
    const anCol = app.findCollectionByNameOrId('anamnese')
    if (ids['11122233344']) {
      try {
        const autor = app.findAuthRecordByEmail(
          '_pb_users_auth_',
          'alfa.dentista@demo.gestec.local',
        )
        if (!existe('anamnese', 'paciente_id = "' + ids['11122233344'] + '"')) {
          const an = new Record(anCol)
          an.set('tenant_id', alfa.id)
          an.set('paciente_id', ids['11122233344'])
          an.set('versao', 1)
          an.set('autor_id', autor.id)
          an.set('respostas', {
            cardiaca: 'sim, hipertensao controlada',
            diabetes: 'nao',
            coagulacao: 'nao',
            alergia_medicamento: 'dipirona',
            medicamento_uso: 'losartana 50mg',
            cirurgia: 'nao',
            gestante: 'nao',
            fumo_alcool: 'nao',
            ultima_consulta: '2025',
          })
          an.set('observacoes', 'Paciente relata dor ao frio no dente 26.')
          app.save(an)
        }
      } catch (_) {}
    }
  },
  (app) => {
    try {
      app
        .db()
        .newQuery("DELETE FROM paciente WHERE cpf IN ('11122233344','22233344455','33344455566')")
        .execute()
    } catch (_) {}
  },
)
