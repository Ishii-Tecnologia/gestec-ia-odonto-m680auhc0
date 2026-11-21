/* Modelos de mensagem (Etapa 13)

   As três mensagens que o paciente recebe, editáveis pelo dono.

   POR QUE A TELA MOSTRA O RESULTADO PREENCHIDO, e não só o texto com marcadores:
   "{paciente}" não diz nada a quem vai escrever. O painel de exemplo mostra como
   a Maria receberia a mensagem de verdade, com data e profissional. É a diferença
   entre "sei que existe um marcador" e "sei que a frase fica boa".

   O QUE A TELA IMPEDE, e por quê: marcador desconhecido. Se alguém digitar
   "{pacinete}" (com erro), o texto sai no e-mail exatamente assim e o paciente
   lê um erro de digitação da clínica. A validação avisa ANTES de salvar. */

import { useCallback, useEffect, useState } from 'react'
import { Mail, Eye, AlertTriangle, Save, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { getErrorMessage } from '@/lib/pocketbase/errors'

interface Modelo {
  id: string
  tipo: 'confirmacao' | 'retorno' | 'aniversario' | 'cobranca'
  assunto: string
  corpo: string
  ativo: boolean
}

const TIPOS: Array<{
  valor: Modelo['tipo']
  rotulo: string
  quando: string
  marcadores: string[]
}> = [
  {
    valor: 'confirmacao',
    rotulo: 'Confirmação de consulta',
    quando: 'Enviada 48h e 24h antes da consulta.',
    marcadores: ['paciente', 'data', 'hora', 'profissional', 'clinica'],
  },
  {
    valor: 'retorno',
    rotulo: 'Convite de retorno',
    quando: 'Para paciente que não volta há um tempo e não tem consulta marcada.',
    marcadores: ['paciente', 'dias', 'clinica'],
  },
  {
    valor: 'aniversario',
    rotulo: 'Aniversário',
    quando: 'No dia do aniversário do paciente.',
    marcadores: ['paciente', 'clinica'],
  },
]

/* Exemplo fixo, e não dado real: o dono está editando texto e não deve ver nome
   de paciente de verdade numa tela de configuração. */
const EXEMPLO: Record<string, string> = {
  paciente: 'Maria Silva',
  data: '15/12/2026',
  hora: '14:00',
  profissional: 'Dra. Ana Demo',
  clinica: 'Clínica Demo Alfa',
  dias: '180',
}

export default function ModelosMensagem() {
  const { sessao } = useSessao()
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [tipoAtivo, setTipoAtivo] = useState<Modelo['tipo']>('confirmacao')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    if (!sessao) return
    setCarregando(true)
    try {
      const lista = (await pb.collection('modelo_mensagem').getFullList({
        filter: `tenant_id = "${sessao.tenantId}"`,
      })) as unknown as Modelo[]
      setModelos(lista)
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setCarregando(false)
    }
  }, [sessao])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const modelo = modelos.find((m) => m.tipo === tipoAtivo)
  const def = TIPOS.find((t) => t.valor === tipoAtivo)!

  function alterar(campo: 'assunto' | 'corpo', valor: string) {
    setAviso('')
    setModelos((atual) => atual.map((m) => (m.tipo === tipoAtivo ? { ...m, [campo]: valor } : m)))
  }

  /* Marcadores usados no texto que não existem para este tipo. Só comparo o que
     está entre chaves; o resto é texto livre. */
  function marcadoresInvalidos(texto: string): string[] {
    const achados = String(texto).match(/\{[a-zA-Z_]+\}/g) || []
    const ruins: string[] = []
    for (const a of achados) {
      const nome = a.slice(1, -1)
      if (def.marcadores.indexOf(nome) < 0 && ruins.indexOf(a) < 0) ruins.push(a)
    }
    return ruins
  }

  const invalidos = modelo
    ? marcadoresInvalidos(modelo.assunto).concat(marcadoresInvalidos(modelo.corpo))
    : []

  function preencher(texto: string): string {
    let out = String(texto || '')
    for (const k of Object.keys(EXEMPLO)) out = out.split('{' + k + '}').join(EXEMPLO[k])
    return out
  }

  async function salvar() {
    if (!modelo) return
    setErro('')
    setAviso('')
    if (invalidos.length > 0) {
      setErro(
        `Marcador não reconhecido: ${invalidos.join(', ')}. Use apenas: ${def.marcadores
          .map((m) => '{' + m + '}')
          .join(', ')}.`,
      )
      return
    }
    setSalvando(true)
    try {
      await pb.collection('modelo_mensagem').update(modelo.id, {
        assunto: modelo.assunto,
        corpo: modelo.corpo,
      })
      setAviso('Modelo salvo.')
      await carregar()
    } catch (err) {
      setErro(getErrorMessage(err))
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mensagens ao paciente</h1>
        <p className="text-sm text-muted-foreground">
          O que o paciente recebe por e-mail nos lembretes automáticos.
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

      <div className="flex gap-1.5">
        {TIPOS.map((t) => {
          const existe = modelos.some((m) => m.tipo === t.valor)
          return (
            <Button
              key={t.valor}
              size="sm"
              variant={tipoAtivo === t.valor ? 'default' : 'outline'}
              onClick={() => setTipoAtivo(t.valor)}
            >
              {t.rotulo}
              {!existe && (
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  ausente
                </Badge>
              )}
            </Button>
          )
        })}
      </div>

      {!modelo ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Este tenant não tem modelo para “{def.rotulo}”, então esse lembrete não é enviado.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                Editar
              </CardTitle>
              <CardDescription className="text-xs">{def.quando}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Assunto</Label>
                <Input
                  value={modelo.assunto}
                  onChange={(e) => alterar('assunto', e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem</Label>
                <Textarea
                  value={modelo.corpo}
                  onChange={(e) => alterar('corpo', e.target.value)}
                  rows={10}
                  className="text-sm"
                />
              </div>

              <div className="rounded-md bg-muted/50 p-2">
                <p className="mb-1 text-[11px] font-medium">Marcadores disponíveis</p>
                <div className="flex flex-wrap gap-1">
                  {def.marcadores.map((m) => (
                    <code
                      key={m}
                      className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {'{' + m + '}'}
                    </code>
                  ))}
                </div>
              </div>

              {invalidos.length > 0 && (
                <p className="text-xs text-red-700">
                  Marcador não reconhecido: {invalidos.join(', ')}. Ele sairia no e-mail como está
                  escrito.
                </p>
              )}

              <Button onClick={() => void salvar()} disabled={salvando || invalidos.length > 0}>
                {salvando ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Salvar
              </Button>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4" />
                Como o paciente recebe
              </CardTitle>
              <CardDescription className="text-xs">
                Exemplo com dados fictícios, preenchido como o sistema envia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <div className="border-b bg-muted/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Assunto
                  </p>
                  <p className="text-sm font-medium">
                    {preencher(modelo.assunto) || '(sem assunto)'}
                  </p>
                </div>
                <div className="space-y-2 px-3 py-3 text-sm">
                  {preencher(modelo.corpo)
                    .split('\n')
                    .map((linha, i) => (
                      <p key={i} className="text-[13px] leading-relaxed">
                        {linha || '\u00a0'}
                      </p>
                    ))}
                </div>
              </div>
              <Separator className="my-3" />
              <p className="text-[11px] text-muted-foreground">
                O e-mail sai em nome da clínica. Respostas vão para o endereço configurado no envio.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
