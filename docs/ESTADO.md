# Estado do projeto — GesTec-IA-Odonto

Registro de progresso das etapas de construção. Atualizar ao final de cada etapa.
Plano completo em `artifacts/gestec/07-plano-de-execucao-consolidado.md` e prompts em
`artifacts/gestec/08-prompts-consolidados.md`.

## Situação atual

| Campo         | Valor                                                               |
| ------------- | ------------------------------------------------------------------- |
| Etapa atual   | Fase 1 concluída + auditoria de qualidade                           |
| Status        | 15 etapas completas · fluxo operacional 11/11 · avisos operacionais |
| Próxima etapa | Fase 2 (TISS, NGS2, CRUDs faltantes)                                |
| Stack         | React + Vite + Skip Cloud (PocketBase v0.36 / SQLite)               |
| Versão        | 0.0.114                                                             |

## Etapas

| #   | Etapa                   | Status    | Observação                                                                                  |
| --- | ----------------------- | --------- | ------------------------------------------------------------------------------------------- |
| 1   | Fundação                | concluída | Cliente PocketBase, layout, página inicial, marca vetorial e este registro                  |
| 2   | Identidade e isolamento | concluída | `tenant` + `users` com `papel`/`tenant_id` travados; 2 tenants demo                         |
| 3   | Núcleo organizacional   | concluída | unidade, sala, profissional, especialidade (25 CFO), módulos, tenant_modulo                 |
| 4   | Acesso e auditoria      | concluída | login, guarda de rota por papel, `auditoria_acesso` imutável, gestão de usuários            |
| 5   | Pacientes               | concluída | cadastro, alertas clínicos com faixa de destaque, responsável legal, anamnese versionada    |
| 6   | Agenda                  | concluída | `agenda_slot` com UNIQUE por profissional e por sala; 4 critérios provados                  |
| 7   | Prontuário              | concluída | evolução com cadeia de hash, odontograma por snapshot, sigilo e acesso temporário           |
| 8   | Catálogo e preços       | concluída | 4 coleções, preço resolvido por item, importação CSV validada antes de gravar               |
| 9   | Orçamento e execução    | concluída | plano versionado, passivo clínico, cancelamento com crédito/estorno                         |
| 10  | Financeiro do paciente  | concluída | contas a receber, baixa multi-forma, lote de vencimento, exportação contábil                |
| 11  | Financeiro gerencial    | concluída | despesas, centro de custo, DRE por competência, fluxo por caixa, aging, régua               |
| 12  | Relatórios operacionais | concluída | painel, faltas por dia/horário/paciente, produção, PDF do prontuário auditado, CSV          |
| 13  | Comunicação e 2FA       | concluída | lembretes (confirmação 48/24h, retorno, aniversário) e segundo fator por e-mail na conta    |
| 14  | Módulos e assinatura    | concluída | catálogo, assinatura com valor congelado, guarda de escrita, menu filtrado, tela de módulos |
| 15  | Publicação e operação   | concluída | checklist 4/4 assinado, backup verificado, produção publicada                               |

## Auditoria de qualidade (21/11/2026)

Detalhes em `artifacts/gestec/12-auditoria-qualidade.md`.

**Bugs graves corrigidos:**

- Paciente nascia `ativo=false` e **não podia ser agendado** — o elo cadastro→agenda
  estava quebrado desde a Etapa 5. Corrigido em `hooks/ativo_padrao.js` (request
  hook, porque no model hook campo bool ausente já vale `false`) + backfill 0044.
- Tabela de preço particular **vencida há 6 meses**: clínica não conseguia cobrar
  particular. Corrigido na 0045, com aviso automático criado.
- Proprietário **não conseguia redefinir 2FA nem senha** de funcionário — quem
  perdia o e-mail ficava fora para sempre. Rota `redefinir-acesso-usuario` criada.
- Contas demo quebradas pelos próprios testes (senha e 2FA alterados). Reset na 0043.

