# Casa de Leilões — Backend (FastAPI + PostgreSQL)

API do teste técnico **Elite Dev (Verzel)**. Itens leiloados vêm da API pública do *Art Institute of Chicago*.
Leiloeiros criam lotes, licitantes dão lances ao vivo, o vencedor recebe um comprovante público, e qualquer pessoa
pode auditar o histórico de lances de um lote.

## Stack

Python 3.12+ · FastAPI · SQLAlchemy 2 · PostgreSQL · WebSocket · JWT · bcrypt · pytest

## Rodando (Linux)

```bash
# 1) PostgreSQL (uma vez)
sudo apt install postgresql
sudo -u postgres psql -c "CREATE USER leilao WITH PASSWORD 'leilao';"
sudo -u postgres psql -c "CREATE DATABASE leilao OWNER leilao;"
sudo -u postgres psql -c "CREATE DATABASE leilao_test OWNER leilao;"   # só para os testes

# 2) Ambiente Python isolado
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 3) Configuração
cp .env.example .env        # troque SECRET_KEY e AUDIT_SECRET por valores aleatórios longos

# 4) Subir (cria as tabelas e os dados de demonstração na primeira vez)
uvicorn app.main:app --reload --port 8000
```

Documentação interativa: <http://localhost:8000/docs>

> **Use apenas 1 worker do uvicorn.** As salas de WebSocket ficam na memória do processo (ver "Limitações").

### Contas de demonstração (senha `demo1234`)

| Papel | E-mail |
|---|---|
| Leiloeiro | leiloeiro@demo.com |
| Licitante (saldo R$ 50.000) | ana@demo.com |
| Licitante (saldo R$ 30.000) | bruno@demo.com |

Dados semeados: lote ao vivo com disputa (Ana lidera, Bruno foi superado), lote ao vivo que **termina em 20 min**
(bom para ver contagem regressiva e prorrogação), lote ao vivo sem lances, lote agendado, lote encerrado com
vencedor + comprovante e lote encerrado sem lances.
Para recriar tudo (reajusta os horários, apaga os dados atuais): `python -m app.seed --reset`.
Para não semear: `SEED_ON_START=false`.

### Testes

```bash
pytest -q          # usa o banco leilao_test (variável TEST_DATABASE_URL para trocar)
```

Os testes exigem PostgreSQL de verdade, porque o controle de concorrência usa travas de linha (`SELECT … FOR UPDATE`).
Cobrem: regras de lance, saldo comprometido, prorrogação, liquidação, cancelamento, concorrência (lances simultâneos),
detecção de adulteração direta no banco, privacidade da auditoria/comprovante e resiliência da API externa.

> Por padrão os testes usam `postgresql+psycopg://leilao:leilao@localhost:5432/leilao_test` (nunca o banco de desenvolvimento, porque limpam as tabelas).

## Regras de negócio (como foram implementadas)

| Regra | Implementação |
|---|---|
| Lances só em lotes ao vivo | rejeitados com `lot_not_started`, `lot_ended` ou `lot_cancelled` |
| 1º lance ≥ lance inicial; demais ≥ atual + incremento | `below_minimum` (a resposta traz `min_next_bid_cents`) |
| Líder não cobre o próprio lance | `already_leading` |
| Leiloeiro não dá lance | `seller_cannot_bid` (403) |
| Saldo disponível = total − comprometido | o "comprometido" **não é gravado**: é a soma dos lances atuais dos lotes que o usuário lidera. Por isso nunca desincroniza; ao ser superado, o valor volta ao disponível no mesmo instante. Lance acima do disponível: `insufficient_balance` |
| Anti-sniping | lance aceito nos últimos 2 min define o fim como `agora + 2 min` (pode repetir indefinidamente) |
| Liquidação | ao encerrar, debita o vencedor, credita o leiloeiro, grava as duas movimentações e gera o comprovante, tudo em uma transação e de forma idempotente. Sem lances: encerra sem vencedor |
| Cancelamento | só lotes **sem lances**; com `?refund=true` (opcional do teste) cancela mesmo com lances e o estorno é automático (o lote cancelado deixa de comprometer saldo). Lotes cancelados não aparecem na vitrine |

**Concorrência.** Cada lance roda em uma transação que trava, nesta ordem, a linha do lote e a do usuário. Dois lances
iguais simultâneos: só um é aceito. O mesmo usuário dando lances simultâneos em vários lotes não consegue gastar
mais que o saldo (ambos cobertos por testes com threads).

**Encerramento.** Um laço em segundo plano liquida lotes vencidos a cada ~1 s; além disso, abrir um lote vencido
também o liquida (nunca se mostra um lote "ao vivo" já terminado).

## Histórico à prova de adulteração (técnica e explicação)

