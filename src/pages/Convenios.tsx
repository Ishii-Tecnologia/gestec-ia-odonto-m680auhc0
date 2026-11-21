/* Convênios (pendência P2 da auditoria)

   POR QUE ESTA TELA FALTAVA E POR QUE ELA IMPORTA:

   A coleção `convenio` existe desde a Etapa 8, é usada por paciente e por
   tabela de preço, e até hoje só dava para criar por migration. Na prática a
   clínica não conseguia cadastrar um convênio novo — tinha que pedir para mim.

   E convênio não é cadastro raro: é o que define QUANTO a clínica recebe. Um
   convênio sem tabela de preço vigente joga o paciente no particular (a tela de
   Avisos alerta sobre isso, mas alertar sem poder resolver é meio caminho).

   DUAS DECISÕES DE TELA:

   1. `ativo` é o interruptor principal, não o botão de excluir. Convênio que
      sai do contrato continua referenciado por pacientes e títulos antigos; se
      eu apagasse, o histórico financeiro perderia o nome do plano de saúde.
      Desativar tira ele das listas de escolha e preserva o passado.

   2. A exclusão existe, mas avisa antes de falhar. O banco recusa apagar
      convênio em uso (integridade referencial) devolvendo "Failed to delete
      record" — mensagem que não diz o que fazer. Aqui eu conto o que está
      segurando e ofereço o caminho certo: desativar. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  BadgeCheck,
  AlertTriangle,
  ArrowRight,
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
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Convenio {
  id: string
  nome: string
  registro_ans: string
  ativo: boolean
}

interface TabelaInfo {
  convenio_id: string
  nome: string
  vigencia_fim: string
}

const VAZIO = { nome: '', registro_ans: '', ativo: true }

export default function Convenios() {
  const { sessao } = useSessao()
  const [convenios, setConvenios] = useState<Convenio[]>([])
  const [tabelas, setTabelas] = useState<TabelaInfo[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState<Convenio | null>(null)
  const [form, setForm] = useState(VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  const [excluindo, setExcluindo] = useState<Convenio | null>(null)
  const [erroExclusao, setErroExclusao] = useState('')

  const podeEditar = ['proprietario', 'gestor', 'dentista'].indexOf(sessao?.papel || '') >= 0
  const podeExcluir = ['proprietario', 'gestor'].indexOf(sessao?.papel || '') >= 0

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const [conv, tabs] = await Promise.all([
        pb.collection('convenio').getFullList({
          filter: `tenant_id = "${sessao.tenantId}"`,
          sort: 'nome',
        }),
        pb.collection('tabela_preco').getFullList({
          filter: `tenant_id = "${sessao.tenantId}" && convenio_id != ""`,
          sort: 'nome',
        }),
      ])
      setConvenios(conv as unknown as Convenio[])
      setTabelas(tabs as unknown as TabelaInfo[])
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
    if (!t) return convenios
    return convenios.filter(
      (c) =>
        c.nome.toLowerCase().indexOf(t) >= 0 ||
        (c.registro_ans || '').toLowerCase().indexOf(t) >= 0,
    )
  }, [busca, convenios])

  /* Um convênio sem tabela de preço vigente não consegue cobrar nada: o
     paciente cai no particular. Marco na lista em vez de deixar o erro
     aparecer só na hora do orçamento. */
  function tabelaVigente(c: Convenio): TabelaInfo | null {
    const hoje = new Date().toISOString().slice(0, 10)
    const minhas = tabelas.filter((t) => t.convenio_id === c.id)
    for (const t of minhas) {
      const fim = String(t.vigencia_fim || '').slice(0, 10)
      if (!fim || fim >= hoje) return t
    }
    return null
  }

  function abrirNovo() {
    setEditando(null)
    setForm(VAZIO)
    setErroForm('')
    setDialogo(true)
  }

  function abrirEdicao(c: Convenio) {
    setEditando(c)
    setForm({ nome: c.nome, registro_ans: c.registro_ans || '', ativo: c.ativo !== false })
    setErroForm('')
    setDialogo(true)
  }

  async function salvar() {
    if (!sessao) return
    if (!form.nome.trim()) {
      setErroForm('Informe o nome do convênio.')
      return
    }
    setSalvando(true)
    setErroForm('')
    try {
      const dados = {
        tenant_id: sessao.tenantId,
        nome: form.nome.trim(),
        registro_ans: form.registro_ans.trim(),
        ativo: form.ativo,
      }
      if (editando) {
        await pb.collection('convenio').update(editando.id, dados)
      } else {
        await pb.collection('convenio').create(dados)
      }
      setDialogo(false)
      await carregar()
    } catch (err) {
      setErroForm(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(c: Convenio) {
    try {
      await pb.collection('convenio').update(c.id, { ativo: c.ativo === false })
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setErroExclusao('')
    try {
      await pb.collection('convenio').delete(excluindo.id)
      setExcluindo(null)
      await carregar()
    } catch {
      /* O banco recusa com "Failed to delete record". Reescrevo com o motivo
         real e a alternativa — quem está no balcão não tem como adivinhar que
         o problema é um título antigo apontando para ele. */
      setErroExclusao(
        'Este convênio está em uso: existe paciente, tabela de preço ou título apontando para ele. ' +
          'Apagar deixaria esses registros órfãos, por isso o sistema não permite. ' +
          'Desative-o: ele sai das listas de escolha e o histórico fica preservado.',
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Convênios</h1>
          <p className="text-sm text-muted-foreground">
            Planos de saúde atendidos pela clínica e o registro ANS de cada um.
          </p>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo convênio
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
                {convenios.length} convênio{convenios.length === 1 ? '' : 's'}
              </CardTitle>
              <CardDescription className="text-xs">
                Convênio sem tabela de preço vigente cai no particular na hora de orçar.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou ANS"
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
              {convenios.length === 0
                ? 'Nenhum convênio cadastrado. Clique em "Novo convênio" para começar.'
                : 'Nenhum convênio encontrado para esta busca.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Registro ANS</TableHead>
                  <TableHead>Tabela de preço</TableHead>
                  <TableHead className="w-24">Situação</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((c) => {
                  const tab = tabelaVigente(c)
                  return (
                    <TableRow key={c.id} className={c.ativo === false ? 'opacity-60' : ''}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.registro_ans || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {tab ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <BadgeCheck className="h-3.5 w-3.5" />
                            {tab.nome}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            sem tabela vigente
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
                              title={c.ativo === false ? 'Reativar' : 'Desativar'}
                            >
                              {c.ativo === false ? 'Reativar' : 'Desativar'}
                            </Button>
                          )}
                          {podeExcluir && (
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

      {tabelas.length === 0 && convenios.length > 0 && (
        <Alert>
          <AlertDescription className="text-xs">
            Nenhum convênio tem tabela de preço cadastrada. Sem ela, o orçamento do paciente sai
            pelo particular.{' '}
            <Link
              to="/tabelas-preco"
              className="inline-flex items-center gap-0.5 font-medium underline"
            >
              Ir para Tabelas de preço
              <ArrowRight className="h-3 w-3" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* ---------- cadastro / edição ---------- */}
      <Dialog open={dialogo} onOpenChange={setDialogo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar convênio' : 'Novo convênio'}</DialogTitle>
            <DialogDescription className="text-xs">
              Depois de cadastrar, crie a tabela de preço deste convênio em{' '}
              <span className="font-medium">Tabelas de preço</span>.
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
                placeholder="Ex.: Odonto Prev"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ans" className="text-xs">
                Registro ANS
              </Label>
              <Input
                id="ans"
                value={form.registro_ans}
                onChange={(e) => setForm({ ...form, registro_ans: e.target.value })}
                placeholder="Número de registro na ANS"
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Obrigatório para faturamento TISS. Pode preencher depois.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-xs font-medium">Ativo</p>
                <p className="text-[11px] text-muted-foreground">
                  Inativo sai das listas de escolha, mas preserva o histórico.
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
            <DialogTitle>Excluir convênio</DialogTitle>
            <DialogDescription className="text-xs">{excluindo?.nome}</DialogDescription>
          </DialogHeader>

          {erroExclusao ? (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{erroExclusao}</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              Excluir apaga o cadastro de vez. Se este convênio já atendeu alguém, prefira{' '}
              <span className="font-medium text-foreground">desativar</span>: ele sai das escolhas e
              o histórico financeiro continua íntegro.
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
                  Desativar em vez de excluir
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
