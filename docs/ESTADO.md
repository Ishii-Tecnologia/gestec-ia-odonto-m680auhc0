# Estado do projeto — GesTec-IA-Odonto

Registro de progresso das etapas de construção. Atualizar ao final de cada etapa.
Plano completo em `07-plano-de-execucao-consolidado.md` e prompts em
`08-prompts-consolidados.md`.

## Situação atual

| Campo            | Valor                                                 |
| ---------------- | ----------------------------------------------------- |
| Etapa atual      | 2 — Identidade e isolamento                           |
| Status           | concluída (build verde + 5 testes de API)             |
| Próxima etapa    | 3 — Núcleo organizacional                             |
| Stack            | React + Vite + Skip Cloud (PocketBase v0.36 / SQLite) |
| Versão publicada | 0.0.6                                                 |

## Etapas

| #   | Etapa                   | Status    | Observação                                                                 |
| --- | ----------------------- | --------- | -------------------------------------------------------------------------- |
| 1   | Fundação                | concluída | Cliente PocketBase, layout, página inicial, marca vetorial e este registro |
| 2   | Identidade e isolamento | concluída | `tenant` + `users` com `papel`/`tenant_id` travados; 2 tenants demo        |
| 3   | Núcleo organizacional   | pendente  | unidade, sala, profissional, especialidade (25 CFO), tenant_modulo         |
| 4   | Acesso e auditoria      | pendente  | convite, guarda de rota, `auditoria_acesso`                                |
| 5   | Pacientes               | pendente  | cadastro, alertas clínicos, responsável legal, anamnese versionada         |
| 6   | Agenda                  | pendente  | `agenda_slot` com índice único por profissional e por sala                 |
| 7   | Prontuário              | pendente  | evolução append-only, odontograma, sigilo restrito ao responsável          |
| 8   | Catálogo e preços       | pendente  | procedimentos, convênio, tabela de preço                                   |
| 9   | Orçamento e execução    | pendente  | plano versionado, passivo clínico, crédito/estorno                         |
| 10  | Financeiro do paciente  | pendente  | competência × liquidação, baixa parcial, lote, contador                    |
| 11  | Financeiro gerencial    | pendente  | despesas, DRE, fluxo 90 dias, aging                                        |
| 12  | Relatórios operacionais | pendente  | painel, faltas, produção                                                   |
| 13  | Comunicação             | pendente  | lembretes de consulta, retorno e aniversário                               |
| 14  | Módulos e assinatura    | pendente  | catálogo de módulos, assinatura por CNPJ                                   |
| 15  | Publicação e operação   | pendente  | produção, segredos, backup testado, checklist                              |

## Decisões fechadas

- Tenant = CNPJ (um CNPJ por clínica).
- Backend e banco no Skip Cloud (PocketBase / SQLite).
- Sigilo padrão: restrito ao profissional responsável.
- Módulos com mensalidade fixa por CNPJ, contratáveis e canceláveis a qualquer momento.
- Autônomo é o caso degenerado da clínica: um produto só.
- Prontuário imutável: append-only, correção por retificação datada.
- Dinheiro sempre em centavos inteiros.
- Data de competência separada da data de liquidação em todo recebível.

## Cliente piloto (definido em 20/11/2026)

- 3 dentistas
- 4 cadeiras
- 3 especialidades
- **Fatura convênio** → TISS deixa de ser opcional no roadmap; entra na Fase 2
- Contas a pagar **entra** na Etapa 11 (necessário para o DRE fechar)

## Dados de demonstração

Dois tenants fictícios, marcados com `demo = true`:

| CNPJ           | Nome                  | Usuários                                                                                       |
| -------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| 11222333000181 | Clinica Demo Alfa     | alfa.proprietario@demo.gestec.local (proprietario), alfa.dentista@demo.gestec.local (dentista) |
| 44555666000172 | Consultorio Demo Beta | beta.proprietario@demo.gestec.local (proprietario)                                             |

Senha de todos: `Demo@2026!`

**Para excluir todos de uma vez:**

```sql
DELETE FROM users WHERE email LIKE '%@demo.gestec.local';
DELETE FROM tenant WHERE demo = true;
```

Ou reverter as migrations `0002_demo_tenants` e `0001_identidade_e_isolamento`.

## Resultado dos testes da Etapa 2 (executados em 20/11/2026)

Testes chamados direto na API do backend, não pela interface:

| Teste                           | Esperado | Resultado                                      |
| ------------------------------- | -------- | ---------------------------------------------- |
| Proprietário Alfa lista tenants | 1        | 1 ✔                                            |
| Proprietário Beta lista tenants | 1        | 1 ✔                                            |
| Alfa lista usuários             | 2        | 2 ✔                                            |
| Beta lista usuários             | 1        | 1 ✔                                            |
| Alterar o próprio `papel`       | recusado | recusado ✔ (`papel` permaneceu `proprietario`) |
| Alterar o próprio `tenant_id`   | recusado | 404 ✔                                          |
| Alfa ler tenant do Beta por id  | recusado | 404 ✔                                          |

## Pendências

- Definir e-mails reais e senha inicial dos usuários do cliente piloto (substituir os demo).
- Confirmar se o logo vetorial recriado em `src/components/Logo.tsx` reproduz fielmente a marca (o SVG foi redesenhado a partir da imagem; o binário original segue como referência).
