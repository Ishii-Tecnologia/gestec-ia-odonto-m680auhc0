/* Avisos operacionais (pendência P1 da auditoria)

   A tela que responde "o que está travando a clínica hoje?".

   POR QUE ELA EXISTE: a auditoria encontrou a tabela de preço particular
   vencida há quase seis meses, e ninguém sabia — o sintoma só apareceu quando a
   recepção tentou montar orçamento e levou "Item sem preco definido", com a
   paciente esperando. Aviso que só existe depois da falha não é aviso.

   ORDEM POR SEVERIDADE, e o porquê: crítico = bloqueia venda agora (tabela
   vencida, procedimento sem preço). Atenção = vai bloquear (vencendo em 30
   dias, convênio sem tabela). Misturar os dois numa lista só faz a pessoa
   resolver o que é fácil e deixar o que trava.

   QUANDO ESTÁ TUDO CERTO, a tela diz isso claramente. Tela de avisos vazia sem
   mensagem faz a pessoa achar que não carregou. */

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  ArrowRight,
  Info,
  Tag,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Aviso {
  tipo: string
  severidade: 'critico' | 'atencao'
  titulo: string
  detalhe: string
  acao: string
  referencia?: string
}

interface Resposta {
  dia: string
  total: number
  criticos: number
  avisos: Aviso[]
  resumo: string
}

/* Para onde mandar a pessoa resolver cada tipo de aviso. Sem isso o aviso
   informa o problema e deixa a solução como exercício. */
const DESTINO: Record<string, string> = {
  tabela_vencida: '/tabelas-preco',
  tabela_vencendo: '/tabelas-preco',
  procedimento_sem_preco: '/tabelas-preco',
  convenio_sem_tabela: '/tabelas-preco',
}

export default function Avisos() {
  const { sessao } = useSessao()
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/avisos-operacionais', { method: 'GET' })
      setDados(r as Resposta)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando…
      </div>
    )
  }

  const criticos = (dados?.avisos || []).filter((a) => a.severidade === 'critico')
  const atencao = (dados?.avisos || []).filter((a) => a.severidade === 'atencao')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Avisos</h1>
          <p className="text-sm text-muted-foreground">
            O que impede a clínica de atender e cobrar agora.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregar()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Verificar
        </Button>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {dados && dados.total === 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="flex items-center gap-3 py-5">
            <CheckCircle2 className="h-6 w-6 text-emerald-700" />
            <div>
              <p className="text-sm font-medium">Tudo em ordem</p>
              <p className="text-xs text-muted-foreground">
                Preços vigentes, nenhum procedimento sem valor, nenhum convênio descoberto.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {criticos.length > 0 && (
        <Card className="border-red-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-red-800">
              <ShieldAlert className="h-4 w-4" />
              Bloqueando venda
              <Badge variant="destructive" className="text-[10px]">
                {criticos.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Resolva estes antes de atender. Os outros podem esperar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {criticos.map((a, i) => (
              <div key={i} className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.titulo}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.detalhe}</p>
                    <p className="mt-1 text-xs">
                      <span className="font-medium">O que fazer: </span>
                      {a.acao}
                    </p>
                    {DESTINO[a.tipo] && (
                      <Button asChild variant="outline" size="sm" className="mt-2 h-7 text-xs">
                        <Link to={DESTINO[a.tipo]}>
                          Resolver
                          <ArrowRight className="ml-1.5 h-3 w-3" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {atencao.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800">
              <Info className="h-4 w-4" />
              Para revisar
              <Badge variant="secondary" className="text-[10px]">
                {atencao.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Não bloqueiam agora, mas vão bloquear se ficarem assim.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {atencao.map((a, i) => (
              <div key={i} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-sm font-medium">{a.titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.detalhe}</p>
                <p className="mt-1 text-xs">
                  <span className="font-medium">O que fazer: </span>
                  {a.acao}
                </p>
                {DESTINO[a.tipo] && (
                  <Button asChild variant="ghost" size="sm" className="mt-1.5 h-7 text-xs">
                    <Link to={DESTINO[a.tipo]}>
                      <Tag className="mr-1.5 h-3 w-3" />
                      Abrir
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground">
        Verificado em {dados ? dados.dia.split('-').reverse().join('/') : '—'}. Esta verificação
        roda a cada abertura da tela.
      </p>
    </div>
  )
}
