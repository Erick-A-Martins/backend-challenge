# Arquitetura: Distributed Wagering Processor

> Documento vivo. Seções marcadas com ⏳ descrevem decisões **planejadas** e serão confirmadas
> (ou ajustadas) quando a parte correspondente for implementada.

## 1. Visão geral

Serviço financeiro distribuído que processa transações de apostas (`BET`, `WIN`, `LOSS`, `REFUND`,
`ROLLBACK`) vindas de múltiplos provedores, via HTTP e SQS, com entrega *at-least-once*.

O sistema deve permanecer correto quando as mensagens forem duplicadas, chegarem fora de ordem ou
forem processadas simultaneamente por várias instâncias. As invariantes globais são:

- nunca duplicar crédito nem débito;
- nunca permitir saldo negativo;
- nunca perder um evento confirmado;
- `wallet.balance == saldo reconstruído pelo ledger`.

**Princípio central:** o banco de dados é o responsável final pelas invariantes. Unicidade,
não-negatividade e imutabilidade do ledger estão no schema, não apenas no código. Ordenação e
deduplicação do broker são otimizações, nunca a garantia de consistência.

## 2. Estado da implementação

| Área | Estado |
|---|---|
| Infra local (Compose, PostgreSQL, SQS FIFO + DLQ) | ✅ |
| Migrations versionadas e reversíveis | ✅ |
| `Money` | ✅ |
| `Wallet` e `WalletLedgerEntry` (domínio) | ✅ |
| `WagerTransaction` (domínio) | ✅ |
| Schema e constraints | ✅ |
| Persistência e criação de wallet com `OPENING` (atômica) | ✅ |
| HTTP de wallets (`POST /wallets`, `GET /wallets/:id`) | ✅ |
| Submissão de transações e idempotência | ⏳ |
| Concorrência (lock por wallet) | ⏳ |
| Inbox, outbox, publisher e consumer SQS | ⏳ |
| Worker de `PENDING_REFERENCE` | ⏳ |
| Ledger paginado e reconciliação | ⏳ |
| Observabilidade e `health/ready` (liveness ✅) | ⏳ |
| Testes de concorrência e de falha | ⏳ |

## 3. Stack

| Item | Escolha |
|---|---|
| Runtime, package manager e test runner | Bun |
| Linguagem | TypeScript em modo estrito |
| Framework | NestJS 12 (ESM) |
| Banco | PostgreSQL 17 |
| ORM | MikroORM 7 |
| Mensageria | AWS SQS (FIFO + DLQ) via LocalStack |
| Orquestração local | Docker Compose |

## 4. Arquitetura em camadas

Organização por módulo de negócio, com camadas DDD dentro de cada um:

```
src/
├── main.ts, app.module.ts, app.setup.ts
├── shared/
│   ├── domain/            Money, DomainError e erros base
│   ├── application/       portas: UnitOfWork, Clock, IdGenerator
│   ├── infrastructure/    implementações das portas, config do ORM
│   └── interface/http/    filtro global de exceções, helpers de parsing
├── wallet/
│   ├── domain/            Wallet, WalletLedgerEntry, portas de repositório, erros
│   ├── application/       CreateWallet, GetWallet, WalletView
│   ├── infrastructure/persistence/   records do ORM, mappers, repositórios
│   └── interface/http/    controller e parsing do request
├── wagering/
│   ├── domain/            WagerTransaction, FailureCode, portas, erros
│   └── infrastructure/persistence/
└── health/
```

Regras de dependência:

- `domain/` **nunca** importa `@nestjs/*` nem `@mikro-orm/*`.
- A dependência aponta para dentro: `interface` e `infrastructure` → `application` → `domain`.
- Portas de repositório vivem no domínio e são **classes abstratas**. Interfaces TypeScript somem
  em tempo de execução, e o Nest precisa de um valor como token de injeção. A classe abstrata é,
  ao mesmo tempo, o contrato e o token.
- Modelos de domínio têm construtor privado e factories estáticas (`create`, `open`, `rehydrate`).
  `rehydrate` reconstrói estado já persistido e **não** revalida transições.
