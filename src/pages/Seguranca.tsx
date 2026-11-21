/* Segurança da conta — segundo fator (Etapa 13)

   Ativar, ver códigos de recuperação, desativar — e dizer a verdade sobre o que
   cada coisa protege.

   A TELA EXPLICA A LIMITAÇÃO, em vez de escondê-la: o segundo fator aqui é por
   e-mail. Isso protege contra senha vazada (o caso comum: a mesma senha usada em
   outro site que vazou), mas NÃO protege contra o e-mail comprometido. Prometer
   "conta blindada" seria mentir para o dentista que confia na tela.

   OS CÓDIGOS DE RECUPERAÇÃO APARECEM UMA VEZ. Depois disso só existe o hash no
   banco. A tela obriga a pessoa a marcar "guardei" antes de fechar — um clique a
   menos aqui custa o acesso ao prontuário, e a recuperação seguinte é pedir ao
   proprietário. */

import { useCallback, useEffect, useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Copy,
  Check,
  Loader2,
  Mail,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import { PAPEIS_COM_2FA_OBRIGATORIO } from '@/lib/auth'

interface Status {
  ativo: boolean
  obrigatorio_para_papel: boolean
  codigos_recuperacao_restantes: number
  alerta: string
}

export default function Seguranca() {
  const { sessao, recarregar } = useSessao()
  const [status, setStatus] = useState<Status | null>(null)
  const [senha, setSenha] = useState('')
  const [codigos, setCodigos] = useState<string[]>([])
  const [guardei, setGuardei] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    try {
      const r = await pb.send('/backend/v1/segundo-fator/status', { method: 'GET' })
      setStatus(r as Status)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function ativar() {
    setErro('')
    setAviso('')
    if (!senha) {
      setErro('Digite sua senha para confirmar.')
      return
    }
    setOcupado(true)
    try {
      const r = await pb.send('/backend/v1/ativar-segundo-fator', {
        method: 'POST',
        body: { senha },
      })
      setCodigos(r.codigos_recuperacao || [])
      setGuardei(false)
      setSenha('')
      setAviso('')
      await carregar()
      await recarregar?.()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setOcupado(false)
    }
  }

  async function desativar() {
    setErro('')
    setAviso('')
    if (!senha) {
      setErro('Digite sua senha para confirmar.')
      return
    }
    setOcupado(true)
    try {
      await pb.send('/backend/v1/desativar-segundo-fator', {
        method: 'POST',
        body: { senha },
      })
      setSenha('')
      setAviso('Verificação em duas etapas desativada.')
      await carregar()
      await recarregar?.()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setOcupado(false)
    }
  }

  function copiar() {
    const texto = codigos.join('\n')
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  function baixar() {
    const texto =
      'Codigos de recuperacao — GesTec-IA-Odonto\n' +
      'Conta: ' +
      (sessao?.email || '') +
      '\n' +
      'Cada codigo serve UMA vez, para entrar se voce perder o acesso ao e-mail.\n\n' +
      codigos.join('\n') +
      '\n\nGuarde em local seguro e fora do computador da clinica.\n'
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'codigos-recuperacao-gestec.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  const papel = sessao?.papel || ''
  const obrigatorio = PAPEIS_COM_2FA_OBRIGATORIO.indexOf(papel as never) >= 0

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Segurança da conta</h1>
        <p className="text-sm text-muted-foreground">Verificação em duas etapas e recuperação.</p>
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

      {/* ---- estado atual ---- */}
      <Card className={status?.ativo ? 'border-emerald-500/40 bg-emerald-500/5' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {status?.ativo ? (
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            )}
            {status?.ativo ? 'Proteção ativa' : 'Proteção desligada'}
            {obrigatorio && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                obrigatório para o seu perfil
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            {status?.ativo
              ? 'Ao entrar, além da senha, pedimos um código enviado ao seu e-mail.'
              : 'Hoje, quem souber a sua senha entra na sua conta. Ativar o código por e-mail impede isso.'}
          </CardDescription>
        </CardHeader>

        {status?.ativo && (
          <CardContent className="pt-0">
            <div className="flex items-center justify-between rounded-md bg-background/60 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Códigos de recuperação disponíveis</span>
              <span className="font-semibold tabular-nums">
                {status.codigos_recuperacao_restantes}
              </span>
            </div>
            {status.alerta && <p className="mt-2 text-xs text-amber-700">{status.alerta}</p>}
          </CardContent>
        )}
      </Card>

      {/* ---- códigos recém-gerados ---- */}
      {codigos.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5" />
              Guarde estes códigos agora
            </CardTitle>
            <CardDescription className="text-xs">
              Cada um serve <strong>uma vez</strong>, para entrar caso você perca o acesso ao
              e-mail. Eles não serão mostrados de novo. Guarde fora do computador da clínica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5 rounded-md border bg-background p-3 font-mono text-sm">
              {codigos.map((c) => (
                <div key={c} className="tracking-wider">
                  {c}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copiar}>
                {copiado ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copiado ? 'Copiado' : 'Copiar'}
              </Button>
              <Button variant="outline" size="sm" onClick={baixar}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Baixar .txt
              </Button>
            </div>
            <Separator />
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={guardei}
                onChange={(e) => setGuardei(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Guardei os códigos em local seguro. Entendo que não poderei vê-los de novo e que,
                sem eles, precisarei pedir ajuda ao proprietário.
              </span>
            </label>
            <Button
              size="sm"
              disabled={!guardei}
              onClick={() => {
                setCodigos([])
                setAviso('Códigos guardados. Sua conta está protegida.')
              }}
            >
              Concluir
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---- ativar / desativar ---- */}
      {codigos.length === 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {status?.ativo ? 'Desativar a proteção' : 'Ativar a proteção'}
            </CardTitle>
            <CardDescription className="text-xs">
              Pedimos a senha de novo de propósito: se o computador ficou aberto, quem sentar nele
              não pode mudar esta configuração.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="senha-conf" className="text-xs">
                Sua senha
              </Label>
              <Input
                id="senha-conf"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="h-9"
              />
            </div>

            {!status?.ativo && (
              <Button onClick={() => void ativar()} disabled={ocupado || !senha}>
                {ocupado ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                )}
                Ativar verificação em duas etapas
              </Button>
            )}

            {status?.ativo && !obrigatorio && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={ocupado || !senha}>
                    Desativar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desativar a verificação em duas etapas?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Sua conta volta a depender só da senha, e os códigos de recuperação atuais
                      deixam de valer. Você pode reativar quando quiser.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Manter ativa</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void desativar()}>
                      Desativar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {status?.ativo && obrigatorio && (
              <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                Seu perfil tem acesso a prontuário, então a verificação é obrigatória e não pode ser
                desligada por aqui. Se você perdeu o acesso ao e-mail, use um código de recuperação
                na tela de entrada ou procure o proprietário.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- transparência sobre o limite ---- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4" />
            O que esta proteção cobre — e o que não cobre
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Cobre:</strong> alguém que descubra ou compre sua
            senha não entra, porque o código vai para o seu e-mail.
          </p>
          <p>
            <strong className="text-foreground">Não cobre:</strong> se a sua caixa de e-mail for
            invadida, a pessoa recebe o código. Por isso a senha do e-mail é a mais importante de
            todas — mantenha a verificação em duas etapas também nela.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
