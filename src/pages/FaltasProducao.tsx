/* Faltas e produção (Etapa 12) — duas abas, dois propósitos.

   FALTAS mostra ONDE a falta acontece, não só quanto. Três cortes porque cada
   um pede uma ação: paciente (conversa), dia (mover agenda), horário (rever
   oferta). Um número só de "taxa de falta" não diz o que fazer.

   PRODUÇÃO mostra o que foi executado, por profissional e por especialidade —
   e diz na tela que NÃO é repasse. O plano é explícito ("base do futuro
   repasse; nesta etapa é só leitura"), e prometer comissão que não existe faria
   o profissional cobrar com base num número que ninguém combinou. */

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Info,
  TrendingDown,
  Users,
  Clock,
  Stethoscope,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface PacienteFalta {
  id: string
  nome: string
  total: number
  faltou: number
  cancelado: number
  atendido: number
  taxa_falta: number
  perdeu_centavos: number
}

interface Corte {
  total: number
  faltou: number
  cancelado: number
  taxa_falta: number
  dia?: string
  faixa?: string
  ordem?: number
}

interface Faltas {
  periodo: { de: string; ate: string }
  resumo: {
    total_considerado: number
    atendidos: number
    faltou: number
    cancelado: number
    taxa_falta_percentual: number
    taxa_falta_sem_aviso_percentual: number
  }
  explicacao_denominador: string
  por_paciente: PacienteFalta[]
  por_dia_semana: Corte[]
  por_faixa_horario: Corte[]
}

