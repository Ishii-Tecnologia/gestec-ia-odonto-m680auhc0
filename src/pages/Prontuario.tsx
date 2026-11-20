/* Prontuário (Etapa 7) — o coração do produto.

   Regra de ouro desta tela: ela NÃO decide quem pode ler. Quem decide é a rota
   /backend/v1/prontuario, que confere sigilo e expiração a cada leitura. Aqui
   só mostro o resultado — inclusive a negativa, que é informação legítima.

   Ordem da tela, da informação mais crítica para a menos:
   alerta clínico (segurança) → evolução (histórico) → odontograma → acesso.
   Retificar nunca apaga: cria registro novo referenciando o anterior. */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Lock,
  Plus,
  Printer,
  ShieldCheck,
  UserPlus,
  History,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { rotuloPapel } from '@/lib/auth'
import { alertaDeRegistro, formatarData, type Alerta } from '@/lib/pacientes'
import { FaixaAlerta } from '@/components/FaixaAlerta'
import { Odontograma, CONDICOES, type MapaDentes } from '@/components/Odontograma'

interface Evolucao {
  id: string
  texto: string
  tipo: string
  motivo_retificacao: string
  referencia_evolucao_id: string
  hash_anterior: string
  hash_registro: string
  profissional_id: string
  autor_id: string
  created: string
}

interface Odonto {
  id: string
  dentes: MapaDentes
  denticao: string
  autor_id: string
  created: string
}

interface Resumo {
  id: string
  conteudo: string
  revisado_em: string
}

interface Acesso {
  id: string
  concedido_por: string
  concedido_para: string
  expira_em: string
  justificativa: string
  ativo: boolean
  nomeConcedido?: string
}

