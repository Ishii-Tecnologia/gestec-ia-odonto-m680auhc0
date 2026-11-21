/* Home Page - pagina inicial do GesTec-IA-Odonto.
   Reflete o estado real do projeto (ver docs/ESTADO.md). Ao concluir uma etapa,
   atualizar as listas abaixo junto com o registro de estado. */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/Logo'
import { BRAND } from '@/lib/brand'

type Status = 'concluida' | 'proxima' | 'pendente'

const ETAPAS: Array<{ numero: number; titulo: string; status: Status }> = [
  { numero: 1, titulo: 'Fundação', status: 'concluida' },
  { numero: 2, titulo: 'Identidade e isolamento', status: 'concluida' },
  { numero: 3, titulo: 'Núcleo organizacional', status: 'concluida' },
  { numero: 4, titulo: 'Acesso e auditoria', status: 'concluida' },
  { numero: 5, titulo: 'Pacientes', status: 'concluida' },
  { numero: 6, titulo: 'Agenda', status: 'concluida' },
  { numero: 7, titulo: 'Prontuário', status: 'concluida' },
  { numero: 8, titulo: 'Catálogo e preços', status: 'concluida' },
  { numero: 9, titulo: 'Orçamento e execução', status: 'concluida' },
  { numero: 10, titulo: 'Financeiro do paciente', status: 'concluida' },
  { numero: 11, titulo: 'Financeiro gerencial', status: 'proxima' },
]

const RESUMO: Array<{ rotulo: string; valor: string }> = [
  { rotulo: 'Backend e banco', valor: 'Skip Cloud (PocketBase)' },
  { rotulo: 'Coleções criadas', valor: '35' },
  { rotulo: 'Especialidades do CFO', valor: '25' },
  { rotulo: 'Módulos no catálogo', valor: '6' },
]

const ROTULO: Record<Status, string> = {
  concluida: 'concluída',
  proxima: 'próxima',
  pendente: 'pendente',
}

const Index = () => {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-4">
        <Logo size={64} />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{BRAND.nome}</h1>
          <p className="text-sm text-muted-foreground">{BRAND.descricao}</p>
        </div>
      </div>

      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{BRAND.slogan}</p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Estado do projeto</CardTitle>
          <CardDescription>
            Etapas 1 a 10 concluídas: fundação, isolamento entre CNPJs, estrutura da clínica, acesso
            com auditoria, pacientes, agenda com conflito garantido pelo banco, prontuário com
            sigilo, catálogo com preço por convênio, plano versionado com passivo clínico e contas a
            receber com competência separada da liquidação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {RESUMO.map((linha, i) => (
            <div
              key={linha.rotulo}
              className={
                i < RESUMO.length - 1
                  ? 'flex items-center justify-between gap-4 border-b pb-2'
                  : 'flex items-center justify-between gap-4'
              }
            >
              <span className="text-muted-foreground">{linha.rotulo}</span>
              <span className="font-medium">{linha.valor}</span>
            </div>
          ))}
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
              <Badge variant={etapa.status === 'concluida' ? 'default' : 'outline'}>
                {ROTULO[etapa.status]}
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
