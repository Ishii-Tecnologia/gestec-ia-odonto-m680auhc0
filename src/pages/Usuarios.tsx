/* Gestão de usuários (Etapa 4)

   Convidar, ativar/desativar e trocar papel. Quem convida é proprietário ou
   gestor (a rota é protegida e o hook /backend/v1/convidar-usuario repete a
   checagem, porque a interface não é confiável).

   Duas travas de segurança que aparecem aqui de propósito:
   - ninguém troca o próprio papel (evita se autopromover ou se rebaixar por
     engano e perder o acesso à administração);
   - trocar o papel de outra pessoa exige que seja você quem manda: a regra
     de update da coleção users só permite o usuário editar o PRÓPRIO
     cadastro, e papel/tenant não são editáveis por ninguém pela API.
     Portanto a troca de papel passa pela rota abaixo, que confere antes. */

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { UserPlus, ShieldCheck, UserX, UserCheck, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { PAPEIS, rotuloPapel, type Papel } from '@/lib/auth'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Membro {
  id: string
  nome: string
  email: string
  papel: Papel | ''
  ativo: boolean
  precisaTrocarSenha: boolean
}

export default function Usuarios() {
  const { sessao } = useSessao()
  const [membros, setMembros] = useState<Membro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Papel>('dentista')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const lista = await pb.collection('users').getFullList({
        sort: 'nome',
        filter: `tenant_id = "${sessao.tenantId}"`,
      })
      setMembros(
        lista.map((r) => ({
          id: r.id,
          nome: (r.nome as string) || (r.email as string),
          email: r.email as string,
          papel: (r.papel as Papel) || '',
          ativo: r.ativo !== false,
          precisaTrocarSenha: r.precisa_trocar_senha === true,
        })),
      )
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function convidar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      const resp = await pb.send('/backend/v1/convidar-usuario', {
        method: 'POST',
        body: { nome, email, papel },
      })
      setAviso(
        `Convite criado para ${resp.email}. O convidado entra por "esqueci minha senha" e define a própria senha.`,
      )
      setAberto(false)
      setNome('')
      setEmail('')
      setPapel('dentista')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setEnviando(false)
    }
  }

  async function alternarAtivo(m: Membro) {
    setErro('')
    setAviso('')
    try {
      await pb.collection('users').update(m.id, { ativo: !m.ativo })
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  async function trocarPapel(m: Membro, novo: Papel) {
    setErro('')
    setAviso('')
    if (m.id === sessao?.id) {
      setErro('Você não pode alterar o seu próprio papel.')
      return
    }
    try {
      // A coleção users não permite alterar papel pela API (é proposital).
      // A troca passa pela rota administrativa, que confere quem pede.
      await pb.send('/backend/v1/trocar-papel', {
        method: 'POST',
        body: { usuario_id: m.id, papel: novo },
      })
      setAviso(`Papel de ${m.nome} alterado para ${rotuloPapel(novo)}.`)
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  // Um gestor não pode editar um proprietário.
  function podeEditar(m: Membro): boolean {
    if (!sessao) return false
    if (m.id === sessao.id) return false
    if (m.papel === 'proprietario' && sessao.papel !== 'proprietario') return false
    return true
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Quem entra no sistema e com qual papel. O papel define o que a pessoa vê.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar
          </Button>

          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Convidar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={convidar}>
                <DialogHeader>
                  <DialogTitle>Convidar usuário</DialogTitle>
                  <DialogDescription>
                    A conta é criada sem senha conhecida. O convidado define a dele no primeiro
                    acesso.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nome">Nome</Label>
                    <Input
                      id="nome"
                      value={nome}
                      onChange={(ev) => setNome(ev.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="papel">Papel</Label>
                    <Select value={papel} onValueChange={(v) => setPapel(v as Papel)}>
                      <SelectTrigger id="papel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAPEIS.filter(
                          (p) => p.valor !== 'proprietario' || sessao?.papel === 'proprietario',
                        ).map((p) => (
                          <SelectItem key={p.valor} value={p.valor}>
                            {p.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {PAPEIS.find((p) => p.valor === papel)?.descricao}
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAberto(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={enviando}>
                    {enviando ? 'Enviando…' : 'Enviar convite'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {aviso && (
        <Alert>
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Equipe</CardTitle>
          <CardDescription>
            {carregando ? 'Carregando…' : `${membros.length} usuário(s) nesta clínica`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {membros.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{m.nome}</span>
                    {m.id === sessao?.id && (
                      <Badge variant="outline" className="text-[10px]">
                        você
                      </Badge>
                    )}
                    {!m.ativo && (
                      <Badge variant="destructive" className="text-[10px]">
                        desativado
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>

                <div className="flex items-center gap-2">
                  {podeEditar(m) ? (
                    <Select value={m.papel} onValueChange={(v) => void trocarPapel(m, v as Papel)}>
                      <SelectTrigger className="h-8 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAPEIS.filter(
                          (p) => p.valor !== 'proprietario' || sessao?.papel === 'proprietario',
                        ).map((p) => (
                          <SelectItem key={p.valor} value={p.valor}>
                            {p.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {rotuloPapel(m.papel)}
                    </Badge>
                  )}

                  {podeEditar(m) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void alternarAtivo(m)}
                      title={m.ativo ? 'Desativar acesso' : 'Reativar acesso'}
                    >
                      {m.ativo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
