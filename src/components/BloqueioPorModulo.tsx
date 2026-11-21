/* Bloqueio por módulo não contratado (Etapa 14)

   Envolve uma página e mostra a tela de contratação quando o módulo que ela
   exige não está ativo.

   POR QUE UMA TELA, E NÃO UM ERRO OU UM REDIRECIONAMENTO:

   - Erro 403 seco ("Acesso não permitido") é o que a rota faz hoje para papel
     errado, e ali está certo: papel não se resolve ali mesmo. Módulo, sim — a
     pessoa pode contratar naquele instante. Mostrar erro esconde a saída.
   - Redirecionar sozinho para /modulos tira a pessoa do lugar onde ela clicou,
     e ela não entende por que foi parar em outra tela.

   Então: a tela diz QUAL módulo falta, o que ele inclui, quanto custa, e leva
   para a contratação com um clique.

   ISSO NÃO É A BARREIRA DE SEGURANÇA. A barreira é o servidor (guarda de
   escrita e regras de coleção). Este componente evita que a pessoa veja uma
   tela quebrada e não saiba o motivo — nada mais. */

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Package, Lock, Check, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useModulos } from '@/contexts/ModulosContext'

interface Props {
  modulo: string
  children: ReactNode
}

function brl(c: number): string {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function BloqueioPorModulo({ modulo, children }: Props) {
  const { tem, catalogo, assinaturas, carregado } = useModulos()

  // ainda carregando: não pisca "não contratado" antes de saber
  if (!carregado) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  if (tem(modulo)) return <>{children}</>

  const item = catalogo.find((c) => c.codigo === modulo)
  const cancelada = assinaturas.find((a) => a.codigo === modulo && !a.vigente)

  return (
    <div className="mx-auto max-w-lg py-8">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
            <Lock className="h-5 w-5 text-amber-700" />
          </div>
          <CardTitle className="text-base">
            {item ? `${item.nome} não está contratado` : 'Módulo não contratado'}
          </CardTitle>
          <CardDescription>
            {cancelada
              ? 'Este módulo foi cancelado nesta clínica. Os dados que já existem continuam guardados — nada foi apagado.'
              : 'Esta área faz parte de um módulo que esta clínica ainda não contratou.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {item && (
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{item.nome}</span>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {brl(item.preco_centavos)}/mês
                </Badge>
              </div>
              {item.descricao && (
                <p className="mt-1 text-xs text-muted-foreground">{item.descricao}</p>
              )}
            </div>
          )}

          <ul className="space-y-1 text-xs text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              Sem fidelidade: pode cancelar quando quiser.
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              Cancelar não apaga nada. O dado continua guardado e exportável.
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              O valor fica congelado no dia da contratação.
            </li>
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/modulos">
                Contratar
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Voltar ao início</Link>
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Somente o proprietário ou o gestor pode contratar. Se você não é um deles, fale com quem
            administra a clínica.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
