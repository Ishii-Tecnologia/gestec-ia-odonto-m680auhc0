/* Migration 0005 - Alinhamento da Etapa 3 ao plano consolidado

   A 0003 e a 0004 entregaram o essencial, mas ficaram devendo itens que o
   plano (07-plano-de-execucao-consolidado.md, Etapa 3) exige. Esta migration
   fecha a diferença, sem recriar o que já funciona:

   1. profissional: tipo_vinculo + percentual_repasse (os três modelos de
      remuneração da mesma clínica: assalariado, comissionado, locatário, sócio).
   2. sala.tipo: valores alinhados ao plano (consultorio|raio_x|esterilizacao).
      Os registros existentes com 'cadeira' passam a 'consultorio'.
   3. usuario_profissional: vínculo usuário <-> profissional, separado do
      profissional, porque um profissional pode não ter login e um login pode
      não ser profissional.
   4. profissional_especialidade: o detalhe do título (instituição, data de
      registro no CRO). A relação `profissional.especialidades` continua sendo
      a fonte de verdade para PERMITIR/NEGAR, porque ela trava maxSelect = 2 e
      o art. 39 §1 da Consolidação veda mais de duas especialidades por
      cirurgião-dentista: a regra fica no schema, não só no código.
   5. especialidade: norma_origem e vigente (nomes do plano).
   6. tenant_modulo: valor_mensal_centavos.
   7. unidade: horario_abertura / horario_fechamento.

   Cada passo é idempotente: checa antes de criar ou alterar. */

