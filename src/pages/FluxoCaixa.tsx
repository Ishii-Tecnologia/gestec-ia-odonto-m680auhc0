/* Fluxo de caixa projetado (Etapa 11)

   Responde "vou ter dinheiro no dia 20?". Usa CAIXA, não competência — é o
   oposto do DRE, e é de propósito.

   O ponto que o critério 2 pede: cartão de crédito entra na data de CRÉDITO
   PREVISTA (30 dias depois), não na data da venda. É por isso que o gráfico não
   pode ser feito a partir dos títulos: o título sabe quando o paciente pagou,
   mas não quando a maquininha libera.

   O alerta de saldo mínimo é a razão de existir da tela. Sem ele, é só um
   gráfico bonito; com ele, avisa com antecedência qual dia a conta fica
   negativa. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, TrendingUp, TrendingDown, Calendar, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Dia {
  data: string
  entradas_centavos: number
  saidas_centavos: number
  saldo_centavos: number
  abaixo_do_minimo: boolean
  passado: boolean
}

interface Fluxo {
  dias: number
  hoje: string
  saldo_inicial_centavos: number
  saldo_minimo_centavos: number
  serie: Dia[]
  totais: { entradas_centavos: number; saidas_centavos: number; saldo_final_centavos: number }
  alerta: { primeira_data_abaixo_do_minimo: string; dias_abaixo: number } | null
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function brlCurto(c: number): string {
  const v = c / 100
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
  return v.toFixed(0)
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function FluxoCaixa() {
  const [dias, setDias] = useState('90')
  const [saldoInicial, setSaldoInicial] = useState('0')
  const [saldoMinimo, setSaldoMinimo] = useState('0')
  const [dados, setDados] = useState<Fluxo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const p = new URLSearchParams({ dias })
      p.set(
        'saldo_inicial_centavos',
        String(Math.round(Number(saldoInicial.replace(/\./g, '').replace(',', '.') || '0') * 100)),
      )
      p.set(
        'saldo_minimo_centavos',
        String(Math.round(Number(saldoMinimo.replace(/\./g, '').replace(',', '.') || '0') * 100)),
      )
      /* Uso o cliente do PocketBase, e não fetch manual: ele resolve a URL do
         backend e injeta o token do usuário logado. Eu tinha escrito fetch com
         o token lido do localStorage — frágil (a chave do storage muda entre
         versões do SDK) e teria quebrado sem aviso. */
      const r = await pb.send(`/backend/v1/relatorios/fluxo-caixa?${p.toString()}`, {
        method: 'GET',
      })
      setDados(r as Fluxo)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [dias, saldoInicial, saldoMinimo])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // desenho do gráfico em SVG puro: sem dependência nova e com controle total
  const grafico = useMemo(() => {
    if (!dados || dados.serie.length === 0) return null
    const W = 900
    const H = 200
    const pad = 8
    const valores = dados.serie.map((s) => s.saldo_centavos)
    const min = Math.min(0, dados.saldo_minimo_centavos, ...valores)
    const max = Math.max(dados.saldo_minimo_centavos, ...valores, 1)
    const range = max - min || 1

    const x = (i: number) => pad + (i / Math.max(1, dados.serie.length - 1)) * (W - pad * 2)
    const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2)

    const pontos = dados.serie.map((s, i) => `${x(i)},${y(s.saldo_centavos)}`).join(' ')
    const area = `M ${x(0)},${y(min)} L ${pontos.replace(/ /g, ' L ')} L ${x(dados.serie.length - 1)},${y(min)} Z`

    // ponto onde cruza o mínimo (primeira data abaixo)
    const indiceAlerta = dados.serie.findIndex((s) => s.abaixo_do_minimo)

    return {
      W,
      H,
      pontos,
      area,
      y,
      x,
      yMinimo: y(dados.saldo_minimo_centavos),
      yZero: y(0),
      indiceAlerta,
    }
  }, [dados])

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (!dados) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Não foi possível carregar o fluxo.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Fluxo de caixa projetado</h1>
        <p className="text-sm text-muted-foreground">
          Responde "vou ter dinheiro no dia 20?". Por caixa — cartão entra na data em que a
          maquininha libera, não na data da venda.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <Label className="text-xs">Horizonte</Label>
          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="180">180 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Label className="text-xs">Saldo hoje (R$)</Label>
          <Input
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
            className="h-9 text-right font-mono"
          />
        </div>
        <div className="w-40">
          <Label className="text-xs">Saldo mínimo (R$)</Label>
          <Input
            value={saldoMinimo}
            onChange={(e) => setSaldoMinimo(e.target.value)}
            className="h-9 text-right font-mono"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregar()}>
          Recalcular
        </Button>
      </div>

      {/* alerta */}
      {dados.alerta ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            A projeção fica abaixo do mínimo a partir de{' '}
            <strong>{dataBr(dados.alerta.primeira_data_abaixo_do_minimo)}</strong>, em{' '}
            {dados.alerta.dias_abaixo} dia(s) do período.{' '}
            {dados.alerta.primeira_data_abaixo_do_minimo && (
              <span>
                Sem uma entrada nova até lá, faltará dinheiro — vale antecipar recebimento ou
                reprogramar pagamento.
              </span>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            A projeção não fica abaixo de {brl(dados.saldo_minimo_centavos)} em nenhum dia do
            período.
          </AlertDescription>
        </Alert>
      )}

      {/* totais */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Entradas
            </div>
            <div className="text-lg font-semibold tabular-nums text-emerald-700">
              {brl(dados.totais.entradas_centavos)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <TrendingDown className="h-3 w-3" /> Saídas
            </div>
            <div className="text-lg font-semibold tabular-nums text-red-700">
              {brl(dados.totais.saidas_centavos)}
            </div>
          </CardContent>
        </Card>
        <Card
          className={
            dados.totais.saldo_final_centavos >= 0 ? 'border-emerald-500/30' : 'border-red-500/30'
          }
        >
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3 w-3" /> Saldo ao fim
            </div>
            <div
              className={`text-lg font-semibold tabular-nums ${
                dados.totais.saldo_final_centavos >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {brl(dados.totais.saldo_final_centavos)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* gráfico */}
      {grafico && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Saldo projetado</CardTitle>
            <CardDescription className="text-xs">
              Linha cheia até hoje (realizado) e tracejada daqui para frente (projetado). A linha
              vermelha é o saldo mínimo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <svg viewBox={`0 0 ${grafico.W} ${grafico.H}`} className="w-full" role="img">
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* zero */}
              <line
                x1="0"
                y1={grafico.yZero}
                x2={grafico.W}
                y2={grafico.yZero}
                stroke="currentColor"
                strokeOpacity="0.15"
                strokeWidth="1"
              />
              {/* mínimo */}
              <line
                x1="0"
                y1={grafico.yMinimo}
                x2={grafico.W}
                y2={grafico.yMinimo}
                stroke="rgb(239 68 68)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text
                x={grafico.W - 4}
                y={grafico.yMinimo - 4}
                textAnchor="end"
                className="fill-red-600"
                fontSize="10"
              >
                mínimo {brlCurto(dados.saldo_minimo_centavos)}
              </text>

              <path d={grafico.area} fill="url(#areaGrad)" />
              <polyline
                points={grafico.pontos}
                fill="none"
                stroke="rgb(16 185 129)"
                strokeWidth="2"
                strokeLinejoin="round"
              />

              {/* marcador do primeiro dia abaixo do mínimo */}
              {grafico.indiceAlerta >= 0 && (
                <circle
                  cx={grafico.x(grafico.indiceAlerta)}
                  cy={grafico.y(dados.serie[grafico.indiceAlerta].saldo_centavos)}
                  r="4"
                  fill="rgb(239 68 68)"
                />
              )}

              {/* divisória hoje */}
              {(() => {
                const idx = dados.serie.findIndex((s) => !s.passado)
                if (idx <= 0) return null
                return (
                  <line
                    x1={grafico.x(idx)}
                    y1="0"
                    x2={grafico.x(idx)}
                    y2={grafico.H}
                    stroke="currentColor"
                    strokeOpacity="0.2"
                    strokeWidth="1"
                  />
                )
              })()}
            </svg>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{dataBr(dados.serie[0].data)}</span>
              <span>hoje</span>
              <span>{dataBr(dados.serie[dados.serie.length - 1].data)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* dias com movimento */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Dias com movimento</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {dados.serie.filter((s) => s.entradas_centavos !== 0 || s.saidas_centavos !== 0)
              .length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhuma entrada ou saída projetada neste período.
              </p>
            ) : (
              dados.serie
                .filter((s) => s.entradas_centavos !== 0 || s.saidas_centavos !== 0)
                .map((s) => (
                  <div
                    key={s.data}
                    className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${
                      s.abaixo_do_minimo ? 'bg-red-500/10' : s.passado ? 'bg-muted/40' : ''
                    }`}
                  >
                    <span
                      className={`w-16 tabular-nums ${s.passado ? '' : 'text-muted-foreground'}`}
                    >
                      {dataBr(s.data)}
                    </span>
                    <span className="flex-1 text-right tabular-nums text-emerald-700">
                      {s.entradas_centavos !== 0 ? `+${brl(s.entradas_centavos)}` : ''}
                    </span>
                    <span className="flex-1 text-right tabular-nums text-red-700">
                      {s.saidas_centavos !== 0 ? `−${brl(s.saidas_centavos)}` : ''}
                    </span>
                    <span className="w-28 text-right font-medium tabular-nums">
                      {brl(s.saldo_centavos)}
                    </span>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
