# Estado do projeto — GesTec-IA-Odonto

Registro de progresso das etapas de construção. Atualizar ao final de cada etapa.
Plano completo em `artifacts/gestec/07-plano-de-execucao-consolidado.md` e prompts em
`artifacts/gestec/08-prompts-consolidados.md`.

## Situação atual

| Campo         | Valor                                                           |
| ------------- | --------------------------------------------------------------- |
| Etapa atual   | 7 — Prontuário                                                  |
| Status        | concluída (build verde + 4 critérios testados na API e na tela) |
| Próxima etapa | 8 — Catálogo e preços                                           |
| Stack         | React + Vite + Skip Cloud (PocketBase v0.36 / SQLite)           |
| Versão        | 0.0.45                                                          |

## Etapas

| #   | Etapa                   | Status    | Observação                                                                               |
| --- | ----------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 1   | Fundação                | concluída | Cliente PocketBase, layout, página inicial, marca vetorial e este registro               |
| 2   | Identidade e isolamento | concluída | `tenant` + `users` com `papel`/`tenant_id` travados; 2 tenants demo                      |
| 3   | Núcleo organizacional   | concluída | unidade, sala, profissional, especialidade (25 CFO), módulos, tenant_modulo              |
| 4   | Acesso e auditoria      | concluída | login, guarda de rota por papel, `auditoria_acesso` imutável, gestão de usuários         |
| 5   | Pacientes               | concluída | cadastro, alertas clínicos com faixa de destaque, responsável legal, anamnese versionada |
| 6   | Agenda                  | concluída | `agenda_slot` com UNIQUE por profissional e por sala; 4 critérios provados               |
| 7   | Prontuário              | concluída | evolução com cadeia de hash, odontograma por snapshot, sigilo e acesso temporário        |
| 8   | Catálogo e preços       | pendente  | procedimentos, convênio, tabela de preço                                                 |
| 9   | Orçamento e execução    | pendente  | plano versionado, passivo clínico, crédito/estorno                                       |
| 10  | Financeiro do paciente  | pendente  | competência × liquidação, baixa parcial, lote, contador                                  |
| 11  | Financeiro gerencial    | pendente  | despesas, DRE, fluxo 90 dias, aging                                                      |
| 12  | Relatórios operacionais | pendente  | painel, faltas, produção                                                                 |
| 13  | Comunicação             | pendente  | lembretes de consulta, retorno e aniversário                                             |
| 14  | Módulos e assinatura    | pendente  | catálogo de módulos, assinatura por CNPJ                                                 |
| 15  | Publicação e operação   | pendente  | produção, segredos, backup testado, checklist                                            |

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
| `auditoria_acesso`           | por tenant  | create do próprio tenant; leitura só proprietário/gestor; **update e delete nulos**                                              |
| `paciente`                   | por tenant  | todos os papéis leem; recepção e dentista cadastram; delete só proprietário                                                      |
| `responsavel_legal`          | por tenant  | idem paciente                                                                                                                    |
| `alerta_clinico`             | por tenant  | **todos leem** (segurança); escrita só clínico; delete proprietário/gestor                                                       |
| `anamnese`                   | por tenant  | só papéis clínicos leem/escrevem; **update e delete nulos**                                                                      |

Nenhuma regra nula fora dos catálogos globais e do `create`/`delete` de `tenant`,
que são nulos por decisão.

## Dados de demonstração

Dois tenants fictícios, marcados com `demo = true`:

| CNPJ           | Nome                  | Usuários                                                                                                                                   |
| -------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 11222333000181 | Clinica Demo Alfa     | alfa.proprietario@demo.gestec.local (proprietario), alfa.dentista@demo.gestec.local (dentista), alfa.recepcao@demo.gestec.local (recepcao) |
| 44555666000172 | Consultorio Demo Beta | beta.proprietario@demo.gestec.local (proprietario)                                                                                         |

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

## Etapa 4 — como o acesso é controlado

Três camadas, e a ordem importa:

1. **Regra da coleção (servidor)** — a barreira real. Toda coleção filtra por
   `tenant_id` e por `papel`. É o que vale mesmo se alguém chamar a API direto.
2. **Rota protegida (cliente)** — `src/components/RotaProtegida.tsx`. Redireciona
   se não logado, força troca de senha no primeiro acesso e mostra a tela de
   bloqueio por papel. É conveniência, não segurança.