function dataHora(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Prontuario() {
  const { id: pacienteId } = useParams<{ id: string }>()
  const { sessao } = useSessao()
  const navegar = useNavigate()

  const [paciente, setPaciente] = useState<{ nome: string } | null>(null)
  const [titulo, setTitulo] = useState('')
  const [evolucoes, setEvolucoes] = useState<Evolucao[]>([])
  const [odontogramas, setOdontogramas] = useState<Odonto[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [negado, setNegado] = useState('')
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // nova evolução / retificação
  const [dialogo, setDialogo] = useState<'nova' | 'retificar' | null>(null)
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [refId, setRefId] = useState('')
  const [salvando, setSalvando] = useState(false)

  // odontograma
  const [mapa, setMapa] = useState<MapaDentes>({})
  const [denticao, setDenticao] = useState<'permanente' | 'decidua' | 'mista'>('permanente')
  const [profissionalId, setProfissionalId] = useState('')
  const [profissionais, setProfissionais] = useState<Array<{ id: string; nome: string }>>([])

  // acesso
  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string; papel: string }>>([])
  const [dialogoAcesso, setDialogoAcesso] = useState(false)
  const [acessoPara, setAcessoPara] = useState('')
  const [acessoHoras, setAcessoHoras] = useState('24')
  const [acessoJust, setAcessoJust] = useState('')

  const carregar = useCallback(async () => {
    if (!pacienteId || !sessao) return
    setCarregando(true)
    setErro('')
    setNegado('')
    try {
      // alertas: sempre visíveis a papel clínico, independentemente do sigilo
      try {
        const al = await pb.collection('alerta_clinico').getFullList({
          filter: `paciente_id = "${pacienteId}" && ativo = true`,
        })
        setAlertas(al.map(alertaDeRegistro))
      } catch {
        setAlertas([])
      }

      // prontuário pela rota (que decide o sigilo)
      try {
        const r = await pb.send(`/backend/v1/prontuario?paciente_id=${pacienteId}`, {
          method: 'GET',
        })
        setPaciente(r.paciente || null)
        setTitulo(r.titulo || '')
        setEvolucoes(r.evolucoes || [])
        setOdontogramas(r.odontogramas || [])
        setResumo(r.resumo || null)

        // últimos dentes marcados viram o ponto de partida do odontograma
        if (r.odontogramas && r.odontogramas.length > 0) {
          const ultimo = r.odontogramas[r.odontogramas.length - 1]
          setMapa(ultimo.dentes || {})
          setDenticao(ultimo.denticao || 'permanente')
        }
      } catch (err) {
        // o erro 403 aqui não é falha: é a regra funcionando
        const msg = getErrorMessage(err)
        setNegado(msg)
        // mesmo sem prontuário, o nome do paciente aparece na ficha
        try {
          const p = await pb.collection('paciente').getOne(pacienteId)
          setPaciente({ nome: p.nome as string })
        } catch {
          /* nada */
        }
      }

      // dados auxiliares
      try {
        const profs = await pb.collection('profissional').getFullList({
          filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
          sort: 'nome',
        })
        setProfissionais(profs.map((p) => ({ id: p.id, nome: p.nome as string })))
        if (profs.length > 0) setProfissionalId((atual) => atual || profs[0].id)
      } catch {
        /* nada */
      }

      try {
        const us = await pb.collection('users').getFullList({
          filter: `tenant_id = "${sessao.tenantId}" && ativo = true`,
          sort: 'nome',
        })
        setUsuarios(
          us
            .map((u) => ({
              id: u.id,
              nome: (u.nome as string) || (u.email as string),
              papel: (u.papel as string) || '',
            }))
            .filter((u) => ['proprietario', 'gestor', 'dentista'].indexOf(u.papel) >= 0),
        )
      } catch {
        /* nada */
      }

      try {
        const ac = await pb.collection('acesso_prontuario').getFullList({
          filter: `paciente_id = "${pacienteId}"`,
          sort: '-created',
        })
        setAcessos(
          ac.map((a) => ({
            id: a.id,
            concedido_por: a.concedido_por as string,
            concedido_para: a.concedido_para as string,
            expira_em: a.expira_em as string,
            justificativa: (a.justificativa as string) || '',
            ativo: a.ativo !== false,
          })),
        )
      } catch {
        setAcessos([])
      }
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [pacienteId, sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function registrar() {
    if (!pacienteId || !profissionalId) {
      setErro('Selecione o profissional responsável.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/registrar-evolucao', {
        method: 'POST',
        body: {
          paciente_id: pacienteId,
          profissional_id: profissionalId,
          texto: texto.trim(),
          tipo: dialogo === 'retificar' ? 'retificacao' : 'evolucao',
          referencia_evolucao_id: dialogo === 'retificar' ? refId : '',
          motivo_retificacao: dialogo === 'retificar' ? motivo.trim() : '',
        },
      })
      setDialogo(null)
      setTexto('')
      setMotivo('')
      setRefId('')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function salvarOdontograma() {
    if (!pacienteId || !profissionalId) return
    setSalvando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/registrar-odontograma', {
        method: 'POST',
        body: {
          paciente_id: pacienteId,
          profissional_id: profissionalId,
          denticao,
          dentes: mapa,
        },
      })
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function conceder() {
    if (!pacienteId || !acessoPara || !acessoJust.trim()) {
      setErro('Informe para quem e a justificativa.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await pb.send('/backend/v1/conceder-acesso', {
        method: 'POST',
        body: {
          paciente_id: pacienteId,
          concedido_para: acessoPara,
          horas: Number(acessoHoras),
          justificativa: acessoJust.trim(),
        },
      })
      setDialogoAcesso(false)
      setAcessoPara('')
      setAcessoJust('')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function revogar(acessoId: string) {
    try {
      await pb.send('/backend/v1/revogar-acesso', {
        method: 'POST',
        body: { acesso_id: acessoId },
      })
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  function nomeUsuario(id: string): string {
    return usuarios.find((u) => u.id === id)?.nome || id.slice(0, 8)
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navegar('/pacientes')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Pacientes
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Imprimir
          </Button>
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Prontuário — {paciente?.nome || 'paciente'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {titulo === 'autor' && 'Você é o profissional responsável por este registro.'}
          {titulo === 'temporario' && (
            <span className="text-amber-700">
              Acesso temporário — concedido por outro profissional, com prazo.
            </span>
          )}
          {titulo === 'responsavel' && 'Você é o profissional responsável por um atendimento.'}
        </p>
      </div>

      {/* alerta clínico vem primeiro: segurança antes de história */}
      {alertas.length > 0 && <FaixaAlerta alertas={alertas} />}

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {negado ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-base">Prontuário protegido</CardTitle>
            <CardDescription>{negado}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              O sigilo do prontuário é restrito ao profissional responsável. Outro profissional pode
              receber acesso temporário, com justificativa e prazo — concedido por quem já tem
              acesso. Esta tentativa foi registrada na trilha de auditoria.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/pacientes/${pacienteId}`}>Ver a ficha administrativa</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="evolucao">
          <TabsList>
            <TabsTrigger value="evolucao">
              Evolução
              {evolucoes.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {evolucoes.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="odontograma">Odontograma</TabsTrigger>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="acesso">Acesso</TabsTrigger>
          </TabsList>

          {/* ---------- EVOLUÇÃO ---------- */}
          <TabsContent value="evolucao" className="space-y-3">
            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">Evolução clínica</CardTitle>
                  <CardDescription>
                    Registro imutável, em cadeia de hash. Corrigir = retificar, sem apagar.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setDialogo('nova')
                    setTexto('')
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo registro
                </Button>
              </CardHeader>
              <CardContent>
                {evolucoes.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum registro clínico ainda.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {evolucoes.map((e) => (
                      <li key={e.id} className="rounded-md border p-3">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <Badge
                            variant={e.tipo === 'retificacao' ? 'secondary' : 'default'}
                            className="text-[10px]"
                          >
                            {e.tipo === 'retificacao' ? 'Retificação' : 'Evolução'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {dataHora(e.created)}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {e.hash_registro.slice(0, 10)}
                          </span>
                        </div>

                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{e.texto}</p>

                        {e.motivo_retificacao && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            <strong>Motivo da retificação:</strong> {e.motivo_retificacao}
                          </p>
                        )}

                        <div className="mt-2 flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setDialogo('retificar')
                              setRefId(e.id)
                              setTexto('')
                              setMotivo('')
                            }}
                          >
                            <History className="mr-1 h-3 w-3" />
                            Retificar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- ODONTOGRAMA ---------- */}
          <TabsContent value="odontograma" className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Odontograma</CardTitle>
                <CardDescription>
                  Clique no dente para marcar. Cada gravação é um snapshot — o histórico não é
                  sobrescrito.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-40">
                    <Label className="text-xs">Dentição</Label>
                    <Select
                      value={denticao}
                      onValueChange={(v) => setDenticao(v as typeof denticao)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="permanente">Permanente</SelectItem>
                        <SelectItem value="decidua">Decídua</SelectItem>
                        <SelectItem value="mista">Mista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-56">
                    <Label className="text-xs">Profissional responsável</Label>
                    <Select value={profissionalId} onValueChange={setProfissionalId}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar" />
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
                  <Button
                    size="sm"
                    className="mt-4"
                    onClick={() => void salvarOdontograma()}
                    disabled={salvando}
                  >
                    {salvando ? 'Salvando…' : 'Salvar snapshot'}
                  </Button>
                </div>

                <Odontograma valor={mapa} onChange={setMapa} denticao={denticao} />

                {odontogramas.length > 0 && (
                  <div className="border-t pt-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Snapshots anteriores ({odontogramas.length})
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {[...odontogramas]
                        .reverse()
                        .slice(0, 10)
                        .map((o) => (
                          <li key={o.id} className="text-xs text-muted-foreground">
                            {dataHora(o.created)} · {o.denticao} ·{' '}
                            {Object.values(o.dentes || {}).filter((c) => c !== 'higido').length}{' '}
                            dente(s) alterado(s)
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- RESUMO ---------- */}
          <TabsContent value="resumo">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Resumo compartilhável</CardTitle>
                <CardDescription>
                  Conteúdo revisado pelo responsável. Não é derivado do texto da evolução — derivar
                  vazaria justamente o que o sigilo protege.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {resumo ? (
                  <>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{resumo.conteudo}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Revisado em {dataHora(resumo.revisado_em || '')}
                    </p>
                  </>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nenhum resumo revisado para este paciente.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------- ACESSO ---------- */}
          <TabsContent value="acesso" className="space-y-3">
            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">Quem tem acesso a este paciente</CardTitle>
                  <CardDescription>
                    Acesso temporário exige justificativa e prazo. Expirado, deixa de valer sozinho.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDialogoAcesso(true)}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Conceder
                </Button>
              </CardHeader>
              <CardContent>
                {acessos.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nenhuma concessão registrada.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {acessos.map((a) => {
                      const expira = new Date(String(a.expira_em).replace(' ', 'T'))
                      const vencido = expira.getTime() < Date.now()
                      return (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-start justify-between gap-2 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {nomeUsuario(a.concedido_para)}
                              </span>
                              {!a.ativo && (
                                <Badge variant="outline" className="text-[10px]">
                                  revogado
                                </Badge>
                              )}
                              {a.ativo && vencido && (
                                <Badge variant="destructive" className="text-[10px]">
                                  expirado
                                </Badge>
                              )}
                              {a.ativo && !vencido && (
                                <Badge variant="secondary" className="text-[10px]">
                                  ativo
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{a.justificativa}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Concedido por {nomeUsuario(a.concedido_por)} · expira{' '}
                              {dataHora(a.expira_em)}
                            </p>
                          </div>
                          {a.ativo && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => void revogar(a.id)}
                            >
                              Revogar
                            </Button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Seu perfil: {rotuloPapel(sessao?.papel || '')}. O proprietário e o gestor
                administram a clínica, mas não leem prontuário de paciente que não acompanham — é o
                que separa administração de responsabilidade clínica.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>
      )}

      {/* ---------- diálogo: nova evolução / retificação ---------- */}
      <Dialog open={!!dialogo} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogo === 'retificar' ? 'Retificar registro' : 'Novo registro clínico'}
            </DialogTitle>
            <DialogDescription>
              {dialogo === 'retificar'
                ? 'A retificação cria um registro novo. O original permanece intacto e consultável.'
                : 'Registro imutável. Depois de salvo, só se corrige por retificação.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Profissional responsável</Label>
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecionar" />
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

            {dialogo === 'retificar' && (
              <div className="space-y-1.5">
                <Label htmlFor="mot" className="text-xs">
                  Motivo da retificação
                </Label>
                <Input
                  id="mot"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: número do dente incorreto"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="txt" className="text-xs">
                Texto
              </Label>
              <Textarea
                id="txt"
                rows={7}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Queixa, exame, hipótese diagnóstica, conduta..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void registrar()} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- diálogo: conceder acesso ---------- */}
      <Dialog open={dialogoAcesso} onOpenChange={setDialogoAcesso}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conceder acesso temporário</DialogTitle>
            <DialogDescription>
              O acesso expira sozinho no prazo. Só quem já tem acesso ao prontuário pode conceder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Profissional</Label>
              <Select value={acessoPara} onValueChange={setAcessoPara}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios
                    .filter((u) => u.id !== sessao?.id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo</Label>
              <Select value={acessoHoras} onValueChange={setAcessoHoras}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 horas</SelectItem>
                  <SelectItem value="24">24 horas</SelectItem>
                  <SelectItem value="72">3 dias</SelectItem>
                  <SelectItem value="168">7 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="just" className="text-xs">
                Justificativa (obrigatória)
              </Label>
              <Textarea
                id="just"
                rows={3}
                value={acessoJust}
                onChange={(e) => setAcessoJust(e.target.value)}
                placeholder="Ex.: interconsulta sobre o caso do dente 26"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAcesso(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void conceder()} disabled={salvando}>
              {salvando ? 'Concedendo…' : 'Conceder acesso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