- Relógio e geração de ids entram por portas (`Clock`, `IdGenerator`), então o domínio é
  determinístico e testável. Os ids são UUIDv7 (`Bun.randomUUIDv7()`), ordenáveis por tempo.

## 5. Decisões técnicas

### 5.1 ORM e estratégia transacional

**MikroORM 7**, pelos recursos que o desafio exige: `em.transactional()`, `LockMode` para
pessimistic locking, Unit of Work explícito e migrations com `up` e `down`.

- **Entities do ORM são separadas do domínio** (`WalletRecord`, `WagerTransactionRecord`,
  `WalletLedgerEntryRecord`), com *mappers* entre os dois mundos. Isso mantém o domínio puro, sem
  decorators. Custo: mais arquivos e mapeamento explícito.
- **Escrita com `em.insert()`**, sem `persist`/`flush`. Cada repositório executa exatamente o SQL
  pretendido, sem identity map nem escrita implícita. Combina com um ledger que só recebe
  inserções.
- **`UnitOfWork` é uma porta** (`run(work)`), implementada com `em.transactional()`. Os
  repositórios que usam o mesmo `EntityManager` participam da transação automaticamente, porque o
  MikroORM propaga o contexto transacional. Isso é **provado por teste de integração**: uma falha
  ao gravar o ledger desfaz a wallet e a transação `OPENING`.
- **Decorators**: `@mikro-orm/decorators/legacy` com `ReflectMetadataProvider`, que é o formato
  que o NestJS usa. Os tipos das colunas são declarados explicitamente nas entities, sem depender
  da inferência de metadados.
- **Migrations escritas à mão em SQL** (`migration:create --blank`). Constraints, índices
  parciais e triggers não saem de um diff automático. O snapshot do MikroORM está desligado
  (`snapshot: false`) para não gerar diffs enganosos.
- Violação do `UNIQUE (player_id, currency)` é traduzida, dentro do repositório, para
  `WalletAlreadyExistsError`. O caso de uso não conhece exceções do ORM.

### 5.2 Money

- Representação interna: **`bigint` em centavos**, sem biblioteca. A escala é fixa em 2 casas,
  então a aritmética de inteiros é exata e sem arredondamento. (O esqueleto do README sugere
  `Decimal`; a assinatura pública foi preservada.)
- Entrada como **string decimal validada por regex** (`^\d{1,15}(\.\d{1,2})?$`), nunca convertida
  para `number`. Rejeita `NaN`, `Infinity`, notação científica, string vazia, sinal, espaços e
  mais de 2 casas decimais.
- **Limite de 15 dígitos inteiros na entrada.** A coluna é `numeric(19,2)` (17 dígitos inteiros), e
  o limite deixa folga para somas sem estourar o banco. Sem ele, um valor enorme viraria erro 500.
- **Normalização**: `"25"` e `"25.5"` são aceitos e normalizados para `"25.00"` e `"25.50"`.
- Construtor privado, imutável. Toda operação devolve nova instância. Moedas diferentes lançam
  `CurrencyMismatchError`; `equals` entre moedas diferentes devolve `false`.
- Valores **negativos só existem como resultado de cálculo** (`subtract`, `negate`), nunca como
  entrada. É assim que a `Wallet` detecta saldo insuficiente.
- Persistência: `numeric(19,2)` + coluna `currency` (`varchar(3)`), reidratado como `Money`. No
  ORM, o campo é `string`, e o driver devolve `numeric` como string, então o valor nunca passa por
  `number`.

### 5.3 Wallet e WalletLedgerEntry

- `debit` e `credit` **devolvem o lançamento do ledger**. Saldo e ledger nascem da mesma
  operação, então um não existe sem o outro.
- **Valida antes de mutar**: o lançamento é criado (e a aritmética validada) antes de alterar o
  saldo. Se algo falhar, a wallet permanece intacta.
- `version` começa em 1 e **só incrementa quando o saldo muda**.
- Saldo insuficiente é um erro de domínio genérico (`InsufficientFundsError`). A camada de
  aplicação decide o `failureCode` olhando o tipo da transação (aposta sem saldo versus reversão
  que ficaria negativa).
- `WalletLedgerEntry` é imutável por estrutura (campos `readonly`, sem métodos de transição).
  `create` valida `balanceBefore ± amount == balanceAfter`, valor positivo e saldo final não
  negativo.
