/* Aging de inadimplência (Etapa 11)

   Faixas de atraso que o plano define: 30/60/90/120+. Cada título cai em UMA
   faixa — nunca em duas. É o que permite dizer "R$ 530 vencido, dos quais
   R$ 150 tem mais de 90 dias": o valor antigo é o que exige ação, e somar tudo
   num número só esconde isso.

   A tela também mostra a régua de cobrança, mas com o aviso na cara de que o
   envio não funciona sem SMTP. Esconder isso faria a clínica confiar numa
   cobrança automática que nunca aconteceu. */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Mail, Send, Info, Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface ItemAging {
  id: string
  paciente_id: string
  paciente_nome: string
  descricao: string
  vencimento: string
  dias_atraso: number
  saldo_centavos: number
}

interface Faixa {
  chave: string
  rotulo: string
  total_centavos: number
  quantidade: number
  percentual: number
  itens: ItemAging[]
}

interface Aging {
  hoje: string
  total_geral_centavos: number
  total_vencido_centavos: number
  total_a_vencer_centavos: number
  faixas: Faixa[]
}

interface Previa {
  titulo_id: string
  paciente_id: string
  paciente_nome: string
  email: string
  tem_email: boolean
  descricao: string
  vencimento: string
  dias_atraso: number
  saldo_centavos: number
  etapa: string
  situacao: string
}

interface Cobranca {
  hoje: string
  resumo: {
    titulos_vencidos: number
    a_contatar_hoje: number
    sem_email: number
    valor_total_vencido_centavos: number
  }
  aviso_envio: string
  previa: Previa[]
  etapas: Array<{ chave: string; dias: number; assunto: string }>
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(iso: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function Aging() {
  const { sessao } = useSessao()
  const [aging, setAging] = useState<Aging | null>(null)
  const [cobranca, setCobranca] = useState<Cobranca | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const [a, c] = await Promise.all([
        pb.send('/backend/v1/relatorios/aging', { method: 'GET' }),
        pb.send('/backend/v1/relatorios/cobranca', { method: 'GET' }),
      ])
      setAging(a as Aging)
      setCobranca(c as Cobranca)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function rodarRegua() {
    setProcessando(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/rodar-regua-cobranca', { method: 'POST', body: {} })
      setAviso(
        `Régua executada: ${r.enviados} enviado(s), ${r.falhas} falha(s), ${r.sem_email} sem e-mail, ` +
          `${r.ja_contatados} já contatado(s).`,
      )
      setConfirmar(false)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (!aging) {
    return (
      <div className="mx-auto max-w-3xl">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Não foi possível carregar o aging.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const podeDisparar = ['proprietario', 'gestor'].indexOf(sessao?.papel || '') >= 0

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Inadimplência</h1>
        <p className="text-sm text-muted-foreground">
          Quanto está vencido e há quanto tempo. O valor antigo é o que exige ação.
        </p>
      </div>

      {aviso && (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total a receber
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {brl(aging.total_geral_centavos)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Vencido</div>
            <div className="text-lg font-semibold tabular-nums text-red-700">
              {brl(aging.total_vencido_centavos)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              A vencer
            </div>
            <div className="text-lg font-semibold tabular-nums">
              {brl(aging.total_a_vencer_centavos)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="aging">
        <TabsList>
          <TabsTrigger value="aging">Faixas de atraso</TabsTrigger>
          <TabsTrigger value="regua">
            Régua de cobrança
            {cobranca && cobranca.resumo.a_contatar_hoje > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px]">
                {cobranca.resumo.a_contatar_hoje}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aging" className="space-y-2">
          {aging.faixas.map((f) => (
            <Card key={f.chave} className={f.chave === 'a_vencer' ? 'opacity-70' : ''}>
              <CardContent className="py-3">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{f.rotulo}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {f.quantidade}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold tabular-nums">
                      {brl(f.total_centavos)}
                    </span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{f.percentual}%</span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${
                      f.chave === 'a_vencer'
                        ? 'bg-muted-foreground/40'
                        : f.chave === 'd0_30'
                          ? 'bg-amber-500'
                          : f.chave === 'd31_60'
                            ? 'bg-orange-500'
                            : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(1, Math.min(100, f.percentual))}%` }}
                  />
                </div>

                {f.itens.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {f.itens.map((i) => (
                      <div
                        key={i.id}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <Link
                          to={`/pacientes/${i.paciente_id}/extrato`}
                          className="min-w-0 flex-1 truncate hover:underline"
                        >
                          {i.paciente_nome}
                          <span className="ml-1 text-muted-foreground">· {i.descricao}</span>
                        </Link>
                        <span className="w-20 text-right tabular-nums text-muted-foreground">
                          {i.dias_atraso > 0
                            ? `${i.dias_atraso}d`
                            : `vence ${dataBr(i.vencimento)}`}
                        </span>
                        <span className="w-24 text-right font-medium tabular-nums">
                          {brl(i.saldo_centavos)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="regua" className="space-y-3">
          {cobranca && (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{cobranca.aviso_envio}</AlertDescription>
              </Alert>

              <Card>
                <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">Quem seria cobrado hoje</CardTitle>
                    <CardDescription className="text-xs">
                      {cobranca.resumo.titulos_vencidos} título(s) vencido(s) ·{' '}
                      {cobranca.resumo.a_contatar_hoje} a contatar · {cobranca.resumo.sem_email} sem
                      e-mail
                    </CardDescription>
                  </div>
                  {podeDisparar && (
                    <Button size="sm" variant="outline" onClick={() => setConfirmar(true)}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Rodar agora
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {cobranca.previa.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum título vencido para cobrar.
                    </p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Paciente</TableHead>
                            <TableHead className="w-24">Atraso</TableHead>
                            <TableHead className="w-20">Etapa</TableHead>
                            <TableHead className="w-28 text-right">Saldo</TableHead>
                            <TableHead className="w-28">Situação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cobranca.previa.map((p) => (
                            <TableRow key={p.titulo_id}>
                              <TableCell className="text-xs">
                                {p.paciente_nome}
                                <div className="text-[10px] text-muted-foreground">
                                  {p.tem_email ? p.email : 'sem e-mail cadastrado'}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs tabular-nums">
                                {p.dias_atraso}d
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {p.etapa}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs tabular-nums">
                                {brl(p.saldo_centavos)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={p.situacao === 'pendente' ? 'secondary' : 'outline'}
                                  className="text-[10px]"
                                >
                                  {p.situacao}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <Separator className="my-3" />
                  <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> D+1: lembrete leve
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> D+7: cobrança normal
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> D+15: último aviso
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    O cron roda todo dia às 8h (Brasília) e cada etapa é enviada uma única vez por
                    título.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rodar a régua de cobrança agora</DialogTitle>
            <DialogDescription>
              Vai tentar enviar e-mail para {cobranca?.resumo.a_contatar_hoje || 0} título(s). Cada
              tentativa é registrada em comunicação, inclusive as que falharem.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              O SMTP não está configurado neste projeto. As tentativas serão registradas como falhas
              com o erro real — nada será enviado de fato até o SMTP ser configurado.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void rodarRegua()} disabled={processando}>
              {processando ? 'Executando…' : 'Executar mesmo assim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
