/* Redefinição de senha pelo link do e-mail (correção do P3 — fluxo de convite)

   O PROBLEMA QUE ISTO FECHA, encontrado ao preparar o roteiro do piloto:

   O convite cria a conta com uma senha aleatória de 18 caracteres que ninguém
   conhece, e a rota responde "o convidado precisa usar 'esqueci minha senha'".
   Só que esse caminho não existia em dois pontos:

   1. A tela de login não tinha link para pedir a redefinição.
   2. O PocketBase envia o e-mail com link para `{SITE_URL}/reset-password`, e
      ESSA ROTA NÃO EXISTIA no app. Quem recebesse o e-mail clicava e caía no
      NotFound — ou, pior, na tela de login, achando que o link estava quebrado.

   Resultado prático: todo convidado dependia do proprietário gerar uma senha
   temporária e ditar por telefone. Funcionava, mas transformava o dono da
   clínica em suporte de senha — e senha ditada não é segredo de ninguém.

   O CAMINHO AGORA: convidado pede a redefinição no login → recebe e-mail com
   link → clica → define a própria senha → entra direto.

   DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO:

   - Não revelo se o e-mail existe. A resposta é sempre a mesma mensagem. Se a
     tela dissesse "e-mail não encontrado", qualquer um poderia descobrir quem
     tem conta na clínica digitando endereços.
   - Depois de salvar, entro com a senha nova na hora. O PocketBase devolve
     token junto do `confirmPasswordReset`, e obrigar a pessoa a digitar a senha
     de novo, que ela acabou de criar, é atrito sem ganho de segurança. */

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { KeyRound, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Logo } from '@/components/Logo'
import { BRAND } from '@/lib/brand'
import pb from '@/lib/pocketbase/client'
import { sessaoDoRegistro } from '@/lib/auth'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

const MINIMO = 8

export default function ResetSenha() {
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const { recarregar } = useSessao()

  const token = params.get('token') || ''

  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)

  /* Token ausente ou malformado não é erro de rede: é link truncado. Vale a
     mensagem específica — quem copiou o link do e-mail com o dedo no celular
     cortou a última parte, e "link inválido" sem mais nada não ajuda. */
  useEffect(() => {
    if (!token) {
      setErro(
        'Este link está incompleto. Abra o e-mail mais recente de "Redefina sua senha" e clique no botão, ou peça um novo na tela de entrada.',
      )
    }
  }, [token])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')

    if (nova.length < MINIMO) {
      setErro(`A senha precisa de pelo menos ${MINIMO} caracteres.`)
      return
    }
    if (nova !== confirma) {
      setErro('A confirmação não confere com a senha.')
      return
    }

    setEnviando(true)
    try {
      const resp = await pb.collection('users').confirmPasswordReset(token, nova, nova)

      /* Entra direto: a pessoa acabou de provar que tem o e-mail e acabou de
         escolher a senha. Pedir as duas coisas outra vez seria cerimônia. */
      if (resp && resp.token) {
        pb.authStore.save(resp.token, resp.record)
        recarregar()
        const sessao = sessaoDoRegistro(resp.record)
        setPronto(true)
        setTimeout(() => {
          navegar(sessao?.precisaTrocarSenha ? '/trocar-senha' : '/', { replace: true })
        }, 900)
      } else {
        setPronto(true)
        setTimeout(() => navegar('/entrar', { replace: true }), 1200)
      }
    } catch (err) {
      /* Causas prováveis: token expirado (o PocketBase invalida depois de um
         tempo), token já usado, ou senha recusada pelo servidor. */
      setErro(
        getErrorMessage(err) ||
          'Não foi possível salvar a nova senha. O link pode ter expirado — peça outro na tela de entrada.',
      )
    } finally {
      setEnviando(false)
    }
  }

  if (pronto) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <div>
          <p className="text-base font-medium">Senha alterada</p>
          <p className="text-sm text-muted-foreground">Entrando na sua conta…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={56} />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{BRAND.nome}</h1>
          <p className="text-sm text-muted-foreground">Defina a sua senha</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Nova senha
          </CardTitle>
          <CardDescription>
            Escolha uma senha sua. A senha provisória, se havia uma, deixa de valer.
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
              <Label htmlFor="nova">Senha nova</Label>
              <div className="relative">
                <Input
                  id="nova"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={nova}
                  onChange={(ev) => setNova(ev.target.value)}
                  className="pr-9"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setMostrar((v) => !v)}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  title={mostrar ? 'Ocultar' : 'Mostrar'}
                >
                  {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Mínimo de {MINIMO} caracteres. Uma frase que você lembra vale mais que uma
                combinação difícil que vai parar num papel.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirma">Repita a senha</Label>
              <Input
                id="confirma"
                type={mostrar ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirma}
                onChange={(ev) => setConfirma(ev.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={enviando || !token}>
              {enviando ? 'Salvando…' : 'Salvar e entrar'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/entrar" className="inline-flex items-center gap-1 underline">
              <ArrowLeft className="h-3 w-3" />
              Voltar para o login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
