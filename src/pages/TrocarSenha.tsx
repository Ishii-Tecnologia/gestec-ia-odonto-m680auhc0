/* Troca obrigatória de senha no primeiro acesso (Etapa 4)

   O convite cria a conta com uma senha temporária aleatória que ninguém
   conhece. Na prática, o convidado entra pelo fluxo de redefinição por
   e-mail e define a própria senha — por isso precisa_trocar_senha existe
   também para quem entrou com senha provisória combinada pelo responsável.

   Ao salvar, o campo precisa_trocar_senha volta a false. */

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

const MINIMO = 8

export default function TrocarSenha() {
  const { sessao, recarregar } = useSessao()
  const navegar = useNavigate()

  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')

    if (nova.length < MINIMO) {
      setErro(`A senha nova precisa de pelo menos ${MINIMO} caracteres.`)
      return
    }
    if (nova !== confirma) {
      setErro('A confirmação não confere com a senha nova.')
      return
    }
    if (!sessao) return

    setEnviando(true)
    try {
      await pb.collection('users').update(sessao.id, {
        oldPassword: atual,
        password: nova,
        passwordConfirm: nova,
        precisa_trocar_senha: false,
      })
      // o token antigo deixa de valer: refaz o login com a senha nova
      await pb.collection('users').authWithPassword(sessao.email, nova)
      recarregar()
      navegar('/', { replace: true })
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Defina a sua senha</CardTitle>
          <CardDescription>
            Este é o seu primeiro acesso. Escolha uma senha sua para continuar — a senha provisória
            deixa de valer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="atual">Senha atual (provisória)</Label>
              <Input
                id="atual"
                type="password"
                autoComplete="current-password"
                value={atual}
                onChange={(ev) => setAtual(ev.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nova">Senha nova</Label>
              <Input
                id="nova"
                type="password"
                autoComplete="new-password"
                value={nova}
                onChange={(ev) => setNova(ev.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Mínimo de {MINIMO} caracteres.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirma">Repita a senha nova</Label>
              <Input
                id="confirma"
                type="password"
                autoComplete="new-password"
                value={confirma}
                onChange={(ev) => setConfirma(ev.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Salvando…' : 'Salvar e entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
