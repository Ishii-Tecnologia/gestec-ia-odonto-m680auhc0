/* Centros de custo (pendência P2 da auditoria)

   O QUE É, EM TERMO DE CLÍNICA: é a divisão que responde "de onde vem e para
   onde vai o dinheiro". Cadeira 1, ortodontia, implantodontia, administrativo.
   Sem isso a DRE diz "a clínica lucrou X" e nada mais — e a pergunta que o dono
   realmente faz é "qual cadeira se paga?".

   POR QUE ESTA TELA FALTAVA: a coleção existe desde a Etapa 11 e a despesa já
   aponta para ela (`centro_custo_id`), mas só dava para criar por migration. Um
   campo que só aceita valor vindo de script é um campo que ninguém usa.

   AS TRÊS AMARRAÇÕES OPCIONAIS (unidade, profissional, especialidade): são o
   que dá sentido ao relatório. Vincular centro de custo a uma especialidade faz
   a produção dela cair naquele centro automaticamente. Deixo todas opcionais e
   explico na tela — centro de custo vago ("Administrativo") é tão válido quanto
   um específico ("Dra. Ana — Implantes").

   DESATIVAR ≠ EXCLUIR, igual a convênio: despesa histórica aponta para o
   centro. Apagar reescreveria o passado contábil, que é justamente o que a DRE
   não pode permitir. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Building2,
  UserRound,
  Stethoscope,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

interface CentroCusto {
  id: string
  nome: string
  unidade_id: string
  profissional_id: string
  especialidade_id: string
  ativo: boolean
}

interface Opcao {
  id: string
  nome: string
  codigo?: string
}

const VAZIO = {
  nome: '',
  unidade_id: '',
  profissional_id: '',
  especialidade_id: '',
  ativo: true,
}

export default function CentrosCusto() {
  const { sessao } = useSessao()
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [unidades, setUnidades] = useState<Opcao[]>([])
  const [profissionais, setProfissionais] = useState<Opcao[]>([])
  const [especialidades, setEspecialidades] = useState<Opcao[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState<CentroCusto | null>(null)
  const [form, setForm] = useState(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  const [excluindo, setExcluindo] = useState<CentroCusto | null>(null)
  const [erroExclusao, setErroExclusao] = useState('')

  const podeEditar = ['proprietario', 'gestor'].indexOf(sessao?.papel || '') >= 0

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const [cs, un, pr, es] = await Promise.all([
        pb.collection('centro_custo').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'nome',
        }),
        pb.collection('unidade').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'nome',
        }),
        pb.collection('profissional').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'nome',
        }),
        pb.collection('especialidade').getFullList({ sort: 'nome' }),
      ])
      setCentros(cs as unknown as CentroCusto[])
      setUnidades(un as unknown as Opcao[])
      setProfissionais(pr as unknown as Opcao[])
      setEspecialidades(es as unknown as Opcao[])
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function nomeUnidade(id: string) {
    return unidades.find((u) => u.id === id)?.nome || ''
  }
  function nomeProfissional(id: string) {
    return profissionais.find((p) => p.id === id)?.nome || ''
  }
  function nomeEspecialidade(id: string) {
    return especialidades.find((e) => e.id === id)?.nome || ''
  }

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return centros
    return centros.filter((c) => {
      const alvo = [
        c.nome,
        nomeUnidade(c.unidade_id),
        nomeProfissional(c.profissional_id),
        nomeEspecialidade(c.especialidade_id),
      ]
        .join(' ')
        .toLowerCase()
      return alvo.indexOf(t) >= 0
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, centros, unidades, profissionais, especialidades])

  function abrirNovo() {
    setEditando(null)
    setForm(VAZIO)
    setErroForm('')
    setDialogo(true)
  }

  function abrirEdicao(c: CentroCusto) {
    setEditando(c)
    setForm({
      nome: c.nome,
      unidade_id: c.unidade_id || '',
      profissional_id: c.profissional_id || '',
      especialidade_id: c.especialidade_id || '',
      ativo: c.ativo !== false,
    })
    setErroForm('')
    setDialogo(true)
  }

  async function salvar() {
    if (!sessao) return
    if (!form.nome.trim()) {
      setErroForm('Informe o nome do centro de custo.')
      return
    }
    setSalvando(true)
    setErroForm('')
    try {
      const dados = {
        tenant_id: sessao.tenantId,
        nome: form.nome.trim(),
        unidade_id: form.unidade_id || '',
        profissional_id: form.profissional_id || '',
        especialidade_id: form.especialidade_id || '',
        ativo: form.ativo,
      }
      if (editando) {
        await pb.collection('centro_custo').update(editando.id, dados)
      } else {
        await pb.collection('centro_custo').create(dados)
      }
      setDialogo(false)
      await carregar()
    } catch (err) {
      setErroForm(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(c: CentroCusto) {
    try {
      await pb.collection('centro_custo').update(c.id, { ativo: c.ativo === false })
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setErroExclusao('')
    try {
      await pb.collection('centro_custo').delete(excluindo.id)
      setExcluindo(null)
      await carregar()
    } catch {
      setErroExclusao(
        'Este centro de custo está em uso: existe despesa lançada nele. ' +
          'Apagar tiraria essas despesas do relatório e falsearia a DRE de meses já fechados. ' +
          'Desative-o: some das opções de lançamento e o histórico continua correto.',
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Centros de custo</h1>
          <p className="text-sm text-muted-foreground">
            Como o dinheiro é separado para o relatório: por cadeira, especialidade, profissional ou
            setor.
          </p>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo centro
          </Button>
        )}
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {centros.length} centro{centros.length === 1 ? '' : 's'} de custo
              </CardTitle>
              <CardDescription className="text-xs">
                A despesa escolhe um destes no lançamento. É o que permite a DRE dizer qual área dá
                lucro.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-9 pl-7 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : filtrados.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {centros.length === 0
                ? 'Nenhum centro de custo. Sem eles, toda despesa cai num balde só e a DRE não separa nada.'
                : 'Nenhum centro encontrado para esta busca.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Amarrações</TableHead>
                  <TableHead className="w-24">Situação</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => {
                  const amarrado: string[] = []
                  if (c.unidade_id) amarrado.push(nomeUnidade(c.unidade_id))
                  if (c.profissional_id) amarrado.push(nomeProfissional(c.profissional_id))
                  if (c.especialidade_id) amarrado.push(nomeEspecialidade(c.especialidade_id))
                  return (
                    <TableRow key={c.id} className={c.ativo === false ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {amarrado.length === 0 ? (
                          <span className="italic">nenhuma — centro genérico</span>
                        ) : (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            {c.unidade_id && <Building2 className="h-3 w-3" />}
                            {c.profissional_id && <UserRound className="h-3 w-3" />}
                            {c.especialidade_id && <Stethoscope className="h-3 w-3" />}
                            {amarrado.join(' · ')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.ativo === false ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Inativo
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">
                            Ativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => abrirEdicao(c)}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => void alternarAtivo(c)}
                            >
                              {c.ativo === false ? 'Reativar' : 'Desativar'}
                            </Button>
                          )}
                          {podeEditar && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                              onClick={() => {
                                setExcluindo(c)
                                setErroExclusao('')
                              }}
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---------- cadastro / edição ---------- */}
      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editando ? 'Editar centro de custo' : 'Novo centro de custo'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              As três amarrações abaixo são opcionais. Um centro genérico como "Administrativo" não
              precisa de nenhuma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nome" className="text-xs">
                Nome <span className="text-red-600">*</span>
              </Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Cadeira 1, Ortodontia, Administrativo"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Unidade</Label>
              <Select
                value={form.unidade_id || 'nenhuma'}
                onValueChange={(v) => setForm({ ...form, unidade_id: v === 'nenhuma' ? '' : v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Profissional</Label>
              <Select
                value={form.profissional_id || 'nenhum'}
                onValueChange={(v) =>
                  setForm({ ...form, profissional_id: v === 'nenhum' ? '' : v })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {profissionais.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Especialidade</Label>
              <Select
                value={form.especialidade_id || 'nenhuma'}
                onValueChange={(v) =>
                  setForm({ ...form, especialidade_id: v === 'nenhuma' ? '' : v })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                  {especialidades.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-xs font-medium">Ativo</p>
                <p className="text-[11px] text-muted-foreground">
                  Inativo sai das opções de lançamento; o histórico fica.
                </p>
              </div>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
            </div>

            {erroForm && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{erroForm}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogo(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editando ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- exclusão ---------- */}
      <Dialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir centro de custo</DialogTitle>
            <DialogDescription className="text-xs">{excluindo?.nome}</DialogDescription>
          </DialogHeader>

          {erroExclusao ? (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{erroExclusao}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              Se já houve despesa neste centro, prefira{' '}
              <span className="font-medium text-foreground">desativar</span>: apagar reescreveria a
              DRE de meses fechados.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExcluindo(null)}>
              {erroExclusao ? 'Entendi' : 'Cancelar'}
            </Button>
            {!erroExclusao && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (excluindo) void alternarAtivo(excluindo)
                    setExcluindo(null)
                  }}
                >
                  Desativar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void confirmarExclusao()}>
                  Excluir
                </Button>
              </>
            )}
            {erroExclusao && excluindo && (
              <Button
                size="sm"
                onClick={() => {
                  void alternarAtivo(excluindo)
                  setExcluindo(null)
                }}
              >
                Desativar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
