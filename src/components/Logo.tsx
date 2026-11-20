/* Marca do GesTec-IA-Odonto em SVG.

   Recriada em vetor a partir do logo original (dente branco dentro de anel
   azul, com malha de nós e linhas de circuito). Vetor em vez de bitmap porque:
   - e nitido em qualquer tamanho (favicon, cabecalho, impressao);
   - pesa poucos KB;
   - acompanha a paleta definida em src/lib/brand.ts.

   O arquivo binario original continua sendo a referencia visual; este SVG
   reproduz a mesma linguagem grafica em codigo. */

import type { SVGProps } from 'react'

interface Props extends SVGProps<SVGSVGElement> {
  size?: number
  /** 'colorido' usa o anel azul; 'branco' desenha tudo em branco (para fundo escuro) */
  variante?: 'colorido' | 'branco'
}

const NOS: Array<[number, number]> = [
  [50, 10],
  [74, 17],
  [88, 38],
  [84, 63],
  [68, 82],
  [46, 90],
  [24, 82],
  [11, 61],
  [14, 36],
  [30, 16],
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
  [8, 9],
  [9, 0],
  [9, 5],
  [1, 6],
]

export function Logo({ size = 32, variante = 'colorido', ...props }: Props) {
  const branco = variante === 'branco'
  const anel = branco ? '#FFFFFF' : '#123B72'
  const anelInterno = branco ? '#FFFFFF' : '#1E6FD9'
  const malha = branco ? '#FFFFFF' : '#7FC4F5'

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="GesTec-IA-Odonto"
      {...props}
    >
      {/* anel externo */}
      <circle cx="50" cy="50" r="47" fill="none" stroke={anel} strokeWidth="4" />
      {/* anel interno */}
      <circle
        cx="50"
        cy="50"
        r="41"
        fill="none"
        stroke={anelInterno}
        strokeWidth="1.2"
        opacity="0.7"
      />

      {/* malha de conexao: ligacoes primeiro, nos depois */}
      <g stroke={malha} strokeWidth="0.9" opacity="0.85">
        {LIGACOES.map(([a, b], i) => (
          <line key={i} x1={NOS[a][0]} y1={NOS[a][1]} x2={NOS[b][0]} y2={NOS[b][1]} />
        ))}
      </g>
      <g fill={malha}>
        {NOS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.7" />
        ))}
      </g>

      {/* dente */}
      <path
        d="M50 26c-5 0-8 3-13 3-4 0-7 3-7 9 0 5 2 8 3 13 1 4 1 9 2 14 1 5 2 9 5 9 3 0 3-4 4-8 1-4 2-7 6-7s5 3 6 7c1 4 1 8 4 8 3 0 4-4 5-9 1-5 1-10 2-14 1-5 3-8 3-13 0-6-3-9-7-9-5 0-8-3-13-3z"
        fill="#FFFFFF"
        stroke={branco ? '#FFFFFF' : anel}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* linhas de circuito sob o dente */}
      <g stroke={malha} strokeWidth="0.9" fill="none" opacity="0.9">
        <path d="M40 68v5h-4v6" />
        <path d="M50 70v9" />
        <path d="M60 68v5h4v6" />
      </g>
    </svg>
  )
}

export default Logo
