/* Plano de tratamento (Etapa 9) — monta, orça, executa e cancela.

   A tela NÃO decide nada sozinha: preço vem de /resolver-preco, execução e
   cancelamento passam por rota. Aqui só se mostra o resultado e se pede a
   decisão do usuário — porque o número que aparece precisa ser o mesmo que o
   passivo clínico mostra, e ele é calculado no servidor.

   Duas coisas que a tela precisa deixar explícitas, senão o usuário erra:
   1. Ao alterar um plano, ele está criando uma VERSÃO NOVA. O aviso aparece
      antes, não depois — senão ele acha que "editou" e perdeu o combinado.
   2. Ao cancelar com algo executado, a escolha entre crédito e estorno é dele.
      O sistema não escolhe. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Receipt,
  History,
  Ban,
  AlertTriangle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

interface Item {
  id: string
  procedimento_id: string
  procedimento_nome: string
  procedimento_codigo: string
  dente: string
  face: string[]
  quantidade: number
  valor_unitario_centavos: number
  valor_total_centavos: number
  status: string
  substituido_por_item_id: string
  observacao: string
}

interface Fase {
  id: string
  ordem: number
  nome: string
  itens: Item[]
}

interface Orcamento {
  id: string
  plano_versao: number
  valor_bruto_centavos: number
  desconto_centavos: number
  valor_final_centavos: number
  parcelas: number
  status: string
  validade: string
  aprovado_em: string
  motivo_recusa: string
}

interface Completo {
  plano: {
    id: string
    titulo: string
    versao: number
    status: string
    paciente_id: string
    profissional_id: string
    plano_anterior_id: string
    observacoes: string
  }
  solicitado_id: string
  eh_corrente: boolean
  fases: Fase[]
  totais: { bruto_centavos: number; executado_centavos: number; pendente_centavos: number }
  orcamentos: Orcamento[]
  realizados: Array<{
    id: string
    item_tratamento_id: string
    valor_centavos: number
    created: string
  }>
  versoes: Array<{ id: string; versao: number; status: string; created: string }>
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const ROTULO_STATUS: Record<string, string> = {
  proposto: 'Proposto',
  executado: 'Executado',
  substituido: 'Substituído',
  cancelado: 'Cancelado',
}

export default function PlanoTratamento() {
  const { id: pacienteId, planoId } = useParams<{ id?: string; planoId?: string }>()
  const { sessao } = useSessao()
  const navegar = useNavigate()

  const [dados, setDados] = useState<Completo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [procedimentos, setProcedimentos] = useState<
    Array<{ id: string; codigo: string; nome: string; por_dente: boolean }>
  >([])
  const [profissionais, setProfissionais] = useState<Array<{ id: string; nome: string }>>([])

  // diálogos
  const [dialogoOrcamento, setDialogoOrcamento] = useState(false)
  const [dialogoCancelar, setDialogoCancelar] = useState(false)
  const [dialogoDecisao, setDialogoDecisao] = useState<Orcamento | null>(null)

  // formulário de orçamento
  const [desconto, setDesconto] = useState('0,00')
  const [parcelas, setParcelas] = useState('1')
  const [diasValidade, setDiasValidade] = useState('30')
  const [processando, setProcessando] = useState(false)

  // cancelamento
  const [destinoCancel, setDestinoCancel] = useState('')
  const [motivoCancel, setMotivoCancel] = useState('')
  const [motivoDecisao, setMotivoDecisao] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao || !planoId) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErro('')
    try {
      const r = await pb.send(`/backend/v1/plano-completo?plano_id=${planoId}`, { method: 'GET' })
      setDados(r as Completo)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, planoId])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    async function aux() {
      if (!sessao) return
      try {
        const [ps, prs] = await Promise.all([
          pb.collection('procedimento').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
            sort: 'codigo',
          }),
          pb.collection('profissional').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
            sort: 'nome',
          }),
        ])
        setProcedimentos(
          ps.map((p) => ({
            id: p.id,
            codigo: p.codigo as string,
            nome: p.nome as string,
            por_dente: !!p.por_dente,
          })),
        )
        setProfissionais(prs.map((p) => ({ id: p.id, nome: p.nome as string })))
      } catch {
        /* silencioso */
      }
    }
    void aux()
  }, [sessao])

  const itensTodos = useMemo(() => {
    if (!dados) return []
    return dados.fases.flatMap((f) => f.itens)
  }, [dados])

  const temExecucao = useMemo(() => itensTodos.some((i) => i.status === 'executado'), [itensTodos])

  const orcAtual = useMemo(() => {
    if (!dados || dados.orcamentos.length === 0) return null
    return dados.orcamentos[0]
  }, [dados])

  async function gerarOrcamento() {
    if (!dados) return
    setProcessando(true)
    setErro('')
    try {
      const centavos = Math.round(
        Number(desconto.trim().replace(/\./g, '').replace(',', '.') || '0') * 100,
      )
      await pb.send('/backend/v1/gerar-orcamento', {
        method: 'POST',
        body: {
          plano_id: dados.plano.id,
          desconto_centavos: centavos,
          parcelas: Number(parcelas) || 1,
          dias_validade: Number(diasValidade) || 30,
        },
      })
      setDialogoOrcamento(false)
      setAviso('Orçamento gerado.')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function decidir(decisao: 'aprovado' | 'recusado') {
    if (!dialogoDecisao) return
    if (decisao === 'recusado' && !motivoDecisao.trim()) {
      setErro('Informe o motivo da recusa.')
      return
    }
    setProcessando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/decidir-orcamento', {
        method: 'POST',
        body: {
          orcamento_id: dialogoDecisao.id,
          decisao,
          motivo: motivoDecisao.trim(),
        },
      })
      setDialogoDecisao(null)
      setMotivoDecisao('')
      setAviso(decisao === 'aprovado' ? 'Orçamento aprovado.' : 'Recusa registrada.')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function executar(item: Item) {
    setProcessando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/registrar-realizado', {
        method: 'POST',
        body: {
          item_tratamento_id: item.id,
          profissional_executante_id: dados?.plano.profissional_id || '',
        },
      })
      setAviso(`Executado: ${item.procedimento_nome}.`)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  async function cancelar() {
    if (!dados) return
    if (!motivoCancel.trim()) {
      setErro('O motivo do cancelamento é obrigatório.')
      return
    }
    if (temExecucao && !destinoCancel) {
      setErro('Escolha entre crédito e estorno: há procedimento já executado.')
      return
    }
    setProcessando(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/cancelar-tratamento', {
        method: 'POST',
        body: {
          plano_id: dados.plano.id,
          destino: destinoCancel || 'nada',
          motivo: motivoCancel.trim(),
        },
      })
      setDialogoCancelar(false)
      setMotivoCancel('')
      setDestinoCancel('')
      setAviso(
        r.destino === 'credito'
          ? `Cancelado. Crédito de ${brl(r.credito_centavos)} gerado ao paciente.`
          : r.destino === 'estorno'
            ? 'Cancelado com estorno registrado.'
            : 'Tratamento cancelado.',
      )
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  if (!planoId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">Plano de tratamento</h1>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Abra o plano a partir da ficha do paciente.
            <div className="mt-3">
              <Button variant="outline" size="sm" asChild>
                <Link to={pacienteId ? `/pacientes/${pacienteId}` : '/pacientes'}>Voltar</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (!dados) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Plano não encontrado.'}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/pacientes/${pacienteId || ''}`}>Voltar</Link>
        </Button>
      </div>
    )
  }

  const p = dados.plano
  const cancelado = p.status === 'cancelado'
  const temProposto = itensTodos.some((i) => i.status === 'proposto')

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navegar(`/pacientes/${p.paciente_id}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Ficha do paciente
        </Button>
        <div className="flex flex-wrap gap-2">
          {!cancelado && temProposto && (
            <Button variant="outline" size="sm" onClick={() => setDialogoOrcamento(true)}>
              <Receipt className="mr-1.5 h-3.5 w-3.5" />
              Gerar orçamento
            </Button>
          )}
          {!cancelado && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setDestinoCancel(temExecucao ? '' : 'nada')
                setMotivoCancel('')
                setDialogoCancelar(true)
              }}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Cancelar
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{p.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            Versão {p.versao}
            {dados.versoes.length > 1 && ` de ${dados.versoes.length}`} ·{' '}
            <Badge variant={cancelado ? 'outline' : 'secondary'} className="text-[10px]">
              {p.status.replace('_', ' ')}
            </Badge>
          </p>
        </div>
      </div>

      {!dados.eh_corrente && (
        <Alert>
          <History className="h-4 w-4" />
          <AlertDescription>
            Você pediu a versão antiga, mas esta é a versão atual do tratamento (v{p.versao}). As
            versões anteriores continuam no histórico logo abaixo.
          </AlertDescription>
        </Alert>
      )}

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

      {/* totais */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Bruto</div>
            <div className="text-lg font-semibold tabular-nums">
              {brl(dados.totais.bruto_centavos)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Realizado
            </div>
            <div className="text-lg font-semibold tabular-nums text-emerald-700">
              {brl(dados.totais.executado_centavos)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Pendente
            </div>
            <div className="text-lg font-semibold tabular-nums text-amber-700">
              {brl(dados.totais.pendente_centavos)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* orçamento */}
      {orcAtual && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" />
              Orçamento
              <Badge
                variant={
                  orcAtual.status === 'aprovado'
                    ? 'default'
                    : orcAtual.status === 'recusado'
                      ? 'destructive'
                      : 'secondary'
                }
                className="text-[10px]"
              >
                {orcAtual.status}
              </Badge>
            </CardTitle>
            <CardDescription>
              Da versão {orcAtual.plano_versao} · válido até{' '}
              {orcAtual.validade
                ? orcAtual.validade.slice(0, 10).split('-').reverse().join('/')
                : '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bruto</span>
              <span className="tabular-nums">{brl(orcAtual.valor_bruto_centavos)}</span>
            </div>
            {orcAtual.desconto_centavos > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Desconto</span>
                <span className="tabular-nums">− {brl(orcAtual.desconto_centavos)}</span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span className="tabular-nums">{brl(orcAtual.valor_final_centavos)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Parcelas</span>
              <span>
                {orcAtual.parcelas}× de{' '}
                {brl(Math.round(orcAtual.valor_final_centavos / orcAtual.parcelas))}
              </span>
            </div>

            {orcAtual.motivo_recusa && (
              <p className="mt-2 rounded bg-destructive/5 p-2 text-xs">
                <strong>Motivo da recusa:</strong> {orcAtual.motivo_recusa}
              </p>
            )}

            {orcAtual.status === 'proposto' && !cancelado && (
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setMotivoDecisao('')
                    setDialogoDecisao(orcAtual)
                  }}
                >
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Registrar decisão
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* fases e itens */}
      {dados.fases.map((f) => (
        <Card key={f.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {f.ordem}. {f.nome}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y">
              {f.itens.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {i.procedimento_codigo}
                      </span>
                      <span className="text-sm">{i.procedimento_nome}</span>
                      {i.dente && (
                        <Badge variant="outline" className="text-[10px]">
                          dente {i.dente}
                        </Badge>
                      )}
                      <Badge
                        variant={
                          i.status === 'executado'
                            ? 'default'
                            : i.status === 'cancelado'
                              ? 'outline'
                              : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {ROTULO_STATUS[i.status] || i.status}
                      </Badge>
                      {i.substituido_por_item_id && (
                        <span className="text-[10px] text-muted-foreground">substituído</span>
                      )}
                    </div>
                    {i.observacao && (
                      <p className="text-[11px] text-muted-foreground">{i.observacao}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">{brl(i.valor_total_centavos)}</span>
                    {i.status === 'proposto' && !cancelado && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => void executar(i)}
                        disabled={processando}
                      >
                        <PlayCircle className="mr-1 h-3 w-3" />
                        Executar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {/* versões */}
      {dados.versoes.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Histórico de versões</CardTitle>
            <CardDescription className="text-xs">
              Alterar um plano cria versão nova. As anteriores ficam preservadas e consultáveis.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1">
              {dados.versoes.map((v) => (
                <li key={v.id} className="flex items-center justify-between text-xs">
                  <span>
                    v{v.versao}{' '}
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      {v.status}
                    </Badge>
                    {v.id === p.id && <span className="ml-2 text-muted-foreground">atual</span>}
                  </span>
                  <Link
                    to={`/pacientes/${p.paciente_id}/plano/${v.id}`}
                    className="text-muted-foreground hover:underline"
                  >
                    abrir
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---------- diálogo: gerar orçamento ---------- */}
      <Dialog open={dialogoOrcamento} onOpenChange={setDialogoOrcamento}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar orçamento</DialogTitle>
            <DialogDescription>
              Calcula sobre os itens propostos da versão {p.versao}. O valor fica gravado nesta
              versão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="rounded-md bg-muted/50 p-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bruto</span>
                <span className="tabular-nums">{brl(dados.totais.bruto_centavos)}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Desconto (R$)</Label>
                <Input
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  className="text-right font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                  className="text-right"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Validade (dias)</Label>
                <Input
                  type="number"
                  min={1}
                  value={diasValidade}
                  onChange={(e) => setDiasValidade(e.target.value)}
                  className="text-right"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoOrcamento(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void gerarOrcamento()} disabled={processando}>
              {processando ? 'Gerando…' : 'Gerar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- diálogo: decisão do orçamento ---------- */}
      <Dialog open={!!dialogoDecisao} onOpenChange={(v) => !v && setDialogoDecisao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar decisão do paciente</DialogTitle>
            <DialogDescription>
              Aprovar sobe o plano para "aprovado". Recusar exige motivo — é o que permite entender
              por que o paciente não fechou.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="rounded-md bg-muted/50 p-2.5 text-sm">
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span className="tabular-nums">
                  {brl(dialogoDecisao?.valor_final_centavos || 0)}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo (obrigatório para recusar)</Label>
              <Textarea
                rows={3}
                value={motivoDecisao}
                onChange={(e) => setMotivoDecisao(e.target.value)}
                placeholder="Ex.: valor acima do esperado; vai pensar; optou por outra clínica"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => void decidir('recusado')}
              disabled={processando}
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Recusar
            </Button>
            <Button onClick={() => void decidir('aprovado')} disabled={processando}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- diálogo: cancelar ---------- */}
      <Dialog open={dialogoCancelar} onOpenChange={setDialogoCancelar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar tratamento</DialogTitle>
            <DialogDescription>
              Cancelar não apaga nada: o plano, os itens e o orçamento continuam no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            {temExecucao ? (
              <>
                <Alert className="border-amber-500/40 bg-amber-500/5">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <AlertDescription className="text-xs">
                    Já há procedimento executado ({brl(dados.totais.executado_centavos)}). Você
                    precisa escolher o destino do que foi cobrado e não entregue:{' '}
                    <strong>{brl(dados.totais.pendente_centavos)}</strong>.
                  </AlertDescription>
                </Alert>
                <div className="space-y-1.5">
                  <Label className="text-xs">Destino do valor pendente</Label>
                  <Select value={destinoCancel} onValueChange={setDestinoCancel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha uma opção" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credito">
                        Crédito ao paciente (usar em outro tratamento)
                      </SelectItem>
                      <SelectItem value="estorno">Estorno (devolver o dinheiro)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    O sistema não escolhe por você: crédito e estorno têm efeitos contábeis
                    diferentes.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nada foi executado neste tratamento, então não há valor a devolver.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Motivo (obrigatório)</Label>
              <Textarea
                rows={3}
                value={motivoCancel}
                onChange={(e) => setMotivoCancel(e.target.value)}
                placeholder="Ex.: paciente interrompeu por mudança de cidade"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoCancelar(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={() => void cancelar()} disabled={processando}>
              {processando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Confirmar cancelamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
