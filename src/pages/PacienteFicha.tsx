/* Ficha do paciente (Etapa 5) — abas: dados, alertas clínicos, anamnese.

   A faixa de alerta grave fica ACIMA das abas, fixa: não importa em que aba a
   pessoa esteja, o alerta está à vista.

   Anamnese é histórico em versões. Não existe "editar": existe "nova versão".
   A lista mostra todas, da mais nova para a mais antiga, e cada uma abre para
   leitura. A versão antiga continua consultável para sempre — é o que o plano
   exige e o que faz sentido clínico: o que o paciente respondeu em 2024 não
   pode ser reescrito em 2026. */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  Plus,
  AlertTriangle,
  FileText,
  ClipboardList,
  Banknote,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { podeAcessarClinico } from '@/lib/auth'
import {
  GRAVIDADES,
  TIPOS_ALERTA,
  alertaDeRegistro,
  anamneseDeRegistro,
  deRegistro,
  formatarCpf,
  formatarData,
  idadeEmAnos,
  responsavelDeRegistro,
  type Alerta,
  type Anamnese,
  type Gravidade,
  type Paciente,
  type Responsavel,
  type TipoAlerta,
} from '@/lib/pacientes'
import { FaixaAlerta } from '@/components/FaixaAlerta'

/* Perguntas padrão da anamnese. Ficam aqui, no código, porque são o
   questionário inicial do produto — não são dado da clínica. Se virarem
   configuráveis, migram para coleção própria numa etapa futura. */
const PERGUNTAS: Array<{ chave: string; texto: string }> = [
  { chave: 'cardiaca', texto: 'Tem problema cardíaco ou pressão alta?' },
  { chave: 'diabetes', texto: 'Tem diabetes?' },
  { chave: 'coagulacao', texto: 'Tem problema de coagulação ou sangramento?' },
  { chave: 'alergia_medicamento', texto: 'Tem alergia a algum medicamento? Qual?' },
  { chave: 'medicamento_uso', texto: 'Usa algum medicamento regularmente?' },
  { chave: 'cirurgia', texto: 'Já fez cirurgia? Alguma complicação?' },
  { chave: 'gestante', texto: 'Está grávida ou amamentando?' },
  { chave: 'fumo_alcool', texto: 'Fuma ou faz uso frequente de álcool?' },
  { chave: 'ultima_consulta', texto: 'Quando foi ao dentista pela última vez?' },
]

