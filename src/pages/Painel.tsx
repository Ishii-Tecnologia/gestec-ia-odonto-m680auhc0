/* Painel do proprietário (Etapa 12)

   A tela que justifica a assinatura: em uma olhada o dono sabe se a clínica
   está cheia, se o dinheiro está entrando e se sobrou algo.

   DUAS COISAS QUE A TELA FAZ E QUE PARECEM DETALHE:

   1. MOSTRA A CONTA DA OCUPAÇÃO. "2,1%" sem contexto é um número que não
      significa nada: 36,8h agendadas em 1.728h disponíveis (8h × 4 salas × 54
      dias úteis). Se a clínica abre 10h por dia, o dono vê que a premissa não é
      dele e ajusta — em vez de concluir que está vazia quando não está.

   2. DIZ QUE OS NÚMEROS SÃO OS MESMOS DOS RELATÓRIOS. O valor da etapa é
      confiança: se o painel mostrasse um resultado diferente do DRE, o dono
      passaria a desconfiar dos dois. Por isso há link para cada relatório
      detalhado ao lado do número. */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Users,
  Stethoscope,
  AlertTriangle,
  Info,
  ArrowRight,
  Activity,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Painel {
  periodo: { de: string; ate: string }
  agenda: {
    total: number
    por_status: Record<string, number>
    horas_agendadas: number
    horas_disponiveis: number
    ocupacao_percentual: number
    premissa: { horas_por_dia: number; salas_ativas: number; dias_uteis: number }
    taxa_falta_percentual: number
    pacientes_atendidos: number
  }
  financeiro: {
    receita_bruta_centavos: number
    receita_liquida_centavos: number
    custos_diretos_centavos: number
    despesas_fixas_centavos: number
    resultado_operacional_centavos: number
    recebido_centavos: number
    inadimplente_centavos: number
    faturado_centavos: number
  }
  clinico: {
    passivo_centavos: number
    passivo_itens: number
    produzido_centavos: number
    procedimentos_realizados: number
  }
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(iso: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const ROTULO_STATUS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  atendido: 'Atendido',
  faltou: 'Faltou',
  cancelado: 'Cancelado',
}

export default function Painel() {
  const { sessao } = useSessao()
  const agora = new Date()
  const [de, setDe] = useState(
    `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}-01`,
  )
  const [ate, setAte] = useState(agora.toISOString().slice(0, 10))
  const [dados, setDados] = useState<Painel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const r = await pb.send(`/backend/v1/relatorios/painel?de=${de}&ate=${ate}`, {
        method: 'GET',
      })
      setDados(r as Painel)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, de, ate])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (!dados) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Não foi possível carregar o painel.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const a = dados.agenda
  const f = dados.financeiro
  const c = dados.clinico
  const resultadoPositivo = f.resultado_operacional_centavos >= 0
  const ocupacaoBaixa = a.ocupacao_percentual < 40
  const faltaAlta = a.taxa_falta_percentual >= 15

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">
            {dataBr(dados.periodo.de)} a {dataBr(dados.periodo.ate)} · os números são os mesmos dos
            relatórios detalhados
          </p>
        </div>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* período */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9" />
        </div>
        <div className="w-40">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>

      {/* resultado em destaque */}
      <Card
        className={
          resultadoPositivo
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-red-500/40 bg-red-500/5'
        }
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full ${
                resultadoPositivo ? 'bg-emerald-500/15' : 'bg-red-500/15'
              }`}
            >
              {resultadoPositivo ? (
                <TrendingUp className="h-6 w-6 text-emerald-700" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-700" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Resultado do período
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {brl(f.resultado_operacional_centavos)}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dre">
              Ver DRE
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* linha de números */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Faturado
            </div>
            <div className="text-lg font-semibold tabular-nums">{brl(f.faturado_centavos)}</div>
            <div className="text-[10px] text-muted-foreground">por competência</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Activity className="h-3 w-3" /> Recebido
            </div>
            <div className="text-lg font-semibold tabular-nums text-emerald-700">
              {brl(f.recebido_centavos)}
            </div>
            <div className="text-[10px] text-muted-foreground">dinheiro que entrou</div>
          </CardContent>
        </Card>
        <Card className={f.inadimplente_centavos > 0 ? 'border-red-500/30 bg-red-500/5' : ''}>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Inadimplente
            </div>
            <div className="text-lg font-semibold tabular-nums text-red-700">
              {brl(f.inadimplente_centavos)}
            </div>
            <div className="text-[10px] text-muted-foreground">vencido e não pago</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Stethoscope className="h-3 w-3" /> Pendente de fazer
            </div>
            <div className="text-lg font-semibold tabular-nums text-amber-700">
              {brl(c.passivo_centavos)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {c.passivo_itens} procedimento(s) vendido(s)
            </div>
          </CardContent>
        </Card>
      </div>

      {/* agenda */}
      <div className="grid gap-2 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Ocupação das cadeiras
            </CardTitle>
            <CardDescription className="text-xs">
              Horas agendadas sobre horas disponíveis no período.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-semibold tabular-nums ${
                  ocupacaoBaixa ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {a.ocupacao_percentual}%
              </span>
              <span className="text-xs text-muted-foreground">
                {a.horas_agendadas}h de {a.horas_disponiveis}h
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${ocupacaoBaixa ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.max(1, Math.min(100, a.ocupacao_percentual))}%` }}
              />
            </div>

            {/* a conta, à vista */}
            <div className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
              <Info className="mr-1 inline h-3 w-3" />
              Conta: {a.premissa.dias_uteis} dias úteis × {a.premissa.salas_ativas} sala(s) ×{' '}
              {a.premissa.horas_por_dia}h por dia = {a.horas_disponiveis}h disponíveis.
              {ocupacaoBaixa && (
                <span className="mt-1 block text-amber-700">
                  Ocupação baixa. Se a clínica abre mais de {a.premissa.horas_por_dia}h por dia, o
                  percentual real é maior — a premissa é conservadora.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Agenda
            </CardTitle>
            <CardDescription className="text-xs">
              {a.total} agendamento(s) · {a.pacientes_atendidos} paciente(s) atendido(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.keys(ROTULO_STATUS).map((k) => {
              const n = a.por_status[k] || 0
              const pct = a.total > 0 ? (n / a.total) * 100 : 0
              return (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-20 text-[11px] text-muted-foreground">{ROTULO_STATUS[k]}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${
                        k === 'faltou'
                          ? 'bg-red-500'
                          : k === 'cancelado'
                            ? 'bg-muted-foreground/50'
                            : k === 'atendido'
                              ? 'bg-emerald-500'
                              : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.max(n > 0 ? 2 : 0, pct)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[11px] tabular-nums">{n}</span>
                </div>
              )
            })}

            {faltaAlta && (
              <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/5 p-2 text-[11px] text-red-800">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                Taxa de falta de {a.taxa_falta_percentual}%. Veja o relatório de faltas: o padrão
                costuma estar concentrado num dia ou horário.
              </div>
            )}

            <div className="mt-1 flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/inadimplencia">
                  Faltas e inadimplência
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* produção e vínculos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Produção realizada</CardTitle>
          <CardDescription className="text-xs">
            {c.procedimentos_realizados} procedimento(s) executado(s) no período ·{' '}
            {brl(c.produzido_centavos)}. Apenas leitura: não é cálculo de repasse.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/producao">Produção por profissional</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/fluxo-caixa">Fluxo de caixa</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/contas-receber">Contas a receber</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/passivo-clinico">Passivo clínico</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
