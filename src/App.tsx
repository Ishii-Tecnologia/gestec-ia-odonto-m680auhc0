/* Main App Component - routing, sessão e providers.
   Rotas de acesso livre ficam FORA do Layout; as demais passam por
   RotaProtegida, que aplica as regras de papel. */

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import Entrar from './pages/Entrar'
import TrocarSenha from './pages/TrocarSenha'
import Usuarios from './pages/Usuarios'
import Auditoria from './pages/Auditoria'
import Prontuario from './pages/Prontuario'
import Pacientes from './pages/Pacientes'
import PacienteForm from './pages/PacienteForm'
import PacienteFicha from './pages/PacienteFicha'
import Agenda from './pages/Agenda'
import { PAPEIS_CLINICOS } from './lib/auth'
import { SessaoProvider } from './contexts/SessaoContext'
import { RotaProtegida } from './components/RotaProtegida'

const App = () => (
  <BrowserRouter>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SessaoProvider>
        <Routes>
          {/* acesso livre */}
          <Route path="/entrar" element={<Entrar />} />

          {/* exige login, mas não exige senha já trocada */}
          <Route
            path="/trocar-senha"
            element={
              <RotaProtegida>
                <TrocarSenha />
              </RotaProtegida>
            }
          />

          {/* área autenticada */}
          <Route
            element={
              <RotaProtegida>
                <Layout />
              </RotaProtegida>
            }
          >
            <Route path="/" element={<Index />} />
            <Route
              path="/usuarios"
              element={
                <RotaProtegida exigeGestao>
                  <Usuarios />
                </RotaProtegida>
              }
            />
            <Route
              path="/auditoria"
              element={
                <RotaProtegida exigeAuditoria>
                  <Auditoria />
                </RotaProtegida>
              }
            />
            {/* agenda: operada pela recepção */}
            <Route path="/agenda" element={<Agenda />} />

            {/* pacientes: cadastro é da recepção também */}
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/novo" element={<PacienteForm />} />
            <Route path="/pacientes/:id" element={<PacienteFicha />} />
            <Route path="/pacientes/:id/editar" element={<PacienteForm />} />

            {/* rota clínica: recepção e financeiro são bloqueados aqui */}
            <Route
              path="/prontuario"
              element={
                <RotaProtegida papeis={PAPEIS_CLINICOS}>
                  <Prontuario />
                </RotaProtegida>
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </SessaoProvider>
    </TooltipProvider>
  </BrowserRouter>
)

export default App
