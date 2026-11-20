/* Home Page - pagina inicial do GesTec-IA-Odonto (Etapa 1: fundacao).
   Sem funcionalidade de negocio: apenas identidade do produto e o estado atual
   do projeto, para conferir que a base esta de pe. */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const ETAPA_ATUAL = 1
const ETAPA_TITULO = 'Fundação'

const ETAPAS = [
  { numero: 1, titulo: 'Fundação', concluida: true },
  { numero: 2, titulo: 'Identidade e isolamento', concluida: false },
]

const Index = () => {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">GesTec-IA-Odonto</h1>
        <p className="text-sm text-muted-foreground">
          Gestão de consultórios e clínicas odontológicas.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Etapa {ETAPA_ATUAL} &mdash; {ETAPA_TITULO}
          </CardTitle>
          <CardDescription>
            Base do projeto pronta: cliente de dados, layout e registro de estado. Nenhuma regra de
            negócio foi criada nesta etapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Backend e banco</span>
            <span>Skip Cloud (PocketBase)</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Coleções criadas</span>
            <span>0</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Próxima etapa</span>
            <span>2 &mdash; Identidade e isolamento</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Etapas</h2>
        <ul className="space-y-1.5">
          {ETAPAS.map((etapa) => (
            <li
              key={etapa.numero}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>
                {etapa.numero} &mdash; {etapa.titulo}
              </span>
              <Badge variant={etapa.concluida ? 'default' : 'outline'}>
                {etapa.concluida ? 'concluída' : 'próxima'}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-xs text-muted-foreground">
          O plano completo tem 15 etapas. O registro detalhado fica em docs/ESTADO.md.
        </p>
      </div>
    </div>
  )
}

export default Index
