/* Extrato do paciente (Etapa 10)

   Mostra a posição financeira dele com as TRÊS datas separadas, porque é a
   única forma honesta de responder "quanto este paciente deve":

   - competência: quando o serviço foi feito (o que entrou no faturamento)
   - vencimento: quando deveria ter sido pago
   - liquidação: quando o dinheiro entrou de fato

   E mostra o CRÉDITO a favor separado do saldo devedor. Somar crédito ao saldo
   e mostrar um número só esconde do paciente que ele tem dinheiro na casa — e
   é o tipo de erro que vira briga no balcão. Por isso existe
   `posicao_liquida` além de `saldo_devedor`. */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CircleDollarSign, TrendingDown, Wallet, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Pagamento {
  id: string
  tipo: string
  valor_centavos: number
  forma: string
  data_pagamento: string
  data_credito_prevista: string
}

interface Titulo {
  id: string
  descricao: string
  valor_centavos: number
  valor_pago_centavos: number
  saldo_centavos: number
  vencimento: string
  status: string
  vencido: boolean
  data_competencia: string
  data_liquidacao: string
  parcelas: Pagamento[]
}

interface Credito {
  id: string
  valor_centavos: number
  utilizado_centavos: number
  disponivel_centavos: number
  origem: string
  observacao: string
  created: string
}

interface Extrato {
  paciente: { id: string; nome: string }
  resumo: {
    total_centavos: number
    pago_centavos: number
    saldo_devedor_centavos: number
    vencido_centavos: number
    credito_disponivel_centavos: number
    posicao_liquida_centavos: number
  }
  titulos: Titulo[]
  creditos: Credito[]
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(iso: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function ExtratoPaciente() {
  const { id } = useParams<{ id: string }>()
  const { sessao } = useSessao()
  const navegar = useNavigate()
  const [dados, setDados] = useState<Extrato | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao || !id) return
    setCarregando(true)
    setErro('')
    try {
      const r = await pb.send(`/backend/v1/extrato-paciente?paciente_id=${id}`, { method: 'GET' })
      setDados(r as Extrato)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (!dados) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Não foi possível carregar o extrato.'}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => navegar(`/pacientes/${id || ''}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
      </div>
    )
  }

  const r = dados.resumo

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navegar(`/pacientes/${dados.paciente.id}`)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Ficha
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/contas-receber">Contas a receber</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Extrato — {dados.paciente.nome}</h1>
        <p className="text-sm text-muted-foreground">
          Competência é quando o serviço foi feito. Liquidação é quando o dinheiro entrou.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <CircleDollarSign className="h-3 w-3" />
              Faturado
            </div>
            <div className="text-lg font-semibold tabular-nums">{brl(r.total_centavos)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3 w-3" />
              Pago
            </div>
            <div className="text-lg font-semibold tabular-nums text-emerald-700">
              {brl(r.pago_centavos)}
            </div>
          </CardContent>
        </Card>
        <Card className={r.vencido_centavos > 0 ? 'border-red-500/30 bg-red-500/5' : ''}>
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              <TrendingDown className="h-3 w-3" />
              Saldo devedor
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {brl(r.saldo_devedor_centavos)}
            </div>
            {r.vencido_centavos > 0 && (
              <div className="text-[11px] font-medium text-red-700">
                {brl(r.vencido_centavos)} vencido
              </div>
            )}
          </CardContent>
        </Card>
        <Card
          className={
            r.credito_disponivel_centavos > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : ''
          }
        >
          <CardContent className="py-3">
            <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              Crédito a favor
            </div>
            <div className="text-lg font-semibold tabular-nums text-emerald-700">
              {brl(r.credito_disponivel_centavos)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* posição líquida só aparece quando há crédito */}
      {r.credito_disponivel_centavos > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Descontando o crédito a favor, a posição líquida é{' '}
            <strong className="tabular-nums">{brl(r.posicao_liquida_centavos)}</strong>.
            {r.posicao_liquida_centavos === 0 &&
              r.credito_disponivel_centavos > r.saldo_devedor_centavos && (
                <>
                  {' '}
                  O paciente fica com{' '}
                  {brl(r.credito_disponivel_centavos - r.saldo_devedor_centavos)} de crédito.
                </>
              )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Títulos</CardTitle>
          <CardDescription className="text-xs">
            Cada título mostra a competência e, quando quitado, a data de liquidação.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {dados.titulos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum título financeiro para este paciente.
            </p>
          ) : (
            <ul className="divide-y">
              {dados.titulos.map((t) => (
                <li key={t.id} className="py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">{t.descricao}</span>
                        <Badge
                          variant={
                            t.status === 'pago'
                              ? 'default'
                              : t.vencido
                                ? 'destructive'
                                : t.status === 'parcial'
                                  ? 'secondary'
                                  : 'outline'
                          }
                          className="text-[10px]"
                        >
                          {t.vencido && t.status !== 'pago' ? 'vencido' : t.status}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        <span>competência {dataBr(t.data_competencia)}</span>
                        <span>vence {dataBr(t.vencimento)}</span>
                        {t.data_liquidacao && <span>liquidado {dataBr(t.data_liquidacao)}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium tabular-nums">
                        {brl(t.saldo_centavos > 0 ? t.saldo_centavos : t.valor_centavos)}
                      </div>
                      {t.valor_pago_centavos > 0 && t.saldo_centavos > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          de {brl(t.valor_centavos)}
                        </div>
                      )}
                    </div>
                  </div>

                  {t.parcelas.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-l-2 pl-2.5">
                      {t.parcelas.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className={
                              p.tipo === 'estorno' ? 'text-destructive' : 'text-emerald-700'
                            }
                          >
                            {p.tipo === 'estorno' ? '−' : '+'} {brl(p.valor_centavos)}
                          </span>
                          <span className="text-muted-foreground">
                            {p.forma} · {dataBr(p.data_pagamento)}
                          </span>
                          {p.data_credito_prevista &&
                            p.data_credito_prevista !== p.data_pagamento && (
                              <span className="text-muted-foreground">
                                em conta {dataBr(p.data_credito_prevista)}
                              </span>
                            )}
                          {p.tipo === 'estorno' && (
                            <Badge variant="outline" className="text-[10px]">
                              estorno
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {dados.creditos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Créditos a favor</CardTitle>
            <CardDescription className="text-xs">
              Gerados em cancelamento de tratamento. Não são desconto: são dinheiro que o paciente
              já pagou e ainda pode usar.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {dados.creditos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="text-sm font-medium tabular-nums">
                      {brl(c.disponivel_centavos)}{' '}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        de {brl(c.valor_centavos)}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.origem.replace('_', ' ')} · {dataBr(c.created)}
                    </div>
                    {c.observacao && (
                      <div className="text-[11px] text-muted-foreground">{c.observacao}</div>
                    )}
                  </div>
                  {c.utilizado_centavos > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      usado {brl(c.utilizado_centavos)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
