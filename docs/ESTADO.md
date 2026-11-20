# Estado do projeto — GesTec-IA-Odonto

Registro de progresso das etapas de construcao. Atualizar ao final de cada etapa.
Plano completo em `07-plano-de-execucao-consolidado.md` e prompts em
`08-prompts-consolidados.md`.

## Situacao atual

| Campo         | Valor                                                 |
| ------------- | ----------------------------------------------------- |
| Etapa atual   | 1 — Fundacao                                          |
| Status        | concluida                                             |
| Proxima etapa | 2 — Identidade e isolamento                           |
| Stack         | React + Vite + Skip Cloud (PocketBase v0.36 / SQLite) |

## Etapas

| #   | Etapa                   | Status    | Observacao                                                         |
| --- | ----------------------- | --------- | ------------------------------------------------------------------ |
| 1   | Fundacao                | concluida | Cliente PocketBase, layout raiz, pagina inicial e este registro    |
| 2   | Identidade e isolamento | pendente  | tenant + users com `papel` e `tenant_id` travados                  |
| 3   | Nucleo organizacional   | pendente  | unidade, sala, profissional, especialidade (25 CFO), tenant_modulo |
| 4   | Acesso e auditoria      | pendente  | convite, guarda de rota, `auditoria_acesso`                        |
| 5   | Pacientes               | pendente  | cadastro, alertas clinicos, responsavel legal, anamnese versionada |
| 6   | Agenda                  | pendente  | `agenda_slot` com indice unico por profissional e por sala         |
| 7   | Prontuario              | pendente  | evolucao append-only, odontograma, sigilo restrito ao responsavel  |
| 8   | Catalogo e precos       | pendente  | procedimentos, convenio, tabela de preco                           |
| 9   | Orcamento e execucao    | pendente  | plano versionado, passivo clinico, credito/estorno                 |
| 10  | Financeiro do paciente  | pendente  | competencia x liquidacao, baixa parcial, lote, contador            |
| 11  | Financeiro gerencial    | pendente  | despesas, DRE, fluxo 90 dias, aging                                |
| 12  | Relatorios operacionais | pendente  | painel, faltas, producao                                           |
| 13  | Comunicacao             | pendente  | lembretes de consulta, retorno e aniversario                       |
| 14  | Modulos e assinatura    | pendente  | catalogo de modulos, assinatura por CNPJ                           |
| 15  | Publicacao e operacao   | pendente  | producao, segredos, backup testado, checklist                      |

## Decisoes fechadas

- Tenant = CNPJ (um CNPJ por clinica).
- Backend e banco no Skip Cloud (PocketBase / SQLite).
- Sigilo padrao: restrito ao profissional responsavel.
- Modulos com mensalidade fixa por CNPJ, contratáveis e canceláveis a qualquer momento.
- Autonomo e o caso degenerado da clinica: um produto so.
- Prontuario imutavel: append-only, correcao por retificacao datada.
- Dinheiro sempre em centavos inteiros.
- Data de competencia separada da data de liquidacao em todo recebivel.

## Pendencias que dependem do cliente

- Definir o cliente piloto (numero de dentistas, cadeiras, especialidades, se fatura convenio).
- Confirmar se contas a pagar entra na Etapa 11 (sem despesas, o DRE nao fecha no sistema).
