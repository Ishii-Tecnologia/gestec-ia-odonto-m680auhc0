# Estado do projeto — GesTec-IA-Odonto

Registro de progresso das etapas de construção. Atualizar ao final de cada etapa.
Plano completo em `artifacts/gestec/07-plano-de-execucao-consolidado.md` e prompts em
`artifacts/gestec/08-prompts-consolidados.md`.

## Situação atual

| Campo         | Valor                                                              |
| ------------- | ------------------------------------------------------------------ |
| Etapa atual   | 3 — Núcleo organizacional                                          |
| Status        | concluída (build verde + 7 testes de API + conferência das regras) |
| Próxima etapa | 4 — Acesso e auditoria                                             |
| Stack         | React + Vite + Skip Cloud (PocketBase v0.36 / SQLite)              |
| Versão        | 0.0.12                                                             |

## Etapas

| #   | Etapa                   | Status    | Observação                                                                  |
| --- | ----------------------- | --------- | --------------------------------------------------------------------------- |
| 1   | Fundação                | concluída | Cliente PocketBase, layout, página inicial, marca vetorial e este registro  |
| 2   | Identidade e isolamento | concluída | `tenant` + `users` com `papel`/`tenant_id` travados; 2 tenants demo         |
| 3   | Núcleo organizacional   | concluída | unidade, sala, profissional, especialidade (25 CFO), módulos, tenant_modulo |
| 4   | Acesso e auditoria      | pendente  | convite, guarda de rota, `auditoria_acesso`                                 |
| 5   | Pacientes               | pendente  | cadastro, alertas clínicos, responsável legal, anamnese versionada          |
| 6   | Agenda                  | pendente  | `agenda_slot` com índice único por profissional e por sala                  |
| 7   | Prontuário              | pendente  | evolução append-only, odontograma, sigilo restrito ao responsável           |
| 8   | Catálogo e preços       | pendente  | procedimentos, convênio, tabela de preço                                    |
| 9   | Orçamento e execução    | pendente  | plano versionado, passivo clínico, crédito/estorno                          |
| 10  | Financeiro do paciente  | pendente  | competência × liquidação, baixa parcial, lote, contador                     |
| 11  | Financeiro gerencial    | pendente  | despesas, DRE, fluxo 90 dias, aging                                         |
| 12  | Relatórios operacionais | pendente  | painel, faltas, produção                                                    |
| 13  | Comunicação             | pendente  | lembretes de consulta, retorno e aniversário                                |
| 14  | Módulos e assinatura    | pendente  | catálogo de módulos, assinatura por CNPJ                                    |
| 15  | Publicação e operação   | pendente  | produção, segredos, backup testado, checklist                               |

## Decisões fechadas

- Tenant = CNPJ (um CNPJ por clínica).
- Backend e banco no Skip Cloud (PocketBase / SQLite).
- Sigilo padrão: restrito ao profissional responsável.
- Módulos com mensalidade fixa por CNPJ, contratáveis e canceláveis a qualquer momento.
- Autônomo é o caso degenerado da clínica: um produto só.
- Prontuário imutável: append-only, correção por retificação datada.
- Dinheiro sempre em centavos inteiros.
- Data de competência separada da data de liquidação em todo recebível.
- Máximo de 2 especialidades por profissional travado no schema (`maxSelect: 2`),
  conforme art. 39 §1 da Consolidação das Normas do CFO.

## Cliente piloto (definido em 20/11/2026)

- 3 dentistas
- 4 cadeiras
- 3 especialidades
- **Fatura convênio** → TISS deixa de ser opcional no roadmap; entra na Fase 2
- Contas a pagar **entra** na Etapa 11 (necessário para o DRE fechar)

## Coleções

