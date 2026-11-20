/* Prontuário — rota clínica (guarda da Etapa 4)

   Esta tela é o mínimo para existir uma ROTA CLÍNICA de verdade, que é o que
   o critério de pronto da Etapa 4 exige ("usuário recepcao é bloqueado em
   rota clínica e a tentativa aparece em auditoria_acesso").

   O conteúdo clínico (evolução, odontograma, anexos) é construído na Etapa 7.
   O que conta aqui é a PORTA: só dentista, gestor e proprietário entram, e a
   regra é aplicada em dois lugares — a guarda de rota no cliente e as regras
   das coleções no servidor, que é a barreira real.

   Aviso explícito na tela: nada de dado de paciente aqui ainda. Melhor uma
   tela honesta do que um prontuário que finge funcionar. */

import { Lock, Construction } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSessao } from '@/contexts/SessaoContext'
import { rotuloPapel } from '@/lib/auth'

export default function Prontuario() {
  const { sessao } = useSessao()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Lock className="h-5 w-5 text-muted-foreground" />
          Prontuário
        </h1>
        <p className="text-sm text-muted-foreground">
          Área de dado clínico. Acesso restrito a dentistas, gestores e ao proprietário.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">Conteúdo construído na Etapa 7</CardTitle>
          <CardDescription>
            Evolução clínica, odontograma e anexos entram na etapa do prontuário. Nesta etapa (4) o
            que existe é o controle de acesso — que é justamente o que protege esse conteúdo depois.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">Seu acesso</span>
            <Badge variant="secondary">{rotuloPapel(sessao?.papel || '')}</Badge>
          </div>
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-muted-foreground">Dado de paciente nesta tela</span>
            <span>nenhum</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Registro na auditoria</span>
            <span>toda tentativa negada</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
