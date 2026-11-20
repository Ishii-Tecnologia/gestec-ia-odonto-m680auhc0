/* Autenticação e autorização (Etapa 4)

   Tudo que decide "quem pode o quê" fica aqui, num lugar só. As regras da
   API do PocketBase continuam sendo a barreira real (o front não é
   confiável): este arquivo só evita que a pessoa veja uma tela que o
   servidor vai recusar depois.

   Importante: o papel é lido do registro autenticado, que veio do token.
   Nunca de localStorage solto nem de parâmetro de URL. */

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

/* Rotas consideradas clínicas: expõem dado de saúde.
   Só dentista, gestor e proprietário entram. Recepção e financeiro não. */
export const ROTAS_CLINICAS = ['/prontuario', '/odontograma', '/paciente']

export const PAPEIS_CLINICOS: Papel[] = ['proprietario', 'gestor', 'dentista']

export interface Sessao {
  id: string
  nome: string
  email: string
  papel: Papel | ''
  tenantId: string
  ativo: boolean
  precisaTrocarSenha: boolean
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
  }
}

/** Sessão atual, lida do cliente do PocketBase (que guarda o token). */
export function sessaoAtual(): Sessao | null {
  return sessaoDoRegistro(pb.authStore.record)
}

export function estaAutenticado(): boolean {
  return pb.authStore.isValid && !!pb.authStore.record
}

/** O papel permite entrar em rota clínica? */
export function podeAcessarClinico(papel: Papel | ''): boolean {
  return PAPEIS_CLINICOS.indexOf(papel as Papel) >= 0
}

/** O papel administra usuários da clínica? */
export function podeGerenciarUsuarios(papel: Papel | ''): boolean {
  return papel === 'proprietario' || papel === 'gestor'
}

/** O papel vê a trilha de auditoria? */
export function podeVerAuditoria(papel: Papel | ''): boolean {
  return papel === 'proprietario' || papel === 'gestor'
}

/** Rótulo legível de um papel. */
export function rotuloPapel(papel: Papel | ''): string {
  const achado = PAPEIS.find((p) => p.valor === papel)
  return achado ? achado.rotulo : '—'
}

/** Faz login e devolve a sessão. Lança erro com mensagem pronta para a tela. */
export async function entrar(email: string, senha: string): Promise<Sessao> {
  const auth = await pb.collection('users').authWithPassword(email.trim().toLowerCase(), senha)
  const sessao = sessaoDoRegistro(auth.record)
  if (!sessao) throw new Error('Não foi possível iniciar a sessão.')
  if (!sessao.ativo) {
    pb.authStore.clear()
    throw new Error('Conta desativada. Procure o responsável pela clínica.')
  }
  return sessao
}

export function sair(): void {
  pb.authStore.clear()
}