**Fluxo validado 11/11:** paciente → agenda → atendido → evolução → preço → plano →
orçamento → aprovação → títulos → recebimento → título `pago`.
Script: `work/qualidade/a3_final.py`.

**Tela nova:** Avisos (`/avisos`) — tabela vencida/vencendo, procedimento sem preço,
convênio descoberto. Ela encontrou 2 procedimentos sem preço em tabela vigente.

**Cadastros de apoio (v0.0.114):** `/convenios` e `/centros-custo`. Existiam como
coleção desde as Etapas 8 e 11, mas só davam para popular por migration. Nas duas,
**desativar em vez de excluir**: convênio e centro de custo são apontados por
histórico, e apagar reescreveria a DRE. O diálogo de exclusão explica isso antes
de falhar.

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

## Etapa 8 — como o preço é resolvido

Rota `GET /backend/v1/resolver-preco?paciente_id=X[&procedimento_id=Y]`. A
resolução fica no servidor porque depende de qual tabela está vigente **hoje**,
e "hoje" não é expressável em access rule.

**O fallback é por PROCEDIMENTO, não por tabela.** Eu escrevi errado na primeira
versão: se não houvesse tabela do convênio, usava a particular; e quando havia
tabela do convênio sem aquele item, o paciente ficava **sem preço**. O caso real
é o convênio cobrir a maioria e não cobrir alguns itens (estética, selante).
Agora cada procedimento resolve o próprio preço e a resposta diz em
`itens_no_particular` quais caíram no particular.

- `paciente.convenio_id` (novo, opcional): nulo = particular. É só a chave que
  escolhe a tabela — **não** é faturamento de convênio (fora do escopo).
- Dinheiro em **centavos inteiros** (`valor_centavos`), nunca float.
- `procedimento.codigo` é **UNIQUE por tenant**; `tabela_preco_item` é
  **UNIQUE por (tabela, procedimento)**.
- Sobreposição de vigência não é expressável em índice (intervalo não cabe em
  UNIQUE). Fica na rota `POST /backend/v1/salvar-tabela-preco`, que recusa e
  explica como corrigir. Períodos que **não** se cruzam são o jeito correto de
  registrar reajuste.

### Etapa 8 — testes

| Teste                                      | Esperado                     | Resultado                                      |
| ------------------------------------------ | ---------------------------- | ---------------------------------------------- |
| 10 procedimentos com preço em duas tabelas | sim                          | ✔ 10 procs, 10 itens particular, 8 no convênio |
| Preço muda entre particular e convênio     | sim                          | ✔ 8 dos 10 mudam                               |
| Item fora do convênio cai no particular    | preço existe                 | ✔ PROF-009/010                                 |
| CSV com 1 linha inválida                   | erro por linha, nada gravado | ✔ 1 erro na linha 4, total 10 → 10             |
| Código já existente / repetido no arquivo  | recusa                       | ✔ duas linhas com problema                     |
| CSV válido sem confirmar                   | não grava                    | ✔ validou 2, banco 10 → 10                     |
| CSV válido confirmando                     | grava                        | ✔ 2 gravados, banco 12                         |
| Tabela sobrepondo vigência                 | recusada                     | ✔ 400 com instrução                            |
| Fechar anterior e abrir nova               | aceita                       | ✔ 200                                          |

## Etapa 9 — plano versionado, passivo e cancelamento

Seis coleções: `plano_tratamento`, `fase`, `item_tratamento`, `orcamento`,
`procedimento_realizado`, `credito_paciente`.

**Três decisões que mandam no resto:**

1. `item_tratamento.valor_unitario_centavos` é **snapshot**. Se o preço fosse
   resolvido na leitura, um reajuste de tabela reescreveria o orçamento que o
   paciente já aprovou. O preço entra no item quando o plano é montado.

2. **Só a versão CORRENTE conta** para realizado, pendente e passivo. A v2 copia
   os executados da v1; somar as duas contaria o mesmo trabalho duas vezes. Toda
   soma resolve a corrente descendo a cadeia de `plano_anterior_id`.

