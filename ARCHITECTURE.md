# Arquitetura — Distributed Wagering Processor

## 1. Objetivo e estado

Serviço financeiro para processar operações de apostas de múltiplos provedores. A entrega de mensagens é *at least once*: duplicatas, entregas fora de ordem, falhas e concorrência fazem parte do cenário esperado.

As garantias principais são sustentadas pelo PostgreSQL: idempotência persistente, saldo não negativo, ledger append-only e atomicidade entre a operação financeira e seus registros. O SQS transporta mensagens e pode redeliver; FIFO não substitui as constraints nem a inbox.

### Estado atual

| Área | Estado atual |
|---|---|
| Bun, TypeScript estrito, NestJS, PostgreSQL e MikroORM | Implementado |
| Compose para PostgreSQL e LocalStack/SQS | Implementado |
| Migrations reversíveis para wallet, transações, ledger, outbox e inbox | Implementado |
| Money, Wallet, WalletLedgerEntry e WagerTransaction | Implementado |
| API de criação e consulta de wallet | Implementado |
| API de submissão e consulta de transações | Implementado |
| Idempotência HTTP e proteção contra replay conflitante | Implementado |
| Lock pessimista por wallet | Implementado |
| Inbox e consumer SQS | Implementado |
| Outbox transacional e publisher SQS com lease/retry | Implementado |
| Testes de integração com PostgreSQL e LocalStack | Implementado para os cenários listados na seção 8 |
| Worker de `PENDING_REFERENCE` | Pendente |
| Consulta paginada do ledger e endpoint de reconciliação | Pendente |
| Métricas e logs estruturados completos | Pendente |
| Prova de concorrência com três ou mais processos e recuperação após reinício | Pendente |

## 2. Stack e execução local

- Runtime, package manager e testes: Bun 1.x.
- Linguagem: TypeScript em modo estrito.
- Framework: NestJS.
- Banco e ORM: PostgreSQL 17 e MikroORM 7.
- Mensageria local: SQS via LocalStack 4.14.
- Migrations: SQL manual em classes MikroORM, com `up` e `down`.

Os passos de instalação, configuração, execução da API, uso dos endpoints e comandos de teste estão no `README.md`. O banco de testes é `wallet_test`; o helper de integração recusa nomes de banco que não terminem em `_test`.

## 3. Organização e dependências

O código é dividido por módulo de negócio:

```text
src/
├── shared/       Money, erros comuns, hashing, relógio, IDs, UoW e HTTP compartilhado
├── wallet/       domínio, aplicação, persistência e API de wallets
├── wagering/     domínio, aplicação, persistência e API de transações
├── outbox/       evento persistido e repositório de publicação
├── messaging/    inbox, gateway SQS, consumer, publisher e runner
└── health/       endpoints de liveness e readiness
```

O domínio não importa NestJS nem MikroORM. Repositórios são portas abstratas; as implementações MikroORM e SQS ficam na infraestrutura. Casos de uso dependem das portas e recebem `Clock`, `IdGenerator`, `Hasher` e `UnitOfWork` por injeção.

## 4. Dinheiro, wallet e ledger

### Money

- Entrada e saída são strings decimais; a aritmética interna usa `bigint` em centavos.
- A escala aceita é fixa em duas casas, sem conversão monetária por `number`.
- `Money` é imutável e valida formato, escala e moeda.
- O valor no banco é `numeric(19,2)`; moeda fica em coluna separada.

### Wallet

- Uma wallet por `(player_id, currency)`, imposto por constraint.
- Saldo não negativo, imposto por `CHECK` no PostgreSQL e regra de domínio.
- Operações que alteram saldo usam `SELECT ... FOR UPDATE` na wallet.
- `version` começa em 1 e só aumenta quando o saldo muda.
- O saldo inicial positivo cria `OPENING` e crédito no ledger na mesma transação da wallet.

### Ledger

- `WalletLedgerEntry` é imutável no domínio e append-only no banco, protegido por trigger contra `UPDATE` e `DELETE`.
- Cada lançamento confere `balance_before ± amount = balance_after`.
- Constraint composta exige que a moeda do lançamento seja a da wallet.
- Há no máximo um lançamento por `(wallet_id, transaction_id)`.
- O índice para cursor estável já existe; o endpoint de paginação ainda não está implementado.

## 5. Transações, idempotência e concorrência

### Regras implementadas

- `BET`: debita e rejeita saldo insuficiente.
- `WIN`: credita.
- `LOSS`: registra a transação sem alterar saldo nem criar lançamento.
- `REFUND`: credita uma `BET` processada, respeitando valor e referência.
- `ROLLBACK`: aplica o movimento inverso da referência processada; saldo negativo é rejeitado com código específico.
- `REFUND` e `ROLLBACK` sem referência são inválidos.
- `OPENING` é reservado à criação da wallet.
- As transições terminais e os códigos de falha ficam no domínio.

### Idempotência

- SHA-256 do JSON canônico dos campos de negócio.
- `UNIQUE (provider_id, idempotency_key)` e `UNIQUE (provider_id, external_transaction_id)` no banco.
- Replay idêntico devolve a resposta e o saldo observado na operação original.
- Mesma chave com payload diferente é conflito, não replay.

### Concorrência

