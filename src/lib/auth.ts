/* Autenticação e autorização (Etapa 4 · segundo fator na Etapa 13)

   Tudo que decide "quem pode o quê" fica aqui, num lugar só. As regras da API do
   PocketBase continuam sendo a barreira real (o front não é confiável).

   MUDANÇA DA ETAPA 13 — login em duas etapas.
   O hook do servidor (segundo_fator_login.js) recusa a sessão quando a conta tem
   `two_factor_ativo` e devolve `{ segundo_fator: true, desafio }`. Por isso
   `entrar` deixou de usar `pb.collection('users').authWithPassword`: o SDK
   espera `{token, record}` e gravaria uma sessão SEM token, deixando a pessoa
   "logada" e sem acesso a nada. Aqui a chamada é manual, para ler a resposta
   como ela é.

   ORDEM IMPORTA: só `pb.authStore.save` DEPOIS que o token existe de fato. Nunca
   marcar sessão antes do segundo fator — seria aceitar a senha como suficiente,
   que é exatamente o que a etapa quer impedir. */

import type { RecordModel } from 'pocketbase'
import pb from '@/lib/pocketbase/client'

export type Papel = 'proprietario' | 'gestor' | 'dentista' | 'recepcao' | 'financeiro'

export const PAPEIS: Array<{ valor: Papel; rotulo: string; descricao: string }> = [
  {
    valor: 'proprietario',
    rotulo: 'Proprietário',
    descricao: 'Acesso total, incluindo financeiro e auditoria.',
  },
  {
    valor: 'gestor',
    rotulo: 'Gestor',
    descricao: 'Administra a clínica, a equipe e vê a auditoria.',
  },
  {
    valor: 'dentista',
    rotulo: 'Dentista',
    descricao: 'Vê a própria agenda e o prontuário dos próprios pacientes.',
  },
  {
    valor: 'recepcao',
    rotulo: 'Recepção',
    descricao: 'Agenda e cadastro. Sem acesso a prontuário.',
  },
  {
    valor: 'financeiro',
    rotulo: 'Financeiro',
    descricao: 'Contas e faturamento. Sem acesso a prontuário.',
  },
]

/* Rotas consideradas clínicas: expõem dado de saúde. */
export const ROTAS_CLINICAS = ['/prontuario', '/odontograma', '/paciente']

export const PAPEIS_CLINICOS: Papel[] = ['proprietario', 'gestor', 'dentista']
export const PAPEIS_GESTAO: Papel[] = ['proprietario', 'gestor']

/* Papéis para os quais o segundo fator é OBRIGATÓRIO (quem lê prontuário).
   Espelha a decisão do servidor: em segundo_fator_gestao.js o desligamento é
   recusado para estes papéis. Duplicado de propósito — o front só evita mostrar
   um botão que o servidor vai negar; a regra real é a do servidor. */
export const PAPEIS_COM_2FA_OBRIGATORIO: Papel[] = ['proprietario', 'gestor', 'dentista']

export interface Sessao {
  id: string
  nome: string
  email: string
  papel: Papel | ''
  tenantId: string
  ativo: boolean
  precisaTrocarSenha: boolean
  twoFactorAtivo: boolean
}

/** Converte o registro autenticado em uma sessão tipada. */
export function sessaoDoRegistro(r: RecordModel | null): Sessao | null {
  if (!r) return null
  return {
    id: r.id,
    nome: (r.nome as string) || (r.name as string) || r.email || '',
    email: r.email || '',
    papel: ((r.papel as Papel) || '') as Papel | '',
    tenantId: (r.tenant_id as string) || '',
    ativo: r.ativo !== false,
    precisaTrocarSenha: r.precisa_trocar_senha === true,
    twoFactorAtivo: r.two_factor_ativo === true,
  }
}

export function sessaoAtual(): Sessao | null {
  return sessaoDoRegistro(pb.authStore.record)
}

export function estaAutenticado(): boolean {
  return pb.authStore.isValid && !!pb.authStore.record
}

export function podeAcessarClinico(papel: Papel | ''): boolean {
  return PAPEIS_CLINICOS.indexOf(papel as Papel) >= 0
}

export function podeGerenciarUsuarios(papel: Papel | ''): boolean {
  return papel === 'proprietario' || papel === 'gestor'
}

export function podeVerAuditoria(papel: Papel | ''): boolean {
  return papel === 'proprietario' || papel === 'gestor'
}

export function rotuloPapel(papel: Papel | ''): string {
  const achado = PAPEIS.find((p) => p.valor === papel)
  return achado ? achado.rotulo : '—'
}

/** Resultado do primeiro passo do login. */
export type ResultadoEntrada =
  | { tipo: 'sessao'; sessao: Sessao }
  | { tipo: 'segundo_fator'; desafio: string; destino: string; mensagem: string }

/** Primeiro passo: e-mail e senha.
 *  Devolve sessão pronta (conta sem 2FA) ou desafio (conta com 2FA). */
export async function entrar(email: string, senha: string): Promise<ResultadoEntrada> {
  const resp = await pb.send('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: email.trim().toLowerCase(), password: senha },
  })

  // conta com segundo fator: o servidor recusou a sessão de propósito
  if (resp && resp.segundo_fator === true) {
    return {
      tipo: 'segundo_fator',
      desafio: String(resp.desafio || ''),
      destino: String(resp.destino || ''),
      mensagem: String(resp.mensagem || 'Enviamos um código para o seu e-mail.'),
    }
  }

  if (!resp || !resp.token) {
    throw new Error('Não foi possível iniciar a sessão.')
  }

  pb.authStore.save(resp.token, resp.record as RecordModel)
  const sessao = sessaoDoRegistro(resp.record as RecordModel)
  if (!sessao) throw new Error('Não foi possível iniciar a sessão.')
  if (!sessao.ativo) {
    pb.authStore.clear()
    throw new Error('Conta desativada. Procure o responsável pela clínica.')
  }
  return { tipo: 'sessao', sessao }
}

/** Segundo passo: o código de 6 dígitos. Só aqui a sessão nasce. */
export async function verificarSegundoFator(desafio: string, codigo: string): Promise<Sessao> {
  const resp = await pb.send('/backend/v1/verificar-segundo-fator', {
    method: 'POST',
    body: { desafio, codigo },
  })
  if (!resp || !resp.token) throw new Error('Não foi possível concluir a verificação.')
  pb.authStore.save(resp.token, resp.record as RecordModel)
  const sessao = sessaoDoRegistro(resp.record as RecordModel)
  if (!sessao) throw new Error('Não foi possível iniciar a sessão.')
  return sessao
}

/** Reenvia o código do desafio atual. */
export async function reenviarCodigo(desafio: string): Promise<void> {
  await pb.send('/backend/v1/reenviar-codigo', { method: 'POST', body: { desafio } })
}

/** Recuperação por código de uso único (quem perdeu o acesso ao e-mail). */
export async function recuperarAcesso(email: string, codigo: string): Promise<Sessao> {
  const resp = await pb.send('/backend/v1/recuperar-acesso', {
    method: 'POST',
    body: { email: email.trim().toLowerCase(), codigo_recuperacao: codigo.trim().toUpperCase() },
  })
  if (!resp || !resp.token) throw new Error('Código inválido.')
  pb.authStore.save(resp.token, resp.record as RecordModel)
  const sessao = sessaoDoRegistro(resp.record as RecordModel)
  if (!sessao) throw new Error('Não foi possível iniciar a sessão.')
  return sessao
}

export function sair(): void {
  pb.authStore.clear()
}
