/* Catálogo de procedimentos (Etapa 8)

   Duas abas porque são dois momentos diferentes: consultar o catálogo (uso
   diário da recepção) e carregar planilha (uso esporádico do administrador).
   Misturar os dois numa tela só faz a importação atrapalhar quem só quer
   achar um preço.

   A importação segue o fluxo do critério: VALIDAR primeiro, mostrar o
   relatório por linha, e só gravar depois de confirmação. Nunca "tenta e vê
   no que dá" — planilha de consultório costuma vir com linha torta. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Upload,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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

interface Procedimento {
  id: string
  codigo: string
  nome: string
  especialidade_id: string
  por_dente: boolean
  dentes_aplicaveis: string
  ativo: boolean
}

interface Especialidade {
  id: string
  codigo: string
  nome: string
}

interface ErroLinha {
  linha: number
  codigo: string
  nome: string
  problemas: string[]
}

export default function Catalogo() {
  const { sessao } = useSessao()
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([])
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState<Procedimento | null>(null)
  const [form, setForm] = useState({
    codigo: '',
    nome: '',
    especialidade_id: '',
    por_dente: false,
    dentes_aplicaveis: '',
    ativo: true,
  })
  const [salvando, setSalvando] = useState(false)

  // importação
  const [csv, setCsv] = useState('')
  const [relatorio, setRelatorio] = useState<{
    gravado: boolean
    motivo?: string
    total_linhas?: number
    validas?: number
    gravados?: number
    erros: ErroLinha[]
    previsao?: Array<{ linha: number; codigo: string; nome: string }>
    falhas?: Array<{ linha: number; codigo: string; erro: string }>
  } | null>(null)
  const [processando, setProcessando] = useState(false)

  const podeEditar = ['proprietario', 'gestor', 'dentista'].indexOf(sessao?.papel || '') >= 0

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const [procs, esps] = await Promise.all([
        pb.collection('procedimento').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'codigo',
        }),
        pb.collection('especialidade').getFullList({ sort: 'nome' }),
      ])
      setProcedimentos(procs as unknown as Procedimento[])
      setEspecialidades(esps as unknown as Especialidade[])
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return procedimentos
    return procedimentos.filter(
      (p) =>
        p.codigo.toLowerCase().indexOf(t) >= 0 ||
        p.nome.toLowerCase().indexOf(t) >= 0 ||
        nomeEspecialidade(p.especialidade_id).toLowerCase().indexOf(t) >= 0,
    )
  }, [busca, procedimentos, especialidades])

  function nomeEspecialidade(id: string): string {
    return especialidades.find((e) => e.id === id)?.nome || '—'
  }

  function abrirNovo() {
    setEditando(null)
    setForm({
      codigo: '',
      nome: '',
      especialidade_id: '',
      por_dente: false,
      dentes_aplicaveis: '',
      ativo: true,
    })
    setDialogo(true)
  }

  function abrirEdicao(p: Procedimento) {
    setEditando(p)
    setForm({
      codigo: p.codigo,
      nome: p.nome,
      especialidade_id: p.especialidade_id || '',
      por_dente: !!p.por_dente,
      dentes_aplicaveis: p.dentes_aplicaveis || '',
      ativo: p.ativo !== false,
    })
    setDialogo(true)
  }

  async function salvar() {
    if (!sessao) return
    setSalvando(true)
    setErro('')
    try {
      const dados: Record<string, unknown> = {
        tenant_id: sessao.tenantId,
        codigo: form.codigo.trim(),
        nome: form.nome.trim(),
        especialidade_id: form.especialidade_id || '',
        por_dente: form.por_dente,
        dentes_aplicaveis: form.dentes_aplicaveis.trim(),
        ativo: form.ativo,
      }
      if (editando) {
        await pb.collection('procedimento').update(editando.id, dados)
      } else {
        await pb.collection('procedimento').create(dados)
      }
      setDialogo(false)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(p: Procedimento) {
    try {
      await pb.collection('procedimento').update(p.id, { ativo: !p.ativo })
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  async function validarCsv(confirmar: boolean) {
    setProcessando(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/importar-procedimentos', {
        method: 'POST',
        body: { csv, confirmar },
      })
      setRelatorio(r)
      if (r.gravados > 0) {
        await carregar()
        setCsv('')
      }
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Catálogo e preços</h1>
        <p className="text-sm text-muted-foreground">
          Procedimentos da clínica. Os valores por convênio ficam em Tabelas de preço.
        </p>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="procedimentos">
        <TabsList>
          <TabsTrigger value="procedimentos">
            Procedimentos
            <Badge variant="secondary" className="ml-1.5 text-[10px]">
              {procedimentos.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="importar">Importar CSV</TabsTrigger>
        </TabsList>

        {/* ---------- PROCEDIMENTOS ---------- */}
        <TabsContent value="procedimentos">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Procedimentos</CardTitle>
                <CardDescription>
                  Código é único por clínica — é o que evita cobrar o item errado.
                </CardDescription>
              </div>
              {podeEditar && (
                <Button size="sm" onClick={abrirNovo}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por código, nome ou especialidade…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8"
                />
              </div>

              {carregando ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
              ) : filtrados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {busca ? 'Nenhum procedimento encontrado.' : 'Nenhum procedimento cadastrado.'}
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Código</TableHead>
                        <TableHead>Procedimento</TableHead>
                        <TableHead className="w-44">Especialidade</TableHead>
                        <TableHead className="w-20 text-center">Por dente</TableHead>
                        <TableHead className="w-20 text-center">Ativo</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtrados.map((p) => (
                        <TableRow key={p.id} className={p.ativo === false ? 'opacity-50' : ''}>
                          <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                          <TableCell className="text-sm">{p.nome}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {nomeEspecialidade(p.especialidade_id)}
                          </TableCell>
                          <TableCell className="text-center">
                            {p.por_dente ? (
                              <Badge variant="secondary" className="text-[10px]">
                                sim
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {podeEditar ? (
                              <Switch
                                checked={p.ativo !== false}
                                onCheckedChange={() => void alternarAtivo(p)}
                              />
                            ) : (
                              <span className="text-xs">{p.ativo ? 'sim' : 'não'}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {podeEditar && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => abrirEdicao(p)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
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

        {/* ---------- IMPORTAR ---------- */}
        <TabsContent value="importar">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Importar procedimentos</CardTitle>
              <CardDescription>
                Nada é gravado se houver qualquer linha com erro. Você vê o relatório antes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Cabeçalho obrigatório, separado por ponto e vírgula:{' '}
                  <code className="rounded bg-muted px-1">
                    codigo;nome;especialidade;por_dente;dentes_aplicaveis
                  </code>
                  <br />
                  <strong>especialidade</strong> aceita o código CFO (ENDO) ou o nome (Endodontia).{' '}
                  <strong>por_dente</strong> aceita sim/nao.
                </AlertDescription>
              </Alert>

              <Textarea
                rows={9}
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value)
                  setRelatorio(null)
                }}
                placeholder={
                  'codigo;nome;especialidade;por_dente;dentes_aplicaveis\nPROF-020;Clareamento a laser;DENT;nao;\nPROF-021;Apicetomia;ENDO;sim;11-48'
                }
                className="font-mono text-xs"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void validarCsv(false)}
                  disabled={processando || !csv.trim()}
                >
                  {processando ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Validar
                </Button>
                <Button
                  size="sm"
                  onClick={() => void validarCsv(true)}
                  disabled={
                    processando || !csv.trim() || !relatorio || (relatorio.erros || []).length > 0
                  }
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Gravar
                </Button>
              </div>

              {relatorio && (
                <>
                  <Separator />
                  {relatorio.erros && relatorio.erros.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {relatorio.erros.length} linha(s) com erro — nada foi gravado
                      </div>
                      <div className="rounded-md border border-destructive/30 bg-destructive/5">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">Linha</TableHead>
                              <TableHead className="w-28">Código</TableHead>
                              <TableHead>Problemas</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {relatorio.erros.map((e) => (
                              <TableRow key={e.linha}>
                                <TableCell className="font-mono text-xs">{e.linha}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {e.codigo || '—'}
                                </TableCell>
                                <TableCell className="text-xs">
                                  <ul className="list-inside list-disc space-y-0.5">
                                    {e.problemas.map((pr, i) => (
                                      <li key={i}>{pr}</li>
                                    ))}
                                  </ul>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : relatorio.gravados > 0 ? (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        {relatorio.gravados} procedimento(s) gravado(s) com sucesso.
                        {(relatorio.falhas || []).length > 0 && (
                          <span className="mt-1 block text-destructive">
                            {(relatorio.falhas || []).length} falharam:{' '}
                            {(relatorio.falhas || []).map((f) => f.codigo).join(', ')}
                          </span>
                        )}
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        Validação limpa: {relatorio.validas} linha(s) prontas. Clique em{' '}
                        <strong>Gravar</strong> para confirmar.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------- diálogo de procedimento ---------- */}
      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar procedimento' : 'Novo procedimento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Código</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="PROF-020"
                  className="font-mono"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Clareamento a laser"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Especialidade</Label>
              <Select
                value={form.especialidade_id}
                onValueChange={(v) => setForm({ ...form, especialidade_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {especialidades.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={form.por_dente}
                onCheckedChange={(v) => setForm({ ...form, por_dente: v })}
              />
              <Label className="text-xs">Aplicado por dente</Label>
            </div>

            {form.por_dente && (
              <div className="space-y-1.5">
                <Label className="text-xs">Dentes aplicáveis (opcional)</Label>
                <Input
                  value={form.dentes_aplicaveis}
                  onChange={(e) => setForm({ ...form, dentes_aplicaveis: e.target.value })}
                  placeholder="11-48"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={salvando || !form.codigo || !form.nome}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
