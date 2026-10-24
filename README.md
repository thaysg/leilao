# Casa de Leilões online

Teste técnico **Elite Dev (Verzel)**: uma casa de leilões em que leiloeiros publicam lotes a partir de itens de uma API
pública e licitantes disputam cada lote com lances ao vivo. O vencedor recebe um comprovante compartilhável por link,
e qualquer pessoa, mesmo sem login, pode auditar o histórico de lances de um lote e verificar que ele não foi adulterado.

- **Deploy:** <https://leilao-qc1x.onrender.com/> (plano gratuito do Render: se o serviço estiver "dormindo", a primeira abertura pode levar cerca de 1 minuto)
- **Autora:** Thays de Avila Garcia ([@thaysg](https://github.com/thaysg))
- **Contas de demonstração** (senha `demo1234`): `leiloeiro@demo.com` (leiloeiro) · `ana@demo.com` e `bruno@demo.com` (licitantes)

## Sumário

1. [Stack](#stack)
2. [Funcionalidades](#funcionalidades)
3. [Estrutura do repositório](#estrutura-do-repositório)
4. [Como rodar localmente (passo a passo)](#como-rodar-localmente-passo-a-passo)
5. [Variáveis de ambiente](#variáveis-de-ambiente)
6. [Testes](#testes)
7. [Roteiro rápido de avaliação](#roteiro-rápido-de-avaliação)
8. [Regras de negócio](#regras-de-negócio)
9. [Histórico à prova de adulteração](#histórico-à-prova-de-adulteração)
10. [API externa e resiliência](#api-externa-e-resiliência)
11. [Comportamentos que podem surpreender](#comportamentos-que-podem-surpreender)
12. [Limitações conhecidas](#limitações-conhecidas)
13. [Deploy](#deploy)
14. [Uso de IA](#uso-de-ia)

## Stack

| Camada | Tecnologia |
|---|---|
| Front-end | React 18 · Vite · TypeScript · React Router · TanStack Query · zustand · CSS puro com tokens (tema claro/escuro) |
| Back-end | Python 3.12+ · FastAPI · SQLAlchemy 2 · JWT · bcrypt · WebSocket |
| Banco de dados | **PostgreSQL** |
| API externa | [Cleveland Museum of Art Open Access](https://openaccess-api.clevelandart.org/) (pública, sem chave, dados CC0): os itens leiloados são obras de arte |
| Testes | pytest (back, contra PostgreSQL real) · Vitest (front) |

Em produção, **um único serviço** serve tudo: o FastAPI entrega a API, o WebSocket e o build do React no mesmo domínio.

## Funcionalidades

**Leiloeiro:** busca itens na API externa e cria um lote (título, imagem, atributos, lance inicial, incremento mínimo, início e fim) ·
cancela lotes que ainda não receberam lances (opcionalmente, lotes com lances, com estorno automático) ·
vê o resultado de cada lote encerrado e o total recebido.

**Licitante:** deposita saldo simulado · vê saldo total, comprometido e disponível · dá lances em lotes ao vivo ·
acompanha em tempo real se está ganhando ou foi superado · vê seus lances e arremates · compartilha o comprovante por link.

**Público (sem login):** vitrine (ao vivo, agendados, encerrados; lotes cancelados não aparecem) com busca, ordenação e
filtro de preço · página de auditoria do lote · página do comprovante.

**Extras do enunciado implementados:** busca e filtro de lotes · cancelamento com estorno automático · testes automatizados · dark mode.
(Docker Compose não foi implementado.)

## Estrutura do repositório

```
.
├── backend/                     API FastAPI
│   ├── app/
│   │   ├── main.py              app, tratamento de erros, laço de liquidação, serve o front
│   │   ├── models.py            tabelas (users, lots, bids, receipts, wallet_transactions, external_cache)
│   │   ├── integrity.py         hashes HMAC do histórico e pseudônimos
│   │   ├── services/            auction.py (regras), audit.py (verificação), external.py (API do museu)
│   │   ├── routers/             auth, lots (público/licitante), seller
│   │   ├── realtime.py          WebSocket
│   │   └── seed.py              dados de demonstração
│   ├── tests/
│   └── README.md                detalhes do back-end
└── frontend/                    SPA React
    ├── src/
    │   ├── app/                 rotas, layout, injeção de dependências
    │   ├── core/                http, relógio do servidor, formatadores, tema
    │   ├── shared/ui/           componentes de interface
    │   └── features/<feature>/  domain · data · presentation (Clean Architecture)
    └── README.md                detalhes do front-end
```

## Como rodar localmente (passo a passo)

Pré-requisitos: **Python 3.12+**, **Node.js 20+**, **Git** e **PostgreSQL**.

### 1. Banco de dados (PostgreSQL)

Instale o PostgreSQL (Ubuntu/Debian: `sudo apt install postgresql`; Windows: instalador oficial; macOS: `brew install postgresql`)
e crie o usuário e os bancos. Em Linux:

```bash
sudo -u postgres psql -c "CREATE USER leilao WITH PASSWORD 'leilao';"
sudo -u postgres psql -c "CREATE DATABASE leilao OWNER leilao;"
sudo -u postgres psql -c "CREATE DATABASE leilao_test OWNER leilao;"   # usado só pelos testes
```

As tabelas são criadas automaticamente na primeira subida do back-end (não há migrações; ver [Limitações](#limitações-conhecidas)).

### 2. Back-end

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate            # Windows (PowerShell): .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env                 # Windows: copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

- Na primeira execução, com o banco vazio, o back-end **semeia os dados de demonstração** (ver abaixo).
- Documentação interativa da API: <http://localhost:8000/docs>
- Use **apenas 1 worker** do uvicorn (o WebSocket mantém as salas na memória do processo).

### 3. Front-end (em outro terminal)

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

O Vite encaminha `/api` (incluindo WebSocket) para `localhost:8000`, então não há CORS nem variáveis para configurar em desenvolvimento.

### 4. (Opcional) Rodar como em produção: um único serviço

```bash
cd frontend && npm install && npm run build
cd ../backend
FRONTEND_DIST=../frontend/dist uvicorn app.main:app --port 8000     # tudo em http://localhost:8000
```

### Dados de demonstração

Criados automaticamente quando o banco está vazio. Para apagar tudo e recriar (também reajusta os horários dos lotes): `python -m app.seed --reset` (com o servidor **parado**; ver [Comportamentos que podem surpreender](#comportamentos-que-podem-surpreender)).

| Conta | Papel | Saldo inicial |
|---|---|---|
| `leiloeiro@demo.com` | leiloeiro | — |
| `ana@demo.com` | licitante | R$ 50.000,00 |
| `bruno@demo.com` | licitante | R$ 30.000,00 |

Lotes semeados: um **ao vivo com disputa** (Ana lidera, Bruno foi superado) · um ao vivo que **termina em ~20 minutos** (bom para ver a contagem
regressiva e a prorrogação) · um ao vivo sem lances · um agendado · um encerrado com vencedor e comprovante · um encerrado sem lances.
Os itens são obras reais da API do museu quando ela responde durante o seed; caso contrário, itens fictícios **sem imagem** (o seed avisa no terminal).

## Variáveis de ambiente

Definidas em `backend/.env` (modelo em `backend/.env.example`) ou como variáveis do sistema.

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://leilao:leilao@localhost:5432/leilao` | Conexão com o PostgreSQL. Aceita também `postgres://` e `postgresql://` (formato de provedores como Neon, Supabase, Render) |
| `SECRET_KEY` | valor de desenvolvimento | Assina os tokens de login (JWT). **Troque em produção** |
| `AUDIT_SECRET` | valor de desenvolvimento | Chave do HMAC do histórico de lances. **Troque em produção e mantenha fora do banco.** Se mudar, os históricos antigos deixam de validar |
| `SEED_ON_START` | `true` | Semeia os dados de demonstração se o banco estiver vazio |
| `FRONTEND_DIST` | vazio | Caminho do `frontend/dist`. Quando definido, o back-end serve o front |
| `CORS_ORIGINS` | `http://localhost:5173` | Origens permitidas (só importa se front e back estiverem em domínios diferentes) |
| `RUN_FINALIZER` | `true` | Liga o laço que liquida lotes vencidos |

Gere chaves aleatórias com: `python -c "import secrets; print(secrets.token_hex(32))"` (use valores diferentes para cada uma).

## Testes

```bash
# back-end: exige o banco leilao_test (passo 1). Limpa as tabelas desse banco, nunca as do banco de desenvolvimento.
cd backend && source .venv/bin/activate && pytest -q
# outro banco de teste:  TEST_DATABASE_URL=postgresql+psycopg://usuario:senha@host:5432/banco pytest -q

# front-end
cd frontend && npm test
```

O back-end tem 30 testes que cobrem: regras de lance, saldo comprometido, anti-sniping, liquidação, cancelamento, **lances simultâneos**
(threads concorrentes), detecção de adulteração feita direto no banco, privacidade da auditoria/comprovante e resiliência da API externa.
Os testes do back-end precisam de PostgreSQL real porque o controle de concorrência usa trava de linha (`SELECT … FOR UPDATE`).

## Roteiro rápido de avaliação

1. **Vitrine:** abra `/`. Veja as abas Ao vivo / Agendados / Encerrados, busque por um título e ordene por preço.
2. **Lance e tempo real:** abra duas janelas (uma anônima). Entre como `ana@demo.com` e como `bruno@demo.com` e abra o mesmo lote ao vivo.
   Dê um lance com uma conta e veja a outra mudar para "Você foi superado" **sem recarregar**.
3. **Mensagens de recusa:** tente um lance abaixo do mínimo, outro maior que o saldo disponível e outro como líder do lote.
4. **Carteira:** em `/carteira` veja saldo total, comprometido e disponível; deposite e observe os valores. Quando alguém é superado, o valor volta ao disponível.
5. **Prorrogação:** no lote que termina em ~20 min, dê um lance nos últimos 2 minutos e veja o prazo ser estendido ("Prorrogado").
6. **Leiloeiro:** entre como `leiloeiro@demo.com`. Em `/painel`: busque um item, crie um lote, cancele um lote sem lances e veja os resultados.
7. **Comprovante:** o lote encerrado semeado foi vencido por `bruno@demo.com`. Entre com ele, abra "Arremates", copie o link do comprovante e abra em janela anônima.
8. **Auditoria pública:** abra `/auditoria/<id do lote>` sem login e veja "Histórico íntegro".
9. **Adulteração:** edite direto no banco e recarregue a auditoria. Ela passa a mostrar "Histórico adulterado" e aponta o lance:
   ```sql
   UPDATE bids SET amount_cents = 100 WHERE lot_id = 1 AND seq = 2;
   ```
   (Para voltar ao normal, com o servidor parado: `python -m app.seed --reset`.)
10. **API fora:** a vitrine, a sala, a auditoria e o comprovante nunca dependem da API externa. Só a busca de itens do painel depende dela (usa cache e avisa).

## Regras de negócio

| Regra | Como foi implementada |
|---|---|
| Lances só em lotes ao vivo | Recusa com mensagem clara: lote ainda não iniciado, encerrado ou cancelado |
| 1º lance ≥ lance inicial; os seguintes ≥ lance atual + incremento mínimo | Mensagem informa o mínimo exato |
| Líder não cobre o próprio lance | "Você já está ganhando este lote" |
| Leiloeiro não dá lances | Recusado (403) e a interface esconde o formulário |
| Saldo disponível = total − comprometido | O comprometido **não é gravado**: é a soma dos lances atuais dos lotes que o usuário lidera. Por isso nunca desincroniza. Ao ser superado, o valor volta ao disponível no mesmo instante. Só se aceita lance que caiba no disponível |
| Prorrogação (anti-sniping) | Lance aceito nos últimos 2 min define o fim como `agora + 2 min`. Pode se repetir |
| Liquidação | Ao encerrar: debita o vencedor, credita o leiloeiro, grava as duas movimentações no livro-caixa e gera o comprovante, tudo numa transação e de forma idempotente. Lote sem lances encerra sem vencedor |
| Cancelamento | Só lotes sem lances. Com `refund=true` (opcional do teste) cancela mesmo com lances e o estorno é automático, pois o lote cancelado deixa de comprometer saldo |
| Privacidade | Auditoria e comprovante mostram só pseudônimos por lote (`Licitante #A3F9C1`), nunca nome, e-mail ou id |

**Concorrência.** Cada lance roda em uma transação que trava, sempre na mesma ordem, a linha do lote e a do usuário. Dois lances iguais ao
mesmo tempo: só um é aceito. O mesmo usuário dando lances simultâneos em vários lotes não consegue gastar mais do que o saldo. Ambos os casos têm teste.

**Encerramento.** Um laço em segundo plano liquida os lotes vencidos a cada ~1 segundo. Abrir um lote já vencido também o liquida, então a interface nunca mostra como "ao vivo" um lote terminado.

## Histórico à prova de adulteração

**Técnica: corrente de hashes com HMAC-SHA256 (um "mini blockchain" por lote).**

Cada lance guarda:

```
hash = HMAC-SHA256(AUDIT_SECRET, lote | nº do lance | licitante | valor | horário | fim do lote após o lance | hash do lance anterior)
```

- O primeiro lance encadeia a um **hash gênese** que amarra os termos imutáveis do lote (leiloeiro, item, lance inicial, incremento, janela). Alterar o preço inicial depois quebra a corrente.
- **Alterar** um lance (valor, autor, horário): o hash recalculado não confere.
- **Remover** um lance do meio: sequência com buraco e encadeamento quebrado.
- **Inserir** um lance: sem a chave secreta é impossível calcular um hash válido.
- **Apagar os últimos lances:** o lote guarda âncoras (`bid_count`, `head_hash`, lance atual, líder, fim) que denunciam a diferença.
- **Lote liquidado:** a auditoria também confere o livro-caixa e o comprovante contra o último lance.
- A verificação revalida as regras de negócio de cada lance (valor mínimo, horário dentro da janela, ordem temporal).

**Por que HMAC e não um SHA-256 simples?** Quem tem acesso direto ao banco poderia editar um lance e recalcular a corrente inteira. Com HMAC, sem a
`AUDIT_SECRET` (que fica fora do banco) isso não é possível.

`GET /api/lots/{id}/audit` é público e devolve o veredito, a lista de problemas em português e o status de cada lance. A página `/auditoria/:id` mostra isso em uma linha do tempo.

**Limite honesto:** quem tem acesso total ao banco **e** apaga o lance mais recente de um lote **ao vivo** reescrevendo também as âncoras do lote deixa a corrente restante consistente, e isso não é detectável por dentro do sistema. É detectável por quem anotou o `head_hash`
público (mostrado na auditoria) e, depois da liquidação, pelo livro-caixa e pelo comprovante. Há um teste que documenta esse limite. Um reforço possível é publicar o `head_hash` periodicamente em um registro externo.

## API externa e resiliência

Fonte: <https://openaccess-api.clevelandart.org> (sem chave, dados CC0). A primeira opção, a API do Art Institute of Chicago, foi descartada porque fica atrás de um bloqueio do Cloudflare que recusa acessos de servidor (HTTP 403). É usada apenas em **buscar itens** e **criar lote**.

1. O lote guarda um **snapshot** do item (título, imagem, atributos). Vitrine, sala, auditoria e comprovante **nunca** chamam a API externa.
2. As respostas ficam em cache no banco: frescas por 10 minutos; se a API cair, serve o cache vencido com aviso.
3. Timeout de 6 s, uma nova tentativa e disjuntor (pausa de 30 s após falhas seguidas).
4. Sem cache e com a API fora: o painel mostra uma mensagem clara (503) e o resto do sistema segue funcionando.

As imagens vêm do servidor de imagens do museu. Se ele cair, os textos continuam e a interface mostra um espaço reservado com as iniciais da obra.

## Comportamentos que podem surpreender

- **Valores em centavos inteiros** em toda a API; a formatação em reais acontece só na interface.
- **Início no passado:** se o horário de início informado já passou (até 1 minuto), o lote começa agora. Duração mínima de 1 minuto.
- **Lote cancelado:** some da vitrine e responde 404 para o público; só o leiloeiro dono ainda o enxerga.
- **Prorrogação:** o fim do lote muda (`ends_at`); o fim original fica em `original_ends_at`.
- **Depósito simulado:** de R$ 1,00 a R$ 1.000.000,00, só para licitantes. O saldo do leiloeiro cresce com as vendas.
- **Pseudônimos por lote:** o mesmo licitante aparece com códigos diferentes em lotes diferentes, de propósito (privacidade).
- **Sessão:** token JWT válido por 7 dias, guardado no `localStorage`.
- **Horários:** exibidos no fuso do navegador; a contagem regressiva usa o relógio do servidor, não o do computador.
- **Dados de demonstração:** os horários dos lotes semeados são relativos ao momento do seed. No deploy, o lote que termina em ~20 minutos já terá encerrado quando você abrir o link; os outros lotes ao vivo ficam abertos por 7 e 14 dias após o seed, e depois também encerram. O lote agendado, o encerrado com vencedor e o encerrado sem lances continuam disponíveis para o roteiro de avaliação.
- **Renovar os dados de demonstração:** `python -m app.seed --reset` apaga todos os dados e recria os de demonstração. Rode-o com o servidor **parado** (pare o `uvicorn` com Ctrl+C, rode o seed e suba o servidor de novo). Com o servidor ligado, o laço de liquidação pode encerrar lotes no meio do seed e causar o erro "Este lote já foi encerrado".
- **Fora do escopo (conforme o enunciado):** nota fiscal, revenda entre usuários, aplicativo nativo e recuperação de senha.

## Limitações conhecidas

- **WebSocket em memória:** com mais de um worker/instância, os eventos não atravessam processos (o front faz polling a cada 5 s enquanto desconectado). Para escalar seria preciso Redis pub/sub.
- **Sem migrações (Alembic):** as tabelas são criadas com `create_all`. Mudanças no esquema exigem recriar o banco.
- **Sem limite de taxa** (rate limit) nas rotas.
- **Sem Docker Compose.**
- **Sem testes de componentes no front** (só lógica pura); o fluxo completo foi validado manualmente em navegador contra o back-end real.

## Deploy

**Link da aplicação:** <https://leilao-qc1x.onrender.com/>

| Parte | Onde está |
|---|---|
| Aplicação (API + WebSocket + front) | [Render](https://render.com), plano gratuito, **um único serviço** Python: o FastAPI entrega a API, o WebSocket e o build do React no mesmo domínio |
| Banco de dados | [Neon](https://neon.com), PostgreSQL gratuito, com conexão **direta** (sem pooler, por causa das travas de linha usadas nos lances) |
| Código | <https://github.com/thaysg/leilao> (público); o Render publica a branch `main` a cada `git push` |

**Configuração do serviço no Render**

- **Root Directory:** vazio (raiz do repositório). **Runtime:** Python 3. **Health check:** `/api/health`.
- **Build Command:**
  ```bash
  cd frontend && npm install --include=dev && npm run build && cd ../backend && pip install -r requirements.txt
  ```
  (`--include=dev` é necessário porque o build do front usa `tsc` e `vite`, que são devDependencies.)
- **Start Command** (apenas **1 worker**, porque as salas do WebSocket ficam na memória do processo):
  ```bash
  cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```
- **Variáveis de ambiente:** `DATABASE_URL` (conexão do Neon), `SECRET_KEY` e `AUDIT_SECRET` (valores longos e aleatórios, diferentes entre si), `FRONTEND_DIST=../frontend/dist`, `SEED_ON_START=true` e `PYTHON_VERSION=3.12.7`.
- Os dados de demonstração foram criados na primeira subida (`SEED_ON_START=true` com o banco vazio). Para renová-los, veja [Comportamentos que podem surpreender](#comportamentos-que-podem-surpreender).

**O que esperar do plano gratuito**

- O Render coloca o serviço para "dormir" após ~15 minutos sem acesso; a primeira requisição depois disso pode levar cerca de 1 minuto. Enquanto dorme, o laço de liquidação não roda, mas um lote vencido é liquidado assim que alguém o abre.
- O banco do Neon também pausa quando ocioso e acorda na primeira conexão.
- A `AUDIT_SECRET` não deve ser trocada depois que existirem lances: os históricos antigos deixariam de validar na auditoria.

## Uso de IA

Usei o **Claude** (Anthropic) como ferramenta de apoio para **criar o projeto**: o código do back-end e do front-end, os testes automatizados e a documentação (incluindo este README), além do passo a passo do deploy no Render e no Neon.

**A revisão e os testes foram feitos por mim.** Revisei o que foi gerado, rodei o projeto e testei a aplicação, e os ajustes e a publicação final também foram feitos por mim.