3. Alterar plano é ROTA (`/backend/v1/salvar-plano`), nunca update. Versionar
   exige copiar fases e itens e decidir qual é a corrente — update direto
   poderia editar a versão antiga.

**Regra de versionamento implementada:** v(n+1) com `plano_anterior_id`;
executados e substituídos são copiados SEMPRE (fato consumado); propostos só se
o cliente reenviar; cancelados não voltam. `substituido_por_item_id` liga antigo
→ novo. Só a versão mais recente pode gerar outra (senão nascem cadeias
paralelas e "qual é a corrente" vira sorte).

**Regra de cancelamento:** status, nunca delete. Com execução, é **obrigatório**
escolher crédito ou estorno, com motivo. O valor devolvido é o PENDENTE (cobrado
e não entregue), nunca o total — o executado foi entregue.

### Etapa 9 — testes

| Teste                             | Esperado                               | Resultado                                     |
| --------------------------------- | -------------------------------------- | --------------------------------------------- |
| Plano de 3 itens, 2 executados    | realizado 380 / pendente 900           | ✔ bruto 1.280                                 |
| Passivo = soma dos não executados | igual                                  | ✔ 900 = 900 (soma manual)                     |
| Trocar coroa por endo cria v2     | v2, executados mantidos, v1 preservada | ✔ v2 com 2 exec, v1 com 3 itens               |
| Passivo depois da v2              | não contar em dobro                    | ✔ R$ 600                                      |
| Cancelar sem crédito/estorno      | recusado                               | ✔ 400                                         |
| Cancelar sem motivo               | recusado                               | ✔ 400                                         |
| Cancelar com crédito              | registra, não apaga                    | ✔ 3 itens, 2 realizados, 1 crédito, passivo 0 |
| Item executado muda de dente      | recusado                               | ✔ 400                                         |
| Item executado muda de valor      | recusado                               | ✔ 400                                         |
| Item executado só observação      | aceito                                 | ✔ 200                                         |

## Etapa 10 — competência x liquidação

Quatro coleções: `plano_contas`, `forma_pagamento`, `titulo_receber`, `pagamento`.

**A distinção que define a etapa** (e que quase todo sistema de consultório erra):

| Campo                   | O que é                           | Base de        |
| ----------------------- | --------------------------------- | -------------- |
| `data_competencia`      | mês a que o serviço pertence      | DRE            |
| `data_liquidacao`       | dia em que o dinheiro entrou      | fluxo de caixa |
| `data_credito_prevista` | quando o dinheiro fica DISPONÍVEL | caixa real     |

Cartão tem 30 dias de prazo: sem `data_credito_prevista`, o dono da clínica olha
um "recebido" que ainda não está na conta.

**Status e valor pago são DERIVADOS**, nunca digitados:
`valor_pago = soma(recebimentos) − soma(estornos)`, e o status sai daí. É o que
impede o estado impossível clássico (título "pago" sem nenhum pagamento).

Por isso `titulo_receber` e `pagamento` têm regras de escrita **nulas**: aqui
isso é correto (ao contrário do erro da Etapa 9) porque as rotas rodam como
superuser e recalculam. Cliente gravar direto destruiria a derivação.

**Estorno é lançamento novo** (`pagamento.tipo = 'estorno'`, valor positivo,
subtraído no saldo), nunca exclusão — a trilha de quem recebeu precisa existir
inclusive quando deu errado. Estorno é exclusivo de proprietário/gestor: recepção
dá baixa, mas não desfaz sozinha.

**Reagendamento em lote** aceita data fixa OU deslocamento em dias, nunca os
dois; ignora título pago ou cancelado (mudar vencimento de algo já pago
reescreveria o histórico de atraso).

### Etapa 10 — testes

