/* Indicador de carregamento */

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center gap-3 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      {texto}
    </div>
  )
}

export default Carregando
