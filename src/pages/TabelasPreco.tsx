/* Tabelas de preço (Etapa 8)

   A tela mostra a vigência de forma explícita porque é ali que o preço se
   torna ambíguo: duas tabelas do mesmo convênio valendo ao mesmo tempo fazem
   o valor depender da ordem da consulta. A rota /backend/v1/salvar-tabela-preco
   recusa isso; aqui mostro o estado para o usuário entender por que foi
   recusado, em vez de só receber um erro.

   A edição dos itens é uma grade: procedimento x valor. Sem "adicionar item"
   um a um, que numa tabela de 200 procedimentos seria inviável. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, CalendarClock, AlertTriangle, Save, Search } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
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

interface Convenio {
  id: string
  nome: string
}

interface Tabela {
  id: string
  nome: string
  convenio_id: string
  vigencia_inicio: string
  vigencia_fim: string
  ativa: boolean
}

interface Item {
  id: string
  tabela_preco_id: string
  procedimento_id: string
  valor_centavos: number
}

interface Procedimento {
  id: string
  codigo: string
  nome: string
}

/** centavos -> "1.234,56" para exibir; 0 quando ausente */
function brl(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '—'
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** "1.234,56" ou "1234,56" ou "1234.56" -> centavos; null se vazio */
function paraCentavos(texto: string): number | null {
  const t = texto.trim().replace(/\./g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (isNaN(n) || n < 0) return null
  return Math.round(n * 100)
}

/** centavos -> "1234,56" para o input */
function paraInput(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return ''
  return (centavos / 100).toFixed(2).replace('.', ',')
}

function soData(iso: string): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

export default function TabelasPreco() {
  const { sessao } = useSessao()
  const [tabelas, setTabelas] = useState<Tabela[]>([])
  const [convenios, setConvenios] = useState<Convenio[]>([])
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // diálogo de tabela
  const [dialogoTabela, setDialogoTabela] = useState(false)
  const [editando, setEditando] = useState<Tabela | null>(null)
  const [form, setForm] = useState({
    nome: '',
    convenio_id: '',
    vigencia_inicio: '',
    vigencia_fim: '',
    ativa: true,
  })
  const [salvando, setSalvando] = useState(false)

  // grade de itens
  const [tabelaAberta, setTabelaAberta] = useState<Tabela | null>(null)
  const [itens, setItens] = useState<Record<string, string>>({})
  const [buscaItem, setBuscaItem] = useState('')
  const [salvandoItens, setSalvandoItens] = useState(false)

  const podeEditar = ['proprietario', 'gestor', 'dentista'].indexOf(sessao?.papel || '') >= 0

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const [ts, cs, ps] = await Promise.all([
        pb.collection('tabela_preco').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: '-vigencia_inicio',
        }),
        pb.collection('convenio').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'nome',
        }),
        pb.collection('procedimento').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'codigo',
        }),
      ])
      setTabelas(ts as unknown as Tabela[])
      setConvenios(cs as unknown as Convenio[])
      setProcedimentos(ps as unknown as Procedimento[])
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function nomeConvenio(id: string): string {
    return convenios.find((c) => c.id === id)?.nome || 'Particular'
  }

  function abrirNova() {
    setEditando(null)
    const hoje = new Date().toISOString().slice(0, 10)
    setForm({
      nome: '',
      convenio_id: '',
      vigencia_inicio: hoje,
      vigencia_fim: '',
      ativa: true,
    })
    setDialogoTabela(true)
  }

  function abrirEdicao(t: Tabela) {
    setEditando(t)
    setForm({
      nome: t.nome,
      convenio_id: t.convenio_id || '',
      vigencia_inicio: (t.vigencia_inicio || '').slice(0, 10),
      vigencia_fim: (t.vigencia_fim || '').slice(0, 10),
      ativa: t.ativa !== false,
    })
    setDialogoTabela(true)
  }

  async function salvarTabela() {
    setSalvando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/salvar-tabela-preco', {
        method: 'POST',
        body: {
          id: editando?.id || '',
          nome: form.nome,
          convenio_id: form.convenio_id,
          vigencia_inicio: form.vigencia_inicio ? `${form.vigencia_inicio} 00:00:00.000Z` : '',
          vigencia_fim: form.vigencia_fim ? `${form.vigencia_fim} 23:59:59.999Z` : '',
          ativa: form.ativa,
        },
      })
      setDialogoTabela(false)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function abrirItens(t: Tabela) {
    setTabelaAberta(t)
    setBuscaItem('')
    setErro('')
    try {
      const lista = await pb.collection('tabela_preco_item').getFullList({
        filter: `tabela_preco_id = "${t.id}"`,
      })
      const mapa: Record<string, string> = {}
      for (const i of lista) {
        mapa[i.procedimento_id as string] = paraInput(i.valor_centavos as number)
      }
      setItens(mapa)
    } catch (err) {
      setErro(getErrorMessage(err))
      setItens({})
    }
  }

  async function salvarItens() {
    if (!tabelaAberta) return
    setSalvandoItens(true)
    setErro('')
    try {
      const existentes = await pb.collection('tabela_preco_item').getFullList({
        filter: `tabela_preco_id = "${tabelaAberta.id}"`,
      })
      const porProc: Record<string, string> = {}
      for (const e of existentes) porProc[e.procedimento_id as string] = e.id

      for (const [procId, texto] of Object.entries(itens)) {
        const centavos = paraCentavos(texto)
        const idExistente = porProc[procId]

        if (centavos === null) {
          // apagar o item é o correto: "sem preço" não é preço zero
          if (idExistente) await pb.collection('tabela_preco_item').delete(idExistente)
          continue
        }
        if (idExistente) {
          await pb.collection('tabela_preco_item').update(idExistente, {
            valor_centavos: centavos,
          })
        } else {
          await pb.collection('tabela_preco_item').create({
            tenant_id: sessao?.tenantId,
            tabela_preco_id: tabelaAberta.id,
            procedimento_id: procId,
            valor_centavos: centavos,
          })
        }
      }
      setTabelaAberta(null)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvandoItens(false)
    }
  }

  const procedimentosVisiveis = useMemo(() => {
    const t = buscaItem.trim().toLowerCase()
    if (!t) return procedimentos
    return procedimentos.filter(
      (p) => p.codigo.toLowerCase().indexOf(t) >= 0 || p.nome.toLowerCase().indexOf(t) >= 0,
    )
  }, [buscaItem, procedimentos])

  const hoje = new Date().toISOString().slice(0, 10)
  function situacao(t: Tabela): {
    rotulo: string
    variante: 'default' | 'secondary' | 'destructive' | 'outline'
  } {
    if (t.ativa === false) return { rotulo: 'inativa', variante: 'outline' }
    const ini = (t.vigencia_inicio || '').slice(0, 10)
    const fim = (t.vigencia_fim || '').slice(0, 10)
    if (ini && ini > hoje) return { rotulo: 'futura', variante: 'secondary' }
    if (fim && fim < hoje) return { rotulo: 'vencida', variante: 'outline' }
    return { rotulo: 'vigente', variante: 'default' }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tabelas de preço</h1>
        <p className="text-sm text-muted-foreground">
          Uma tabela por convênio (ou particular), com vigência. O paciente herda o convênio dele.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Tabelas</CardTitle>
            <CardDescription>
              Períodos do mesmo convênio não podem se sobrepor — é o que impede dois preços válidos
              ao mesmo tempo.
            </CardDescription>
          </div>
          {podeEditar && (
            <Button size="sm" onClick={abrirNova}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nova tabela
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : tabelas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma tabela cadastrada. Sem tabela, não há preço para orçar.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tabela</TableHead>
                    <TableHead className="w-40">Convênio</TableHead>
                    <TableHead className="w-28">Início</TableHead>
                    <TableHead className="w-28">Fim</TableHead>
                    <TableHead className="w-24">Situação</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabelas.map((t) => {
                    const s = situacao(t)
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm font-medium">{t.nome}</TableCell>
                        <TableCell className="text-xs">
                          {t.convenio_id ? (
                            nomeConvenio(t.convenio_id)
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              particular
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{soData(t.vigencia_inicio)}</TableCell>
                        <TableCell className="text-xs">
                          {t.vigencia_fim ? soData(t.vigencia_fim) : 'sem fim'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.variante} className="text-[10px]">
                            {s.rotulo}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => void abrirItens(t)}
                            >
                              Preços
                            </Button>
                            {podeEditar && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => abrirEdicao(t)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
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
        </CardContent>
      </Card>

      {/* ---------- diálogo de tabela ---------- */}
      <Dialog open={dialogoTabela} onOpenChange={setDialogoTabela}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar tabela' : 'Nova tabela de preço'}</DialogTitle>
            <DialogDescription>
              Deixe o convênio vazio para a tabela particular. Para reajustar, feche a tabela atual
              com uma data de fim e crie a nova.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Particular 2027"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Convênio</Label>
              <Select
                value={form.convenio_id || 'particular'}
                onValueChange={(v) =>
                  setForm({ ...form, convenio_id: v === 'particular' ? '' : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular (sem convênio)</SelectItem>
                  {convenios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Início da vigência</Label>
                <Input
                  type="date"
                  value={form.vigencia_inicio}
                  onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.vigencia_fim}
                  onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })}
                />
              </div>
            </div>
            {form.vigencia_fim && form.vigencia_fim < form.vigencia_inicio && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  O fim não pode ser antes do início.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoTabela(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarTabela()} disabled={salvando || !form.nome}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- grade de itens ---------- */}
      <Dialog open={!!tabelaAberta} onOpenChange={(v) => !v && setTabelaAberta(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preços — {tabelaAberta?.nome}</DialogTitle>
            <DialogDescription>
              Deixe em branco o procedimento que esta tabela não cobre. Em branco não é zero: zero é
              cortesia.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar procedimento…"
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Procedimento</TableHead>
                  <TableHead className="w-32 text-right">Valor (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedimentosVisiveis.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                    <TableCell className="text-xs">{p.nome}</TableCell>
                    <TableCell>
                      <Input
                        value={itens[p.id] || ''}
                        onChange={(e) => setItens({ ...itens, [p.id]: e.target.value })}
                        placeholder="—"
                        className="h-8 text-right font-mono text-xs"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTabelaAberta(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarItens()} disabled={salvandoItens}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {salvandoItens ? 'Salvando…' : 'Salvar preços'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
