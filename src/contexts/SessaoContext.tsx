/* Contexto de sessão (Etapa 4)

   Um único lugar que sabe quem está logado e reage a mudança de token.
   O PocketBase guarda o token no localStorage; pb.authStore.onChange avisa
   quando ele muda (login, logout, expiração, refresh), então as telas não
   precisam consultar nada em cada render. */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'
import { sessaoAtual, type Sessao } from '@/lib/auth'

interface SessaoContexto {
  sessao: Sessao | null
  carregando: boolean
  recarregar: () => void
}

const Contexto = createContext<SessaoContexto>({
  sessao: null,
  carregando: true,
  recarregar: () => {},
})

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(() => sessaoAtual())
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(() => {
    setSessao(sessaoAtual())
  }, [])

  useEffect(() => {
    // onAuthChange dispara a cada mudança do authStore
    const cancelar = pb.authStore.onChange(() => {
      setSessao(sessaoAtual())
    })

    setSessao(sessaoAtual())
    setCarregando(false)

    return cancelar
  }, [])

  return (
    <Contexto.Provider value={{ sessao, carregando, recarregar }}>{children}</Contexto.Provider>
  )
}

export function useSessao(): SessaoContexto {
  return useContext(Contexto)
}
