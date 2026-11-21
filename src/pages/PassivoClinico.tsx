/* Passivo clínico (Etapa 9) — a tela de primeira classe desta etapa.

   "Passivo clínico" é o que a clínica VENDEU e ainda NÃO entregou. É o número
   que a análise competitiva apontou como brecha do mercado: todo mundo mostra
   faturamento, quase ninguém mostra o que está devendo em tratamento.

   Três cuidados que essa tela precisa ter:
   1. Contar só a versão CORRENTE do plano. Se somasse versões antigas, o mesmo
      item apareceria duas vezes (foi copiado para a nova versão).
   2. Não contar plano cancelado: tratamento cancelado não é dívida de serviço.
   3. O total da tela tem de ser IGUAL à soma dos itens listados. Se divergir,
      alguém vai usar o número maior e brigar com o paciente.

   Por isso os três agrupamentos (paciente, profissional, especialidade) e a
   lista vêm do MESMO cálculo, na mesma rota — não de três consultas que podem
   divergir. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, TrendingDown, Search, Users, Stethoscope, Filter } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link } from 'react-router-dom'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Linha {
  plano_id: string
  plano_titulo: string
  versao: number
  plano_status: string
  paciente_id: string
  paciente_nome: string
  profissional_id: string
  profissional_nome: string
  especialidade_id: string
  especialidade_nome: string
  procedimento_nome: string
  procedimento_codigo: string
  fase: string
  dente: string
  valor_centavos: number
}

interface Grupo {
  id: string
  nome: string
  valor_centavos: number
  itens: number
}

interface Resposta {
  total_centavos: number
  total_itens: number
  itens: Linha[]
  por_paciente: Grupo[]
  por_profissional: Grupo[]
  por_especialidade: Grupo[]
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PassivoClinico() {
  const { sessao } = useSessao()
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroProf, setFiltroProf] = useState('todos')
  const [filtroEsp, setFiltroEsp] = useState('todas')
  const [profissionais, setProfissionais] = useState<Array<{ id: string; nome: string }>>([])
  const [especialidades, setEspecialidades] = useState<Array<{ id: string; nome: string }>>([])

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const params = new URLSearchParams()
      if (filtroProf !== 'todos') params.set('profissional_id', filtroProf)
      if (filtroEsp !== 'todas') params.set('especialidade_id', filtroEsp)
      const qs = params.toString()
      const r = await pb.send(`/backend/v1/passivo-clinico${qs ? '?' + qs : ''}`, { method: 'GET' })
      setDados(r as Resposta)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, filtroProf, filtroEsp])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    async function carregarAux() {
      if (!sessao) return
      try {
        const [ps, es] = await Promise.all([
          pb.collection('profissional').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
            sort: 'nome',
          }),
          pb.collection('especialidade').getFullList({ sort: 'nome' }),
        ])
        setProfissionais(ps.map((p) => ({ id: p.id, nome: p.nome as string })))
        setEspecialidades(es.map((e) => ({ id: e.id, nome: e.nome as string })))
      } catch {
        /* silencioso: são só filtros */
      }
    }
    void carregarAux()
  }, [sessao])

  const linhas = useMemo(() => {
    if (!dados) return []
    const t = busca.trim().toLowerCase()
    if (!t) return dados.itens
    return dados.itens.filter(
      (l) =>
        l.paciente_nome.toLowerCase().indexOf(t) >= 0 ||
        l.procedimento_nome.toLowerCase().indexOf(t) >= 0 ||
        (l.dente || '').indexOf(t) >= 0,
    )
  }, [dados, busca])

  // a soma do que está VISÍVEL. Se o filtro de busca estiver ativo, o total
  // exibido na lista não é o total geral — e a tela diz isso.
  const somaVisivel = useMemo(() => linhas.reduce((acc, l) => acc + l.valor_centavos, 0), [linhas])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Passivo clínico</h1>
        <p className="text-sm text-muted-foreground">
          O que a clínica vendeu e ainda não entregou. Conta só a versão vigente de cada plano.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {carregando ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : !dados ? null : dados.total_itens === 0 && dados.total_centavos === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">Nenhum passivo clínico.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Todo tratamento vendido já foi executado — ou nenhum plano foi montado ainda.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* número principal */}
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15">
                  <TrendingDown className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Vendido e não executado
                  </div>
                  <div className="text-2xl font-semibold tabular-nums">
                    {brl(dados.total_centavos)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">
                  {dados.total_itens} procedimento{dados.total_itens === 1 ? '' : 's'} pendente
                  {dados.total_itens === 1 ? '' : 's'}
                </div>
                {linhas.length !== dados.itens.length && (
                  <div className="text-xs text-amber-700">
                    busca mostra {linhas.length} de {dados.itens.length}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar paciente, procedimento ou dente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="w-48">
              <Select value={filtroProf} onValueChange={setFiltroProf}>
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
            <div className="w-48">
              <Select value={filtroEsp} onValueChange={setFiltroEsp}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Especialidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as especialidades</SelectItem>
                  {especialidades.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs defaultValue="detalhe">
            <TabsList>
              <TabsTrigger value="detalhe">Por item</TabsTrigger>
              <TabsTrigger value="paciente">Por paciente</TabsTrigger>
              <TabsTrigger value="profissional">Por profissional</TabsTrigger>
              <TabsTrigger value="especialidade">Por especialidade</TabsTrigger>
            </TabsList>

            <TabsContent value="detalhe">
              <Card>
                <CardContent className="pt-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Procedimento</TableHead>
                          <TableHead className="w-16 text-center">Dente</TableHead>
                          <TableHead className="w-44">Profissional</TableHead>
                          <TableHead className="w-28 text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhas.map((l, idx) => (
                          <TableRow key={`${l.plano_id}-${idx}`}>
                            <TableCell className="text-sm">
                              <Link
                                to={`/pacientes/${l.paciente_id}/plano`}
                                className="hover:underline"
                              >
                                {l.paciente_nome}
                              </Link>
                              <div className="text-[11px] text-muted-foreground">
                                {l.plano_titulo} · v{l.versao}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              {l.procedimento_nome}
                              <div className="text-[11px] text-muted-foreground">
                                {l.fase}
                                {l.especialidade_nome ? ` · ${l.especialidade_nome}` : ''}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">
                              {l.dente || '—'}
                            </TableCell>
                            <TableCell className="text-xs">{l.profissional_nome}</TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {brl(l.valor_centavos)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {busca && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Soma exibida: <strong>{brl(somaVisivel)}</strong> (o total geral acima é{' '}
                      {brl(dados.total_centavos)})
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {(
              [
                ['paciente', dados.por_paciente],
                ['profissional', dados.por_profissional],
                ['especialidade', dados.por_especialidade],
              ] as Array<[string, Grupo[]]>
            ).map(([chave, grupos]) => (
              <TabsContent key={chave} value={chave}>
                <Card>
                  <CardContent className="pt-4">
                    {grupos.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Sem dados neste agrupamento.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {grupos.map((g) => {
                          const pct =
                            dados.total_centavos > 0
                              ? (g.valor_centavos / dados.total_centavos) * 100
                              : 0
                          return (
                            <li key={g.id} className="rounded-md border p-2.5">
                              <div className="mb-1 flex items-baseline justify-between gap-2">
                                <span className="text-sm font-medium">{g.nome}</span>
                                <span className="text-sm tabular-nums">
                                  {brl(g.valor_centavos)}
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-amber-500"
                                  style={{ width: `${Math.max(2, pct)}%` }}
                                />
                              </div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {g.itens} item(ns) · {pct.toFixed(0)}% do passivo
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Este valor é o que falta ENTREGAR, não o que falta receber. Contas a receber entram na
              Etapa 10 — misturar os dois faz o dono da clínica achar que tem dinheiro que não tem.
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  )
}
