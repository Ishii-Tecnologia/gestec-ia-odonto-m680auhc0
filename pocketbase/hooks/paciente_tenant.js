/* Fecha o vazamento entre clínicas em coleções filhas de paciente (Etapa 5)

   BRECHA ENCONTRADA EM TESTE:
   A regra de acesso só verifica que `tenant_id` do registro é o do usuário.
   Ela NÃO verifica que o `paciente_id` apontado pertence a esse mesmo tenant.
   Resultado comprovado: o proprietário da clínica Beta criou uma anamnese com
   tenant_id da Beta apontando para o paciente da clínica Alfa — versão 3 no
   histórico clínico de um paciente que ele não pode nem ler. O mesmo valia
   para alerta_clinico e responsavel_legal.

   Por que a regra da coleção não resolve: as access rules do PocketBase não
   fazem consulta em outra coleção, então não há como escrever "o paciente
   deste registro é do meu tenant" apenas na regra.

   Solução: hook de validação de MODEL (roda em qualquer $app.save, não só na
   API). Ele compara o tenant do registro com o do paciente e recusa com 400.
   Vale para as três coleções que apontam para paciente.

   Custo: uma leitura a mais por gravação. É barato e o dado é o prontuário —
   vale. */

onRecordValidate(
  (e) => {
    const tenantId = e.record.getString('tenant_id')
    const pacienteId = e.record.getString('paciente_id')

    if (!pacienteId) return e.next()

    let paciente
    try {
      paciente = $app.findRecordById('paciente', pacienteId)
    } catch (_) {
      throw new BadRequestError('Paciente nao encontrado.')
    }

    if (paciente.getString('tenant_id') !== tenantId) {
      throw new BadRequestError('O paciente informado pertence a outra clinica. Registro recusado.')
    }

    return e.next()
  },
  'anamnese',
  'alerta_clinico',
  'responsavel_legal',
)
