/* Tela de entrada (Etapa 4) */

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Logo } from '@/components/Logo'
import { BRAND } from '@/lib/brand'
import { entrar } from '@/lib/auth'
import { getErrorMessage } from '@/lib/pocketbase/errors'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const navegar = useNavigate()
  const local = useLocation() as { state?: { de?: string } }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const sessao = await entrar(email, senha)
      const destino = sessao.precisaTrocarSenha ? '/trocar-senha' : local.state?.de || '/'
      navegar(destino, { replace: true })
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={56} />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{BRAND.nome}</h1>
          <p className="text-sm text-muted-foreground">Entre com o seu acesso da clínica</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Entrar</CardTitle>
          <CardDescription>Use o e-mail cadastrado pelo responsável.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            {erro && (
              <Alert variant="destructive">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(ev) => setSenha(ev.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Esqueceu a senha? Peça ao responsável da clínica para redefinir.{' '}
            <Link to="/" className="underline">
              Voltar
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
