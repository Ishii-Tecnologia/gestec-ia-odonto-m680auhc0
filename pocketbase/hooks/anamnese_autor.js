/* Hook de anamnese — autor e tenant (Etapa 5)

   Separado do hook de versão porque cada arquivo deve cuidar de um assunto:
   aqui é sobre QUEM registra, lá é sobre QUAL versão.

   O autor é fixado a partir do token, nunca do corpo do pedido. Sem isso,
   alguém registraria anamnese "em nome de" outro profissional, e o prontuário
   passaria a mentir sobre quem atestou o histórico do paciente.

   O tenant também vem do token: impede gravar anamnese em nome de outra
   clínica, mesmo que a regra da coleção falhasse. */

onRecordCreateRequest((e) => {
  if (!e.auth) {
    throw new UnauthorizedError('Autenticacao obrigatoria.')
  }

  e.record.set('autor_id', e.auth.id)
  e.record.set('tenant_id', e.auth.getString('tenant_id'))

  return e.next()
}, 'anamnese')
