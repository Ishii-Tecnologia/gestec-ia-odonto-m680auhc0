/* Tradução de erros da API para linguagem de quem usa (pendência P3)

   O PROBLEMA, visto na auditoria: a tela de cadastro mostrava
   "Failed to create record." — a mensagem do PocketBase quando a validação
   falha e ele não sabe dizer qual campo. Quem está no balcão lê isso e não tem
   o que fazer: não sabe se foi CPF repetido, campo vazio, ou o sistema fora.

   A REGRA DESTE ARQUIVO: a mensagem tem de dizer (a) o que está errado e
   (b) o que fazer agora. "Erro ao salvar" não cumpre nenhuma das duas.

   MANTENHO O ORIGINAL AO LADO quando traduzo. Esconder o texto técnico
   completamente torna o suporte impossível: quando o cliente liga, ele precisa
   poder ditar o que viu, e eu preciso reconhecer. */

import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

/* Nomes técnicos de campo → nome que a pessoa vê na tela. */
const NOME_CAMPO: Record<string, string> = {
  nome: 'Nome',
  cpf: 'CPF',
  email: 'E-mail',
  telefone: 'Telefone',
  data_nascimento: 'Data de nascimento',
  tenant_id: 'Clínica',
  paciente_id: 'Paciente',
  profissional_id: 'Profissional',
  profissional_executante_id: 'Profissional executante',
  sala_id: 'Sala',
  unidade_id: 'Unidade',
  agendamento_id: 'Agendamento',
  procedimento_id: 'Procedimento',
  valor_centavos: 'Valor',
  valor_unitario_centavos: 'Valor do item',
  data_competencia: 'Data de competência',
  vencimento: 'Vencimento',
  data_pagamento: 'Data do pagamento',
  plano_contas_id: 'Categoria contábil',
  forma_pagamento_id: 'Forma de pagamento',
  centro_custo_id: 'Centro de custo',
  inicio: 'Início',
  fim: 'Fim',
  duracao_minutos: 'Duração',
  texto: 'Texto',
  titulo: 'Título',
  senha: 'Senha',
  password: 'Senha',
  codigo: 'Código',
  descricao: 'Descrição',
  tipo: 'Tipo',
  status: 'Status',
}

/* Código de validação do PocketBase → frase útil. */
const CODIGO_VALIDACAO: Record<string, string> = {
  validation_not_unique: 'já está cadastrado',
  validation_invalid_email: 'não é um e-mail válido',
  validation_required: 'é obrigatório',
  validation_min_text_constraint: 'está curto demais',
  validation_max_text_constraint: 'está longo demais',
  validation_min_select_constraint: 'precisa de uma opção escolhida',
  validation_invalid_format: 'está em formato inválido',
  validation_missing_rel_records: 'aponta para um registro que não existe',
  validation_not_in_values: 'tem um valor não permitido',
  validation_min_number_constraint: 'é menor que o mínimo',
  validation_max_number_constraint: 'é maior que o máximo',
}

function nomeDe(campo: string): string {
  return NOME_CAMPO[campo] || campo.replace(/_/g, ' ')
}

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      const d = detail as { message: string; code?: string }
      const codigo = d.code || ''
      const frase = CODIGO_VALIDACAO[codigo]
      // "CPF já está cadastrado" em vez de "Value must be unique."
      errors[field] = frase ? `${nomeDe(field)} ${frase}.` : `${nomeDe(field)}: ${d.message}`
    }
  }
  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.'
  }

  // 1. mensagem por campo (a mais útil)
  const campos = extractFieldErrors(error)
  const valores = Object.values(campos)
  if (valores.length > 0) return valores.join(' ')

  const msg = (error.message || '').trim()
  const status = error.status

  /* 2. mensagens genéricas do PocketBase que aparecem na tela com frequência.
     Cada uma tem um "o que fazer" — a frase original não tem. */
  if (/failed to create record/i.test(msg)) {
    return 'Não foi possível cadastrar: algum campo está inválido ou duplicado. Confira os dados e tente de novo. (Se o CPF já existe nesta clínica, abra o cadastro existente.)'
  }
  if (/failed to update record/i.test(msg)) {
    return 'Não foi possível salvar as alterações. Confira os campos e tente de novo.'
  }
  if (/failed to authenticate|invalid login credentials/i.test(msg)) {
    return 'E-mail ou senha incorretos.'
  }
  if (/too many requests/i.test(msg)) {
    return 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.'
  }
  /* Token de redefinição de senha. Aparece quando o link do e-mail vence (a
     plataforma dá 1h) ou já foi usado uma vez. A mensagem original é
     "Invalid or expired token." — em inglês, e sem dizer o que fazer. Quem cai
     aqui é alguém que perdeu a senha; precisa de instrução, não de diagnóstico. */
  if (/invalid or expired token/i.test(msg)) {
    return 'Este link expirou ou já foi usado. Volte à tela de entrada, clique em "Esqueci minha senha" e peça um link novo — ele vale por 1 hora.'
  }
  /* Confirmação de e-mail em link próprio. O PocketBase valida o token do
     contato; se houver regra que o recuse, a mensagem fica crua em inglês. */
  if (/token is invalid/i.test(msg) || /invalid token/i.test(msg)) {
    return 'O link não é mais válido. Peça um novo ou entre com a sua senha.'
  }
  if (/the requested resource wasn't found/i.test(msg) || status === 404) {
    return 'Este registro não existe mais ou você não tem acesso a ele.'
  }
  if (/only superusers/i.test(msg)) {
    return 'Esta ação é restrita à administração da plataforma.'
  }
  if (/email rate limit exceeded/i.test(msg)) {
    return 'Limite de e-mails por hora atingido. Os códigos e lembretes voltam a sair na próxima hora.'
  }
  if (status === 401) return 'Sua sessão expirou. Entre novamente.'
  if (status === 403) return msg || 'Seu perfil não tem permissão para esta ação.'
  if (status === 0 || /fetch failed|network/i.test(msg)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
  }

  /* 3. mensagem do próprio sistema (as rotas escrevem texto em português) ou,
     em último caso, a original. Nunca invento uma frase vaga: se é a original,
     fica visível para poder ser ditada ao suporte. */
  return msg || 'Não foi possível concluir. Tente novamente.'
}