migrate(
  (app) => {
    const temCampo = (col, nome) => !!col.fields.getByName(nome)

    // ---------- 1 e 2: profissional e sala ----------
    const prof = app.findCollectionByNameOrId('profissional')
    if (!temCampo(prof, 'tipo_vinculo')) {
      prof.fields.add(
        new SelectField({
          name: 'tipo_vinculo',
          values: ['assalariado', 'comissionado', 'locatario', 'socio'],
          maxSelect: 1,
        }),
      )
    }
    if (!temCampo(prof, 'percentual_repasse')) {
      prof.fields.add(new NumberField({ name: 'percentual_repasse', min: 0, max: 100 }))
    }
    app.save(prof)

    // 'cadeira' não está nos valores do plano: normaliza antes de trocar a lista
    app.db().newQuery("UPDATE sala SET tipo = 'consultorio' WHERE tipo = 'cadeira'").execute()

    const sala = app.findCollectionByNameOrId('sala')
    const campoTipo = sala.fields.getByName('tipo')
    if (campoTipo) {
      campoTipo.values = ['consultorio', 'raio_x', 'esterilizacao']
      app.save(sala)
    }

    // ---------- 7: unidade com horário ----------
    const uni = app.findCollectionByNameOrId('unidade')
    if (!temCampo(uni, 'horario_abertura')) {
      uni.fields.add(new TextField({ name: 'horario_abertura', max: 5 }))
    }
    if (!temCampo(uni, 'horario_fechamento')) {
      uni.fields.add(new TextField({ name: 'horario_fechamento', max: 5 }))
    }
    app.save(uni)

    // ---------- 5: especialidade ----------
    const esp = app.findCollectionByNameOrId('especialidade')
    if (!temCampo(esp, 'norma_origem')) {
      esp.fields.add(new TextField({ name: 'norma_origem' }))
    }
    if (!temCampo(esp, 'vigente')) {
      esp.fields.add(new BoolField({ name: 'vigente' }))
    }
    app.save(esp)

    // copia os valores antigos para os campos novos
    app
      .db()
      .newQuery(
        "UPDATE especialidade SET norma_origem = norma WHERE (norma_origem IS NULL OR norma_origem = '')",
      )
      .execute()
    app.db().newQuery('UPDATE especialidade SET vigente = ativa WHERE vigente IS NULL').execute()

    // remove os antigos para não ter duas fontes de verdade
    ;['norma', 'ativa'].forEach((nome) => {
      if (temCampo(esp, nome)) esp.fields.removeByName(nome)
    })
    app.save(esp)

    // ---------- 6: tenant_modulo ----------
    const tm = app.findCollectionByNameOrId('tenant_modulo')
    if (!temCampo(tm, 'valor_mensal_centavos')) {
      tm.fields.add(new NumberField({ name: 'valor_mensal_centavos' }))
    }
    app.save(tm)
    app
      .db()
      .newQuery(
        'UPDATE tenant_modulo SET valor_mensal_centavos = preco_centavos WHERE valor_mensal_centavos IS NULL',
      )
      .execute()
    if (temCampo(tm, 'preco_centavos')) {
      tm.fields.removeByName('preco_centavos')
      app.save(tm)
    }

    // ---------- 3: usuario_profissional ----------
    const tenantId = app.findCollectionByNameOrId('tenant').id
    const profId = app.findCollectionByNameOrId('profissional').id

    let up
    try {
      up = app.findCollectionByNameOrId('usuario_profissional')
    } catch (_) {
      up = new Collection({
        name: 'usuario_profissional',
        type: 'base',
        listRule: "@request.auth.id != '' && tenant_id = @request.auth.tenant_id",
        viewRule: "@request.auth.id != '' && tenant_id = @request.auth.tenant_id",
        createRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        updateRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        deleteRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && @request.auth.papel = 'proprietario'",
        fields: [
          {
            name: 'tenant_id',
            type: 'relation',
            required: true,
            collectionId: tenantId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'usuario_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'profissional_id',
            type: 'relation',
            required: true,
            collectionId: profId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          { name: 'principal', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_usuario_profissional ON usuario_profissional (tenant_id, usuario_id, profissional_id)',
        ],
      })
      app.save(up)
    }

    // ---------- 4: profissional_especialidade ----------
    const espId = app.findCollectionByNameOrId('especialidade').id
    let pe
    try {
      pe = app.findCollectionByNameOrId('profissional_especialidade')
    } catch (_) {
      pe = new Collection({
        name: 'profissional_especialidade',
        type: 'base',
        listRule: "@request.auth.id != '' && tenant_id = @request.auth.tenant_id",
        viewRule: "@request.auth.id != '' && tenant_id = @request.auth.tenant_id",
        createRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        updateRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor')",
        deleteRule:
          "@request.auth.id != '' && tenant_id = @request.auth.tenant_id && @request.auth.papel = 'proprietario'",
        fields: [
          {
            name: 'tenant_id',
            type: 'relation',
            required: true,
            collectionId: tenantId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'profissional_id',
            type: 'relation',
            required: true,
            collectionId: profId,
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            name: 'especialidade_id',
            type: 'relation',
            required: true,
            collectionId: espId,
            maxSelect: 1,
            cascadeDelete: false,
          },
          { name: 'instituicao', type: 'text', max: 200 },
          { name: 'data_registro_cro', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_prof_esp ON profissional_especialidade (profissional_id, especialidade_id)',
        ],
      })
      app.save(pe)
    }

    // índices auxiliares
    ;[
      'CREATE INDEX IF NOT EXISTS idx_usuario_profissional_tenant ON usuario_profissional (tenant_id)',
      'CREATE INDEX IF NOT EXISTS idx_prof_esp_tenant ON profissional_especialidade (tenant_id)',
    ].forEach((sql) => app.db().newQuery(sql).execute())

    // ---------- dados do piloto: vínculo e detalhe das especialidades ----------
    const profs = app.findRecordsByFilter('profissional', "cro_uf = 'PR'", '', 50, 0)
    for (const p of profs) {
      const ids = p.get('especialidades') || []
      for (const espRecordId of ids) {
        let jaExiste = false
        try {
          app.findFirstRecordByFilter(
            'profissional_especialidade',
            `profissional_id = "${p.id}" && especialidade_id = "${espRecordId}"`,
          )
          jaExiste = true
        } catch (_) {}
        if (jaExiste) continue
        const r = new Record(app.findCollectionByNameOrId('profissional_especialidade'))
        r.set('tenant_id', p.getString('tenant_id'))
        r.set('profissional_id', p.id)
        r.set('especialidade_id', espRecordId)
        app.save(r)
      }
    }

    // tipo de vínculo padrão do piloto (comissionado é o mais comum em clínica)
    app
      .db()
      .newQuery(
        "UPDATE profissional SET tipo_vinculo = 'comissionado' WHERE tipo_vinculo IS NULL OR tipo_vinculo = ''",
      )
      .execute()

    // horário da unidade do piloto
    app
      .db()
      .newQuery("UPDATE unidade SET horario_abertura = '08:00' WHERE horario_abertura IS NULL")
      .execute()
    app
      .db()
      .newQuery("UPDATE unidade SET horario_fechamento = '18:00' WHERE horario_fechamento IS NULL")
      .execute()
  },
  (app) => {
    ;['profissional_especialidade', 'usuario_profissional'].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n))
      } catch (_) {}
    })
  },
)
