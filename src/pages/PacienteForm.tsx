/* Formulário de paciente (Etapa 5) — cria e edita.

   Validação de responsável legal: o plano exige responsável para menor de 18
   anos, VALIDADO NA APLICAÇÃO. Não dá para validar na regra da coleção porque
   a regra não sabe comparar data de nascimento com "hoje" de forma confiável,
   então:
   - aqui a tela bloqueia o salvamento do menor sem responsável;
   - e o cadastro é gravado numa transação lógica: paciente primeiro, depois o
     responsável. Se o responsável falhar, o paciente JÁ existe e avisamos na
     tela, com o formulário aberto para completar. Preferi isso a apagar o
     paciente no meio e perder o que a pessoa digitou.

   O aviso honesto: um menor pode ficar sem responsável se alguém chamar a API
   direto. A trava real disso seria um campo obrigatório calculado no servidor,
   que a Coleção não oferece sem hook; fica registrado como pendência. */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, ArrowLeft, UserRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  PARENTESCOS,
  SEXOS,
  ehMenorDeIdade,
  responsavelDeRegistro,
  type Responsavel,
  type Sexo,
} from '@/lib/pacientes'

interface Form {
  nome: string
  cpf: string
  data_nascimento: string
  sexo: Sexo | ''
  email: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  observacoes: string
  ativo: boolean
}

const VAZIO: Form = {
  nome: '',
  cpf: '',
  data_nascimento: '',
  sexo: '',
  email: '',
  telefone: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  observacoes: '',
  ativo: true,
}

const RESP_VAZIO = {
  nome: '',
  cpf: '',
  parentesco: '',
  telefone: '',
  email: '',
}

