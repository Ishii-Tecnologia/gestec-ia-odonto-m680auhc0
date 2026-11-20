/* Agenda (Etapa 6) — visões diária, semanal e mensal.

   A visão DIÁRIA é a grade por horário: é onde a recepção trabalha. Semanal e
   mensal existem para enxergar ocupação, não para marcar.

   O bloqueio de conflito NÃO é feito aqui. A tela manda o pedido para
   /backend/v1/agendar e mostra a mensagem que o servidor devolveu. Isso é
   deliberado: validação de tela não sobrevive a duas abas abertas, e o índice
   único no banco é quem decide. Se a tela "achasse" que o horário está livre e
   o banco recusasse, a mensagem certa é a do banco. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, CalendarX, Copy, Ban } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  chaveDoDia,
  horaLocal,
  inicioDaSemana,
  inicioDoDia,
  isoLocal,
  minutosDoDia,
  offsetMinutos,
  paraLocal,
  rotuloCompleto,
  rotuloDia,
  somaDias,
  statusCor,
  statusRotulo,
} from '@/lib/agenda'

type Visao = 'dia' | 'semana' | 'mes'

interface Evento {
  id: string
  pacienteId: string
  pacienteNome: string
  profissionalId: string
  profissionalNome: string
  salaId: string
  salaNome: string
  inicio: Date
  fim: Date
  status: string
  tipo: string
  temAlertaGrave: boolean
}

interface Opcao {
  id: string
  nome: string
}

const HORA_INICIO = 7
const HORA_FIM = 20

export default function Agenda() {
  const { sessao } = useSessao()

  const [visao, setVisao] = useState<Visao>('dia')
  const [ref, setRef] = useState<Date>(() => inicioDoDia(new Date()))
  const [eventos, setEventos] = useState<Evento[]>([])
  const [bloqueios, setBloqueios] = useState<
    Array<{
      id: string
      inicio: Date
      fim: Date
      motivo: string
      profissionalId: string
      salaId: string
    }>
  >([])
  const [profissionais, setProfissionais] = useState<Opcao[]>([])
  const [salas, setSalas] = useState<Opcao[]>([])
  const [filtroProf, setFiltroProf] = useState('todos')
  const [filtroSala, setFiltroSala] = useState('todas')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // diálogo de novo agendamento
  const [novoAberto, setNovoAberto] = useState(false)
  const [form, setForm] = useState({
    paciente: '',
    profissional: '',
    sala: '',
    data: '',
    hora: '08:00',
    duracao: '30',
    tipo: 'procedimento',
    obs: '',
  })
  const [salvando, setSalvando] = useState(false)

  // diálogo de ação sobre evento
  const [acaoEvento, setAcaoEvento] = useState<Evento | null>(null)
  const [modoAcao, setModoAcao] = useState<'detalhe' | 'reagendar' | 'cancelar'>('detalhe')
  const [novoInicio, setNovoInicio] = useState({ data: '', hora: '' })
  const [motivo, setMotivo] = useState('')

  const intervalo = useMemo(() => {
    if (visao === 'dia') {
      return { de: inicioDoDia(ref), ate: somaDias(inicioDoDia(ref), 1) }
    }
    if (visao === 'semana') {
      const de = inicioDaSemana(ref)
      return { de, ate: somaDias(de, 7) }
    }
    const de = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const ate = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    return { de, ate }
  }, [visao, ref])

  const carregarOpcoes = useCallback(async () => {
    if (!sessao) return
    try {
      const [ps, ss, pacs] = await Promise.all([
        pb
          .collection('profissional')
          .getFullList({ filter: `tenant_id = "${sessao.tenantId}"`, sort: 'nome' }),
        pb
          .collection('sala')
          .getFullList({ filter: `tenant_id = "${sessao.tenantId}"`, sort: 'nome' }),
        pb.collection('paciente').getFullList({
          filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
          sort: 'nome',
        }),
      ])
      setProfissionais(ps.map((r) => ({ id: r.id, nome: r.nome as string })))
      setSalas(ss.map((r) => ({ id: r.id, nome: r.nome as string })))
      return pacs.map((r) => ({ id: r.id, nome: r.nome as string }))
    } catch {
      return [] as Opcao[]
    }
  }, [sessao])

  const [pacientes, setPacientes] = useState<Opcao[]>([])

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const de = intervalo.de.toISOString().replace('T', ' ').slice(0, 19) + 'Z'
      const ate = intervalo.ate.toISOString().replace('T', ' ').slice(0, 19) + 'Z'

      const filtros = [`tenant_id = "${sessao.tenantId}"`, `inicio >= "${de}"`, `inicio < "${ate}"`]
      if (filtroProf !== 'todos') filtros.push(`profissional_id = "${filtroProf}"`)
      if (filtroSala !== 'todas') filtros.push(`sala_id = "${filtroSala}"`)

      const lista = await pb.collection('agendamento').getFullList({
        filter: filtros.join(' && '),
        sort: 'inicio',
        expand: 'paciente_id,profissional_id,sala_id',
      })

      // alertas graves dos pacientes que aparecem: a recepção precisa saber
      const idsPac = Array.from(new Set(lista.map((r) => r.paciente_id as string)))
      const graves = new Set<string>()
      if (idsPac.length > 0) {
        try {
          const alertas = await pb.collection('alerta_clinico').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && ativo = true && (gravidade = "alta" || gravidade = "critica")`,
          })
          for (const a of alertas) {
            if (idsPac.indexOf(a.paciente_id as string) >= 0) graves.add(a.paciente_id as string)
          }
        } catch {
          /* sem alertas a agenda ainda funciona */
        }
      }

      setEventos(
        lista.map((r) => {
          const exp = r.expand as Record<string, { nome?: string }> | undefined
          const pid = r.paciente_id as string
          return {
            id: r.id,
            pacienteId: pid,
            pacienteNome: exp?.paciente_id?.nome || '—',
            profissionalId: r.profissional_id as string,
            profissionalNome: exp?.profissional_id?.nome || '—',
            salaId: r.sala_id as string,
            salaNome: exp?.sala_id?.nome || '—',
            inicio: paraLocal(r.inicio as string),
            fim: paraLocal(r.fim as string),
            status: (r.status as string) || 'agendado',
            tipo: (r.tipo as string) || '',
            temAlertaGrave: graves.has(pid),
          }
        }),
      )

      // bloqueios
      try {
        const bs = await pb.collection('bloqueio_agenda').getFullList({
          filter: [
            `tenant_id = "${sessao.tenantId}"`,
            `inicio >= "${de}"`,
            `inicio < "${ate}"`,
          ].join(' && '),
          sort: 'inicio',
        })
        setBloqueios(
          bs
            .filter((b) => {
              if (filtroProf !== 'todos' && b.profissional_id !== filtroProf) return false
              if (filtroSala !== 'todas' && b.sala_id !== filtroSala) return false
              return true
            })
            .map((b) => ({
              id: b.id,
              inicio: paraLocal(b.inicio as string),
              fim: paraLocal(b.fim as string),
              motivo: (b.motivo as string) || 'Bloqueio',
              profissionalId: b.profissional_id as string,
              salaId: b.sala_id as string,
            })),
        )
      } catch {
        setBloqueios([])
      }
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao, intervalo, filtroProf, filtroSala])

  useEffect(() => {
    void carregarOpcoes().then((ps) => {
      if (ps) setPacientes(ps)
    })
  }, [carregarOpcoes])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function navegar(dir: -1 | 1) {
    if (visao === 'dia') setRef((d) => somaDias(d, dir))
    else if (visao === 'semana') setRef((d) => somaDias(d, 7 * dir))
    else setRef((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1))
  }

  async function criarAgendamento(e: React.FormEvent) {
    e.preventDefault()
    if (!sessao) return
    setSalvando(true)
    setErro('')
    try {
      const unidade = await pb.collection('unidade').getFullList({
        filter: `tenant_id = "${sessao.tenantId}"`,
      })
      await pb.send('/backend/v1/agendar', {
        method: 'POST',
        body: {
          unidade_id: unidade.length > 0 ? unidade[0].id : '',
          sala_id: form.sala,
          profissional_id: form.profissional,
          paciente_id: form.paciente,
          inicio: isoLocal(form.data, form.hora),
          duracao_minutos: Number(form.duracao),
          tipo: form.tipo,
          observacoes: form.obs,
          offset_minutos: offsetMinutos(),
        },
      })
      setNovoAberto(false)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function reagendar() {
    if (!acaoEvento) return
    setSalvando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/reagendar', {
        method: 'POST',
        body: {
          agendamento_id: acaoEvento.id,
          inicio: isoLocal(novoInicio.data, novoInicio.hora),
          offset_minutos: offsetMinutos(),
        },
      })
      setAcaoEvento(null)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function cancelar() {
    if (!acaoEvento) return
    if (!motivo.trim()) {
      setErro('Informe o motivo do cancelamento.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/cancelar-agendamento', {
        method: 'POST',
        body: { agendamento_id: acaoEvento.id, motivo: motivo.trim() },
      })
      setAcaoEvento(null)
      setMotivo('')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function mudarStatus(status: string) {
    if (!acaoEvento) return
    setSalvando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/status-agendamento', {
        method: 'POST',
        body: { agendamento_id: acaoEvento.id, status },
      })
      setAcaoEvento(null)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  function abrirNovo() {
    setForm((f) => ({
      ...f,
      data: chaveDoDia(ref),
      profissional: f.profissional || profissionais[0]?.id || '',
      sala: f.sala || salas[0]?.id || '',
      paciente: '',
    }))
    setNovoAberto(true)
  }

  const ALTURA_MINUTO = 1 // 1px por minuto -> 13h = 780px
  const totalMinutos = (HORA_FIM - HORA_INICIO) * 60

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            O conflito de horário é recusado pelo banco, não pela tela.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Agendar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void carregar()}
            disabled={carregando}
            title="Atualizar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* controles */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={visao} onValueChange={(v) => setVisao(v as Visao)}>
          <TabsList>
            <TabsTrigger value="dia">Dia</TabsTrigger>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mês</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => navegar(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRef(inicioDoDia(new Date()))}>
            Hoje
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navegar(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <span className="text-sm font-medium capitalize">
          {visao === 'dia' && rotuloCompleto(ref)}
          {visao === 'semana' &&
            `${rotuloDia(inicioDaSemana(ref))} a ${rotuloDia(somaDias(inicioDaSemana(ref), 6))}`}
          {visao === 'mes' && ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </span>

        <div className="ml-auto flex gap-2">
          <Select value={filtroProf} onValueChange={setFiltroProf}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue />
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
          <Select value={filtroSala} onValueChange={setFiltroSala}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as salas</SelectItem>
              {salas.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* GRADE DIÁRIA */}
      {visao === 'dia' && (
        <Card>
          <CardContent className="p-0">
            <div className="relative flex" style={{ height: totalMinutos * ALTURA_MINUTO + 20 }}>
              {/* coluna de horas */}
              <div className="w-14 shrink-0 border-r">
                {Array.from({ length: HORA_FIM - HORA_INICIO + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="text-right text-[11px] text-muted-foreground"
                    style={{ height: 60 * ALTURA_MINUTO, paddingRight: 4 }}
                  >
                    {String(HORA_INICIO + i).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* área de eventos */}
              <div className="relative flex-1">
                {/* linhas de hora */}
                {Array.from({ length: HORA_FIM - HORA_INICIO + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-border/50"
                    style={{ top: i * 60 * ALTURA_MINUTO }}
                  />
                ))}

                {/* bloqueios */}
                {bloqueios.map((b) => {
                  const top = (minutosDoDia(b.inicio) - HORA_INICIO * 60) * ALTURA_MINUTO
                  const altura = Math.max(
                    18,
                    ((b.fim.getTime() - b.inicio.getTime()) / 60000) * ALTURA_MINUTO,
                  )
                  return (
                    <div
                      key={b.id}
                      className="absolute left-1 right-1 rounded border border-dashed border-muted-foreground/40 bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
                      style={{ top, height: altura }}
                    >
                      <Ban className="mr-1 inline h-3 w-3" />
                      {b.motivo}
                    </div>
                  )
                })}

                {/* eventos */}
                {eventos.map((ev) => {
                  const top = (minutosDoDia(ev.inicio) - HORA_INICIO * 60) * ALTURA_MINUTO
                  const altura = Math.max(
                    20,
                    ((ev.fim.getTime() - ev.inicio.getTime()) / 60000) * ALTURA_MINUTO,
                  )
                  return (
                    <button
                      key={ev.id}
                      onClick={() => {
                        setAcaoEvento(ev)
                        setModoAcao('detalhe')
                        setNovoInicio({ data: chaveDoDia(ev.inicio), hora: horaLocal(ev.inicio) })
                        setMotivo('')
                      }}
                      className={cn(
                        'absolute left-1 right-1 overflow-hidden rounded border px-2 py-1 text-left text-[11px] transition-shadow hover:shadow-md',
                        statusCor(ev.status),
                      )}
                      style={{ top, height: altura }}
                    >
                      <div className="flex items-center gap-1 font-medium">
                        {ev.temAlertaGrave && (
                          <span
                            className="text-destructive"
                            title="Paciente com alerta clínico grave"
                          >
                            ⚠
                          </span>
                        )}
                        <span className="truncate">{horaLocal(ev.inicio)}</span>
                        <span className="truncate">{ev.pacienteNome}</span>
                      </div>
                      <div className="truncate opacity-80">
                        {ev.profissionalNome} · {ev.salaNome}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SEMANA */}
      {visao === 'semana' && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 divide-x">
              {Array.from({ length: 7 }).map((_, i) => {
                const dia = somaDias(inicioDaSemana(ref), i)
                const chave = chaveDoDia(dia)
                const doDia = eventos.filter((e) => chaveDoDia(e.inicio) === chave)
                const hoje = chave === chaveDoDia(new Date())
                return (
                  <div key={chave} className="min-h-[300px] p-1.5">
                    <div
                      className={cn(
                        'mb-1.5 rounded px-1 py-0.5 text-[11px] font-medium',
                        hoje && 'bg-primary/10 text-primary',
                      )}
                    >
                      {rotuloDia(dia)}
                    </div>
                    <ul className="space-y-1">
                      {doDia.map((ev) => (
                        <li key={ev.id}>
                          <button
                            onClick={() => {
                              setAcaoEvento(ev)
                              setModoAcao('detalhe')
                              setNovoInicio({
                                data: chaveDoDia(ev.inicio),
                                hora: horaLocal(ev.inicio),
                              })
                            }}
                            className={cn(
                              'w-full rounded border px-1.5 py-1 text-left text-[10px]',
                              statusCor(ev.status),
                            )}
                          >
                            <div className="flex items-center gap-0.5 font-medium">
                              {ev.temAlertaGrave && <span>⚠</span>}
                              {horaLocal(ev.inicio)}
                            </div>
                            <div className="truncate">{ev.pacienteNome}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MÊS */}
      {visao === 'mes' && (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 gap-px bg-border">
              {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => (
                <div key={d} className="bg-muted/50 px-1.5 py-1 text-[11px] font-medium">
                  {d}
                </div>
              ))}
              {(() => {
                const primeiro = new Date(ref.getFullYear(), ref.getMonth(), 1)
                const inicioGrade = inicioDaSemana(primeiro)
                const celulas = []
                for (let i = 0; i < 42; i++) {
                  const dia = somaDias(inicioGrade, i)
                  const chave = chaveDoDia(dia)
                  const doDia = eventos.filter((e) => chaveDoDia(e.inicio) === chave)
                  const outroMes = dia.getMonth() !== ref.getMonth()
                  const hoje = chave === chaveDoDia(new Date())
                  celulas.push(
                    <div
                      key={chave}
                      className={cn(
                        'min-h-[72px] bg-background p-1',
                        outroMes && 'bg-muted/30 text-muted-foreground',
                      )}
                    >
                      <div
                        className={cn(
                          'mb-0.5 text-[11px]',
                          hoje &&
                            'inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground',
                        )}
                      >
                        {dia.getDate()}
                      </div>
                      {doDia.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {doDia.length} atend.
                        </div>
                      )}
                      {doDia.slice(0, 2).map((ev) => (
                        <div key={ev.id} className="truncate text-[10px]">
                          {horaLocal(ev.inicio)} {ev.pacienteNome.split(' ')[0]}
                        </div>
                      ))}
                    </div>,
                  )
                }
                return celulas
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {!carregando && eventos.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Nenhum agendamento neste período.
        </p>
      )}

      {/* ---------- novo agendamento ---------- */}
      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent>
          <form onSubmit={criarAgendamento}>
            <DialogHeader>
              <DialogTitle>Novo agendamento</DialogTitle>
              <DialogDescription>
                Se o horário já estiver ocupado, o banco recusa e você vê o motivo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Paciente</Label>
                <Select
                  value={form.paciente}
                  onValueChange={(v) => setForm((f) => ({ ...f, paciente: v }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {pacientes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <Select
                  value={form.profissional}
                  onValueChange={(v) => setForm((f) => ({ ...f, profissional: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profissionais.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sala</Label>
                <Select
                  value={form.sala}
                  onValueChange={(v) => setForm((f) => ({ ...f, sala: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {salas.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adata">Data</Label>
                <Input
                  id="adata"
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ahora">Hora</Label>
                <Input
                  id="ahora"
                  type="time"
                  step={900}
                  value={form.hora}
                  onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                  required
                />
                <p className="text-[11px] text-muted-foreground">Múltiplos de 15 minutos.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Duração</Label>
                <Select
                  value={form.duracao}
                  onValueChange={(v) => setForm((f) => ({ ...f, duracao: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['15', '30', '45', '60', '90', '120'].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d} minutos
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avaliacao">Avaliação</SelectItem>
                    <SelectItem value="retorno">Retorno</SelectItem>
                    <SelectItem value="procedimento">Procedimento</SelectItem>
                    <SelectItem value="urgencia">Urgência</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="aobs">Observações</Label>
                <Textarea
                  id="aobs"
                  rows={2}
                  value={form.obs}
                  onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovoAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? 'Agendando…' : 'Agendar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- ações sobre o evento ---------- */}
      <Dialog open={!!acaoEvento} onOpenChange={(v) => !v && setAcaoEvento(null)}>
        <DialogContent>
          {acaoEvento && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {acaoEvento.temAlertaGrave && <span className="text-destructive">⚠</span>}
                  {acaoEvento.pacienteNome}
                </DialogTitle>
                <DialogDescription>
                  {acaoEvento.inicio.toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}{' '}
                  · {acaoEvento.profissionalNome} · {acaoEvento.salaNome} ·{' '}
                  {statusRotulo(acaoEvento.status)}
                </DialogDescription>
              </DialogHeader>

              {acaoEvento.temAlertaGrave && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">
                    Este paciente tem alerta clínico grave. Confira antes do atendimento.{' '}
                    <Link to={`/pacientes/${acaoEvento.pacienteId}`} className="underline">
                      Abrir ficha
                    </Link>
                  </AlertDescription>
                </Alert>
              )}

              {modoAcao === 'detalhe' && (
                <div className="space-y-2 py-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Button variant="outline" size="sm" onClick={() => setModoAcao('reagendar')}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Reagendar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModoAcao('cancelar')}
                      className="text-destructive"
                    >
                      <CalendarX className="mr-1.5 h-3.5 w-3.5" />
                      Cancelar
                    </Button>
                  </div>
                  <div className="pt-1 text-xs text-muted-foreground">Alterar situação</div>
                  <div className="flex flex-wrap gap-1.5">
                    {['confirmado', 'atendido', 'faltou'].map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="secondary"
                        className="text-xs"
                        onClick={() => void mudarStatus(s)}
                        disabled={salvando}
                      >
                        {statusRotulo(s)}
                      </Button>
                    ))}
                  </div>
                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link to={`/pacientes/${acaoEvento.pacienteId}`}>Ver ficha do paciente</Link>
                  </Button>
                </div>
              )}

              {modoAcao === 'reagendar' && (
                <div className="space-y-3 py-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="rd">Nova data</Label>
                      <Input
                        id="rd"
                        type="date"
                        value={novoInicio.data}
                        onChange={(e) => setNovoInicio((n) => ({ ...n, data: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rh">Nova hora</Label>
                      <Input
                        id="rh"
                        type="time"
                        step={900}
                        value={novoInicio.hora}
                        onChange={(e) => setNovoInicio((n) => ({ ...n, hora: e.target.value }))}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setModoAcao('detalhe')}>
                      Voltar
                    </Button>
                    <Button onClick={() => void reagendar()} disabled={salvando}>
                      {salvando ? 'Movendo…' : 'Confirmar'}
                    </Button>
                  </DialogFooter>
                </div>
              )}

              {modoAcao === 'cancelar' && (
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="mot">Motivo do cancelamento</Label>
                    <Input
                      id="mot"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: paciente pediu para remarcar"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setModoAcao('detalhe')}>
                      Voltar
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void cancelar()}
                      disabled={salvando}
                    >
                      {salvando ? 'Cancelando…' : 'Cancelar agendamento'}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
