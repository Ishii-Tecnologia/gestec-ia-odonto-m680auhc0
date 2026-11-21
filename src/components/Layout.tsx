/* Layout Component - estrutura raiz do GesTec-IA-Odonto
   - Cabeçalho com a marca e o usuário logado (com sair)
   - Barra lateral filtrada pelo PAPEL do usuário
   - O conteúdo das rotas é renderizado no Outlet

   O menu esconde o que o papel não pode abrir, mas esconder não é proteger:
   cada rota também passa pela RotaProtegida e, principalmente, cada coleção
   tem a regra de acesso no servidor. */

import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  UserRound,
  LogOut,
  Users,
  ScrollText,
  Home,
  Contact,
  CalendarDays,
  BookOpen,
  Tags,
  TrendingDown,
  Banknote,
  PieChart,
  LineChart,
  HandCoins,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/Logo'
import { BRAND } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSessao } from '@/contexts/SessaoContext'
import { podeGerenciarUsuarios, podeVerAuditoria, rotuloPapel, sair } from '@/lib/auth'

interface ItemMenu {
  label: string
  to: string
  icone: typeof Home
  visivel: (papel: string) => boolean
}

const ITENS: ItemMenu[] = [
  { label: 'Início', to: '/', icone: Home, visivel: () => true },
  { label: 'Agenda', to: '/agenda', icone: CalendarDays, visivel: () => true },
  { label: 'Pacientes', to: '/pacientes', icone: Contact, visivel: () => true },
  { label: 'Catálogo', to: '/catalogo', icone: BookOpen, visivel: () => true },
  { label: 'Tabelas de preço', to: '/tabelas-preco', icone: Tags, visivel: () => true },
  { label: 'Contas a receber', to: '/contas-receber', icone: Banknote, visivel: () => true },
  {
    label: 'Despesas',
    to: '/despesas',
    icone: Receipt,
    visivel: (papel) => ['proprietario', 'gestor'].indexOf(papel) >= 0,
  },
  {
    label: 'DRE',
    to: '/dre',
    icone: PieChart,
    visivel: (papel) => ['proprietario', 'gestor'].indexOf(papel) >= 0,
  },
  {
    label: 'Fluxo de caixa',
    to: '/fluxo-caixa',
    icone: LineChart,
    visivel: (papel) => ['proprietario', 'gestor'].indexOf(papel) >= 0,
  },
  {
    label: 'Inadimplência',
    to: '/inadimplencia',
    icone: HandCoins,
    visivel: (papel) => ['proprietario', 'gestor', 'recepcao'].indexOf(papel) >= 0,
  },
  {
    label: 'Passivo clínico',
    to: '/passivo-clinico',
    icone: TrendingDown,
    visivel: (papel) => ['proprietario', 'gestor', 'dentista'].indexOf(papel) >= 0,
  },
  {
    label: 'Usuários',
    to: '/usuarios',
    icone: Users,
    visivel: (papel) => podeGerenciarUsuarios(papel as never),
  },
  {
    label: 'Auditoria',
    to: '/auditoria',
    icone: ScrollText,
    visivel: (papel) => podeVerAuditoria(papel as never),
  },
]

export default function Layout() {
  const { sessao } = useSessao()
  const navegar = useNavigate()

  function sairAgora() {
    sair()
    navegar('/entrar', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">{BRAND.nome}</div>
            <div className="text-[11px] text-muted-foreground">{BRAND.descricao}</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {sessao ? (
            <>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-xs font-medium">{sessao.nome}</div>
                <div className="text-[11px] text-muted-foreground">{rotuloPapel(sessao.papel)}</div>
              </div>
              <Badge variant="secondary" className="text-[10px] sm:hidden">
                {rotuloPapel(sessao.papel)}
              </Badge>
              <Button variant="ghost" size="sm" onClick={sairAgora} title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="h-4 w-4" />
              <span className="text-xs">Não autenticado</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r p-3 md:block">
          <nav className="flex flex-col gap-1" aria-label="Navegação principal">
            {ITENS.filter((i) => i.visivel(sessao?.papel || '')).map((item) => {
              const Icone = item.icone
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                      isActive && 'bg-accent font-medium',
                    )
                  }
                >
                  <Icone className="h-4 w-4" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
