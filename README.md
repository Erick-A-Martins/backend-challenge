# BackEnd Challenge

Desafio proposto pela Jungle Gaming

## Requisitos locais

- Bun 1.x
- Docker Desktop com Docker Compose
- Portas `5432` (PostgreSQL), `4566` (LocalStack) e `3000` disponíveis

## Instalação e execução

No PowerShell, na raiz do projeto:

```powershell
Copy-Item .env.example .env
bun install
docker compose up -d
```

O Compose inicia PostgreSQL e LocalStack. O script do LocalStack cria as filas SQS usadas pela aplicação. O banco `wallet_test` é necessário para os testes de integração; crie-o uma vez:

```powershell
docker compose exec postgres createdb -U wallet wallet_test
```

Se ele já existir, não execute esse comando novamente.

Aplique as migrations no banco de desenvolvimento e inicie a API:

```powershell
bun run migration:up
bun run start
```

A aplicação fica disponível em `http://localhost:3000`. Com `WORKERS_ENABLED=true` (valor do `.env.example`), o processo também inicia o consumer da fila `wager-transactions.fifo` e o publisher da outbox para `wager-events.fifo`.

Para parar os serviços locais:

```powershell
docker compose down
```

Os dados do PostgreSQL ficam no volume `pgdata`; `docker compose down` preserva esse volume.

## Configuração

As variáveis principais estão em `.env.example`:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL usado pela API e pelas migrations |
| `TEST_DATABASE_URL` | Banco de integração; o nome precisa terminar em `_test` |
| `AWS_ENDPOINT` | Endpoint do LocalStack; em AWS real, deixe vazio |
| `AWS_REGION` | Região do SQS |
| `SQS_QUEUE_URL` | Fila de solicitações de transação |
| `SQS_DLQ_URL` | Dead-letter queue das solicitações |
| `SQS_EVENTS_QUEUE_URL` | Fila FIFO de eventos publicados pela outbox |
| `WORKERS_ENABLED` | Ativa ou desativa os workers de mensageria |
| `REFERENCE_RETRY_BATCH_SIZE` | Máximo de referências pendentes por rodada do worker |
| `REFERENCE_RETRY_POLL_MS` | Intervalo entre rodadas do worker de referências |
| `PORT` | Porta HTTP da API |

As credenciais `test` são apenas para o LocalStack. Não use esses valores em AWS.

## API HTTP

Todos os valores monetários são strings decimais com até duas casas. O header `Idempotency-Key` é obrigatório ao enviar transações.

### Criar uma wallet

```http
POST /wallets
Content-Type: application/json
```

```json
{
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "initialBalance": { "amount": "100.00", "currency": "BRL" }
}
```

Um saldo inicial positivo cria a transação interna `OPENING` e seu lançamento de crédito no ledger, atomicamente com a wallet.

### Consultar uma wallet

```http
GET /wallets/{walletId}
```

### Enviar uma transação

```http
POST /wagering/transactions
Idempotency-Key: provider-a:bet-123
Content-Type: application/json
```

```json
{
  "providerId": "provider-a",
  "externalTransactionId": "bet-123",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "roundId": "round-987",
  "gameId": "fortune-chimp",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "BRL" }
}
```

Os tipos aceitos são `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`. A mesma chave e o mesmo payload retornam o resultado original; reutilizar a chave com outro payload é conflito.

### Consultar transações

```http
GET /wagering/transactions/{transactionId}
GET /providers/{providerId}/wagering/transactions/{externalTransactionId}
```

### Health checks

```http
GET /health/live
GET /health/ready
```

`/health/live` verifica que o processo responde. `/health/ready` verifica acesso ao PostgreSQL e às filas configuradas do SQS; retorna `503` se alguma dependência estiver indisponível.

## Mensageria

O consumer lê mensagens `WagerTransactionRequested` da fila de solicitações. Cada mensagem é validada, deduplicada pela inbox e processada pelo mesmo caso de uso da API. A mensagem só recebe ACK após o commit financeiro.

Eventos como `WagerTransactionProcessed`, `WagerTransactionRejected`, `WagerTransactionPendingReference` e `WalletBalanceChanged` são gravados na outbox junto com a transação. O publisher envia os eventos à fila `wager-events.fifo`. O SQS pode entregar ou publicar novamente; a inbox e as chaves persistentes são as garantias de idempotência.

O worker de referências busca `PENDING_REFERENCE` vencidas. Ele reavalia `REFUND` e `ROLLBACK` pelas mesmas regras do processamento normal, aguarda referências ainda pendentes e rejeita com `REFERENCE_NOT_FOUND` após oito consultas totais. O intervalo usa backoff de 5 segundos até 5 minutos.

## Testes

Suba PostgreSQL e LocalStack antes dos testes de integração. O helper aplica as migrations e recusa conexões a bancos cujo nome não termine em `_test`.

```powershell
bun run typecheck
bun run test:unit
bun run test:integration
bun run test:concurrency
```

- `test:unit`: domínio, validações, eventos e políticas sem banco/SQS.
- `test:integration`: PostgreSQL real; os cenários de messaging usam também LocalStack/SQS.
- `test:concurrency`: concorrência paralela contra PostgreSQL.

## Migrations

```powershell
bun run migration:up
bun run migration:down
bun run migration:create
```

`migration:down` desfaz a migration mais recente; use com cuidado no banco de desenvolvimento.

## Limitações atuais

- Não há autenticação; a decisão e o desenho futuro estão descritos em `ARCHITECTURE.md`.
- Ainda não há endpoint de consulta paginada do ledger nem de reconciliação.
- Ainda faltam testes de integração dedicados ao worker de referências pendentes.
- Ainda não há métricas de aplicação; elas seguem pendentes.
- Os testes atuais não comprovam execução em três ou mais processos independentes nem reinício completo do serviço.
