/* Utilidades de data e hora da agenda (Etapa 6)

   Toda a conta é feita em horário LOCAL do consultório, não em UTC. O banco
   guarda UTC; a tela mostra local. Misturar os dois é a fonte número um de
   agendamento no horário errado, então as funções abaixo deixam explícito
   quando estão convertendo.

   O offset do navegador é enviado às rotas do backend, que precisam dele para
   alinhar os blocos de 15 minutos no relógio local. */

export const BLOCO_MINUTOS = 15

/** Offset do navegador em minutos (ex.: -180 em Brasília). */
export function offsetMinutos(): number {
  return -new Date().getTimezoneOffset()
}

export function paraLocal(iso: string): Date {
  // "2026-12-21 11:00:00.000Z" -> Date
  return new Date(iso.replace(' ', 'T'))
}

/** yyyy-mm-dd do dia local */
export function chaveDoDia(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function inicioDoDia(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function somaDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Segunda-feira da semana de `d` (semana começa na segunda). */
export function inicioDaSemana(d: Date): Date {
  const x = inicioDoDia(d)
  const dia = x.getDay() // 0 = domingo
  const volta = dia === 0 ? 6 : dia - 1
  return somaDias(x, -volta)
}

export function rotuloDia(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export function rotuloCompleto(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

/** "09:00" no horário local */
export function horaLocal(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Posição vertical em minutos desde a meia-noite local. */
export function minutosDoDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/** Converte data+hora local em ISO, para mandar ao backend. */
export function isoLocal(data: string, hora: string): string {
  // data = "2026-12-21", hora = "08:00"
  const [ano, mes, dia] = data.split('-').map(Number)
  const [h, m] = hora.split(':').map(Number)
  const d = new Date(ano, mes - 1, dia, h, m, 0, 0)
  return d.toISOString()
}

export function statusRotulo(s: string): string {
  const mapa: Record<string, string> = {
    agendado: 'Agendado',
    confirmado: 'Confirmado',
    atendido: 'Atendido',
    faltou: 'Faltou',
    cancelado: 'Cancelado',
  }
  return mapa[s] || s
}

export function statusCor(s: string): string {
  const mapa: Record<string, string> = {
    agendado: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
    confirmado: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    atendido: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
    faltou: 'bg-amber-500/15 text-amber-800 border-amber-500/30',
    cancelado: 'bg-destructive/10 text-destructive border-destructive/30 line-through',
  }
  return mapa[s] || 'bg-muted text-muted-foreground'
}
