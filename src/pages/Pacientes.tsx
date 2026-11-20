/* Listagem de pacientes (Etapa 5)

   Busca por nome, CPF ou telefone. A faixa de alerta grave aparece já na
   lista: quem chama o paciente pelo nome precisa saber antes de encostar nele
   que ele tem alergia crítica ou condição sistêmica grave.

   Busca no servidor com filter do PocketBase. O termo é escapado: sem isso uma
   aspa no nome do paciente quebraria o filtro (e um termo malicioso poderia
   tentar injetar condição). */

import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, UserPlus, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  alertaDeRegistro,
  deRegistro,
  formatarCpf,
  idadeEmAnos,
  type Alerta,
  type Paciente,
} from '@/lib/pacientes'
import { FaixaAlerta } from '@/components/FaixaAlerta'

interface Linha {
  paciente: Paciente
  alertas: Alerta[]
}

/** Escapa aspas para uso seguro dentro de um filter do PocketBase. */
function escapar(termo: string): string {
  return termo.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export default function Pacientes() {
  const { sessao } = useSessao()
  const navegar = useNavigate()

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [termo, setTermo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(
    async (busca: string) => {
      if (!sessao) return
      setCarregando(true)
      setErro('')
      try {
        const digitos = busca.replace(/\D/g, '')
        const partes = [`tenant_id = "${sessao.tenantId}"`]

        if (busca.trim()) {
          const t = escapar(busca.trim())
          const condicoes = [`nome ~ "${t}"`, `telefone ~ "${t}"`]
          if (digitos) condicoes.push(`cpf ~ "${escapar(digitos)}"`)
          partes.push(`(${condicoes.join(' || ')})`)
        }

        const lista = await pb.collection('paciente').getFullList({
          sort: 'nome',
          filter: partes.join(' && '),
        })
        const pacientes = lista.map(deRegistro)

        // alertas de todos os pacientes listados, numa consulta só
        let alertasPorPaciente: Record<string, Alerta[]> = {}
        if (pacientes.length > 0) {
          const ids = pacientes.map((p) => `"${p.id}"`).join(',')
          const alertas = await pb.collection('alerta_clinico').getFullList({
            filter: `tenant_id = "${sessao.tenantId}" && paciente_id ?~ (${ids}) && ativo = true`,
          })
          alertasPorPaciente = alertas.reduce<Record<string, Alerta[]>>((acc, r) => {
            const a = alertaDeRegistro(r)
            if (!acc[a.pacienteId]) acc[a.pacienteId] = []
            acc[a.pacienteId].push(a)
            return acc
          }, {})
        }

        setLinhas(pacientes.map((p) => ({ paciente: p, alertas: alertasPorPaciente[p.id] || [] })))
      } catch (err) {
        setErro(getErrorMessage(err))
      } finally {
        setCarregando(false)
      }
    },
    [sessao],
  )

  useEffect(() => {
    void carregar('')
  }, [carregar])

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    void carregar(termo)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro com alertas clínicos visíveis em toda tela onde o paciente aparece.
          </p>
        </div>
        <Button size="sm" onClick={() => navegar('/pacientes/novo')}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Novo paciente
        </Button>
      </div>

      <form onSubmit={buscar} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por nome, CPF ou telefone"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        {termo && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setTermo('')
              void carregar('')
            }}
          >
            Limpar
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void carregar(termo)}
          disabled={carregando}
          title="Atualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </form>

      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pacientes</CardTitle>
          <CardDescription>
            {carregando ? 'Carregando…' : `${linhas.length} paciente(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!carregando && linhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum paciente encontrado.
            </p>
          ) : (
            <ul className="divide-y">
              {linhas.map(({ paciente, alertas }) => {
                const idade = idadeEmAnos(paciente.dataNascimento)
                return (
                  <li key={paciente.id} className="py-2.5">
                    <Link
                      to={`/pacientes/${paciente.id}`}
                      className="group flex flex-wrap items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium group-hover:underline">
                            {paciente.nome}
                          </span>
                          {!paciente.ativo && (
                            <Badge variant="outline" className="text-[10px]">
                              inativo
                            </Badge>
                          )}
                          {idade !== null && (
                            <span className="text-xs text-muted-foreground">{idade} anos</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatarCpf(paciente.cpf)}
                          {paciente.telefone && ` · ${paciente.telefone}`}
                        </div>
                      </div>
                    </Link>
                    {alertas.length > 0 && (
                      <FaixaAlerta alertas={alertas} compacto className="mt-2" />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
