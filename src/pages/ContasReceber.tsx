/* Contas a receber (Etapa 10)

   A tela que a recepção usa o dia inteiro. Três coisas mandam no desenho:

   1. O TOTAL VEM DO SERVIDOR, sempre do conjunto filtrado. Nunca somo no
      navegador: se houvesse mais de 500 títulos, a soma da tela divergiria da
      soma real e alguém cobraria o número errado.

   2. ATRASO É POR DATA, não por status gravado. O status 'vencido' só é
      atualizado quando uma rota roda; um título que venceu ontem à noite
      ainda está gravado como 'aberto'. A tela mostra "12 dias" porque compara
      a data com hoje.

   3. REAGENDAMENTO EM LOTE é uma confirmação só. Era o pedido explícito do
      plano: mudar vencimento é operação de fim de mês, e fazer um por um é o
      que faz ninguém fazer.

   A baixa aceita VÁRIAS FORMAS no mesmo ato (Pix + dinheiro é o caso real do
   paciente que paga parte no app e parte em espécie). */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Wallet,
  Filter,
  X,
  Download,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Item {
  id: string
  paciente_id: string
  paciente_nome: string
  descricao: string
  valor_centavos: number
  valor_pago_centavos: number
  saldo_centavos: number
  vencimento: string
  status: string
  vencido: boolean
  dias_atraso: number
  data_competencia: string
  data_liquidacao: string
  plano_contas_id: string
  plano_contas_nome: string
  parcela: number
  parcelas_total: number
  formas: Array<{
    tipo: string
    valor_centavos: number
    forma: string
    data: string
    credito_previsto: string
  }>
}

interface Resposta {
  itens: Item[]
  total_itens: number
  truncado: boolean
  totais: {
    total_centavos: number
    pago_centavos: number
    aberto_centavos: number
    vencido_centavos: number
    n: number
    n_vencidos: number
  }
  hoje: string
}

interface PlanoOpt {
  id: string
  nome: string
}

interface FormaOpt {
  id: string
  nome: string
  prazo: number
}

