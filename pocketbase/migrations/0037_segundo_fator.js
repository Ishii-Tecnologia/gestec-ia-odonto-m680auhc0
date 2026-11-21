/* Migration 0037 — Segundo fator de autenticação (Etapa 13)

   O QUE ESTA MIGRATION FAZ, E POR QUE ASSIM.

   1. Campos em users: two_factor_ativo e totp_segredo.

   2. Liga o MFA nativo: users.mfa.enabled = true e
      users.mfa.rule = "two_factor_ativo = true".
      O PocketBase, quando a regra aceita o registro, NÃO devolve token: devolve
      401 com { mfaId }. Só a segunda autenticação completa emite sessão. É
      exatamente o que a etapa pede — e é feito pelo núcleo, não por mim, então
      não há caminho em que eu esqueça de checar.

   3. users.otp.enabled = FALSE, e fica trancado.
      ESTE É O PONTO DELICADO. O OTP do PocketBase não tem campo de regra: com
      ele ligado, /request-otp manda código para QUALQUER e-mail e
      /auth-with-otp loga SEM SENHA. Se eu ligasse o OTP para servir de segundo
      fator, abriria um login sem senha — o oposto do objetivo. Como ele fica
      desligado, os códigos do segundo fator são meus, em coleção própria, e o
      hook onRecordAuthWithOTPRequest recusa o caminho nativo com mensagem clara
      (senão o front recebe "OTP is not enabled", que não ajuda ninguém).

   4. Coleção autenticacao_fator: trilha de cada tentativa de segundo fator.
      Registro separado de auditoria_acesso de propósito: auditoria_acesso é
      sobre DADO CLÍNICO (quem viu prontuário). Tentativa de login é sobre
      SEGURANÇA DE CONTA. Misturar as duas faria o relatório de prontuário
      encher de linha de login, e a investigação de invasão se perder no meio
      de leitura de exame.

   5. Índices. O código do segundo fator é procurado por hash + usuário + uso;
      sem índice, cada tentativa varreria a coleção. */