- **Criação da wallet**: `Wallet.open` recebe o saldo inicial (versão 1). Quando o saldo inicial é
  maior que zero, o caso de uso cria a transação `OPENING` (já `PROCESSED`) e o lançamento
  `CREDIT` com `balanceBefore = 0`, **na mesma transação SQL**. Ordem de inserção: wallet,
  transação, ledger (por causa das chaves estrangeiras).

### 5.4 WagerTransaction

- `create` **rejeita `OPENING`**: é interno e não pode vir pela API nem pela fila. A factory
  `createOpening` existe só para uso interno.
- Convenção do `OPENING`, compatível com as colunas `NOT NULL`: `providerId = 'system'`,
  `externalTransactionId = <walletId>`, `idempotencyKey = 'system:opening:<walletId>'`.
- Valores: positivos para todos os tipos, exceto `LOSS`, que aceita `0.00`.
- `REFUND` e `ROLLBACK` exigem `referenceExternalTransactionId`. `BET` não pode ter referência.
- `checkReference` concentra as regras de referência e **devolve** o `FailureCode` (ou
  `undefined`), sem lançar exceção, porque é caminho de negócio, não erro de programação.
- Transições a partir de estado terminal lançam `InvalidTransactionStateError` (erro de
  programação).
- `markPendingReference(nextAttemptAt)` conta a tentativa e agenda a próxima. A política (limite e
  backoff) fica na camada de aplicação.

### 5.5 Idempotência ⏳

Já decidido no schema:

- `UNIQUE (provider_id, idempotency_key)`: a persistência é a fonte da verdade (nada em memória).
- `UNIQUE (provider_id, external_transaction_id)`: a mesma transação externa não duplica, mesmo
  com chaves diferentes.
- A chave é escopada por provedor, então provedores diferentes não colidem.

Planejado para o passo de submissão: header `Idempotency-Key` obrigatório; `payloadHash` =
SHA-256 do JSON canônico (chaves ordenadas) apenas dos campos de negócio (`providerId`,
`externalTransactionId`, `playerId`, `walletId`, `roundId`, `gameId`, `kind`, `money`,
`referenceExternalTransactionId`); o header e metadados de transporte ficam fora do hash. Repetição
idêntica devolve o resultado original com `idempotentReplay: true`; mesma chave com payload
diferente é conflito (409 `IDEMPOTENCY_CONFLICT`).

### 5.6 Concorrência ⏳

A unidade de concorrência é a `walletId`. Direção planejada: **lock pessimista por linha**
(`SELECT ... FOR UPDATE` na wallet, dentro da transação), sem lock global. Wallets diferentes
processam em paralelo; operações na mesma wallet se serializam. A justificativa completa
(comparação com optimistic locking sob *hot wallet*) será registrada ao implementar.

### 5.7 Inbox e Outbox ⏳

Direção planejada: inbox, alteração financeira, ledger e outbox na **mesma transação SQL**;
publisher com `FOR UPDATE SKIP LOCKED` para suportar vários publishers concorrentes; `ack` do SQS
somente após o commit. Ponto em aberto: decidir se a abertura da wallet (`OPENING`) emite
`WalletBalanceChanged`, já que o saldo muda de 0 para o valor inicial.

### 5.8 Autenticação

**Decisão: não implementar autenticação**, conforme permitido pelo desafio (não vale pontos e não
deve competir com correção, concorrência e idempotência).

Desenho que seria adotado: integrar um Identity Provider externo (por exemplo Keycloak ou Zitadel)
via OIDC; um `AuthGuard` validaria o JWT (assinatura via JWKS, `iss`, `aud`, expiração) e
extrairia a identidade do provedor, que seria comparada com o `providerId` do payload
(`ProviderIdentityPort`). Os endpoints de health ficam abertos, e as mensagens da fila são
tratadas como canal interno confiável, mas a identidade do provedor contida na mensagem continua
sujeita às validações de domínio.

Ponto de extensão no código: um `AuthGuard` no-op documentado (a criar junto da camada de
submissão).

## 6. Modelo de dados