interface LinhaPag {
  forma: string
  valor: string
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(iso: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const ROTULO: Record<string, string> = {
  aberto: 'Aberto',
  parcial: 'Parcial',
  pago: 'Pago',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
}

export default function ContasReceber() {
  const { sessao } = useSessao()
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [fStatus, setFStatus] = useState('todos')
  const [busca, setBusca] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [fPlano, setFPlano] = useState('todos')

  const [planos, setPlanos] = useState<PlanoOpt[]>([])
  const [formas, setFormas] = useState<FormaOpt[]>([])

  const [selecionados, setSelecionados] = useState<string[]>([])
  // baixa
  const [alvoBaixa, setAlvoBaixa] = useState<Item | null>(null)
  const [linhasPag, setLinhasPag] = useState<LinhaPag[]>([])
  const [dataPag, setDataPag] = useState('')
  const [obsPag, setObsPag] = useState('')
  const [processando, setProcessando] = useState(false)

  // lote
  const [dialogoLote, setDialogoLote] = useState(false)
  const [modoData, setModoData] = useState<'data' | 'deslocamento'>('data')
  const [novaData, setNovaData] = useState('')
  const [deslocamento, setDeslocamento] = useState('30')

  const podeEstornar = ['proprietario', 'gestor'].indexOf(sessao?.papel || '') >= 0

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const p = new URLSearchParams()
      if (fStatus !== 'todos') p.set('status', fStatus)
      if (busca.trim()) p.set('busca', busca.trim())
      if (de) p.set('de', de)
      if (ate) p.set('ate', ate)
      if (fPlano !== 'todos') p.set('plano_contas_id', fPlano)
      const qs = p.toString()
      const r = await pb.send(`/backend/v1/contas-receber${qs ? '?' + qs : ''}`, { method: 'GET' })
      setDados(r as Resposta)
      setSelecionados([])
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, fStatus, busca, de, ate, fPlano])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    async function aux() {
      if (!sessao) return
      try {
        const [pcs, fs] = await Promise.all([
          pb.collection('plano_contas').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && tipo = "receita"`,
            sort: 'codigo',
          }),
          pb.collection('forma_pagamento').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
            sort: 'nome',
          }),
        ])
        setPlanos(pcs.map((p) => ({ id: p.id, nome: p.nome as string })))
        setFormas(
          fs.map((f) => ({
            id: f.id,
            nome: f.nome as string,
            prazo: (f.prazo_compensacao_dias as number) || 0,
          })),
        )
      } catch {
        /* silencioso */
      }
    }
    void aux()
  }, [sessao])

  function abrirBaixa(item: Item) {
    setAlvoBaixa(item)
    setDataPag(new Date().toISOString().slice(0, 10))
    setObsPag('')
    // pré-preenche com o saldo na primeira forma (o caso comum é quitar)
    setLinhasPag([
      {
        forma: formas[0]?.id || '',
        valor: (item.saldo_centavos / 100).toFixed(2).replace('.', ','),
      },
    ])
  }

  async function confirmarBaixa() {
    if (!alvoBaixa) return
    const pagamentos = linhasPag
      .map((l) => ({
        forma_pagamento_id: l.forma,
        valor_centavos: Math.round(
          Number(l.valor.trim().replace(/\./g, '').replace(',', '.') || '0') * 100,
        ),
      }))
      .filter((l) => l.forma && l.valor_centavos > 0)

    if (pagamentos.length === 0) {
      setErro('Informe ao menos uma forma com valor.')
      return
    }

    setProcessando(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/baixar-titulo', {
        method: 'POST',
        body: {
          titulo_id: alvoBaixa.id,
          data_pagamento: dataPag,
          observacao: obsPag,
          pagamentos,
        },
      })
      setAviso(
        r.status === 'pago'
          ? `Título quitado. Recebido ${brl(r.valor_pago_centavos)}.`
          : `Recebimento parcial. Saldo ${brl(r.saldo_centavos)}.`,
      )
      setAlvoBaixa(null)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function estornar(item: Item) {
    const pag = item.formas.filter((f) => f.tipo === 'recebimento')
    if (pag.length === 0) {
      setErro('Este título não tem recebimento para estornar.')
      return
    }
    const motivo = window.prompt(
      'Motivo do estorno (obrigatório). O estorno é um lançamento novo; nada será apagado:',
    )
    if (!motivo || !motivo.trim()) return

    setProcessando(true)
    setErro('')
    try {
      // pega o pagamento mais recente do título para estornar
      const pags = await pb.collection('pagamento').getFullList({
        filter: `titulo_receber_id = "${item.id}" && tipo = "recebimento"`,
        sort: '-data_pagamento',
      })
      if (pags.length === 0) throw new Error('Sem recebimento para estornar.')
      await pb.send('/backend/v1/estornar-pagamento', {
        method: 'POST',
        body: { pagamento_id: pags[0].id, motivo: motivo.trim() },
      })
      setAviso('Estorno registrado como lançamento novo.')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function confirmarLote() {
    if (selecionados.length === 0) return
    setProcessando(true)
    setErro('')
    try {
      const body: Record<string, unknown> = { titulo_ids: selecionados }
      if (modoData === 'data') {
        if (!novaData) throw new Error('Informe a nova data.')
        body.nova_data = novaData
      } else {
        body.deslocamento_dias = Number(deslocamento) || 0
      }
      const r = await pb.send('/backend/v1/reagendar-vencimento', { method: 'POST', body })
      setAviso(
        `${r.alterados} título(s) reagendado(s)` +
          (r.ignorados > 0 ? `, ${r.ignorados} ignorado(s) (pago ou cancelado).` : '.'),
      )
      setDialogoLote(false)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function exportar() {
    const d = de || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
    const a = ate || new Date().toISOString().slice(0, 10)
    setProcessando(true)
    setErro('')
    try {
      const r = await pb.send(`/backend/v1/exportar-contador?de=${d}&ate=${a}`, { method: 'GET' })
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `contador_${d}_a_${a}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setAviso(`Exportado: ${r.linhas} linha(s), líquido ${brl(r.liquido_centavos)}.`)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  const itens = dados?.itens || []
  const elegiveis = useMemo(
    () => itens.filter((i) => i.status !== 'pago' && i.status !== 'cancelado'),
    [itens],
  )
  const todosSelecionados = elegiveis.length > 0 && selecionados.length === elegiveis.length

  function alternar(id: string) {
    setSelecionados((s) => (s.indexOf(id) >= 0 ? s.filter((x) => x !== id) : [...s, id]))
  }

  function alternarTodos() {
    setSelecionados(todosSelecionados ? [] : elegiveis.map((i) => i.id))
  }

  const somaSelecionada = useMemo(() => {
    let v = 0
    for (const i of itens) if (selecionados.indexOf(i.id) >= 0) v += i.saldo_centavos
    return v
  }, [itens, selecionados])

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contas a receber</h1>
          <p className="text-sm text-muted-foreground">
            O que a clínica tem a receber. Competência e liquidação são datas diferentes.
          </p>
        </div>
        {podeEstornar && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportar()}
            disabled={processando}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Exportar contador
          </Button>
        )}
      </div>

      {aviso && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* totais do SERVIDOR */}
      {dados && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Card>
            <CardContent className="py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Em aberto
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {brl(dados.totais.aberto_centavos)}
              </div>
              <div className="text-[11px] text-muted-foreground">{dados.totais.n} título(s)</div>
            </CardContent>
          </Card>
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Vencido
              </div>
              <div className="text-lg font-semibold tabular-nums text-red-700">
                {brl(dados.totais.vencido_centavos)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {dados.totais.n_vencidos} título(s)
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Recebido
              </div>
              <div className="text-lg font-semibold tabular-nums text-emerald-700">
                {brl(dados.totais.pago_centavos)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="text-lg font-semibold tabular-nums">
                {brl(dados.totais.total_centavos)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar paciente ou descrição…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="w-36">
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
              <SelectItem value="parcial">Parcial</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={fPlano} onValueChange={setFPlano}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as categorias</SelectItem>
              {planos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-36">
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9" />
        </div>
        <div className="w-36">
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9" />
        </div>
      </div>

      {/* barra de seleção / lote */}
      {selecionados.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="text-sm">
            <strong>{selecionados.length}</strong> selecionado(s) · saldo{' '}
            <strong className="tabular-nums">{brl(somaSelecionada)}</strong>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelecionados([])}>
              <X className="mr-1 h-3.5 w-3.5" />
              Limpar
            </Button>
            <Button size="sm" onClick={() => setDialogoLote(true)}>
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              Reagendar vencimento
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {carregando ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum título com estes filtros.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox checked={todosSelecionados} onCheckedChange={alternarTodos} />
                    </TableHead>
                    <TableHead>Paciente / descrição</TableHead>
                    <TableHead className="w-28">Vencimento</TableHead>
                    <TableHead className="w-28 text-right">Valor</TableHead>
                    <TableHead className="w-28 text-right">Saldo</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i) => {
                    const quitado = i.status === 'pago' || i.status === 'cancelado'
                    return (
                      <TableRow key={i.id} className={i.vencido ? 'bg-red-500/5' : ''}>
                        <TableCell>
                          {!quitado && (
                            <Checkbox
                              checked={selecionados.indexOf(i.id) >= 0}
                              onCheckedChange={() => alternar(i.id)}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Link
                            to={`/pacientes/${i.paciente_id}/extrato`}
                            className="hover:underline"
                          >
                            {i.paciente_nome}
                          </Link>
                          <div className="text-[11px] text-muted-foreground">
                            {i.descricao}
                            {i.parcelas_total > 1 && ` · ${i.parcela}/${i.parcelas_total}`}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            comp. {dataBr(i.data_competencia)}
                            {i.data_liquidacao ? ` · liq. ${dataBr(i.data_liquidacao)}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {dataBr(i.vencimento)}
                          {i.vencido && (
                            <div className="text-[10px] font-medium text-red-700">
                              {i.dias_atraso}d atraso
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {brl(i.valor_centavos)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {brl(i.saldo_centavos)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              i.status === 'pago'
                                ? 'default'
                                : i.status === 'vencido'
                                  ? 'destructive'
                                  : i.status === 'parcial'
                                    ? 'secondary'
                                    : 'outline'
                            }
                            className="text-[10px]"
                          >
                            {ROTULO[i.status] || i.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {!quitado && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => abrirBaixa(i)}
                              >
                                Baixar
                              </Button>
                            )}
                            {podeEstornar && i.valor_pago_centavos > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive"
                                onClick={() => void estornar(i)}
                              >
                                Estornar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {dados?.truncado && (
            <p className="mt-2 text-xs text-amber-700">
              Mostrando 500 de {dados.total_itens} títulos. Os totais acima consideram todos.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ---------- diálogo de baixa ---------- */}
      <Dialog open={!!alvoBaixa} onOpenChange={(v) => !v && setAlvoBaixa(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
            <DialogDescription>
              {alvoBaixa?.paciente_nome} · {alvoBaixa?.descricao}
              <br />
              Saldo: <strong>{brl(alvoBaixa?.saldo_centavos || 0)}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Data do pagamento</Label>
                <Input type="date" value={dataPag} onChange={(e) => setDataPag(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Observação</Label>
                <Input
                  value={obsPag}
                  onChange={(e) => setObsPag(e.target.value)}
                  placeholder="opcional"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Formas de pagamento</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setLinhasPag([...linhasPag, { forma: '', valor: '' }])}
                >
                  + outra forma
                </Button>
              </div>

              {linhasPag.map((l, idx) => {
                const f = formas.find((x) => x.id === l.forma)
                return (
                  <div key={idx} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select
                        value={l.forma}
                        onValueChange={(v) => {
                          const copia = [...linhasPag]
                          copia[idx].forma = v
                          setLinhasPag(copia)
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Forma" />
                        </SelectTrigger>
                        <SelectContent>
                          {formas.map((fm) => (
                            <SelectItem key={fm.id} value={fm.id}>
                              {fm.nome}
                              {fm.prazo > 0 ? ` (${fm.prazo}d)` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-32">
                      <Input
                        value={l.valor}
                        onChange={(e) => {
                          const copia = [...linhasPag]
                          copia[idx].valor = e.target.value
                          setLinhasPag(copia)
                        }}
                        className="h-9 text-right font-mono"
                        placeholder="0,00"
                      />
                    </div>
                    {linhasPag.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-8 p-0"
                        onClick={() => setLinhasPag(linhasPag.filter((_, k) => k !== idx))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {f && f.prazo > 0 && (
                      <div className="w-24 pb-2 text-[10px] text-muted-foreground">
                        crédito +{f.prazo}d
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvoBaixa(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarBaixa()} disabled={processando}>
              {processando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Confirmar recebimento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- diálogo do lote ---------- */}
      <Dialog open={dialogoLote} onOpenChange={setDialogoLote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar vencimento em lote</DialogTitle>
            <DialogDescription>
              {selecionados.length} título(s). Títulos pagos ou cancelados são ignorados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Tabs value={modoData} onValueChange={(v) => setModoData(v as typeof modoData)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="data">Nova data igual</TabsTrigger>
                <TabsTrigger value="deslocamento">Deslocar dias</TabsTrigger>
              </TabsList>
              <TabsContent value="data" className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  Todos os títulos passam a vencer nesta data.
                </p>
                <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
              </TabsContent>
              <TabsContent value="deslocamento" className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  Soma dias ao vencimento de cada título, mantendo o escalonamento das parcelas.
                  Negativo antecipa.
                </p>
                <Input
                  type="number"
                  value={deslocamento}
                  onChange={(e) => setDeslocamento(e.target.value)}
                  className="text-right"
                />
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoLote(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarLote()} disabled={processando}>
              {processando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
