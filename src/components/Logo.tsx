/* Marca do GesTec-IA-Odonto em SVG — recreação vetorial do ícone oficial.

   Reproduz o ícone enviado pela empresa:
   - círculo com gradiente do azul profundo (esquerda) ao verde (direita);
   - anel fino branco na borda;
   - dente branco ao centro;
   - malha de nós interligados (circuito/molécula) na parte superior;
   - trilhas de circuito com nós na parte inferior.

   Vetor em vez de bitmap porque o workspace do Skip aceita apenas arquivos de
   texto (não aceita upload binário). Resultado: nítido em qualquer tamanho,
   poucos KB, e nenhum risco de arquivo de imagem faltar no deploy.
   O PNG original continua sendo a referência visual para o refinamento final. */

import { useId } from 'react'
import type { SVGProps } from 'react'

interface Props extends SVGProps<SVGSVGElement> {
  size?: number
  /** 'colorido' usa o gradiente azul→verde; 'branco' desenha tudo em branco. */
  variante?: 'colorido' | 'branco'
}

/* Nós da malha superior, em coordenadas do viewBox 100x100. */
const NOS: Array<[number, number]> = [
  [50, 12],
  [68, 18],
  [79, 32],
  [78, 49],
  [66, 61],
  [34, 61],
  [22, 49],
  [21, 32],
  [32, 18],
]

const LIGACOES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 0],
  [8, 1],
  [3, 6],
]

export function Logo({ size = 32, variante = 'colorido', ...props }: Props) {
  const uid = useId().replace(/:/g, '')
  const gradId = `gestec-grad-${uid}`
  const branco = variante === 'branco'

  const traco = branco ? '#FFFFFF' : '#FFFFFF'
  const noCor = branco ? '#FFFFFF' : '#DCEBFF'

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="GesTec-IA-Odonto"
      {...props}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0E2F63" />
          <stop offset="45%" stopColor="#1668C9" />
          <stop offset="100%" stopColor="#1FB47A" />
        </linearGradient>
      </defs>

      {/* fundo circular com gradiente */}
      <circle cx="50" cy="50" r="48" fill={branco ? 'none' : `url(#${gradId})`} />
      {/* anel fino branco na borda */}
      <circle
        cx="50"
        cy="50"
        r="46.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.1"
        opacity={branco ? 0.9 : 0.5}
      />

      {/* malha superior: ligações primeiro, nós por cima */}
      <g stroke={traco} strokeWidth="0.75" opacity="0.65">
        {LIGACOES.map(([a, b], i) => (
          <line key={i} x1={NOS[a][0]} y1={NOS[a][1]} x2={NOS[b][0]} y2={NOS[b][1]} />
        ))}
      </g>
      <g fill={noCor}>
        {NOS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 0 ? 1.9 : 1.5} />
        ))}
      </g>

      {/* dente branco */}
      <path
        d="M50 27.5c-4.6 0-7.4 2.6-12 2.6-3.7 0-6.4 2.7-6.4 8.2 0 4.5 1.8 7.3 2.7 11.8.9 3.6.9 8.2 1.8 12.7.9 4.5 1.8 8.2 4.6 8.2 2.7 0 2.7-3.7 3.6-7.3.9-3.6 1.8-6.4 5.5-6.4s4.6 2.8 5.5 6.4c.9 3.6.9 7.3 3.6 7.3 2.8 0 3.7-3.7 4.6-8.2.9-4.5.9-9.1 1.8-12.7.9-4.5 2.7-7.3 2.7-11.8 0-5.5-2.7-8.2-6.4-8.2-4.6 0-7.4-2.6-12-2.6z"
        fill="#FFFFFF"
      />

      {/* circuito inferior: trilhas com nós */}
      <g stroke={traco} strokeWidth="0.8" fill="none" opacity="0.75">
        <path d="M50 66v6" />
        <path d="M50 72h-6v5" />
        <path d="M50 72h6v5" />
        <path d="M38 68v4h-5v6" />
        <path d="M62 68v4h5v6" />
      </g>
      <g fill={noCor} opacity="0.9">
        <circle cx="33" cy="80" r="1.3" />
        <circle cx="44" cy="79" r="1.3" />
        <circle cx="56" cy="79" r="1.3" />
        <circle cx="67" cy="80" r="1.3" />
      </g>
    </svg>
  )
}

export default Logo
