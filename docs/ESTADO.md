# Estado do projeto — GesTec-IA-Odonto

Registro de progresso das etapas de construção. Atualizar ao final de cada etapa.
Plano completo em `07-plano-de-execucao-consolidado.md` e prompts em
`08-prompts-consolidados.md`.

## Situação atual

| Campo         | Valor                                                 |
| ------------- | ----------------------------------------------------- |
| Etapa atual   | 1 — Fundação                                          |
| Status        | concluída                                             |
| Próxima etapa | 2 — Identidade e isolamento                           |
| Stack         | React + Vite + Skip Cloud (PocketBase v0.36 / SQLite) |

## Etapas

| #   | Etapa                   | Status    | Observação                                                         |
| --- | ----------------------- | --------- | ------------------------------------------------------------------ |
| 1   | Fundação                | concluída | Cliente PocketBase, layout raiz, página inicial e este registro    |
| 2   | Identidade e isolamento | pendente  | tenant + users com `papel` e `tenant_id` travados                  |
| 3   | Núcleo organizacional   | pendente  | unidade, sala, profissional, especialidade (25 CFO), tenant_modulo |
| 4   | Acesso e auditoria      | pendente  | convite, guarda de rota, `auditoria_acesso`                        |
| 5   | Pacientes               | pendente  | cadastro, alertas clínicos, responsável legal, anamnese versionada |
| 6   | Agenda                  | pendente  | `agenda_slot` com índice único por profissional e por sala         |
| 7   | Prontuário              | pendente  | evolução append-only, odontograma, sigilo restrito ao responsável  |
| 8   | Catálogo e preços       | pendente  | procedimentos, convênio, tabela de preço                           |
| 9   | Orçamento e execução    | pendente  | plano versionado, passivo clínico, crédito/estorno                 |
| 10  | Financeiro do paciente  | pendente  | competência × liquidação, baixa parcial, lote, contador            |
| 11  | Financeiro gerencial    | pendente  | despesas, DRE, fluxo 90 dias, aging                                |
| 12  | Relatórios operacionais | pendente  | painel, faltas, produção                                           |
| 13  | Comunicação             | pendente  | lembretes de consulta, retorno e aniversário                       |
| 14  | Módulos e assinatura    | pendente  | catálogo de módulos, assinatura por CNPJ                           |
| 15  | Publicação e operação   | pendente  | produção, segredos, backup testado, checklist                      |

## Decisões fechadas

- Tenant = CNPJ (um CNPJ por clínica).
- Backend e banco no Skip Cloud (PocketBase / SQLite).
- Sigilo padrão: restrito ao profissional responsável.
- Módulos com mensalidade fixa por CNPJ, contratáveis e canceláveis a qualquer momento.
- Autônomo é o caso degenerado da clínica: um produto só.
- Prontuário imutável: append-only, correção por retificação datada.
- Dinheiro sempre em centavos inteiros.
- Data de competência separada da data de liquidação em todo recebível.

## Pendências que dependem do cliente

- Definir o cliente piloto (número de dentistas, cadeiras, especialidades, se fatura convênio).
- Confirmar se contas a pagar entra na Etapa 11 (sem despesas, o DRE não fecha no sistema).
