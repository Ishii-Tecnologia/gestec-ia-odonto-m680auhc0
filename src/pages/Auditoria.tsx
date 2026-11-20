/* Trilha de auditoria (Etapa 4)

   Visível apenas para proprietário e gestor — a própria regra da coleção já
   recusa os demais papéis, então esta tela não é a proteção: é a leitura.
   Deixa claro na tela que o registro é imutável. */

import { useCallback, useEffect, useState } from 'react'
import { Lock, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Linha {
  id: string
  created: string
  acao: string
  ip: string
  motivo: string
  rota: string
  usuarioNome: string
}

const ROTULO_ACAO: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  ver_prontuario: 'Ver prontuário',
  ver_odontograma: 'Ver odontograma',
  ver_paciente: 'Ver paciente',
  editar_prontuario: 'Editar prontuário',
  exportar: 'Exportar',
  tentativa_negada: 'Acesso negado',
  convite_usuario: 'Convite de usuário',
  ativar_usuario: 'Ativação de usuário',
  desativar_usuario: 'Desativação de usuário',
  trocar_papel: 'Troca de papel',
}

const COR_ACAO: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  tentativa_negada: 'destructive',
  editar_prontuario: 'default',
  convite_usuario: 'secondary',
  trocar_papel: 'secondary',
}

function formatarData(iso: string): string {
  if (!iso) return '—'
  // PocketBase devolve "2026-11-20 19:46:41.484Z"
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Auditoria() {
  const { sessao } = useSessao()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    setErro('')
    try {
      const lista = await pb.collection('auditoria_acesso').getList(1, 100, {
        sort: '-created',
        expand: 'usuario_id',
        filter: `tenant_id = "${sessao.tenantId}"`,
      })
      setLinhas(
        lista.items.map((r) => {
          const exp = r.expand as Record<string, { nome?: string; email?: string }> | undefined
          const u = exp?.usuario_id
          return {
            id: r.id,
            created: r.created as string,
            acao: r.acao as string,
            ip: (r.ip as string) || '',
            motivo: (r.motivo as string) || '',
            rota: (r.rota as string) || '',
            usuarioNome: u?.nome || u?.email || '—',
          }
        }),
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

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Auditoria de acesso</h1>
          <p className="text-sm text-muted-foreground">
            Registro de quem abriu dado sensível, com data, hora e IP.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Os registros são permanentes: não podem ser editados nem apagados por ninguém, nem pelo
          proprietário. É o que dá valor à trilha.
        </AlertDescription>
      </Alert>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimos 100 registros</CardTitle>
          <CardDescription>
            {carregando ? 'Carregando…' : `${linhas.length} registro(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linhas.length === 0 && !carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            <ul className="divide-y">
              {linhas.map((l) => (
                <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={COR_ACAO[l.acao] || 'outline'} className="text-[10px]">
                        {ROTULO_ACAO[l.acao] || l.acao}
                      </Badge>
                      <span className="text-sm font-medium">{l.usuarioNome}</span>
                    </div>
                    {(l.motivo || l.rota) && (
                      <p className="text-xs text-muted-foreground">{l.motivo || l.rota}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{formatarData(l.created)}</div>
                    {l.ip && <div className="tabular-nums">{l.ip}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
