/* Sim, você não tem acesso a isso — e a tentativa foi registrada.

   A mensagem é explícita de propósito: esconder o motivo gera chamado de
   suporte. E, quando o usuário está logado, a tentativa vira linha na
   auditoria ('tentativa_negada'), que é o que o requisito da etapa pede. */

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import pb from '@/lib/pocketbase/client'
import { useSessao } from '@/contexts/SessaoContext'
import { rotuloPapel, type Papel } from '@/lib/auth'

interface Props {
  papel: Papel | ''
  rota: string
}

export default function Bloqueado({ papel, rota }: Props) {
  const { sessao } = useSessao()
  const registrado = useRef(false)

  useEffect(() => {
    // Uma vez por montagem: registrar a negativa na trilha.
    if (registrado.current || !sessao) return
    registrado.current = true

    pb.collection('auditoria_acesso')
      .create({
        tenant_id: sessao.tenantId,
        usuario_id: sessao.id,
        acao: 'tentativa_negada',
        rota,
        motivo: `Papel ${papel || 'sem papel'} tentou abrir rota restrita`,
      })
      .catch(() => {
        // Se a gravação falhar, não faz nada: o bloqueio já aconteceu.
      })
  }, [sessao, papel, rota])

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-10">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <CardTitle className="text-base">Acesso não permitido</CardTitle>
          {/* A mensagem é genérica sobre o MOTIVO porque este componente serve a
              várias rotas. Antes ele dizia sempre "prontuário e dados clínicos",
              o que ficava errado ao bloquear, por exemplo, a tela de mensagens —
              a recepção lia uma explicação sobre prontuário e não entendia por
              que não podia editar texto de e-mail. */}
          <CardDescription>
            Seu perfil <strong>{rotuloPapel(papel)}</strong> não tem permissão para abrir esta área.
            Cada área é liberada por perfil de acesso, e esta não está entre as suas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Esta tentativa foi registrada na trilha de auditoria da clínica. Se você precisa desse
            acesso, fale com o responsável.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
