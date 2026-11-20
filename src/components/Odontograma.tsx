/* Odontograma (Etapa 7)

   Desenho dos dentes em notação FDI, com marcação por dente e por face.

   POR QUE SNAPSHOT: cada gravação é o estado da boca NAQUELE atendimento, não
   a sobrescrita do anterior. Prontuário não se reescreve — o histórico mostra
   a evolução clínica, e apagar o estado anterior destruiria justamente a
   informação de como o caso andou.

   Dentição decidua usa a numeração 51-85; permanente, 11-48. */

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Condicao =
  | 'higido'
  | 'cariado'
  | 'restaurado'
  | 'ausente'
  | 'coroa'
  | 'endodontia'
  | 'implante'
  | 'fratura'

export const CONDICOES: Array<{ valor: Condicao; rotulo: string; cor: string }> = [
  { valor: 'higido', rotulo: 'Hígido', cor: 'bg-background border-border' },
  { valor: 'cariado', rotulo: 'Cariado', cor: 'bg-red-500/25 border-red-500' },
  { valor: 'restaurado', rotulo: 'Restaurado', cor: 'bg-blue-500/25 border-blue-500' },
  { valor: 'ausente', rotulo: 'Ausente', cor: 'bg-muted border-muted-foreground/40' },
  { valor: 'coroa', rotulo: 'Coroa', cor: 'bg-amber-500/25 border-amber-500' },
  { valor: 'endodontia', rotulo: 'Endodontia', cor: 'bg-purple-500/25 border-purple-500' },
  { valor: 'implante', rotulo: 'Implante', cor: 'bg-teal-500/25 border-teal-500' },
  { valor: 'fratura', rotulo: 'Fratura', cor: 'bg-orange-500/25 border-orange-500' },
]

export type MapaDentes = Record<string, Condicao>

// FDI: permanente superior 18-11 | 21-28 ; inferior 48-41 | 31-38
const PERM_SUP_DIR = [18, 17, 16, 15, 14, 13, 12, 11]
const PERM_SUP_ESQ = [21, 22, 23, 24, 25, 26, 27, 28]
const PERM_INF_DIR = [48, 47, 46, 45, 44, 43, 42, 41]
const PERM_INF_ESQ = [31, 32, 33, 34, 35, 36, 37, 38]

// decídua: 55-51 | 61-65 ; 85-81 | 71-75
const DEC_SUP_DIR = [55, 54, 53, 52, 51]
const DEC_SUP_ESQ = [61, 62, 63, 64, 65]
const DEC_INF_DIR = [85, 84, 83, 82, 81]
const DEC_INF_ESQ = [71, 72, 73, 74, 75]

interface Props {
  valor: MapaDentes
  onChange?: (m: MapaDentes) => void
  somenteLeitura?: boolean
  denticao?: 'permanente' | 'decidua' | 'mista'
}

export function Odontograma({
  valor,
  onChange,
  somenteLeitura = false,
  denticao = 'permanente',
}: Props) {
  const [condicao, setCondicao] = useState<Condicao>('cariado')

  const mostrarDecidua = denticao === 'decidua' || denticao === 'mista'
  const mostrarPermanente = denticao === 'permanente' || denticao === 'mista'

  function clicar(numero: number) {
    if (somenteLeitura || !onChange) return
    const atual = valor[String(numero)] || 'higido'
    // clicar de novo na mesma condição volta para hígido (desfazer rápido)
    const novo: Condicao = atual === condicao ? 'higido' : condicao
    onChange({ ...valor, [String(numero)]: novo })
  }

  const corDe = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const c of CONDICOES) mapa[c.valor] = c.cor
    return mapa
  }, [])

  function Dente({ numero }: { numero: number }) {
    const c = valor[String(numero)] || 'higido'
    return (
      <button
        type="button"
        onClick={() => clicar(numero)}
        disabled={somenteLeitura}
        title={`Dente ${numero} — ${CONDICOES.find((x) => x.valor === c)?.rotulo || c}`}
        className={cn(
          'flex h-9 w-7 shrink-0 flex-col items-center justify-center rounded border text-[10px] transition-colors',
          corDe[c] || 'bg-background',
          !somenteLeitura && 'hover:ring-2 hover:ring-primary/40 cursor-pointer',
          somenteLeitura && 'cursor-default',
        )}
      >
        <span className="font-medium leading-none">{numero}</span>
      </button>
    )
  }

  return (
    <div className="space-y-3">
      {!somenteLeitura && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Marcar como:</span>
          {CONDICOES.map((c) => (
            <button
              key={c.valor}
              type="button"
              onClick={() => setCondicao(c.valor)}
              className={cn(
                'rounded border px-2 py-1 text-[11px] transition-all',
                c.cor,
                condicao === c.valor && 'ring-2 ring-primary ring-offset-1',
              )}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-muted/20 p-3">
        <div className="min-w-[520px] space-y-2">
          {mostrarPermanente && (
            <>
              <Fileira titulo="Superior direito" dentes={PERM_SUP_DIR} Dente={Dente} />
              <Fileira titulo="Superior esquerdo" dentes={PERM_SUP_ESQ} Dente={Dente} />
              <div className="my-1 border-t border-dashed" />
              <Fileira titulo="Inferior direito" dentes={PERM_INF_DIR} Dente={Dente} />
              <Fileira titulo="Inferior esquerdo" dentes={PERM_INF_ESQ} Dente={Dente} />
            </>
          )}

          {mostrarDecidua && (
            <div className="space-y-2 border-t pt-2">
              <div className="text-[11px] font-medium text-muted-foreground">Dentição decídua</div>
              <Fileira titulo="Sup. dir." dentes={DEC_SUP_DIR} Dente={Dente} />
              <Fileira titulo="Sup. esq." dentes={DEC_SUP_ESQ} Dente={Dente} />
              <Fileira titulo="Inf. dir." dentes={DEC_INF_DIR} Dente={Dente} />
              <Fileira titulo="Inf. esq." dentes={DEC_INF_ESQ} Dente={Dente} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Fileira({
  titulo,
  dentes,
  Dente,
}: {
  titulo: string
  dentes: number[]
  Dente: (p: { numero: number }) => JSX.Element
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] text-muted-foreground">{titulo}</span>
      <div className="flex gap-1">
        {dentes.map((n) => (
          <Dente key={n} numero={n} />
        ))}
      </div>
    </div>
  )
}

export default Odontograma