| Teste                         | Esperado                      | Resultado                               |
| ----------------------------- | ----------------------------- | --------------------------------------- |
| R$ 1.000 pago em 400 + 600    | saldo zero, sem centavo       | ✔ parcial → pago, saldo 0               |
| Cartão grava crédito previsto | +30 dias                      | ✔ 21/11 → 21/12                         |
| Reagendar 10 títulos          | 1 operação                    | ✔ 10 alterados, 0 ignorados             |
| Exportação do contador        | competência e categoria       | ✔ 3 linhas, 0 sem competência/categoria |
| Pagamento acima do saldo      | recusado                      | ✔ 400 com o valor que falta             |
| Duas formas no mesmo título   | 2 lançamentos                 | ✔ Pix 75 + Dinheiro 75                  |
| Estorno                       | lançamento novo, nada apagado | ✔ 2 → 3 pagamentos, original intacto    |
| Estorno duplo                 | recusado                      | ✔ 400                                   |
| Título pago no lote           | ignorado                      | ✔ 0 alterados, 2 ignorados              |
| Competência ≠ vencimento      | sim                           | ✔ 8 de 8 títulos                        |
| DELETE de título pela API     | recusado                      | ✔ 403                                   |

## Etapa 11 — DRE por competência, fluxo por caixa

Cinco coleções: `centro_custo`, `despesa`, `fechamento_caixa`, `retirada_socio`,
`comunicacao`.

**A regra que não pode ser violada:**

| Relatório      | Data usada                             | Pergunta que responde            |
| -------------- | -------------------------------------- | -------------------------------- |
| DRE            | `data_competencia`                     | "sobrou alguma coisa neste mês?" |
| Fluxo de caixa | `data_credito_prevista` e `vencimento` | "vou ter dinheiro no dia 20?"    |

Serviço feito em outubro entra no DRE de outubro mesmo que o paciente pague em
dezembro. No fluxo, um Pix de hoje não paga a folha do dia 5 se o cartão só
libera dia 25. **Trocar as duas faz a clínica decidir com dinheiro que não
existe.**

- `retirada_socio` é coleção separada: pró-labore e distribuição **ficam fora do
  resultado operacional**. Dentro, a clínica pareceria menos lucrativa e o dono
  decidiria preço com base num número que já descontou o próprio salário.
- `fechamento_caixa.valor_sistema_centavos` é **calculado dos pagamentos, nunca
  digitado**. Se fosse digitável, a diferença sairia zero e o fechamento
  perderia a função de revelar quebra de caixa. `responsavel` é obrigatório.
- Margem de contribuição separa **custo direto** (material, laboratório, repasse)
  de **despesa fixa** (aluguel, folha). Se a margem é positiva e o resultado é
  negativo, o problema é estrutura, não preço.
- Aging: cada título em UMA faixa (30/60/90/120+), nunca em duas.

### Etapa 11 — testes

| Teste                                    | Esperado                | Resultado                          |
| ---------------------------------------- | ----------------------- | ---------------------------------- |
| DRE fecha com títulos por competência    | igual                   | ✔ R$ 1.150,00 = R$ 1.150,00        |
| Degraus somam algebricamente             | sim                     | ✔ receita→liquida→margem→resultado |
| Cartão entra na data de crédito previsto | 19/12, não 19/11        | ✔ R$ 120 em 19/12                  |
| Aging sem sobreposição de faixas         | sim                     | ✔ soma das faixas = total          |
| Aging classifica por dias de atraso      | correto                 | ✔ 20d→1-30, 45d→31-60, 95d→91-120  |
| Fechamento com diferença                 | registra e assina       | ✔ −R$ 5,00, situação "falta"       |
| Responsável é o usuário logado           | sim                     | ✔ gravado no banco                 |
| Exportação de despesas                   | categoria e competência | ✔ 10 linhas, 0 em branco           |

## Pendências

- Definir e-mails reais e senha inicial dos usuários do cliente piloto.
- Confirmar se a marca vetorial recriada em `src/components/Logo.tsx` reproduz
  fielmente o ícone enviado (o PNG original é a referência; o SVG foi
  redesenhado porque o workspace do Skip não aceita upload binário).
- SMTP do projeto não configurado: o convite cria a conta, mas o e-mail de
  definição de senha não sai. Hoje o caminho é o proprietário combinar a senha.

=======
