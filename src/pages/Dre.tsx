/* DRE gerencial (Etapa 11)

   A tela mostra os DEGRAUS, não só o resultado. Isso é deliberado: "sobrou
   R$ 3.000" não diz nada; "receita 20.000, custo direto 8.000, margem 12.000,
   despesa fixa 9.000, resultado 3.000" diz onde mexer.

   Dois avisos que ficam visíveis na tela e não escondidos em documentação:

   1. Este relatório é por COMPETÊNCIA. Ele responde "sobrou alguma coisa?",
      não "tem dinheiro na conta?" — essa é a tela de fluxo de caixa.
   2. Retirada de sócio aparece SEPARADA, abaixo do resultado operacional. Se
      entrasse na conta, a clínica pareceria menos lucrativa do que é — e o dono
      tomaria decisão de preço com base num número que já descontou o próprio
      salário. */

import { useCallback, useEffect, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  ChevronRight,
  Wallet,
  PiggyBank,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
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

interface Categoria {
  nome: string
  valor: number
  tipo?: string
}

interface Dre {
  mes: string
  degraus: {
    receita_bruta_centavos: number
    deducoes_centavos: number
    receita_liquida_centavos: number
    custos_diretos_centavos: number
    margem_contribuicao_centavos: number
    despesas_fixas_centavos: number
    resultado_operacional_centavos: number
  }
  retiradas: {
    prolabore_centavos: number
    distribuicao_centavos: number
    total_centavos: number
    resultado_apos_retiradas_centavos: number
  }
  margem_percentual: number
  receitas_por_categoria: Array<{ nome: string; valor: number; tipo: string }>
  custos_por_categoria: Categoria[]
  despesas_por_categoria: Categoria[]
  titulos_considerados: number
  despesas_consideradas: number
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesAtual(): string {
  const d = new Date()
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

export default function Dre() {
  const { sessao } = useSessao()
  const [mes, setMes] = useState(mesAtual())
  const [dados, setDados] = useState<Dre | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [unidade, setUnidade] = useState('todas')
  const [profissional, setProfissional] = useState('todos')
  const [unidades, setUnidades] = useState<Array<{ id: string; nome: string }>>([])
  const [profissionais, setProfissionais] = useState<Array<{ id: string; nome: string }>>([])

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const p = new URLSearchParams({ mes })
      if (unidade !== 'todas') p.set('unidade', unidade)
      if (profissional !== 'todos') p.set('profissional', profissional)
      const r = await pb.send(`/backend/v1/relatorios/dre?${p.toString()}`, { method: 'GET' })
      setDados(r as Dre)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, mes, unidade, profissional])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    async function aux() {
      if (!sessao) return
      try {
        const [us, ps] = await Promise.all([
          pb
            .collection('unidade')
            .getFullList({ filter: `tenant_id = "${sessao.tenantId}"`, sort: 'nome' }),
          pb.collection('profissional').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
            sort: 'nome',
          }),
        ])
        setUnidades(us.map((u) => ({ id: u.id, nome: u.nome as string })))
        setProfissionais(ps.map((x) => ({ id: x.id, nome: x.nome as string })))
      } catch {
        /* silencioso */
      }
    }
    void aux()
  }, [sessao])

  // navegação de mês
  function mudarMes(delta: number) {
    const [a, m] = mes.split('-').map(Number)
    const d = new Date(Date.UTC(a, m - 1 + delta, 1))
    setMes(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'))
  }

  const nomeMes = (() => {
    const [a, m] = mes.split('-').map(Number)
    return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  })()

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (!dados) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Não foi possível carregar o DRE.'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const d = dados.degraus
  const positivo = d.resultado_operacional_centavos >= 0

  // linha de degrau: rótulo, valor, sinal, destaque
  function Degrau({
    rotulo,
    valor,
    sinal,
    forte,
    destaque,
    nota,
  }: {
    rotulo: string
    valor: number
    sinal?: 'menos' | 'igual' | ''
    forte?: boolean
    destaque?: boolean
    nota?: string
  }) {
    return (
      <div
        className={`flex items-baseline justify-between gap-3 px-3 py-2 ${
          destaque ? 'rounded-md bg-muted/60' : ''
        } ${forte ? 'font-semibold' : ''}`}
      >
        <div className="flex items-baseline gap-2">
          {sinal === 'menos' && <Minus className="h-3 w-3 text-muted-foreground" />}
          {sinal === 'igual' && <span className="text-xs text-muted-foreground">=</span>}
          <span className={forte ? 'text-sm' : 'text-sm text-muted-foreground'}>{rotulo}</span>
          {nota && <span className="text-[10px] text-muted-foreground">{nota}</span>}
        </div>
        <span className={`tabular-nums ${forte ? 'text-base' : 'text-sm'}`}>{brl(valor)}</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">DRE gerencial</h1>
        <p className="text-sm text-muted-foreground">
          Responde "sobrou alguma coisa?". Por competência — o serviço conta no mês em que foi
          feito, pago ou não.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => mudarMes(-1)}>
            ←
          </Button>
          <div className="w-40">
            <Input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => mudarMes(1)}>
            →
          </Button>
        </div>
        <div className="w-44">
          <Select value={unidade} onValueChange={setUnidade}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Unidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as unidades</SelectItem>
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={profissional} onValueChange={setProfissional}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os profissionais</SelectItem>
              {profissionais.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* resultado em destaque */}
      <Card
        className={
          positivo ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'
        }
      >
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-full ${
                positivo ? 'bg-emerald-500/15' : 'bg-red-500/15'
              }`}
            >
              {positivo ? (
                <TrendingUp className="h-5 w-5 text-emerald-700" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-700" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Resultado operacional — {nomeMes}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {brl(d.resultado_operacional_centavos)}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">margem sobre receita líquida</div>
            <div className="text-lg font-medium tabular-nums">{dados.margem_percentual}%</div>
          </div>
        </CardContent>
      </Card>

      {/* degraus */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Do faturamento ao resultado</CardTitle>
          <CardDescription className="text-xs">
            {dados.titulos_considerados} título(s) e {dados.despesas_consideradas} despesa(s) com
            competência em {nomeMes}.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y">
            <Degrau rotulo="Receita bruta" valor={d.receita_bruta_centavos} />
            {d.deducoes_centavos > 0 && (
              <Degrau
                rotulo="(−) Deduções"
                valor={d.deducoes_centavos}
                sinal="menos"
                nota="descontos e glosas"
              />
            )}
            <Degrau
              rotulo="Receita líquida"
              valor={d.receita_liquida_centavos}
              sinal="igual"
              forte
            />

            <Degrau
              rotulo="(−) Custos diretos"
              valor={d.custos_diretos_centavos}
              sinal="menos"
              nota="material, laboratório, repasse"
            />
            <Degrau
              rotulo="Margem de contribuição"
              valor={d.margem_contribuicao_centavos}
              sinal="igual"
              forte
              destaque
            />

            <Degrau
              rotulo="(−) Despesas fixas"
              valor={d.despesas_fixas_centavos}
              sinal="menos"
              nota="aluguel, folha, energia"
            />
            <Degrau
              rotulo="Resultado operacional"
              valor={d.resultado_operacional_centavos}
              sinal="igual"
              forte
              destaque
            />
          </div>

          <Alert className="mt-3">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Margem de contribuição</strong> é quanto cada atendimento deixa depois do
              custo direto. Se ela é positiva e o resultado é negativo, o problema está na estrutura
              fixa, não no preço. Se ela já é negativa, atender mais só aumenta o prejuízo.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* onde o dinheiro foi */}
      <div className="grid gap-2 md:grid-cols-2">
        {dados.custos_por_categoria.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Custos diretos por categoria</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                {dados.custos_por_categoria.map((c) => (
                  <li key={c.nome} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{c.nome}</span>
                    <span className="tabular-nums">{brl(c.valor)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {dados.despesas_por_categoria.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Despesas fixas por categoria</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-1">
                {dados.despesas_por_categoria.map((c) => (
                  <li key={c.nome} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{c.nome}</span>
                    <span className="tabular-nums">{brl(c.valor)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* retiradas — FORA do resultado operacional */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="h-4 w-4" />
            Retirada de sócio
            <Badge variant="outline" className="text-[10px]">
              fora do resultado operacional
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Pró-labore e distribuição são eventos de sócio, não despesa da operação. Por isso ficam
            separados: se entrassem no resultado, a clínica pareceria menos lucrativa do que é.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {dados.retiradas.total_centavos === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Nenhuma retirada neste mês.</p>
          ) : (
            <>
              <div className="divide-y">
                <div className="flex justify-between px-3 py-1.5 text-sm">
                  <span className="text-muted-foreground">Pró-labore</span>
                  <span className="tabular-nums">{brl(dados.retiradas.prolabore_centavos)}</span>
                </div>
                {dados.retiradas.distribuicao_centavos > 0 && (
                  <div className="flex justify-between px-3 py-1.5 text-sm">
                    <span className="text-muted-foreground">Distribuição de lucros</span>
                    <span className="tabular-nums">
                      {brl(dados.retiradas.distribuicao_centavos)}
                    </span>
                  </div>
                )}
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between rounded-md bg-muted/60 px-3 py-2">
                <span className="text-sm font-medium">Resultado depois das retiradas</span>
                <span className="text-sm font-semibold tabular-nums">
                  {brl(dados.retiradas.resultado_apos_retiradas_centavos)}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                <Wallet className="mr-1 inline h-3 w-3" />
                Este é o número que sobra na conta do sócio depois de tirar o próprio pagamento. Não
                é o resultado da clínica — esse está acima, em{' '}
                {brl(d.resultado_operacional_centavos)}.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
