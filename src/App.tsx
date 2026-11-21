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
import Catalogo from './pages/Catalogo'
import TabelasPreco from './pages/TabelasPreco'
import PlanoTratamento from './pages/PlanoTratamento'
import PassivoClinico from './pages/PassivoClinico'
import ContasReceber from './pages/ContasReceber'
import ExtratoPaciente from './pages/ExtratoPaciente'
import Dre from './pages/Dre'
import FluxoCaixa from './pages/FluxoCaixa'
import Aging from './pages/Aging'
import Despesas from './pages/Despesas'
import Painel from './pages/Painel'
import FaltasProducao from './pages/FaltasProducao'
import Seguranca from './pages/Seguranca'
import ModelosMensagem from './pages/ModelosMensagem'
import { PAPEIS_CLINICOS, PAPEIS_GESTAO } from './lib/auth'
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

            {/* catálogo e preços: recepção consulta; quem atende administra */}
            <Route path="/catalogo" element={<Catalogo />} />
            <Route path="/tabelas-preco" element={<TabelasPreco />} />

            {/* financeiro do paciente: recepção opera */}
            <Route path="/contas-receber" element={<ContasReceber />} />
            <Route path="/pacientes/:id/extrato" element={<ExtratoPaciente />} />

            {/* painel e relatórios operacionais */}
            <Route
              path="/painel"
              element={
                <RotaProtegida papeis={PAPEIS_GESTAO}>
                  <Painel />
                </RotaProtegida>
              }
            />
            <Route
              path="/producao"
              element={
                <RotaProtegida papeis={PAPEIS_CLINICOS}>
                  <FaltasProducao />
                </RotaProtegida>
              }
            />

            {/* segurança da conta: todo mundo tem conta, todo mundo configura */}
            <Route
              path="/seguranca"
              element={
                <RotaProtegida>
                  <Seguranca />
                </RotaProtegida>
              }
            />

            {/* modelos de mensagem: só quem administra a clínica */}
            <Route
              path="/mensagens"
              element={
                <RotaProtegida papeis={PAPEIS_GESTAO}>
                  <ModelosMensagem />
                </RotaProtegida>
              }
            />

            {/* financeiro gerencial: só dono e gestor */}
            <Route
              path="/dre"
              element={
                <RotaProtegida papeis={PAPEIS_GESTAO}>
                  <Dre />
                </RotaProtegida>
              }
            />
            <Route
              path="/fluxo-caixa"
              element={
                <RotaProtegida papeis={PAPEIS_GESTAO}>
                  <FluxoCaixa />
                </RotaProtegida>
              }
            />
            <Route
              path="/despesas"
              element={
                <RotaProtegida papeis={PAPEIS_GESTAO}>
                  <Despesas />
                </RotaProtegida>
              }
            />
            <Route path="/inadimplencia" element={<Aging />} />

            {/* plano de tratamento e passivo: clínicos */}
            <Route
              path="/passivo-clinico"
              element={
                <RotaProtegida papeis={PAPEIS_CLINICOS}>
                  <PassivoClinico />
                </RotaProtegida>
              }
            />
            <Route
              path="/pacientes/:id/plano"
              element={
                <RotaProtegida papeis={PAPEIS_CLINICOS}>
                  <PlanoTratamento />
                </RotaProtegida>
              }
            />
            <Route
              path="/pacientes/:id/plano/:planoId"
              element={
                <RotaProtegida papeis={PAPEIS_CLINICOS}>
                  <PlanoTratamento />
                </RotaProtegida>
              }
            />

            {/* pacientes: cadastro é da recepção também */}
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/novo" element={<PacienteForm />} />
            <Route path="/pacientes/:id" element={<PacienteFicha />} />
            <Route path="/pacientes/:id/editar" element={<PacienteForm />} />

            {/* rota clínica: recepção e financeiro são bloqueados aqui */}
            <Route
              path="/pacientes/:id/prontuario"
              element={
                <RotaProtegida papeis={PAPEIS_CLINICOS}>
                  <Prontuario />
                </RotaProtegida>
              }
            />
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