Três tabelas na migration `create_core_schema`: `wallets`, `wager_transactions` e
`wallet_ledger_entries`. Inbox e outbox terão migration própria.

| Garantia | Mecanismo no banco |
|---|---|
| Uma wallet por jogador e moeda | `UNIQUE (player_id, currency)` |
| Saldo nunca negativo | `CHECK (balance >= 0)` |
| Idempotência persistente | `UNIQUE (provider_id, idempotency_key)` |
| Transação externa nunca duplicada | `UNIQUE (provider_id, external_transaction_id)` |
| Uma referência não é revertida 2× pelo mesmo tipo | índice único **parcial** `(reference_transaction_id, kind)` onde `status = 'PROCESSED'` e `kind in ('REFUND','ROLLBACK')` |
| Aritmética do ledger | `CHECK (balance_after = balance_before ± amount)` conforme a direção |
| Ledger imutável | **trigger** que bloqueia `UPDATE` e `DELETE` |
| Moeda do lançamento e da transação igual à da wallet | FK composta `(wallet_id, currency)` → `wallets(id, currency)` |
| Um lançamento por transação em cada wallet | `UNIQUE (wallet_id, transaction_id)` |
| `failure_code` só em `REJECTED` e `FAILED` | `CHECK ((status in ('REJECTED','FAILED')) = (failure_code is not null))` |
| `processed_at` só em `PROCESSED` | `CHECK ((status = 'PROCESSED') = (processed_at is not null))` |
| `REFUND` e `ROLLBACK` exigem referência | `CHECK` sobre `kind` e `reference_external_transaction_id` |
| Valores e estados válidos | `CHECK` de `kind`, `status`, `direction`, formato de moeda e valores |

Outros pontos:

- Ids são `uuid`; tempos são `timestamptz`; dinheiro é `numeric(19,2)` com a moeda em coluna própria.
- `wager_transactions` tem `reference_attempts` e `next_attempt_at` para o worker de
  `PENDING_REFERENCE` (backoff e limite persistidos). O índice parcial
  `(next_attempt_at) WHERE status = 'PENDING_REFERENCE'` serve a esse worker.
- O índice `(wallet_id, created_at desc, id desc)` no ledger sustenta a paginação por cursor.
- A convenção do `OPENING` (`system` + `walletId`) está descrita em 5.4.
- **`TRUNCATE` não é bloqueado** de propósito, para facilitar a limpeza entre testes de
  integração. Em produção, essa permissão seria negada ao usuário da aplicação.
- Saldo materializado × ledger **não** é garantido por constraint (exigiria uma constraint trigger
  diferida, pesada e frágil). Quem cobre isso é a atomicidade da transação e o endpoint de
  reconciliação.

## 7. Máquina de estados da WagerTransaction

| De | Para | Quando |
|---|---|---|
| `PENDING` | `PROCESSED` | aplicada com sucesso (ou `LOSS` registrada) |
| `PENDING` | `PENDING_REFERENCE` | referência ainda não existe |
| `PENDING` | `REJECTED` | violação de regra de negócio |
| `PENDING` | `FAILED` | erro permanente de infraestrutura |
| `PENDING_REFERENCE` | `PENDING_REFERENCE` | nova tentativa sem sucesso (`attempts + 1`) |
| `PENDING_REFERENCE` | `PROCESSED`, `REJECTED` ou `FAILED` | referência chegou, regra violada ou limite esgotado |
| `PROCESSED`, `REJECTED`, `FAILED` | (nenhum) | estados terminais; tentar mudar é erro de programação |

## 8. Taxonomia de `failureCode`