interface Producao {
  periodo: { de: string; ate: string }
  resumo: { total_centavos: number; procedimentos: number; profissionais: number }
  por_profissional: Array<{ id: string; nome: string; valor_centavos: number; quantidade: number }>
  por_especialidade: Array<{ id: string; nome: string; valor_centavos: number; quantidade: number }>
  por_procedimento: Array<{ nome: string; quantidade: number; valor_centavos: number }>
  aviso: string
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function FaltasProducao() {
  const { sessao } = useSessao()
  const agora = new Date()
  const [de, setDe] = useState(
    `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, '0')}-01`,
  )
  const [ate, setAte] = useState(agora.toISOString().slice(0, 10))
  const [faltas, setFaltas] = useState<Faltas | null>(null)
  const [producao, setProducao] = useState<Producao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const [f, p] = await Promise.all([
        pb.send(`/backend/v1/relatorios/faltas?de=${de}&ate=${ate}`, { method: 'GET' }),
        pb.send(`/backend/v1/relatorios/producao?de=${de}&ate=${ate}`, { method: 'GET' }),
      ])
      setFaltas(f as Faltas)
      setProducao(p as Producao)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, de, ate])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function exportarRecebimentos() {
    setAviso('')
    try {
      const r = await pb.send(`/backend/v1/exportar-recebimentos?de=${de}&ate=${ate}`, {
        method: 'GET',
      })
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `recebimentos_${de}_a_${ate}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setAviso(`Exportados ${r.linhas} recebimento(s).`)
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Faltas e produção</h1>
        <p className="text-sm text-muted-foreground">
          Onde a falta acontece e quanto foi produzido. Somente leitura.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {aviso && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}

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
        <Button variant="ghost" size="sm" onClick={() => void exportarRecebimentos()}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          CSV de recebimentos
        </Button>
      </div>

      <Tabs defaultValue="faltas">
        <TabsList>
          <TabsTrigger value="faltas">Faltas</TabsTrigger>
          <TabsTrigger value="producao">Produção</TabsTrigger>
        </TabsList>

        {/* ---------- FALTAS ---------- */}
        <TabsContent value="faltas" className="space-y-3">
          {faltas && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Card>
                  <CardContent className="py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Considerados
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {faltas.resumo.total_considerado}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Atendidos
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-emerald-700">
                      {faltas.resumo.atendidos}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-red-500/30 bg-red-500/5">
                  <CardContent className="py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Faltou
                    </div>
                    <div className="text-lg font-semibold tabular-nums text-red-700">
                      {faltas.resumo.faltou}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      sem aviso {faltas.resumo.taxa_falta_sem_aviso_percentual}%
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Taxa de falta
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                      {faltas.resumo.taxa_falta_percentual}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">inclui cancelados</div>
                  </CardContent>
                </Card>
              </div>

              <Alert className="text-xs">
                <Info className="h-4 w-4" />
                <AlertDescription>{faltas.explicacao_denominador}</AlertDescription>
              </Alert>

              <div className="grid gap-2 md:grid-cols-2">
                {/* por dia */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <TrendingDown className="h-4 w-4" />
                      Por dia da semana
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Onde a falta se concentra — ação: mover a agenda.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {faltas.por_dia_semana.map((d) => (
                      <div key={d.dia} className="flex items-center gap-2">
                        <span className="w-16 text-[11px] text-muted-foreground">{d.dia}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              d.taxa_falta >= 30
                                ? 'bg-red-500'
                                : d.taxa_falta >= 15
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(1, Math.min(100, d.taxa_falta))}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-[11px] tabular-nums">
                          {d.taxa_falta}%
                        </span>
                        <span className="w-14 text-right text-[10px] text-muted-foreground">
                          {d.faltou}/{d.total}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* por horário */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      Por faixa de horário
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Onde a falta se concentra — ação: rever a oferta deste horário.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {faltas.por_faixa_horario.length === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground">Sem dados no período.</p>
                    ) : (
                      faltas.por_faixa_horario.map((h) => (
                        <div key={h.faixa} className="flex items-center gap-2">
                          <span className="w-16 text-[11px] text-muted-foreground">{h.faixa}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${
                                h.taxa_falta >= 30
                                  ? 'bg-red-500'
                                  : h.taxa_falta >= 15
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.max(1, Math.min(100, h.taxa_falta))}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-[11px] tabular-nums">
                            {h.taxa_falta}%
                          </span>
                          <span className="w-14 text-right text-[10px] text-muted-foreground">
                            {h.faltou}/{h.total}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* por paciente */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4" />
                    Por paciente
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Quem falta mais. A coluna de perda é uma <strong>estimativa</strong> pelo valor
                    médio dos títulos do paciente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Paciente</TableHead>
                          <TableHead className="w-20 text-right">Agendados</TableHead>
                          <TableHead className="w-20 text-right">Faltou</TableHead>
                          <TableHead className="w-20 text-right">Cancelou</TableHead>
                          <TableHead className="w-24 text-right">Taxa</TableHead>
                          <TableHead className="w-32 text-right">Perda estimada</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {faltas.por_paciente.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm">{p.nome}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {p.total}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums text-red-700">
                              {p.faltou}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {p.cancelado}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              <Badge
                                variant={p.taxa_falta >= 30 ? 'destructive' : 'secondary'}
                                className="text-[10px]"
                              >
                                {p.taxa_falta}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">
                              {p.perdeu_centavos > 0 ? brl(p.perdeu_centavos) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ---------- PRODUÇÃO ---------- */}
        <TabsContent value="producao" className="space-y-3">
          {producao && (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{producao.aviso}</AlertDescription>
              </Alert>

              <Card>
                <CardContent className="flex flex-wrap items-baseline gap-4 py-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Total produzido
                    </div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {brl(producao.resumo.total_centavos)}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {producao.resumo.procedimentos} procedimento(s) ·{' '}
                    {producao.resumo.profissionais} profissional(is)
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-2 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Stethoscope className="h-4 w-4" />
                      Por profissional executante
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Conta quem <strong>executou</strong>, não quem indicou.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {producao.por_profissional.length === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground">
                        Nenhum procedimento executado no período.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {producao.por_profissional.map((p) => (
                          <li key={p.id} className="flex items-baseline justify-between gap-2">
                            <span className="text-sm">{p.nome}</span>
                            <span className="text-xs text-muted-foreground">
                              {p.quantidade} proc ·{' '}
                              <strong className="tabular-nums text-foreground">
                                {brl(p.valor_centavos)}
                              </strong>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Por especialidade</CardTitle>
                    <CardDescription className="text-xs">
                      A especialidade vem do procedimento, não do profissional.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {producao.por_especialidade.length === 0 ? (
                      <p className="py-3 text-xs text-muted-foreground">Sem dados no período.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {producao.por_especialidade.map((e) => (
                          <li key={e.id} className="flex items-baseline justify-between gap-2">
                            <span className="text-sm">{e.nome}</span>
                            <span className="text-xs text-muted-foreground">
                              {e.quantidade} proc ·{' '}
                              <strong className="tabular-nums text-foreground">
                                {brl(e.valor_centavos)}
                              </strong>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              {producao.por_procedimento.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Por procedimento</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="space-y-1">
                      {producao.por_procedimento.slice(0, 15).map((p) => (
                        <li
                          key={p.nome}
                          className="flex items-baseline justify-between gap-2 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                          <span className="w-10 text-right tabular-nums text-muted-foreground">
                            {p.quantidade}x
                          </span>
                          <span className="w-24 text-right tabular-nums">
                            {brl(p.valor_centavos)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