export default function PacienteForm() {
  const { id } = useParams<{ id: string }>()
  const editando = !!id
  const { sessao } = useSessao()
  const navegar = useNavigate()

  const [form, setForm] = useState<Form>(VAZIO)
  const [resp, setResp] = useState(RESP_VAZIO)
  const [respExistente, setRespExistente] = useState<Responsavel | null>(null)
  const [carregando, setCarregando] = useState(editando)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const menor = ehMenorDeIdade(form.data_nascimento)

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    try {
      const r = await pb.collection('paciente').getOne(id)
      setForm({
        nome: (r.nome as string) || '',
        cpf: (r.cpf as string) || '',
        data_nascimento: ((r.data_nascimento as string) || '').slice(0, 10),
        sexo: ((r.sexo as Sexo) || '') as Sexo | '',
        email: (r.email as string) || '',
        telefone: (r.telefone as string) || '',
        cep: (r.cep as string) || '',
        logradouro: (r.logradouro as string) || '',
        numero: (r.numero as string) || '',
        complemento: (r.complemento as string) || '',
        bairro: (r.bairro as string) || '',
        cidade: (r.cidade as string) || '',
        uf: (r.uf as string) || '',
        observacoes: (r.observacoes as string) || '',
        ativo: r.ativo !== false,
      })

      const lista = await pb.collection('responsavel_legal').getFullList({
        filter: `paciente_id = "${id}"`,
      })
      if (lista.length > 0) {
        const rr = responsavelDeRegistro(lista[0])
        setRespExistente(rr)
        setResp({
          nome: rr.nome,
          cpf: rr.cpf,
          parentesco: rr.parentesco,
          telefone: rr.telefone,
          email: rr.email,
        })
      }
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function campo<K extends keyof Form>(chave: K, valor: Form[K]) {
    setForm((f) => ({ ...f, [chave]: valor }))
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (!form.nome.trim()) {
      setErro('Informe o nome do paciente.')
      return
    }

    // Regra do plano: menor de 18 exige responsável legal.
    if (menor && !resp.nome.trim()) {
      setErro(
        'Paciente menor de 18 anos: o nome do responsável legal é obrigatório. Preencha o bloco de responsável.',
      )
      return
    }

    if (!sessao) return
    setSalvando(true)

    try {
      const dados = {
        ...form,
        cpf: form.cpf.replace(/\D/g, ''),
        cep: form.cep.replace(/\D/g, ''),
        data_nascimento: form.data_nascimento || '',
        sexo: form.sexo || '',
      }

      let pacienteId = id
      if (editando && id) {
        await pb.collection('paciente').update(id, dados)
      } else {
        const criado = await pb.collection('paciente').create({
          ...dados,
          tenant_id: sessao.tenantId,
        })
        pacienteId = criado.id
      }

      // responsável legal
      if (resp.nome.trim() && pacienteId) {
        const dadosResp = {
          tenant_id: sessao.tenantId,
          paciente_id: pacienteId,
          nome: resp.nome.trim(),
          cpf: resp.cpf.replace(/\D/g, ''),
          parentesco: resp.parentesco,
          telefone: resp.telefone,
          email: resp.email,
        }
        if (respExistente) {
          await pb.collection('responsavel_legal').update(respExistente.id, dadosResp)
        } else {
          await pb.collection('responsavel_legal').create(dadosResp)
        }
      }

      navegar(`/pacientes/${pacienteId}`, { replace: true })
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navegar('/pacientes')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Pacientes
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <UserRound className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold tracking-tight">
          {editando ? 'Editar paciente' : 'Novo paciente'}
        </h1>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={salvar} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados pessoais</CardTitle>
            <CardDescription>O que identifica o paciente.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(e) => campo('nome', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={form.cpf}
                onChange={(e) => campo('cpf', e.target.value)}
                placeholder="somente números"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nasc">Data de nascimento</Label>
              <Input
                id="nasc"
                type="date"
                value={form.data_nascimento}
                onChange={(e) => campo('data_nascimento', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sexo">Sexo</Label>
              <Select
                value={form.sexo || undefined}
                onValueChange={(v) => campo('sexo', v as Sexo)}
              >
                <SelectTrigger id="sexo">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {SEXOS.map((s) => (
                    <SelectItem key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tel">Telefone</Label>
              <Input
                id="tel"
                value={form.telefone}
                onChange={(e) => campo('telefone', e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => campo('email', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Endereço</CardTitle>
            <CardDescription>Opcional, mas útil para cobrança e contato.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" value={form.cep} onChange={(e) => campo('cep', e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="log">Logradouro</Label>
              <Input
                id="log"
                value={form.logradouro}
                onChange={(e) => campo('logradouro', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="num">Número</Label>
              <Input
                id="num"
                value={form.numero}
                onChange={(e) => campo('numero', e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="compl">Complemento</Label>
              <Input
                id="compl"
                value={form.complemento}
                onChange={(e) => campo('complemento', e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input
                id="bairro"
                value={form.bairro}
                onChange={(e) => campo('bairro', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cidade">Cidade</Label>
              <Input
                id="cidade"
                value={form.cidade}
                onChange={(e) => campo('cidade', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uf">UF</Label>
              <Input
                id="uf"
                maxLength={2}
                value={form.uf}
                onChange={(e) => campo('uf', e.target.value.toUpperCase())}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Responsável legal {menor && <span className="text-destructive">*</span>}
            </CardTitle>
            <CardDescription>
              {menor
                ? 'Obrigatório: o paciente é menor de 18 anos.'
                : 'Preencha se o paciente for menor de idade ou tiver representação legal.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rnome">Nome do responsável</Label>
              <Input
                id="rnome"
                value={resp.nome}
                onChange={(e) => setResp((r) => ({ ...r, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rcpf">CPF</Label>
              <Input
                id="rcpf"
                value={resp.cpf}
                onChange={(e) => setResp((r) => ({ ...r, cpf: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rpar">Parentesco</Label>
              <Select
                value={resp.parentesco || undefined}
                onValueChange={(v) => setResp((r) => ({ ...r, parentesco: v }))}
              >
                <SelectTrigger id="rpar">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {PARENTESCOS.map((p) => (
                    <SelectItem key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rtel">Telefone</Label>
              <Input
                id="rtel"
                value={resp.telefone}
                onChange={(e) => setResp((r) => ({ ...r, telefone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remail">E-mail</Label>
              <Input
                id="remail"
                type="email"
                value={resp.email}
                onChange={(e) => setResp((r) => ({ ...r, email: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Observações e situação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="obs">Observações administrativas</Label>
              <Textarea
                id="obs"
                rows={3}
                value={form.observacoes}
                onChange={(e) => campo('observacoes', e.target.value)}
                placeholder="Não use este campo para dado clínico: use os alertas."
              />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Paciente ativo</div>
                <div className="text-xs text-muted-foreground">
                  Inativo mantém o histórico e some da agenda.
                </div>
              </div>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => campo('ativo', v)}
                aria-label="Paciente ativo"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navegar('/pacientes')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            <Save className="mr-1.5 h-4 w-4" />
            {salvando ? 'Salvando…' : 'Salvar paciente'}
          </Button>
        </div>
      </form>
    </div>
  )
}
