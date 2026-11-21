/* Módulos e assinatura (Etapa 14)

   A tela onde a clínica vê o que paga, contrata e cancela.

   O QUE A TELA FAZ PARA NÃO ENGANAR O DONO:

   1. MOSTRA O VALOR CONGELADO SEPARADO DO PREÇO DE CATÁLOGO. Se o catálogo
      subiu depois da contratação, o dono vê "paga R$ 79, hoje custa R$ 99" e
      entende que o contrato dele está protegido. Sem isso, ele vê dois números
      diferentes em telas diferentes e conclui que o sistema cobra errado.

   2. CANCELAR DIZ O QUE ACONTECE COM O DADO. "Cancelar" assusta — parece que
      vai apagar o prontuário. O texto diz, antes do clique, que o dado fica
      guardado e exportável e que o módulo apenas para de aceitar registro novo.

   3. DEPENDÊNCIA É EXPLICADA, NÃO SÓ BLOQUEADA. Ao contratar Orçamento sem
      Prontuário, a tela mostra o motivo e oferece os dois juntos; ao cancelar
      um pré-requisito, diz qual módulo está segurando. Um "erro 400" aqui gera
      chamado de suporte. */

import { useState } from 'react'
import {
  Package,
  Check,
  X,
  AlertTriangle,
  Lock,
  TrendingUp,
  Loader2,
  Info,
  History,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { useModulos } from '@/contexts/ModulosContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Modulos() {
  const { ativos, assinaturas, catalogo, totalMensalCentavos, carregado, recarregar } = useModulos()
  const [ocupado, setOcupado] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  async function acao(rota: string, codigo: string) {
    setErro('')
    setAviso('')
    setOcupado(codigo)
    try {
      const r = await pb.send(rota, { method: 'POST', body: { codigo } })
      setAviso(r.mensagem || 'Feito.')
      await recarregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setOcupado('')
    }
  }

  if (!carregado) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Módulos</h1>
        <p className="text-sm text-muted-foreground">
          O que esta clínica usa hoje e quanto custa por mês.
        </p>
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

      {/* resumo */}
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mensalidade</p>
            <p className="text-2xl font-semibold tabular-nums">{brl(totalMensalCentavos)}</p>
            <p className="text-xs text-muted-foreground">
              {ativos.length} módulo(s) ativo(s) · por CNPJ
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Sem fidelidade.</p>
            <p>Cancele quando quiser.</p>
          </div>
        </CardContent>
      </Card>

      {/* contratados */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Check className="h-4 w-4" />
            Contratados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {assinaturas.filter((a) => a.vigente).length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              Nenhum módulo ativo. O núcleo (pacientes, agenda e catálogo) continua funcionando.
            </p>
          )}
          {assinaturas
            .filter((a) => a.vigente)
            .map((a) => {
              const subiu = a.preco_catalogo_centavos !== a.valor_centavos
              return (
                <div
                  key={a.codigo}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{a.nome}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        ativo
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {brl(a.valor_centavos)}/mês
                      {subiu && (
                        <span className="ml-1.5 text-amber-700">
                          · catálogo hoje {brl(a.preco_catalogo_centavos)} (seu valor está
                          congelado)
                        </span>
                      )}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={ocupado === a.codigo}>
                        {ocupado === a.codigo ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        Cancelar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar {a.nome}?</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                          <span className="block">
                            O módulo deixa de aparecer no menu e para de aceitar registros novos.
                          </span>
                          <span className="block font-medium text-foreground">
                            Os dados que já existem continuam guardados e podem ser exportados.
                            Cancelar não apaga nada.
                          </span>
                          <span className="block">Você pode reativar quando quiser.</span>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Manter</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => void acao('/backend/v1/cancelar-modulo', a.codigo)}
                        >
                          Cancelar módulo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )
            })}
        </CardContent>
      </Card>

      {/* catálogo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Disponíveis
          </CardTitle>
          <CardDescription className="text-xs">
            Contrate e o módulo aparece no menu na hora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {catalogo
            .filter((c) => ativos.indexOf(c.codigo) < 0)
            .map((c) => {
              const precisa = c.depende_de ? catalogo.find((x) => x.codigo === c.depende_de) : null
              const faltaDep = precisa && ativos.indexOf(precisa.codigo) < 0
              return (
                <div
                  key={c.codigo}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.nome}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {brl(c.preco_centavos)}/mês
                      </span>
                    </div>
                    {c.descricao && <p className="text-xs text-muted-foreground">{c.descricao}</p>}
                    {faltaDep && precisa && (
                      <p className="mt-0.5 text-[11px] text-amber-700">
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        Precisa do módulo {precisa.nome}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={faltaDep ? 'outline' : 'default'}
                    disabled={ocupado === c.codigo}
                    onClick={() => void acao('/backend/v1/contratar-modulo', c.codigo)}
                  >
                    {ocupado === c.codigo ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {faltaDep ? 'Contratar (ver dependência)' : 'Contratar'}
                  </Button>
                </div>
              )
            })}
        </CardContent>
      </Card>

      {/* cancelados */}
      {assinaturas.filter((a) => !a.vigente).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <History className="h-4 w-4" />
              Cancelados
            </CardTitle>
            <CardDescription className="text-xs">
              O dado continua guardado e exportável.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1 text-xs text-muted-foreground">
              {assinaturas
                .filter((a) => !a.vigente)
                .map((a) => (
                  <li key={a.codigo} className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Lock className="h-3 w-3" />
                      {a.nome}
                    </span>
                    <span>
                      {a.fim ? `até ${a.fim.split('-').reverse().join('/')}` : 'cancelado'}
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          O valor de cada módulo fica congelado na data da contratação. Reajustar o catálogo não
          altera o que você paga hoje — qualquer mudança no seu contrato aparece no histórico.
        </AlertDescription>
      </Alert>
    </div>
  )
}