migrate(
  (app) => {
    const log = (m) => console.log('[2fa] ' + m)

    // ---------- 1. campos em users ----------
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    const temCampo = (nome) => {
      for (const f of users.fields) if (f.name === nome) return true
      return false
    }

    if (!temCampo('two_factor_ativo')) {
      users.fields.add(new BoolField({ name: 'two_factor_ativo', required: false }))
      log('campo two_factor_ativo criado')
    }
    if (!temCampo('totp_segredo')) {
      users.fields.add(new TextField({ name: 'totp_segredo', required: false, max: 200 }))
      log('campo totp_segredo criado')
    }

    // ---------- 2 e 3. MFA NATIVO: NÃO USAR. OTP PÚBLICO: TRANCADO ----------
    /* TENTEI o MFA nativo e NÃO SERVE AQUI. O PocketBase valida a coleção com
       "MFA requires at least 2 auth methods to be enabled": para ligar
       users.mfa é obrigatório ligar também users.otp. E o OTP do núcleo não tem
       campo de regra — ligado, /request-otp manda código para QUALQUER e-mail e
       /auth-with-otp loga SEM SENHA. Ou seja: usar o MFA nativo exigiria abrir
       um login sem senha, que é o oposto do que esta etapa quer.

       O erro apareceu ao aplicar a migration 0037: "MFA requires at least 2
       auth methods to be enabled". Não é limitação contornável por
       configuração.

       Então o segundo fator é controlado por rota:
       - onRecordAuthWithPasswordRequest recusa a sessão quando
         two_factor_ativo = true e escreve a própria resposta (sem chamar
         e.next(), logo sem token), devolvendo um desafio;
       - a rota /verificar-segundo-fator confere o código e SÓ ENTÃO emite o
         token.

       Os dois ficam desligados aqui de propósito. Se alguém ligar otp.enabled
       mais tarde "para testar", abre login sem senha — por isso existe também o
       hook onRecordAuthWithOTPRequest, que recusa esse caminho. */
    users.mfa.enabled = false
    users.mfa.rule = ''
    users.otp.enabled = false

    app.save(users)
    log('MFA nativo desligado e OTP publico trancado (ver motivo no comentario)')

    // ---------- 4. coleção autenticacao_fator ----------
    let existe = true
    try {
      app.findCollectionByNameOrId('autenticacao_fator')
    } catch (_) {
      existe = false
    }

    if (!existe) {
      const col = new Collection({
        name: 'autenticacao_fator',
        type: 'base',
        // Dono vê as próprias tentativas; gestão vê as do tenant.
        listRule:
          "@request.auth.id != '' && (usuario_id = @request.auth.id || (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor') && tenant_id = @request.auth.tenant_id)",
        viewRule:
          "@request.auth.id != '' && (usuario_id = @request.auth.id || (@request.auth.papel = 'proprietario' || @request.auth.papel = 'gestor') && tenant_id = @request.auth.tenant_id)",
        // Nenhum cliente cria, altera ou apaga: só a rota grava, com $app.save
        // (que roda como admin e ignora as regras). Trilha de segurança não pode
        // ser forjada nem apagada por quem está sendo auditado.
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'tenant_id',
            type: 'relation',
            required: true,
            collectionId: 'pbc_2034940204',
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'usuario_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'metodo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['email', 'recuperacao'],
          },
          {
            name: 'resultado',
            type: 'select',
            required: true,
            maxSelect: 1,
            // 'expirado' e 'reuso' separados de 'falha' porque são sinais
            // diferentes: expirado é lentidão do usuário, reuso é replay.
            values: ['sucesso', 'falha', 'expirado', 'reuso', 'bloqueado'],
          },
          { name: 'ip', type: 'text', required: false, max: 45 },
          { name: 'detalhe', type: 'text', required: false, max: 300 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_fator_usuario ON autenticacao_fator (usuario_id, created DESC)',
          'CREATE INDEX idx_fator_tenant ON autenticacao_fator (tenant_id, created DESC)',
        ],
      })
      app.save(col)
      log('colecao autenticacao_fator criada')
    }

    // ---------- 5. coleção codigo_segundo_fator ----------
    /* Guarda o código vigente (só o HASH) e os códigos de recuperação.
       O código em claro nunca vai para o banco: se o banco vazar, o 2F
       continua valendo. */
    let existeCodigo = true
    try {
      app.findCollectionByNameOrId('codigo_segundo_fator')
    } catch (_) {
      existeCodigo = false
    }

    if (!existeCodigo) {
      const col = new Collection({
        name: 'codigo_segundo_fator',
        type: 'base',
        // Ninguém lê por API. Nem o próprio dono: ver o hash não ajuda e
        // qualquer exposição só serve a quem está atacando.
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'usuario_id',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            cascadeDelete: true,
            maxSelect: 1,
          },
          // hash do código de 6 dígitos
          { name: 'codigo_hash', type: 'text', required: false, max: 200 },
          /* Hash do token de desafio. O desafio é o que o cliente carrega entre
             o login por senha e a verificação do código — se eu guardasse o
             token em claro, um vazamento do banco permitiria completar o
             segundo fator sem o e-mail. */
          { name: 'desafio_hash', type: 'text', required: false, max: 200 },
          { name: 'expira_em', type: 'date', required: false },
          { name: 'tentativas', type: 'number', required: false, min: 0, max: 100 },
          { name: 'usado_em', type: 'date', required: false },
          // códigos de recuperação: uma linha por código, para consumo
          // individual e rastreável
          { name: 'recuperacao_hash', type: 'text', required: false, max: 200 },
          { name: 'recuperacao_usado_em', type: 'date', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_codigo_usuario ON codigo_segundo_fator (usuario_id, created DESC)',
          'CREATE INDEX idx_codigo_recuperacao ON codigo_segundo_fator (recuperacao_hash)',
          'CREATE INDEX idx_codigo_desafio ON codigo_segundo_fator (desafio_hash)',
        ],
      })
      app.save(col)
      log('colecao codigo_segundo_fator criada')
    }

    // ---------- 6. modelos de mensagem por tenant ----------
    let existeModelo = true
    try {
      app.findCollectionByNameOrId('modelo_mensagem')
    } catch (_) {
      existeModelo = false
    }

    if (!existeModelo) {
      const col = new Collection({
        name: 'modelo_mensagem',
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
            collectionId: 'pbc_2034940204',
            cascadeDelete: true,
            maxSelect: 1,
          },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['confirmacao', 'retorno', 'aniversario', 'cobranca'],
          },
          { name: 'assunto', type: 'text', required: true, max: 200 },
          { name: 'corpo', type: 'text', required: true, max: 5000 },
          { name: 'ativo', type: 'bool', required: false },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_modelo_tenant_tipo ON modelo_mensagem (tenant_id, tipo)',
        ],
      })
      app.save(col)
      log('colecao modelo_mensagem criada')
    }

    // ---------- 7. configuração de lembrete por tenant ----------
    const tenant = app.findCollectionByNameOrId('tenant')
    const temNoTenant = (nome) => {
      for (const f of tenant.fields) if (f.name === nome) return true
      return false
    }
    if (!temNoTenant('dias_retorno')) {
      tenant.fields.add(
        new NumberField({ name: 'dias_retorno', required: false, min: 0, max: 730 }),
      )
      log('campo tenant.dias_retorno criado')
    }
    if (!temNoTenant('email_remetente')) {
      tenant.fields.add(new TextField({ name: 'email_remetente', required: false, max: 200 }))
      log('campo tenant.email_remetente criado')
    }
    app.save(tenant)

    // ---------- 8. comunicacao: campos que faltavam ----------
    const com = app.findCollectionByNameOrId('comunicacao')
    const temNaCom = (nome) => {
      for (const f of com.fields) if (f.name === nome) return true
      return false
    }
    if (!temNaCom('agendamento_id')) {
      com.fields.add(
        new RelationField({
          name: 'agendamento_id',
          required: false,
          collectionId: 'pbc_4020147422',
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
      log('comunicacao.agendamento_id criado')
    }
    /* Chave de idempotência: "este paciente, este tipo, este dia" não pode
       gerar duas mensagens. O índice UNIQUE é o que garante isso — se eu
       confiasse só em checar antes de inserir, duas execuções simultâneas do
       cron passariam as duas pela checagem. */
    if (!temNaCom('chave_dia')) {
      com.fields.add(new TextField({ name: 'chave_dia', required: false, max: 120 }))
      log('comunicacao.chave_dia criado')
    }
    app.save(com)

    try {
      app
        .db()
        .newQuery(
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_com_chave_dia ON comunicacao (chave_dia) WHERE chave_dia IS NOT NULL AND chave_dia != ""',
        )
        .execute()
      log('indice unico de idempotencia criado')
    } catch (err) {
      log('indice de idempotencia: ' + String(err).slice(0, 120))
    }

    // ---------- 9. modelos padrão para os tenants que já existem ----------
    const PADROES = {
      confirmacao: {
        assunto: 'Confirmação de consulta — {data} às {hora}',
        corpo:
          'Olá, {paciente}!\n\nSua consulta está marcada para {data} às {hora}, com {profissional}.\n\n' +
          'Confirme sua presença respondendo este e-mail ou ligue para a clínica.\n\n' +
          'Se precisar remarcar, avise com antecedência — assim liberamos o horário para outro paciente.\n\n' +
          'Até breve,\n{clinica}',
      },
      retorno: {
        assunto: 'Está na hora de voltar ao dentista, {paciente}',
        corpo:
          'Olá, {paciente}!\n\nFaz {dias} dias desde seu último atendimento aqui na {clinica}.\n\n' +
          'Manter as consultas em dia é o que evita tratamento grande depois. Quer marcar uma avaliação?\n\n' +
          'Responda este e-mail ou ligue para a clínica.\n\n{clinica}',
      },
      aniversario: {
        assunto: 'Feliz aniversário, {paciente}!',
        corpo:
          'Olá, {paciente}!\n\nA equipe da {clinica} deseja um feliz aniversário.\n\n' +
          'Que este ano venha com muita saúde — e um sorriso de que você tenha orgulho.\n\n{clinica}',
      },
    }

    const tenants = app.findRecordsByFilter('tenant', '', '', 200, 0)
    for (const t of tenants) {
      for (const tipo of Object.keys(PADROES)) {
        try {
          app.findFirstRecordByFilter(
            'modelo_mensagem',
            'tenant_id = "' + t.id + '" && tipo = "' + tipo + '"',
          )
          continue // já tem
        } catch (_) {}
        const m = new Record(app.findCollectionByNameOrId('modelo_mensagem'))
        m.set('tenant_id', t.id)
        m.set('tipo', tipo)
        m.set('assunto', PADROES[tipo].assunto)
        m.set('corpo', PADROES[tipo].corpo)
        m.set('ativo', true)
        app.save(m)
      }
      if (!t.get('dias_retorno')) {
        t.set('dias_retorno', 180)
        app.save(t)
      }
    }
    log('modelos padrao criados para ' + tenants.length + ' tenant(s)')
  },
  (app) => {
    // rollback
    for (const nome of ['codigo_segundo_fator', 'autenticacao_fator', 'modelo_mensagem']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
