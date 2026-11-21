/* Módulos contratados (Etapa 13 → 14)

   Um lugar só que sabe quais módulos a clínica tem, e um mapa de qual item de
   menu depende de qual módulo.

   REGRA DE OURO DA FALHA: se a consulta falhar, o menu aparece COMPLETO. Parece
   contraintuitivo para uma guarda de segurança, mas é o certo aqui: esconder o
   menu de quem pagou por causa de um erro de rede é um bug que o cliente sente
   na hora e que ele lê como "o sistema perdeu meu módulo". A barreira real é o
   servidor (guarda de escrita + rotas); o menu é conveniência.

   Nenhum módulo ativo NÃO significa "esconde tudo": paciente, catálogo e agenda
   são o núcleo — sem eles a clínica não consegue nem cadastrar quem chega. */

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'

export interface Assinatura {
  codigo: string
  nome: string
  valor_centavos: number
  status: string
  vigente: boolean
  vencida: boolean
  inicio: string
  fim: string
  preco_catalogo_centavos: number
}

export interface ItemCatalogo {
  codigo: string
  nome: string
  descricao: string
  preco_centavos: number
  depende_de: string
  contratado: boolean
}

interface EstadoModulos {
  ativos: string[]
  assinaturas: Assinatura[]
  catalogo: ItemCatalogo[]
  totalMensalCentavos: number
  carregado: boolean
  recarregar: () => Promise<void>
  tem: (codigo: string) => boolean
}

const Contexto = createContext<EstadoModulos>({
  ativos: [],
  assinaturas: [],
  catalogo: [],
  totalMensalCentavos: 0,
  carregado: false,
  recarregar: async () => {},
  tem: () => true,
})

/* Item de menu → módulo que o libera.
   O que não aparece aqui é núcleo e está sempre visível. */
export const MENU_POR_MODULO: Record<string, string> = {
  '/painel': 'relatorios',
  '/dre': 'financeiro',
  '/fluxo-caixa': 'financeiro',
  '/contas-receber': 'financeiro',
  '/despesas': 'financeiro',
  '/inadimplencia': 'financeiro',
  '/producao': 'relatorios',
  '/passivo-clinico': 'orcamento',
  '/mensagens': 'automacoes',
}

export function ModulosProvider({ children }: { children: ReactNode }) {
  const { sessao } = useSessao()
  const [ativos, setAtivos] = useState<string[]>([])
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([])
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [total, setTotal] = useState(0)
  const [carregado, setCarregado] = useState(false)
  /* falhou = true quando a consulta deu erro. Nesse caso `tem` responde SEMPRE
     true, para não esconder menu por causa de rede. */
  const [falhou, setFalhou] = useState(false)

  const recarregar = useCallback(async () => {
    if (!sessao) {
      setCarregado(false)
      return
    }
    try {
      const r = await pb.send('/backend/v1/meus-modulos', { method: 'GET' })
      setAtivos(r.modulos_ativos || [])
      setAssinaturas(r.assinaturas || [])
      setCatalogo(r.catalogo || [])
      setTotal(r.total_mensal_centavos || 0)
      setFalhou(false)
    } catch (_) {
      setFalhou(true)
    } finally {
      setCarregado(true)
    }
  }, [sessao])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  function tem(codigo: string): boolean {
    if (falhou || !carregado) return true // nunca esconder por falha ou carregando
    return ativos.indexOf(codigo) >= 0
  }

  return (
    <Contexto.Provider
      value={{
        ativos,
        assinaturas,
        catalogo,
        totalMensalCentavos: total,
        carregado,
        recarregar,
        tem,
      }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useModulos(): EstadoModulos {
  return useContext(Contexto)
}