export default function PacienteFicha() {
  const { id } = useParams<{ id: string }>()
  const { sessao } = useSessao()
  const navegar = useNavigate()
  const clinico = podeAcessarClinico(sessao?.papel || '')

  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [responsavel, setResponsavel] = useState<Responsavel | null>(null)
  const [anamneses, setAnamneses] = useState<Anamnese[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // formulário de novo alerta
  const [novoAlerta, setNovoAlerta] = useState(false)
  const [tipo, setTipo] = useState<TipoAlerta>('alergia')
  const [descricao, setDescricao] = useState('')
  const [gravidade, setGravidade] = useState<Gravidade>('media')
  const [salvandoAlerta, setSalvandoAlerta] = useState(false)

  // nova anamnese
  const [novaAnamnese, setNovaAnamnese] = useState(false)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [obsAnamnese, setObsAnamnese] = useState('')
  const [salvandoAnamnese, setSalvandoAnamnese] = useState(false)

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    setErro('')
    try {
      const p = await pb.collection('paciente').getOne(id)
      setPaciente(deRegistro(p))

      const al = await pb.collection('alerta_clinico').getFullList({
        filter: `paciente_id = "${id}"`,
        sort: '-created',
      })
      setAlertas(al.map(alertaDeRegistro))

      const rl = await pb.collection('responsavel_legal').getFullList({
        filter: `paciente_id = "${id}"`,
      })
      setResponsavel(rl.length > 0 ? responsavelDeRegistro(rl[0]) : null)

      if (clinico) {
        try {
          const an = await pb.collection('anamnese').getFullList({
            filter: `paciente_id = "${id}"`,
            sort: '-versao',
            expand: 'autor_id',
          })
          setAnamneses(an.map(anamneseDeRegistro))
        } catch (_) {
          setAnamneses([])
        }
      }
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [id, clinico])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvarAlerta(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !sessao) return
    setSalvandoAlerta(true)
    setErro('')
    try {
      await pb.collection('alerta_clinico').create({
        tenant_id: sessao.tenantId,
        paciente_id: id,
        tipo,
        descricao: descricao.trim(),
        gravidade,
        ativo: true,
      })
      setNovoAlerta(false)
      setDescricao('')
      setTipo('alergia')
      setGravidade('media')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvandoAlerta(false)
    }
  }

  async function desativarAlerta(a: Alerta) {
    try {
      await pb.collection('alerta_clinico').update(a.id, { ativo: false })
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  async function salvarAnamnese(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !sessao) return
    setSalvandoAnamnese(true)
    setErro('')
    try {
      // `versao` e `autor_id` são atribuídos pelo servidor (hooks) — não
      // mandamos, e o servidor sobrescreveria se mandássemos.
      // `tenant_id` precisa ir no corpo: a regra de create da coleção o exige
      // na avaliação, e o hook não substitui isso.
      await pb.collection('anamnese').create({
        tenant_id: sessao.tenantId,
        paciente_id: id,
        respostas,
        observacoes: obsAnamnese.trim(),
      })
      setNovaAnamnese(false)
      setRespostas({})
      setObsAnamnese('')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvandoAnamnese(false)
    }
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (!paciente) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Alert variant="destructive">
          <AlertDescription>{erro || 'Paciente não encontrado.'}</AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-3" onClick={() => navegar('/pacientes')}>
          Voltar
        </Button>
      </div>
    )
  }

  const idade = idadeEmAnos(paciente.dataNascimento)
  const graves = alertas.filter(
    (a) => a.ativo && (a.gravidade === 'alta' || a.gravidade === 'critica'),
  )

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navegar('/pacientes')}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Pacientes
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{paciente.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {formatarCpf(paciente.cpf)}
            {idade !== null && ` · ${idade} anos`}
            {paciente.telefone && ` · ${paciente.telefone}`}
            {!paciente.ativo && ' · inativo'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {clinico && (
            <Button size="sm" onClick={() => navegar(`/pacientes/${paciente.id}/prontuario`)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Prontuário
            </Button>
          )}
          {clinico && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navegar(`/pacientes/${paciente.id}/plano`)}
            >
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              Plano
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => navegar(`/pacientes/${paciente.id}/extrato`)}
          >
            <Banknote className="mr-1.5 h-3.5 w-3.5" />
            Financeiro
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navegar(`/pacientes/${paciente.id}/editar`)}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      </div>

      {/* Faixa fixa: aparece em qualquer aba */}
      {graves.length > 0 && <FaixaAlerta alertas={graves} />}

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="alertas">
            Alertas
            {alertas.filter((a) => a.ativo).length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {alertas.filter((a) => a.ativo).length}
              </Badge>
            )}
          </TabsTrigger>
          {clinico && <TabsTrigger value="anamnese">Anamnese</TabsTrigger>}
        </TabsList>

        {/* ---------- DADOS ---------- */}
        <TabsContent value="dados" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cadastro</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Linha rotulo="Nome" valor={paciente.nome} />
              <Linha rotulo="CPF" valor={formatarCpf(paciente.cpf)} />
              <Linha rotulo="Nascimento" valor={formatarData(paciente.dataNascimento)} />
              <Linha rotulo="Sexo" valor={paciente.sexo ? paciente.sexo.replace('_', ' ') : '—'} />
              <Linha rotulo="Telefone" valor={paciente.telefone || '—'} />
              <Linha rotulo="E-mail" valor={paciente.email || '—'} />
              <Linha
                rotulo="Endereço"
                valor={
                  [paciente.logradouro, paciente.numero, paciente.bairro, paciente.cidade]
                    .filter(Boolean)
                    .join(', ') || '—'
                }
              />
              <Linha rotulo="CEP" valor={paciente.cep || '—'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Responsável legal</CardTitle>
              <CardDescription>
                {responsavel ? 'Quem responde pelo paciente.' : 'Nenhum responsável registrado.'}
              </CardDescription>
            </CardHeader>
            {responsavel && (
              <CardContent className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Linha rotulo="Nome" valor={responsavel.nome} />
                <Linha rotulo="Parentesco" valor={responsavel.parentesco || '—'} />
                <Linha rotulo="CPF" valor={formatarCpf(responsavel.cpf)} />
                <Linha rotulo="Telefone" valor={responsavel.telefone || '—'} />
              </CardContent>
            )}
          </Card>

          {paciente.observacoes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {paciente.observacoes}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------- ALERTAS ---------- */}
        <TabsContent value="alertas" className="space-y-3">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Alertas clínicos</CardTitle>
                <CardDescription>
                  Alergia, condição sistêmica, medicação. Grave aparece em toda tela.
                </CardDescription>
              </div>
              {clinico && (
                <Button size="sm" variant="outline" onClick={() => setNovoAlerta(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo alerta
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {alertas.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nenhum alerta registrado.
                </p>
              ) : (
                <ul className="divide-y">
                  {alertas.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              a.gravidade === 'critica'
                                ? 'destructive'
                                : a.gravidade === 'alta'
                                  ? 'default'
                                  : 'secondary'
                            }
                            className="text-[10px] uppercase"
                          >
                            {a.gravidade}
                          </Badge>
                          <span className="text-sm font-medium">
                            {TIPOS_ALERTA.find((t) => t.valor === a.tipo)?.rotulo || a.tipo}
                          </span>
                          {!a.ativo && (
                            <Badge variant="outline" className="text-[10px]">
                              inativo
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{a.descricao}</p>
                      </div>
                      {clinico && a.ativo && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => void desativarAlerta(a)}
                        >
                          Desativar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- ANAMNESE ---------- */}
        {clinico && (
          <TabsContent value="anamnese" className="space-y-3">
            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">Anamnese</CardTitle>
                  <CardDescription>
                    Histórico em versões. Cada registro novo é uma versão — nada é sobrescrito.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setNovaAnamnese(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nova anamnese
                </Button>
              </CardHeader>
              <CardContent>
                {anamneses.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nenhuma anamnese registrada ainda.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {anamneses.map((a, idx) => (
                      <li key={a.id}>
                        <Collapsible defaultOpen={idx === 0}>
                          <div className="rounded-md border">
                            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50">
                              <span className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">Versão {a.versao}</span>
                                {idx === 0 && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    atual
                                  </Badge>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {formatarData(a.created)} · {a.autorNome}
                              </span>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="space-y-2 border-t px-3 py-2.5 text-sm">
                                {PERGUNTAS.map((p) => {
                                  const v = a.respostas[p.chave]
                                  return (
                                    <div key={p.chave} className="grid gap-0.5">
                                      <span className="text-xs text-muted-foreground">
                                        {p.texto}
                                      </span>
                                      <span>{v === undefined || v === '' ? '—' : String(v)}</span>
                                    </div>
                                  )
                                })}
                                {a.observacoes && (
                                  <div className="border-t pt-2">
                                    <span className="text-xs text-muted-foreground">
                                      Observações
                                    </span>
                                    <p className="whitespace-pre-wrap">{a.observacoes}</p>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ---------- diálogo: novo alerta ---------- */}
      <Dialog open={novoAlerta} onOpenChange={setNovoAlerta}>
        <DialogContent>
          <form onSubmit={salvarAlerta}>
            <DialogHeader>
              <DialogTitle>Novo alerta clínico</DialogTitle>
              <DialogDescription>
                Alerta de gravidade alta ou crítica aparece em toda tela onde o paciente aparecer.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAlerta)}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ALERTA.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Descrição</Label>
                <Input
                  id="desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: alergia a dipirona"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grav">Gravidade</Label>
                <Select value={gravidade} onValueChange={(v) => setGravidade(v as Gravidade)}>
                  <SelectTrigger id="grav">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRAVIDADES.map((g) => (
                      <SelectItem key={g.valor} value={g.valor}>
                        {g.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovoAlerta(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoAlerta}>
                {salvandoAlerta ? 'Salvando…' : 'Salvar alerta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- diálogo: nova anamnese ---------- */}
      <Dialog open={novaAnamnese} onOpenChange={setNovaAnamnese}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={salvarAnamnese}>
            <DialogHeader>
              <DialogTitle>Nova versão da anamnese</DialogTitle>
              <DialogDescription>
                A versão anterior continua guardada e consultável. O número da versão é atribuído
                pelo sistema.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              {PERGUNTAS.map((p) => (
                <div key={p.chave} className="space-y-1">
                  <Label htmlFor={p.chave} className="text-xs">
                    {p.texto}
                  </Label>
                  <Input
                    id={p.chave}
                    value={respostas[p.chave] || ''}
                    onChange={(e) => setRespostas((r) => ({ ...r, [p.chave]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <Label htmlFor="obsan" className="text-xs">
                  Observações
                </Label>
                <Textarea
                  id="obsan"
                  rows={3}
                  value={obsAnamnese}
                  onChange={(e) => setObsAnamnese(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovaAnamnese(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvandoAnamnese}>
                {salvandoAnamnese ? 'Salvando…' : 'Registrar versão'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="border-b py-1.5 last:border-0">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div>{valor}</div>
    </div>
  )
}