| Coleção                      | Escopo      | Regras                                                                                                                           |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tenant`                     | por clínica | leitura do próprio tenant; update só proprietário; create/delete nulos de propósito (onboarding é pela plataforma, não pela API) |
| `users`                      | auth        | mesmo tenant; `papel` e `tenant_id` imutáveis pelo próprio usuário                                                               |
| `unidade`                    | por tenant  | leitura do tenant; escrita proprietário/gestor                                                                                   |
| `sala`                       | por tenant  | idem                                                                                                                             |
| `profissional`               | por tenant  | idem                                                                                                                             |
| `especialidade`              | global      | leitura autenticada; escrita só superusuário                                                                                     |
| `modulo`                     | global      | leitura autenticada; escrita só superusuário                                                                                     |
| `tenant_modulo`              | por tenant  | idem unidade                                                                                                                     |
| `usuario_profissional`       | por tenant  | vínculo usuário ↔ profissional (vínculo opcional)                                                                                |
| `profissional_especialidade` | por tenant  | detalhe do título: instituição, data de registro no CRO                                                                          |

Nenhuma regra nula fora dos catálogos globais e do `create`/`delete` de `tenant`,
que são nulos por decisão.

## Dados de demonstração

Dois tenants fictícios, marcados com `demo = true`:

| CNPJ           | Nome                  | Usuários                                                                                       |
| -------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| 11222333000181 | Clinica Demo Alfa     | alfa.proprietario@demo.gestec.local (proprietario), alfa.dentista@demo.gestec.local (dentista) |
| 44555666000172 | Consultorio Demo Beta | beta.proprietario@demo.gestec.local (proprietario)                                             |

Senha de todos: `Demo@2026!`

Estrutura do piloto no tenant Alfa: 1 unidade (Unidade Centro), 4 cadeiras,
3 dentistas comissionados (Endodontia, Ortodontia, clínica geral) e
4 módulos contratados.

**Para excluir todos os demos de uma vez:**

```sql
DELETE FROM users WHERE email LIKE '%@demo.gestec.local';
DELETE FROM tenant WHERE demo = true;
```

Os filhos (`unidade`, `sala`, `profissional`, `tenant_modulo`,
`usuario_profissional`, `profissional_especialidade`) saem por `cascadeDelete`.

## Testes executados na API (não pela tela)

### Etapa 2

| Teste                         | Esperado | Resultado  |
| ----------------------------- | -------- | ---------- |
| Alfa lista tenants            | 1        | 1 ✔        |
| Beta lista tenants            | 1        | 1 ✔        |
| Alfa lista usuários           | 2        | 2 ✔        |
| Beta lista usuários           | 1        | 1 ✔        |
| Alterar o próprio `papel`     | recusado | recusado ✔ |
| Alterar o próprio `tenant_id` | recusado | 404 ✔      |
| Alfa ler tenant do Beta       | recusado | 404 ✔      |

### Etapa 3

| Teste                                                      | Esperado | Resultado                      |
| ---------------------------------------------------------- | -------- | ------------------------------ |
| Unidade/sala/profissional/tenant_modulo visíveis para Alfa | >0       | 1/4/3/4 ✔                      |
| As mesmas coleções visíveis para Beta                      | 0        | 0 ✔                            |
| Catálogos globais visíveis para os dois                    | 25 e 6   | 25 e 6 ✔                       |
| Beta criar unidade no tenant da Alfa                       | recusado | 400 ✔                          |
| Alfa ler unidade do Beta por id                            | recusado | 404 ✔                          |
| Dentista criar profissional                                | recusado | 400 ✔                          |
| Usuário criar especialidade no catálogo                    | recusado | 403 ✔                          |
| Alfa mover uma sala para o tenant da Beta                  | recusado | 404, sala permaneceu na Alfa ✔ |

## Correções registradas

- `0005`: as regras de update usavam `@request.body.tenant_id:changed`, que o
  validador recusa ("field changed is not defined"). Removido: a condição
  `tenant_id = @request.auth.tenant_id` já é verificada sobre o registro
  resultante, então tentar mover o registro para outro tenant falha. Provado no
  teste acima.
- `0006`: campos novos de coleção nascem com `0`, não `NULL`, então os
  `UPDATE ... WHERE campo IS NULL` da 0005 não copiaram nada e as 25
  especialidades ficaram com `vigente = false` e os módulos com valor `0`.
  Corrigido com preenchimento por valor.

## Pendências

- Definir e-mails reais e senha inicial dos usuários do cliente piloto.
- Confirmar se a marca vetorial recriada em `src/components/Logo.tsx` reproduz
  fielmente o ícone enviado (o PNG original é a referência; o SVG foi
  redesenhado porque o workspace do Skip não aceita upload binário).
