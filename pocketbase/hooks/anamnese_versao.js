/* Hook de anamnese — versão automática (Etapa 5)

   A anamnese é histórico em versões: criar uma nova NUNCA altera a anterior
   (a coleção recusa update e delete). Mas quem informa o número da versão?

   Se o cliente informasse, duas abas abertas criariam a versão 2 duas vezes:
   a segunda estouraria o índice único ou sobrescreveria. Então o servidor
   atribui: pega a maior versão existente do paciente e soma 1.

   O hook é de MODEL (onRecordCreate), não de request: ele dispara em qualquer
   $app.save() da coleção, inclusive quando outro trecho do servidor gravar.
   Fixar aqui, e não no cliente, é o que impede a versão de ser falsificada. */

onRecordCreate((e) => {
  const pacienteId = e.record.getString('paciente_id')

  // maior versao ja registrada para este paciente.
  // findRecordsByFilter nao aceita parametros ligados: o filtro e montado
  // com o id, que o PocketBase gera em [a-z0-9] (nao vem do usuario).
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

  e.record.set('versao', maior + 1)

  return e.next()
}, 'anamnese')