| Código | Status | Significado | Ação do provedor |
|---|---|---|---|
| `INSUFFICIENT_FUNDS` | `REJECTED` | aposta sem saldo | não reenviar (ou reenviar após depósito) |
| `REVERSAL_WOULD_OVERDRAW` | `REJECTED` | reversão deixaria o saldo negativo | tratar manualmente (problema operacional, distinto de aposta sem saldo) |
| `REFERENCE_NOT_FOUND` | `REJECTED` | a referência nunca chegou (limite esgotado) | corrigir o id, ou reenviar a referência e depois a reversão |
| `REFERENCE_NOT_PROCESSED` | `REJECTED` | a referência foi rejeitada ou falhou | não reenviar |
| `REFERENCE_MISMATCH` | `REJECTED` | provider, player, wallet, rodada ou moeda diferentes | corrigir o payload |
| `INVALID_REFERENCE_KIND` | `REJECTED` | tipo de referência não permitido | corrigir o payload |
| `AMOUNT_MISMATCH` | `REJECTED` | valor diferente do da referência | corrigir o payload |
| `ALREADY_REVERSED` | `REJECTED` | referência já revertida por este tipo | desistir (já foi feito) |
| `WALLET_PLAYER_MISMATCH` | `REJECTED` | a wallet não pertence ao jogador | corrigir o payload |
| `CURRENCY_MISMATCH` | `REJECTED` | moeda diferente da moeda da wallet | corrigir o payload |
| `UNRECOVERABLE_ERROR` | `FAILED` | falha permanente de infraestrutura | contatar suporte |

## 9. API HTTP e mapeamento de status

Endpoints implementados: `POST /wallets` (201), `GET /wallets/:walletId` (200), `GET /health/live`.

Todo erro usa o mesmo formato: `{ "error": { "code": "...", "message": "..." } }`.

| Situação | HTTP | `error.code` | Estado |
|---|---|---|---|
| Payload ou parâmetro inválido | 400 | `INVALID_REQUEST`, `INVALID_MONEY` | ✅ |
| Recurso inexistente | 404 | `WALLET_NOT_FOUND`, `NOT_FOUND` | ✅ |
| Conflito de recurso | 409 | `WALLET_ALREADY_EXISTS` | ✅ |
| Conflito de idempotência | 409 | `IDEMPOTENCY_CONFLICT` | ⏳ |
| Rejeição por regra de negócio | 422 | `failureCode` no corpo da transação | ⏳ |
| Aceito, processamento pendente | 202 | status `PENDING_REFERENCE` | ⏳ |
| Falha transitória de infraestrutura | 503 | `SERVICE_UNAVAILABLE` + `Retry-After` | ⏳ |
| Erro inesperado | 500 | `INTERNAL_ERROR` | ✅ |

O 409 tem dois sentidos (wallet duplicada e conflito de idempotência), então o provedor decide
pelo `code`, nunca pela mensagem.

Decisões da camada HTTP:

- **Validação manual do corpo**, sem `class-validator`. São poucos campos, e a validade do dinheiro
  é responsabilidade única do `Money`, então não há regras duplicadas nem dependência extra.
- **UUIDs validados na borda** (body e parâmetros de rota). Um valor malformado chegaria ao
  PostgreSQL como erro de tipo e viraria 500. O `playerId` é normalizado para minúsculas.
- **Filtro global de exceções com tabela explícita** de erros de domínio. Um erro de domínio
  **não mapeado vira 500 e é logado**, em vez de ser classificado errado em silêncio. A resposta
  nunca expõe detalhes internos.
- Erros do próprio Nest (rota inexistente, JSON malformado, id inválido) passam pelo mesmo filtro e
  saem no mesmo formato.

## 10. Interpretações das regras de negócio

O desafio pede que interpretações adicionais sejam documentadas:

- `"25"` e `"25.5"` são aceitos e normalizados para duas casas (o desafio só proíbe mais de 2).
- `LOSS` aceita valor `0.00`; os demais tipos exigem valor positivo (o ledger não aceita
  lançamento zerado).
- `WIN` referenciando uma `BET` **não** compara valores (o prêmio pode ser diferente da aposta). A
  igualdade de valor só vale para `REFUND` e `ROLLBACK`.
- `ROLLBACK` produz o lançamento **inverso** da referência: desfazer `BET` ou `REFUND` credita ou
  debita conforme o caso, e desfazer `WIN` debita.
- Referência ainda `PENDING` ou `PENDING_REFERENCE` significa **esperar**; referência terminal não
  processada (`REJECTED` ou `FAILED`) gera `REFERENCE_NOT_PROCESSED`.
- Saldo inicial zero cria apenas a wallet, sem transação `OPENING` nem lançamento.
- Ledger de partidas dobradas não foi implementado (diferencial opcional).

## 11. Estratégia de testes

