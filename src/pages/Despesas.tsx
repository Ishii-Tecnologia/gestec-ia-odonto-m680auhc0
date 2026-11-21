/* Despesas e fechamento de caixa (Etapa 11)

   Duas abas porque são dois momentos: lançar/pagar despesa (contas a pagar) e
   fechar o caixa do dia (conferir dinheiro). Misturar as duas numa tela só faz
   o operador fechar caixa achando que está lançando despesa.

   O que a tela NÃO deixa fazer, de propósito:
   - digitar o "valor do sistema" no fechamento: ele vem dos pagamentos. Se
     fosse digitável, a diferença sairia sempre zero e o fechamento perderia a
     função de revelar quebra de caixa.
   - informar o responsável como texto livre: é o usuário logado, e é ele que
     responde pelo valor. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  CheckCircle2,
  CalendarDays,
  Download,
  Wallet,
  AlertTriangle,
  Loader2,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
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

interface Despesa {
  id: string
  fornecedor: string
  descricao: string
  plano_contas_id: string
  centro_custo_id: string
  valor_centavos: number
  data_competencia: string
  vencimento: string
  pago_em: string
  recorrente: boolean
}

interface FormaCaixa {
  id: string
  nome: string
  prazo_compensacao_dias: number
  sistema_centavos: number
  lancamentos: number
  fechado: boolean
  fechamento: {
    valor_sistema_centavos: number
    valor_conferido_centavos: number
    diferenca_centavos: number
    responsavel: string
    observacao: string
  } | null
}

interface Categoria {
  id: string
  nome: string
  tipo: string
  codigo: string
}

interface Centro {
  id: string
  nome: string
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataBr(iso: string): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

function paraCentavos(t: string): number {
  const v = t.trim().replace(/\./g, '').replace(',', '.')
  const n = Number(v || '0')
  return isNaN(n) ? 0 : Math.round(n * 100)
}

export default function Despesas() {
  const { sessao } = useSessao()
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [centros, setCentros] = useState<Centro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [fStatus, setFStatus] = useState('todas')
  const [fCategoria, setFCategoria] = useState('todas')

  // nova despesa
  const [dialogo, setDialogo] = useState(false)
  const [form, setForm] = useState({
    fornecedor: '',
    descricao: '',
    plano_contas_id: '',
    centro_custo_id: '',
    valor: '',
    competencia: new Date().toISOString().slice(0, 10),
    vencimento: new Date().toISOString().slice(0, 10),
    recorrente: false,
  })
  const [processando, setProcessando] = useState(false)

  // caixa
  const [diaCaixa, setDiaCaixa] = useState(new Date().toISOString().slice(0, 10))
  const [formas, setFormas] = useState<FormaCaixa[]>([])
  const [conferidos, setConferidos] = useState<Record<string, string>>({})
  const [obsCaixa, setObsCaixa] = useState<Record<string, string>>({})
  const [carregandoCaixa, setCarregandoCaixa] = useState(false)

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const [ds, cs, ccs] = await Promise.all([
        pb.collection('despesa').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: '-data_competencia,-vencimento',
        }),
        pb.collection('plano_contas').getFullList({
          filter: `tenant_id = "${sessao.tenantId}" && (tipo = "custo" || tipo = "despesa")`,
          sort: 'codigo',
        }),
        pb.collection('centro_custo').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'nome',
        }),
      ])
      setDespesas(ds as unknown as Despesa[])
      setCategorias(cs as unknown as Categoria[])
      setCentros(ccs as unknown as Centro[])
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  const carregarCaixa = useCallback(async () => {
    if (!sessao) return
    setCarregandoCaixa(true)
    try {
      const r = await pb.send(`/backend/v1/caixa-do-dia?data=${diaCaixa}`, { method: 'GET' })
      setFormas((r.formas || []) as FormaCaixa[])
      const pres: Record<string, string> = {}
      for (const f of r.formas || []) {
        if (f.fechado && f.fechamento) {
          pres[f.id] = (f.fechamento.valor_conferido_centavos / 100).toFixed(2).replace('.', ',')
        }
      }
      setConferidos(pres)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregandoCaixa(false)
    }
  }, [sessao, diaCaixa])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    void carregarCaixa()
  }, [carregarCaixa])

  const filtradas = useMemo(() => {
    return despesas.filter((d) => {
      if (fStatus === 'pagas' && !d.pago_em) return false
      if (fStatus === 'a_pagar' && d.pago_em) return false
      if (fCategoria !== 'todas' && d.plano_contas_id !== fCategoria) return false
      return true
    })
  }, [despesas, fStatus, fCategoria])

  const totais = useMemo(() => {
    let total = 0
    let pago = 0
    for (const d of filtradas) {
      total += d.valor_centavos
      if (d.pago_em) pago += d.valor_centavos
    }
    return { total, pago, aPagar: total - pago }
  }, [filtradas])

  function nomeCategoria(id: string): string {
    const c = categorias.find((x) => x.id === id)
    return c ? `${c.codigo} ${c.nome}` : ''
  }

  async function salvar() {
    if (!sessao) return
    if (!form.fornecedor || !form.plano_contas_id) {
      setErro('Informe o fornecedor e a categoria.')
      return
    }
    const valor = paraCentavos(form.valor)
    if (valor <= 0) {
      setErro('Informe o valor.')
      return
    }
    setProcessando(true)
    setErro('')
    try {
      await pb.collection('despesa').create({
        tenant_id: sessao.tenantId,
        fornecedor: form.fornecedor.trim(),
        descricao: form.descricao.trim(),
        plano_contas_id: form.plano_contas_id,
        centro_custo_id: form.centro_custo_id || '',
        valor_centavos: valor,
        data_competencia: `${form.competencia} 00:00:00.000Z`,
        vencimento: `${form.vencimento} 00:00:00.000Z`,
        recorrente: form.recorrente,
        registrado_por: sessao.id,
      })
      setDialogo(false)
      setForm({
        fornecedor: '',
        descricao: '',
        plano_contas_id: '',
        centro_custo_id: '',
        valor: '',
        competencia: new Date().toISOString().slice(0, 10),
        vencimento: new Date().toISOString().slice(0, 10),
        recorrente: false,
      })
      setAviso('Despesa lançada.')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function pagar(d: Despesa) {
    setProcessando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/pagar-despesa', {
        method: 'POST',
        body: { despesa_id: d.id },
      })
      setAviso(`Pago: ${d.fornecedor}.`)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function fechar(forma: FormaCaixa) {
    const conferido = paraCentavos(conferidos[forma.id] || '0')
    setProcessando(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/fechar-caixa', {
        method: 'POST',
        body: {
          data: diaCaixa,
          forma_pagamento_id: forma.id,
          valor_conferido_centavos: conferido,
          observacao: obsCaixa[forma.id] || '',
        },
      })
      setAviso(
        r.situacao === 'confere'
          ? `Caixa de ${forma.nome} confere.`
          : `Caixa de ${forma.nome}: ${r.situacao} de ${brl(Math.abs(r.diferenca_centavos))}.`,
      )
      await carregarCaixa()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function exportar() {
    const de = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
    const ate = new Date().toISOString().slice(0, 10)
    setProcessando(true)
    try {
      const r = await pb.send(`/backend/v1/exportar-despesas?de=${de}&ate=${ate}`, {
        method: 'GET',
      })
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `despesas_${de}_a_${ate}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setAviso(`Exportadas ${r.linhas} despesa(s).`)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Despesas e caixa</h1>
          <p className="text-sm text-muted-foreground">
            O que sai e o que entrou na gaveta. O DRE usa competência; o caixa usa o dia.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void exportar()} disabled={processando}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Exportar contador
        </Button>
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

      <Tabs defaultValue="despesas">
        <TabsList>
          <TabsTrigger value="despesas">Despesas</TabsTrigger>
          <TabsTrigger value="caixa">Fechamento de caixa</TabsTrigger>
        </TabsList>

        {/* ---------- DESPESAS ---------- */}
        <TabsContent value="despesas" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="a_pagar">A pagar</SelectItem>
                  <SelectItem value="pagas">Pagas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <Select value={fCategoria} onValueChange={setFCategoria}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as categorias</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto">
              <Button size="sm" onClick={() => setDialogo(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nova despesa
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardContent className="py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total
                </div>
                <div className="text-base font-semibold tabular-nums">{brl(totais.total)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Pago
                </div>
                <div className="text-base font-semibold tabular-nums text-emerald-700">
                  {brl(totais.pago)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  A pagar
                </div>
                <div className="text-base font-semibold tabular-nums text-amber-700">
                  {brl(totais.aPagar)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4">
              {carregando ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : filtradas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma despesa com estes filtros.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead className="w-44">Categoria</TableHead>
                        <TableHead className="w-24">Competência</TableHead>
                        <TableHead className="w-24">Vencimento</TableHead>
                        <TableHead className="w-28 text-right">Valor</TableHead>
                        <TableHead className="w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtradas.map((d) => (
                        <TableRow key={d.id} className={d.pago_em ? '' : 'bg-amber-500/5'}>
                          <TableCell className="text-sm">
                            {d.fornecedor}
                            {d.recorrente && (
                              <Badge variant="outline" className="ml-1.5 text-[10px]">
                                recorrente
                              </Badge>
                            )}
                            {d.descricao && (
                              <div className="text-[11px] text-muted-foreground">{d.descricao}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">
                            {nomeCategoria(d.plano_contas_id)}
                          </TableCell>
                          <TableCell className="text-xs">{dataBr(d.data_competencia)}</TableCell>
                          <TableCell className="text-xs">{dataBr(d.vencimento)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {brl(d.valor_centavos)}
                          </TableCell>
                          <TableCell>
                            {d.pago_em ? (
                              <Badge variant="secondary" className="text-[10px]">
                                pago {dataBr(d.pago_em)}
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => void pagar(d)}
                                disabled={processando}
                              >
                                Pagar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- CAIXA ---------- */}
        <TabsContent value="caixa" className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="w-44">
              <Label className="text-xs">Dia</Label>
              <Input
                type="date"
                value={diaCaixa}
                onChange={(e) => setDiaCaixa(e.target.value)}
                className="h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => void carregarCaixa()}>
              Carregar
            </Button>
          </div>

          <Alert>
            <Wallet className="h-4 w-4" />
            <AlertDescription className="text-xs">
              O <strong>valor do sistema</strong> vem dos pagamentos registrados — não é digitável.
              Se fosse, a diferença sairia sempre zero e o fechamento não revelaria quebra de caixa.
            </AlertDescription>
          </Alert>

          {carregandoCaixa ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : formas.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nenhum recebimento registrado em {dataBr(diaCaixa)}.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {formas.map((f) => {
                const informado = conferidos[f.id] || ''
                const cent = paraCentavos(informado)
                const diff = informado ? cent - f.sistema_centavos : 0
                return (
                  <Card key={f.id}>
                    <CardContent className="space-y-2 pt-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{f.nome}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {f.lancamentos} lançamento(s)
                          </Badge>
                          {f.fechado && (
                            <Badge variant="secondary" className="text-[10px]">
                              fechado
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            sistema
                          </div>
                          <div className="text-sm font-medium tabular-nums">
                            {brl(f.sistema_centavos)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-36">
                          <Label className="text-[10px]">Conferido (R$)</Label>
                          <Input
                            value={informado}
                            onChange={(e) =>
                              setConferidos({ ...conferidos, [f.id]: e.target.value })
                            }
                            placeholder="0,00"
                            className="h-8 text-right font-mono text-xs"
                          />
                        </div>
                        <div className="min-w-[140px] flex-1">
                          <Label className="text-[10px]">Observação</Label>
                          <Input
                            value={obsCaixa[f.id] || ''}
                            onChange={(e) => setObsCaixa({ ...obsCaixa, [f.id]: e.target.value })}
                            placeholder="opcional"
                            className="h-8 text-xs"
                          />
                        </div>
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => void fechar(f)}
                          disabled={processando || !informado}
                        >
                          {processando ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : f.fechado ? (
                            'Refazer'
                          ) : (
                            'Fechar'
                          )}
                        </Button>
                      </div>

                      {informado && (
                        <div
                          className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                            diff === 0
                              ? 'bg-emerald-500/10 text-emerald-800'
                              : 'bg-red-500/10 text-red-800'
                          }`}
                        >
                          <span>
                            {diff === 0 ? (
                              'Confere'
                            ) : (
                              <>
                                <AlertTriangle className="mr-1 inline h-3 w-3" />
                                {diff > 0 ? 'Sobra' : 'Falta'}
                              </>
                            )}
                          </span>
                          <span className="font-medium tabular-nums">{brl(Math.abs(diff))}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- diálogo: nova despesa ---------- */}
      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova despesa</DialogTitle>
            <DialogDescription>
              A competência é o mês a que a despesa pertence (entra no DRE). O vencimento é quando o
              dinheiro sai (entra no fluxo de caixa).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fornecedor</Label>
              <Input
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                placeholder="Dental Cremer"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Materiais de consumo"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={form.plano_contas_id}
                  onValueChange={(v) => setForm({ ...form, plano_contas_id: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.codigo} {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Centro de custo</Label>
                <Select
                  value={form.centro_custo_id || 'nenhum'}
                  onValueChange={(v) =>
                    setForm({ ...form, centro_custo_id: v === 'nenhum' ? '' : v })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    {centros.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  className="text-right font-mono"
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Competência</Label>
                <Input
                  type="date"
                  value={form.competencia}
                  onChange={(e) => setForm({ ...form, competencia: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date"
                  value={form.vencimento}
                  onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.recorrente}
                onCheckedChange={(v) => setForm({ ...form, recorrente: v })}
              />
              <Label className="text-xs">
                Recorrente (reconhecida todo mês, paga na data própria)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={processando}>
              {processando ? 'Salvando…' : 'Lançar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