O lock da linha da wallet serializa operações da mesma wallet e deixa wallets distintas progredirem em paralelo. É uma garantia no banco, não um lock local da instância. Os testes exercitam disputas de saldo, hot wallet, wallets distintas e 50 submissões idênticas em paralelo; ainda falta executar o cenário com três ou mais processos/instâncias independentes.

## 6. Inbox, consumer e outbox

### Consumer e inbox

A fila `wager-transactions.fifo` recebe o envelope `WagerTransactionRequested`. O consumer valida a mensagem, gera hash canônico e processa com o mesmo caso de uso da API.

Na mesma transação PostgreSQL são gravados inbox, transação, wallet, ledger e outbox. A inbox usa chave `(consumer_name, message_id)`. O ACK é feito depois do commit; redelivery da mesma mensagem não repete o efeito financeiro.

- Rejeições de negócio persistidas são terminais para a mensagem e recebem ACK.
- Erros permanentes são enviados à DLQ.
- Erros transitórios alteram a visibilidade para retry; a fila de entrada tem redrive configurado para cinco recebimentos.
- No encerramento, o runner interrompe polling e devolve a visibilidade das mensagens recebidas que ainda não começaram a ser processadas.

### Outbox e publisher

Os eventos são persistidos junto com a operação financeira. Os tipos emitidos incluem `WagerTransactionProcessed`, `WagerTransactionRejected`, `WagerTransactionPendingReference` e `WalletBalanceChanged` quando o saldo muda.

O publisher reivindica linhas com lease e `FOR UPDATE SKIP LOCKED`, envia à fila `wager-events.fifo`, e confirma a outbox depois da resposta do SQS. Falhas agendam retry com backoff; leases expirados podem ser retomados por outra instância. Uma queda entre o envio e a confirmação pode gerar publicação duplicada, tratada pelo consumidor downstream por idempotência.

A fila de saída é distinta da fila de solicitações. A fila de eventos ainda não possui uma DLQ configurada no Compose; falhas do publisher são retentadas pela própria outbox.

## 7. HTTP e health checks

### Endpoints implementados

| Método | Rota | Uso |
|---|---|---|
| `POST` | `/wallets` | Cria wallet e `OPENING` quando aplicável |
| `GET` | `/wallets/:walletId` | Consulta wallet |
| `POST` | `/wagering/transactions` | Submete transação com `Idempotency-Key` |
| `GET` | `/wagering/transactions/:transactionId` | Consulta por ID interno |
| `GET` | `/providers/:providerId/wagering/transactions/:externalTransactionId` | Consulta por ID externo |
| `GET` | `/health/live` | Confirma que o processo responde |
| `GET` | `/health/ready` | Verifica PostgreSQL e filas configuradas no SQS |

A readiness responde `200` quando as dependências estão disponíveis e `503` quando alguma checagem falha. A liveness não depende da saúde do banco ou do SQS.

Ainda não existem `GET /wallets/:walletId/ledger` nem `POST /wallets/:walletId/reconciliation`.

## 8. Testes existentes e cobertura pendente

### Implementados

- Unitários: Money, Wallet, ledger, WagerTransaction, eventos, inbox, parser de mensagem, retry e classificação de erros.
- Integração PostgreSQL: migrations, constraints, transações, idempotência, atomicidade e HTTP.
- Integração PostgreSQL + LocalStack: consumer, redelivery, ACK após commit, DLQ, retry, shutdown, outbox e leases.
- Concorrência em PostgreSQL: mesma wallet, apostas disputando saldo, wallets distintas e flooding idempotente.

### Pendentes frente ao challenge

- Três ou mais processos/instâncias concorrentes.
- Reinício completo do serviço com verificação de consistência.
- `REFUND`/`ROLLBACK` chegando antes da referência e reprocessamento pelo worker.
- Worker de `PENDING_REFERENCE`, incluindo limite de tentativas e rejeição final.
- Métricas e logs estruturados exigidos pelo challenge.
- Testes dos endpoints de health.

## 9. Decisões, trade-offs e limitações conhecidas

- `bigint` em centavos evita erro de ponto flutuante e assume escala de duas casas.
- Entities ORM separadas do domínio aumentam mapeamento, mantendo domínio independente.
- Escritas usam `em.insert`/operações SQL explícitas para tornar persistência previsível.
- O ledger é protegido por trigger; a igualdade global saldo/ledger depende da atomicidade e de reconciliação, ainda sem endpoint.
- A migration atual permite apenas uma reversão processada por transação referenciada, considerando `REFUND` e `ROLLBACK` juntos. Isso é mais restritivo que a regra do challenge, que fala em não repetir o mesmo tipo de reversão; confirmar a interpretação antes da entrega.
- Autenticação não foi implementada, como permitido pelo challenge. O desenho adotado é integrar um Identity Provider externo por OIDC; o guard/ponto de extensão ainda precisa ser explicitado no código.
- Logging existe, mas ainda não é JSON estruturado com todos os IDs exigidos. Métricas de negócio e infraestrutura ainda não foram adicionadas.

## 10. Próximos passos

1. Implementar worker de `PENDING_REFERENCE` e cobrir referências fora de ordem.
2. Implementar consulta paginada do ledger e reconciliação.
3. Completar testes multi-instância, reinício e health.
4. Adicionar métricas e logs estruturados.
5. Atualizar/validar a política de reversões frente ao requisito.
6. Completar a extensão de autenticação e manter o README alinhado ao uso real.
