/* Tela de entrada (Etapa 4 · segundo fator na Etapa 13)

   DUAS ETAPAS desde a Etapa 13: e-mail/senha, depois o código de 6 dígitos.

   Por que é uma tela só com dois passos, e não duas telas: a pessoa está no meio
   de uma ação (entrar). Navegar para outra URL no meio do login cria um estado
   que o "voltar" do navegador desfaz — e o usuário volta para o formulário de
   senha já tendo digitado a senha certa, o que ele lê como "minha senha não
   funciona". O desafio fica em memória, na mesma tela.

   O DESAFIO NÃO É SESSÃO: nada é gravado no authStore até o código ser aceito
   (ver src/lib/auth.ts). Se a pessoa fechar a aba nesse ponto, não fica
   meio-logada. */

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, Mail } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Logo } from '@/components/Logo'
import { BRAND } from '@/lib/brand'
import { entrar, verificarSegundoFator, reenviarCodigo, recuperarAcesso } from '@/lib/auth'
import type { Sessao } from '@/lib/auth'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

type Passo = 'credenciais' | 'codigo' | 'recuperacao' | 'redefinir'

export default function Entrar() {
  const [passo, setPasso] = useState<Passo>('credenciais')

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')

  const [desafio, setDesafio] = useState('')
  const [destino, setDestino] = useState('')
  const [mensagem, setMensagem] = useState('')

  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pedidoEnviado, setPedidoEnviado] = useState(false)

  const navegar = useNavigate()
  const local = useLocation() as { state?: { de?: string } }

  function seguir(sessao: Sessao) {
    const alvo = sessao.precisaTrocarSenha ? '/trocar-senha' : local.state?.de || '/'
    navegar(alvo, { replace: true })
  }

  async function enviarCredenciais(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      const r = await entrar(email, senha)
      if (r.tipo === 'sessao') {
        seguir(r.sessao)
        return
      }
      // segundo fator: guarda o desafio e troca de passo
      setDesafio(r.desafio)
      setDestino(r.destino)
      setMensagem(r.mensagem)
      setCodigo('')
      setPasso('codigo')
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setEnviando(false)
    }
  }

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault()
    if (codigo.length !== 6) return
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      const sessao = await verificarSegundoFator(desafio, codigo)
      seguir(sessao)
    } catch (err) {
      setErro(getErrorMessage(err))
      setCodigo('')
    } finally {
      setEnviando(false)
    }
  }

  async function pedirOutro() {
    setErro('')
    setAviso('')
    try {
      await reenviarCodigo(desafio)
      setCodigo('')
      setAviso('Enviamos um novo código. O anterior não funciona mais.')
    } catch (err) {
      setErro(getErrorMessage(err))
    }
  }

  /* Pedido de redefinição por e-mail.

     MENSAGEM ÚNICA, DE PROPÓSITO: o texto de sucesso é idêntico exista ou não
     conta com aquele e-mail. Se a tela respondesse "e-mail não encontrado",
     qualquer pessoa poderia descobrir quem tem conta na clínica digitando
     endereços, e numa clínica odontológica a lista de pacientes já é dado
     sensível por si. O PocketBase responde 204 nos dois casos; eu não olho a
     resposta para decidir a mensagem. */
  async function pedirRedefinicao(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!email.trim()) {
      setErro('Digite o seu e-mail.')
      return
    }
    setEnviando(true)
    try {
      await pb.collection('users').requestPasswordReset(email.trim().toLowerCase())
    } catch (err) {
      /* Só cai aqui em falha de rede ou limite de envio. Nesses casos mostro o
         erro real, porque aí o e-mail de fato não saiu e a pessoa precisa
         saber — dizer "verifique sua caixa" quando nada foi enviado faz ela
         esperar para sempre. */
      const msg = getErrorMessage(err)
      if (msg && msg.indexOf('Muitas tentativas') < 0 && !/rate/i.test(msg)) {
        setErro(msg)
        setEnviando(false)
        return
      }
      setErro(msg)
      setEnviando(false)
      return
    }
    setPedidoEnviado(true)
    setEnviando(false)
  }

  async function enviarRecuperacao(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const sessao = await recuperarAcesso(email, codigo)
      seguir(sessao)
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
          <p className="text-sm text-muted-foreground">
            {passo === 'credenciais'
              ? 'Entre com o seu acesso da clínica'
              : passo === 'codigo'
                ? 'Confirme que é você'
                : passo === 'redefinir'
                  ? 'Redefinir senha'
                  : 'Recuperar acesso'}
          </p>
        </div>
      </div>

      <Card>
        {passo === 'credenciais' && (
          <>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Entrar</CardTitle>
              <CardDescription>Use o e-mail cadastrado pelo responsável.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={enviarCredenciais} className="space-y-4">
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
              {/* TRÊS CAMINHOS, e a ordem em que aparecem não é acidental:
                  o mais comum primeiro. "Esqueci minha senha" resolve a maioria
                  (é o primeiro acesso do convidado). "Não recebi o e-mail" é o
                  caso de já ter conta e ter perdido a senha. O código de
                  recuperação é o último recurso de quem perdeu o e-mail — só
                  existe para quem já ativou a verificação em duas etapas, e é
                  por isso que vem por último, discreto. */}
              <div className="mt-4 space-y-2 text-center text-xs">
                <p className="text-muted-foreground">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setErro('')
                      setAviso('')
                      setPasso('redefinir')
                    }}
                  >
                    Esqueci minha senha
                  </button>
                </p>
                <p className="text-muted-foreground">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setErro('')
                      setCodigo('')
                      setPasso('recuperacao')
                    }}
                  >
                    Perdi o acesso ao meu e-mail
                  </button>
                  <span className="ml-1 text-[11px]">(quem usa verificação em duas etapas)</span>
                </p>
              </div>
            </CardContent>
          </>
        )}

        {passo === 'codigo' && (
          <>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                Verificação em duas etapas
              </CardTitle>
              <CardDescription className="flex items-start gap-1.5">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {mensagem}
                  {destino && (
                    <>
                      {' '}
                      Enviamos para <strong>{destino}</strong>.
                    </>
                  )}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={enviarCodigo} className="space-y-4">
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

                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={codigo}
                    onChange={setCodigo}
                    autoFocus
                    inputMode="numeric"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  O código vale por 10 minutos e serve uma vez só.
                </p>

                <Button type="submit" className="w-full" disabled={enviando || codigo.length !== 6}>
                  {enviando ? 'Verificando…' : 'Confirmar'}
                </Button>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-muted-foreground underline"
                    onClick={() => {
                      setPasso('credenciais')
                      setDesafio('')
                      setErro('')
                      setAviso('')
                    }}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Voltar
                  </button>
                  <button type="button" className="underline" onClick={() => void pedirOutro()}>
                    Reenviar código
                  </button>
                </div>
              </form>
            </CardContent>
          </>
        )}

        {passo === 'redefinir' && (
          <>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                Redefinir senha
              </CardTitle>
              <CardDescription>
                {pedidoEnviado
                  ? 'Confira a sua caixa de entrada.'
                  : 'Enviaremos um link para você criar uma nova senha.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pedidoEnviado ? (
                <div className="space-y-4">
                  <Alert>
                    <AlertDescription className="text-sm">
                      Se existir uma conta com <strong>{email.trim().toLowerCase()}</strong>, o link
                      para definir a nova senha chegará em instantes. Ele vale por uma hora e serve
                      uma vez só.
                    </AlertDescription>
                  </Alert>
                  <p className="text-xs text-muted-foreground">
                    Não chegou? Confira o lixo eletrônico e o endereço digitado. Se o e-mail estiver
                    certo, peça ao responsável da clínica para liberar o seu acesso.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setPedidoEnviado(false)
                      setPasso('credenciais')
                    }}
                  >
                    Voltar para o login
                  </Button>
                </div>
              ) : (
                <form onSubmit={pedirRedefinicao} className="space-y-4">
                  {erro && (
                    <Alert variant="destructive">
                      <AlertDescription>{erro}</AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email-red">E-mail da conta</Label>
                    <Input
                      id="email-red"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={enviando}>
                    {enviando ? 'Enviando…' : 'Enviar link'}
                  </Button>
                  <button
                    type="button"
                    className="mx-auto flex items-center gap-1 text-xs text-muted-foreground underline"
                    onClick={() => {
                      setPasso('credenciais')
                      setErro('')
                    }}
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Voltar para o login
                  </button>
                </form>
              )}
            </CardContent>
          </>
        )}

        {passo === 'recuperacao' && (
          <>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Código de recuperação</CardTitle>
              <CardDescription>
                Use um dos códigos que você guardou ao ativar a verificação em duas etapas. Cada
                código serve uma vez.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={enviarRecuperacao} className="space-y-4">
                {erro && (
                  <Alert variant="destructive">
                    <AlertDescription>{erro}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email-rec">E-mail</Label>
                  <Input
                    id="email-rec"
                    type="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cod-rec">Código</Label>
                  <Input
                    id="cod-rec"
                    placeholder="XXXXX-XXXXX"
                    className="font-mono uppercase tracking-wider"
                    value={codigo}
                    onChange={(ev) => setCodigo(ev.target.value.toUpperCase())}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? 'Verificando…' : 'Entrar'}
                </Button>
                <button
                  type="button"
                  className="mx-auto flex items-center gap-1 text-xs text-muted-foreground underline"
                  onClick={() => {
                    setPasso('credenciais')
                    setErro('')
                    setCodigo('')
                  }}
                >
                  <ArrowLeft className="h-3 w-3" />
                  Voltar para o login
                </button>
              </form>
            </CardContent>
          </>
        )}
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Esqueceu a senha? Peça ao responsável da clínica para redefinir.{' '}
        <Link to="/" className="underline">
          Voltar
        </Link>
      </p>
    </div>
  )
}
