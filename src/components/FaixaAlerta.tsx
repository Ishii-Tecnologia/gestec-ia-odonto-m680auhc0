/* Faixa de alerta clínico grave (Etapa 5)

   O plano exige destaque de alerta alta/crítica em TODA tela onde o paciente
   aparece. Por isso isto é um componente único, usado em todos os lugares, em
   vez de cada tela desenhar o seu — assim não existe tela que "esqueceu".

   Vermelho para crítica, âmbar para alta. Chama atenção sem impedir o
   trabalho: é aviso, não bloqueio. */

import { AlertTriangle, Siren } from 'lucide-react'
import type { Alerta } from '@/lib/pacientes'
import { alertaGrave, TIPOS_ALERTA } from '@/lib/pacientes'
import { cn } from '@/lib/utils'

interface Props {
  alertas: Alerta[]
  /** Versão compacta para listagens. */
  compacto?: boolean
  className?: string
}

function rotuloTipo(t: Alerta['tipo']): string {
  return TIPOS_ALERTA.find((x) => x.valor === t)?.rotulo || t
}

export function FaixaAlerta({ alertas, compacto = false, className }: Props) {
  const graves = alertas.filter(alertaGrave)
  if (graves.length === 0) return null

  const temCritica = graves.some((a) => a.gravidade === 'critica')
  const Icone = temCritica ? Siren : AlertTriangle

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm',
        temCritica
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
        className,
      )}
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium">
          {temCritica ? 'Alerta crítico' : 'Alerta clínico'}
          {graves.length > 1 && !compacto ? ` — ${graves.length} alertas graves` : ''}
        </div>
        <ul className={cn('space-y-0.5', compacto && 'flex flex-wrap gap-x-3')}>
          {graves.map((a) => (
            <li key={a.id} className="leading-snug">
              <span className="font-medium">{rotuloTipo(a.tipo)}:</span> {a.descricao}
              {!compacto && a.gravidade === 'critica' && (
                <span className="ml-1 text-xs font-semibold uppercase">(crítica)</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default FaixaAlerta