3. **Rotas administrativas (hooks)** — `/backend/v1/convidar-usuario`,
   `/backend/v1/trocar-papel`, `/backend/v1/definir-ativo`. Existem porque a
   coleção `users` só permite cada um editar o próprio cadastro (é isso que
   impede autopromoção), então atos sobre OUTRAS pessoas passam por aqui, com
   verificação de papel, de tenant e registro na auditoria.

### Duas falhas de segurança encontradas e fechadas

1. **Token sobrevivia à desativação.** O token do PocketBase dura 5 dias e não
   é consultado no banco a cada requisição. Desativar um usuário não bastava:
   o token emitido antes continuava lendo dados clínicos e até renovando.
   Comprovado em teste (3 profissionais lidos com conta já desativada).
   Correção: a rota de ativação agora troca o `tokenKey` do usuário, o que
   invalida na hora todos os tokens emitidos, e o refresh de conta inativa é
   recusado no hook.
2. **Usuário desativado podia se reativar.** A regra de update de `users`
   permite o próprio cadastro; `ativo` não estava travado. Correção na
   migration `0008`: `ativo` também é imutável pelo próprio usuário.

## Etapa 5 — decisões de acesso

- **Alerta clínico é lido por TODOS os papéis**, inclusive recepção e
  financeiro. É exceção deliberada ao sigilo: uma alergia a dipirona é
  informação de segurança. Se a recepção não vê, ela marca a consulta e
  ninguém percebe. Segurança da pessoa vence sigilo do dado.
- **Anamnese é só para papéis clínicos.** É histórico completo; a recepção não
  tem o que fazer com ele.
- **Anamnese não tem update nem delete.** Corrigir é criar a versão seguinte.
  A versão é atribuída pelo servidor (hook `onRecordCreate`), não pelo cliente:
  duas abas abertas não podem gerar a mesma versão.
- **Autor da anamnese vem do token**, nunca do corpo do pedido. Sem isso,
  alguém registraria anamnese em nome de outro profissional e o prontuário
  passaria a mentir sobre quem atestou.
- **Responsável legal para menor de 18** é validado na aplicação (a regra da
  coleção não compara data com "hoje"). Pendência registrada: quem chamar a
  API direto ainda consegue criar menor sem responsável.

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

### Etapa 4

| Teste                                   | Esperado             | Resultado                                   |
| --------------------------------------- | -------------------- | ------------------------------------------- |
| Login grava auditoria com IP            | linha `login` com IP | ✔ (IP real do proxy)                        |
| Recepção entra                          | sim                  | ✔                                           |
| Recepção lê a auditoria                 | negado               | ✔ devolve 0 registros                       |
| Recepção abre `/prontuario` (tela)      | bloqueada            | ✔ tela "Acesso não permitido"               |
| A negativa aparece para o proprietário  | sim                  | ✔ linha `tentativa_negada` em `/prontuario` |
| Recepção grava no próprio tenant        | permitido            | ✔ 200                                       |
| Recepção grava em nome de outra clínica | negado               | ✔ 400                                       |
| Update em `auditoria_acesso`            | rejeitado            | ✔ 403                                       |
| Delete em `auditoria_acesso`            | rejeitado            | ✔ 403                                       |
| Recepção desativar alguém               | negado               | ✔ 403                                       |
| Proprietário desativa dentista          | ok                   | ✔                                           |
| Dentista desativado tenta logar         | recusado             | ✔ 400 "Conta desativada"                    |
| Token antigo do desativado lê dados     | negado               | ✔ 0 registros                               |
| Refresh do token do desativado          | negado               | ✔ 401                                       |

### Etapa 5

| Teste                                        | Esperado              | Resultado                                        |
| -------------------------------------------- | --------------------- | ------------------------------------------------ |
| Alergia crítica aparece na lista             | faixa de destaque     | ✔                                                |
| Alergia crítica aparece na ficha             | faixa em qualquer aba | ✔                                                |
| Nova anamnese cria versão 2                  | sim                   | ✔ (versão vem do servidor)                       |
| Versão 1 continua consultável                | sim                   | ✔                                                |
| Update em anamnese                           | rejeitado             | ✔ 403                                            |
| Delete em anamnese                           | rejeitado             | ✔ 403                                            |
| Recepção vê paciente                         | sim                   | ✔                                                |
| Recepção vê alerta clínico                   | sim (segurança)       | ✔                                                |
| Recepção lê anamnese                         | negado                | ✔ 0 registros                                    |
| Recepção cria alerta                         | negado                | ✔ 400                                            |
| Dentista cria alerta                         | permitido             | ✔ 200                                            |
| Beta lê paciente da Alfa                     | negado                | ✔ 404                                            |
| **Beta cria anamnese para paciente da Alfa** | negado                | **✘ vazamento → corrigido na 0.0.28, agora 400** |
| Beta cria alerta para paciente da Alfa       | negado                | ✔ 400 (após correção)                            |
| Beta cria responsável para paciente da Alfa  | negado                | ✔ 400 (após correção)                            |

