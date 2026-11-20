/* Guarda de rota por papel (Etapa 4)

   Três proteções, em ordem:
   1. não logado -> /entrar
   2. precisa trocar a senha -> /trocar-senha (não deixa passar de nada)
   3. papel sem permissão -> tela de bloqueio, e a tentativa é registrada
      na auditoria como 'tentativa_negada'

   Aviso importante e honesto: esta guarda é de interface. A barreira real é
   a regra de acesso da coleção, no servidor. Se um dia uma tela clínica for
   criada sem a regra correspondente no banco, esconder o menu não protege
   nada. Por isso as regras de auditoria são restritas por papel na migration. */

import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSessao } from '@/contexts/SessaoContext'
import { podeGerenciarUsuarios, podeVerAuditoria, type Papel } from '@/lib/auth'
import Bloqueado from '@/pages/Bloqueado'
import { Carregando } from '@/components/Carregando'

interface Props {
  children: ReactNode
  /** Se informado, só estes papéis passam. */
  papeis?: Papel[]
  /** Atalho para a regra de gestão de usuários. */
  exigeGestao?: boolean
  /** Atalho para a regra de auditoria. */
  exigeAuditoria?: boolean
}

export function RotaProtegida({ children, papeis, exigeGestao, exigeAuditoria }: Props) {
  const { sessao, carregando } = useSessao()
  const local = useLocation()

  if (carregando) return <Carregando />

  if (!sessao) {
    return <Navigate to="/entrar" replace state={{ de: local.pathname }} />
  }

  if (sessao.precisaTrocarSenha && local.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />
  }

  let permitido = true
  if (papeis && papeis.length > 0) permitido = papeis.indexOf(sessao.papel as Papel) >= 0
  if (exigeGestao) permitido = permitido && podeGerenciarUsuarios(sessao.papel)
  if (exigeAuditoria) permitido = permitido && podeVerAuditoria(sessao.papel)

  if (!permitido) {
    return <Bloqueado papel={sessao.papel} rota={local.pathname} />
  }

  return <>{children}</>
}

export default RotaProtegida
