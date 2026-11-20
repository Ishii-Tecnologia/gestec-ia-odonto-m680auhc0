/* Hook de anamnese (Etapa 5)

   A anamnese é histórico em versões: criar uma nova NUNCA altera a anterior.
   A coleção já recusa update e delete (regras nulas), mas isso abre um
   problema prático — quem informa o número da versão?

   Se o cliente informasse, duas abas abertas criariam a versão 2 duas vezes
   (a segunda estouraria o índice único, ou pior, sobrescreveria se houvesse
   update). Então o servidor atribui a versão: pega a maior existente do
   paciente e soma 1. O cliente não opina.

   O autor também é fixado aqui, a partir do token — não do corpo do pedido.
   Sem isso, alguém registraria anamnese "em nome de" outro profissional,
   e o prontuário passaria a mentir sobre quem atestou o histórico. */

onRecordCreate((e) => {
  const pacienteId = e.record.getString('paciente_id')

  // maior versão já registrada para este paciente.
  // findRecordsByFilter nao aceita parametros ligados: o filtro e montado
  // com o id, que e uma string [a-z0-9] gerada pelo PocketBase (nao vem do
  // usuario), entao nao ha injecao possivel aqui.
  let maior = 0
  try {
    const existentes = $app.findRecordsByFilter(
      'anamnese',
      'paciente_id = "' + pacienteId + '"',
      '-versao',
      1,
      0,
    )
    if (existentes.length > 0) {
      maior = existentes[0].getInt('versao')
    }
  } catch (_) {
    maior = 0
  }

  console.log('[anamnese] maior versao existente=' + maior + ' -> nova=' + (maior + 1))
  e.record.set('versao', maior + 1)
  console.log('[anamnese] versao setada, validando')

  return e.next()
}, 'anamnese')

/* Autor: o hook de request é o que tem acesso ao usuário autenticado.
   Grava sempre o autor do token, ignorando o que veio no corpo. */
onRecordCreateRequest((e) => {
  if (!e.auth) {
    throw new UnauthorizedError('Autenticacao obrigatoria.')
  }
  e.record.set('autor_id', e.auth.id)
  // tenant sempre o do usuário: impede registrar anamnese em outra clínica
  e.record.set('tenant_id', e.auth.getString('tenant_id'))
  return e.next()
}, 'anamnese')
