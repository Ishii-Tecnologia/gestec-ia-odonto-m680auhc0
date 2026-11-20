/* Layout Component - estrutura raiz do GesTec-IA-Odonto
   - Header com identidade do produto e area de usuario
   - Barra lateral de navegacao (menu vazio nesta etapa: as rotas chegam junto
     das etapas que criam as colecoes correspondentes)
   - O conteudo das rotas e renderizado no Outlet */

import { Outlet, NavLink } from 'react-router-dom'
import { Stethoscope, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  to: string
}

// Etapa 1: menu vazio de proposito. Cada item entra na etapa que cria a
// colecao e a permissao correspondente.
const NAV_ITEMS: NavItem[] = []

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">GesTec-IA-Odonto</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <UserRound className="h-4 w-4" />
          <span>Sessao nao iniciada</span>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r p-3 md:block">
          <nav className="flex flex-col gap-1" aria-label="Navegacao principal">
            {NAV_ITEMS.length === 0 ? (
              <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                Nenhum modulo habilitado ainda.
              </p>
            ) : (
              NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                      isActive && 'bg-accent font-medium',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))
            )}
          </nav>
        </aside>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