Cada lance guarda `hash = HMAC-SHA256(chave_secreta, lote | seq | licitante | valor | horário | fim_após_lance | hash_anterior)`.

* O primeiro lance encadeia a um **hash gênese** que amarra os termos do lote (preço inicial, incremento, janela, item).
  Alterar o preço inicial depois quebra a corrente.
* Alterar um lance → o hash recalculado não confere. Remover um lance do meio → quebra de encadeamento e
  sequência com buraco. Inserir um lance → hash inválido (sem a chave não há como forjar um válido).
* **Âncoras no lote** (`bid_count`, `head_hash`, lance atual, líder, fim) detectam apagar os últimos lances.
* Para lotes **liquidados**, a auditoria também confere livro-caixa (`wallet_transactions`) e comprovante contra o
  último lance. Isso fecha o caso "apagar o último lance e reescrever as âncoras".
* A auditoria também revalida as regras (valor mínimo, horário dentro da janela, ordem temporal).

Por que HMAC e não um SHA-256 simples: quem tem acesso direto ao banco poderia editar um lance e recalcular toda a
corrente. Com HMAC, sem a `AUDIT_SECRET` (que fica fora do banco) isso não é possível.

`GET /api/lots/{id}/audit` é **público** (sem login) e devolve o veredito (`intact`), a lista de problemas em português
e cada lance com `ok`. Licitantes aparecem só como pseudônimo **por lote** (ex.: `Licitante #A3F9C1`, derivado por
HMAC do usuário e do lote). Nenhum e-mail, nome ou id é exposto. O comprovante segue a mesma regra.

**Como testar a adulteração:** com o servidor rodando, edite direto no banco e recarregue a página de auditoria:

```sql
UPDATE bids SET amount_cents = 100 WHERE lot_id = 1 AND seq = 2;
```

## API externa e resiliência

Fonte: <https://api.artic.edu> (sem chave). Só é usada em **buscar itens** e **criar lote**.

1. O lote guarda um **snapshot** (título, imagem, atributos). Vitrine, sala, auditoria e comprovante nunca chamam a API.
2. Respostas ficam em cache no banco (frescas por 10 min; quando a API cai, serve o cache vencido com `stale: true`).
3. Timeout de 6 s, 1 nova tentativa e disjuntor (pausa de 30 s após falhas seguidas).
4. Sem cache e API fora: o painel recebe `503 external_unavailable` com mensagem clara. O resto continua funcionando.

As **imagens** são servidas pelo próprio site do museu (IIIF); se ele cair, o texto funciona e a imagem usa o
placeholder do front. Os lotes de demonstração usam itens reais quando a API responde na hora do seed e itens fictícios
sem imagem caso contrário.

## Endpoints principais

`POST /api/auth/register|login` · `GET /api/lots?state=live|scheduled|ended&q=&sort=` · `GET /api/lots/{id}` ·
`POST /api/lots/{id}/bids` · `WS /api/ws/lots/{id}` · `GET /api/lots/{id}/audit` · `GET /api/receipts/{code}` ·
`GET /api/wallet` · `POST /api/wallet/deposit` · `GET /api/me/bids|wins` ·
`GET /api/seller/items` · `POST /api/seller/lots` · `GET /api/seller/lots` · `POST /api/seller/lots/{id}/cancel`.
Erros: `{"code": "...", "message": "..."}` com mensagem em português para o usuário.

## Comportamentos que podem surpreender

* Valores em **centavos inteiros** (BRL) em toda a API.
* Se o horário de início informado já passou (até 1 min), o lote começa **agora**. Duração mínima: 1 minuto.
* Uma prorrogação por anti-sniping altera `ends_at`; `original_ends_at` guarda o fim original.
* Depósito é simulado (R$ 1,00 a R$ 1.000.000,00) e só para licitantes. O saldo do leiloeiro cresce com as vendas.
* Não há recuperação de senha, nota fiscal nem revenda (fora do escopo do enunciado).
* Se `FRONTEND_DIST` apontar para o build do React, a API serve o front no mesmo domínio.

## Limitações conhecidas

* **WebSocket em memória:** com mais de um worker/instância, eventos não atravessam processos (o front faz polling de 5 s
  como reserva). Para escalar, trocaria por Redis pub/sub.
* **Adulteração do último lance em lote ao vivo:** quem tem acesso total ao banco pode apagar o lance mais recente *e*
  reescrever as âncoras do lote; a corrente restante continua consistente. É detectável para quem anotou o `head_hash`
  público e, depois da liquidação, pelo livro-caixa + comprovante. Há um teste que documenta esse limite. Reforço
  possível: publicar o `head_hash` periodicamente em um registro externo.
* Sem migrações (Alembic): as tabelas são criadas com `create_all`. Para mudar o esquema, recrie o banco.
* Não há limite de taxa (rate limit) nas rotas.
