/* Tipos e regras de paciente (Etapa 5) */

import type { RecordModel } from 'pocketbase'

export type Sexo = 'feminino' | 'masculino' | 'outro' | 'nao_informado'
export type TipoAlerta = 'alergia' | 'condicao_sistemica' | 'medicacao' | 'gestacao' | 'outro'
export type Gravidade = 'baixa' | 'media' | 'alta' | 'critica'

export interface Paciente {
  id: string
  nome: string
  cpf: string
  dataNascimento: string
  sexo: Sexo | ''
  email: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  observacoes: string
  ativo: boolean
  created: string
}

export interface Responsavel {
  id: string
  pacienteId: string
  nome: string
  cpf: string
  parentesco: string
  telefone: string
  email: string
}

export interface Alerta {
  id: string
  pacienteId: string
  tipo: TipoAlerta
  descricao: string
  gravidade: Gravidade
  ativo: boolean
}

export interface Anamnese {
  id: string
  pacienteId: string
  versao: number
  respostas: Record<string, unknown>
  autorId: string
  autorNome: string
  observacoes: string
  created: string
}

export const TIPOS_ALERTA: Array<{ valor: TipoAlerta; rotulo: string }> = [
  { valor: 'alergia', rotulo: 'Alergia' },
  { valor: 'condicao_sistemica', rotulo: 'Condição sistêmica' },
  { valor: 'medicacao', rotulo: 'Medicação em uso' },
  { valor: 'gestacao', rotulo: 'Gestação' },
  { valor: 'outro', rotulo: 'Outro' },
]

export const GRAVIDADES: Array<{ valor: Gravidade; rotulo: string }> = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'critica', rotulo: 'Crítica' },
]

export const SEXOS: Array<{ valor: Sexo; rotulo: string }> = [
  { valor: 'feminino', rotulo: 'Feminino' },
  { valor: 'masculino', rotulo: 'Masculino' },
  { valor: 'outro', rotulo: 'Outro' },
  { valor: 'nao_informado', rotulo: 'Não informado' },
]

export const PARENTESCOS = [
  { valor: 'mae', rotulo: 'Mãe' },
  { valor: 'pai', rotulo: 'Pai' },
  { valor: 'avo', rotulo: 'Avô/Avó' },
  { valor: 'tutor', rotulo: 'Tutor(a)' },
  { valor: 'outro', rotulo: 'Outro' },
]

export function deRegistro(r: RecordModel): Paciente {
  return {
    id: r.id,
    nome: (r.nome as string) || '',
    cpf: (r.cpf as string) || '',
    dataNascimento: (r.data_nascimento as string) || '',
    sexo: ((r.sexo as Sexo) || '') as Sexo | '',
    email: (r.email as string) || '',
    telefone: (r.telefone as string) || '',
    cep: (r.cep as string) || '',
    logradouro: (r.logradouro as string) || '',
    numero: (r.numero as string) || '',
    complemento: (r.complemento as string) || '',
    bairro: (r.bairro as string) || '',
    cidade: (r.cidade as string) || '',
    uf: (r.uf as string) || '',
    observacoes: (r.observacoes as string) || '',
    ativo: r.ativo !== false,
    created: (r.created as string) || '',
  }
}

export function alertaDeRegistro(r: RecordModel): Alerta {
  return {
    id: r.id,
    pacienteId: (r.paciente_id as string) || '',
    tipo: (r.tipo as TipoAlerta) || 'outro',
    descricao: (r.descricao as string) || '',
    gravidade: (r.gravidade as Gravidade) || 'baixa',
    ativo: r.ativo !== false,
  }
}

export function responsavelDeRegistro(r: RecordModel): Responsavel {
  return {
    id: r.id,
    pacienteId: (r.paciente_id as string) || '',
    nome: (r.nome as string) || '',
    cpf: (r.cpf as string) || '',
    parentesco: (r.parentesco as string) || '',
    telefone: (r.telefone as string) || '',
    email: (r.email as string) || '',
  }
}

export function anamneseDeRegistro(r: RecordModel): Anamnese {
  const exp = r.expand as Record<string, { nome?: string; email?: string }> | undefined
  const autor = exp?.autor_id
  return {
    id: r.id,
    pacienteId: (r.paciente_id as string) || '',
    versao: Number(r.versao) || 0,
    respostas: (r.respostas as Record<string, unknown>) || {},
    autorId: (r.autor_id as string) || '',
    autorNome: autor?.nome || autor?.email || '—',
    observacoes: (r.observacoes as string) || '',
    created: (r.created as string) || '',
  }
}

/** Menor de 18 anos na data de hoje. */
export function ehMenorDeIdade(dataNascimento: string): boolean {
  if (!dataNascimento) return false
  const nasc = new Date(dataNascimento.replace(' ', 'T'))
  if (isNaN(nasc.getTime())) return false
  const hoje = new Date()
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade < 18
}

export function idadeEmAnos(dataNascimento: string): number | null {
  if (!dataNascimento) return null
  const nasc = new Date(dataNascimento.replace(' ', 'T'))
  if (isNaN(nasc.getTime())) return null
  const hoje = new Date()
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade
}

/** Formata CPF para exibição (guardado só com dígitos). */
export function formatarCpf(cpf: string): string {
  const d = (cpf || '').replace(/\D/g, '')
  if (d.length !== 11) return cpf || '—'
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function formatarData(data: string): string {
  if (!data) return '—'
  const d = new Date(data.replace(' ', 'T'))
  if (isNaN(d.getTime())) return data
  return d.toLocaleDateString('pt-BR')
}

/** Alerta que exige faixa de destaque em toda tela (alta ou crítica). */
export function alertaGrave(a: Alerta): boolean {
  return a.ativo && (a.gravidade === 'alta' || a.gravidade === 'critica')
}