## Etapa 6 — como o conflito de agenda é impedido

SQLite não tem `EXCLUDE`, então a garantia vem de **índice UNIQUE**, não de
validação de tela:

- `agenda_slot` tem `CREATE UNIQUE INDEX idx_slot_prof ON (profissional_id, inicio)`
  e `idx_slot_sala ON (sala_id, inicio)`. Um slot por bloco de 15 min, com
  **ambos** os campos na mesma linha: um único INSERT colide nos dois eixos.
- `agendamento` e `bloqueio_agenda` têm `createRule`/`updateRule` **nulos**.
  A única porta é `/backend/v1/agendar`, que grava slots e agendamento juntos.
  Sem isso, alguém criaria agendamento sem slots e o horário ficaria "livre".

Testado: 3 pedidos simultâneos no mesmo bloco → 1 aceito, 2 recusados, 1 slot
no banco. Reagendar libera o antigo e não deixa órfão (checado: 0 órfãos).

## Etapa 7 — sigilo do prontuário

Decisão central: `evolucao` e `odontograma_snapshot` guardam **`usuario_autor_id`**
(o usuário que registrou, fixado pelo token). A regra de leitura é
`usuario_autor_id = @request.auth.id`.

Motivo de denormalizar: a access rule do PocketBase **não consulta outra
coleção**, então não há como escrever "o profissional deste registro é o
vinculado a mim". Gravar o vínculo resolvido no registro torna a regra uma
comparação direta — que vale até para chamada de API fora do app.

- **Proprietário e gestor NÃO têm leitura clínica automática.** Administram a
  clínica, mas não leem prontuário de paciente que não acompanham.
- Acesso de outro profissional só por `acesso_prontuario`, temporário e com
  justificativa, concedido por quem já tem acesso (a rota confere isso).
- **A expiração é conferida na rota de leitura, a cada acesso** — não na regra
  (que não compara data). Provado: acesso com `ativo = true` e `expira_em` no
  passado recebe 403.
- Retificação cria registro novo com `referencia_evolucao_id` e motivo; o
  original fica intacto (texto e hash conferidos após a retificação).
- Cadeia de hash: cada registro guarda `hash_anterior` + `hash_registro`. Não é
  criptografia forte contra quem tem o banco: é **detecção de alteração**.

### Etapa 7 — testes

| Teste                                              | Esperado            | Resultado                                                             |
| -------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| Dentista B lê prontuário do paciente da dentista A | negado              | ✔ 403 na rota, 0 registros na coleção                                 |
| B lê a coleção `evolucao` direto                   | 0 registros         | ✔                                                                     |
| Acesso temporário ativo → B lê                     | permitido           | ✔ título "temporario"                                                 |
| Acesso com `ativo=true` mas expirado → B lê        | negado              | ✔ 403                                                                 |
| Proprietário (não responsável) lê                  | negado              | ✔ 403                                                                 |
| Retificar cria registro novo                       | sim                 | ✔ v1 e retificação convivem                                           |
| Original permanece intacto                         | texto e hash iguais | ✔                                                                     |
| Ações na auditoria                                 | as três             | ✔ ver_prontuario, editar_prontuario, revogar_acesso, tentativa_negada |

## Pendências

- Definir e-mails reais e senha inicial dos usuários do cliente piloto.
- Confirmar se a marca vetorial recriada em `src/components/Logo.tsx` reproduz
  fielmente o ícone enviado (o PNG original é a referência; o SVG foi
  redesenhado porque o workspace do Skip não aceita upload binário).
- SMTP do projeto não configurado: o convite cria a conta, mas o e-mail de
  definição de senha não sai. Hoje o caminho é o proprietário combinar a senha.

=======