- **Unitários** (`bun run test:unit`): `Money`, `Wallet`, `WalletLedgerEntry` e `WagerTransaction`,
  sem I/O.
- **Integração** (`bun run test:integration`): PostgreSQL **real**, no banco `wallet_test` (criado
  uma vez, separado do de desenvolvimento). As migrations rodam via `orm.migrator.up()` e a limpeza
  entre testes usa `TRUNCATE`.
  - Trava de segurança: o helper se recusa a rodar em banco cujo nome não termine em `_test`.
  - Teste de **atomicidade**: uma falha ao gravar o ledger desfaz wallet e `OPENING`.
  - Testes HTTP sobem a aplicação real (Nest + HTTP + banco de teste) numa porta aleatória e
    chamam os endpoints com `fetch`. Montamos um módulo de teste em vez de importar o `AppModule`
    para não gravar no banco de desenvolvimento por acidente.
- Consultas com valores usam **parâmetros** (`?`), nunca interpolação. O SQL cru devolve datas como
  string; datas lidas via entity chegam como `Date` (coberto por teste de repositório).
- ⏳ Concorrência, falhas e multi-instância: previstos para depois da submissão de transações.
- Invariante final dos testes financeiros: `wallet.balance == saldo reconstruído pelo ledger`.

## 12. Infraestrutura local

- **PostgreSQL 17** com *healthcheck*.
- **LocalStack com SQS**, na versão **4.14 fixada**: as versões mais recentes da imagem exigem
  conta e token de autenticação. A 4.14 sobe sem token (verificado no ambiente de
  desenvolvimento). Alternativa aceita pelo desafio: MiniStack.
- Filas criadas por script de inicialização (`infra/localstack/init/01-queues.sh`), executado quando
  o LocalStack fica pronto:
  - `wager-transactions.fifo`, com `VisibilityTimeout` de 30 s e `RedrivePolicy` com
    `maxReceiveCount = 5`;
  - `wager-transactions-dlq.fifo`, como destino das mensagens que esgotam as tentativas.
- O limite de 5 tentativas é decisão nossa: absorve falhas transitórias sem repetir indefinidamente
  uma mensagem que não será processada.
- Scripts `.sh` devem ter final de linha **LF** (`.gitattributes` força `*.sh text eol=lf`), senão
  falham dentro do container Linux.
- O endpoint do SQS no `.env` usa `http://localhost:4566`, sem depender de DNS externo.

## 13. Trade-offs

- **Records do ORM separados do domínio**: mais arquivos e mapeamento explícito, em troca de domínio
  puro e testável sem banco.
- **`bigint` em centavos**: simples e exato, mas assume escala fixa de 2 casas. Moedas com outra
  escala (JPY, KWD) exigiriam parametrizar o fator por moeda.
- **`em.insert` em vez de `persist`/`flush`**: SQL previsível e sem efeitos implícitos, mas sem os
  benefícios do identity map para escritas.
- **Validação manual do corpo**: poucas dependências e regras sem duplicação, mas é um parser
  escrito à mão que precisa de testes (cobertos pelos testes HTTP).
- **Migrations em SQL manual**: controle total de constraints, triggers e índices parciais, mas
  sem diff automático.
- **Ledger imutável por trigger**: a proteção vale para qualquer cliente do banco, ao custo de um
  trigger por linha em cada inserção/alteração negada.

## 14. Limitações conhecidas

- `Money.from` aplica o limite de 15 dígitos também na reidratação. Um saldo acima disso (na
  prática inalcançável) não seria lido.
- Somas sucessivas podem, teoricamente, ultrapassar `numeric(19,2)`. O limite de entrada dá folga
  grande, mas não elimina o caso.
- Saldo × ledger não é garantido por constraint, e sim por atomicidade e reconciliação.
- `TRUNCATE` não é bloqueado no schema (necessário para testes); em produção seria negado por
  permissão.
- Leituras via `EntityManager` exigem contexto de requisição. Workers e o consumer SQS precisarão
  criá-lo explicitamente.
- Falhas transitórias de infraestrutura ainda não são mapeadas para 503 (previsto junto da
  submissão de transações).
- Sem autenticação (ver 5.8) e sem ledger de partidas dobradas.
