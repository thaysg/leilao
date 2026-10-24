# Casa de Leilões — Frontend (React + Vite + TypeScript)

Interface do teste técnico **Elite Dev (Verzel)**. Conversa com a API FastAPI da pasta `backend/`.

Telas: vitrine (ao vivo / agendados / encerrados, busca, ordenação e filtro de preço) · sala do lote ao vivo
(tempo real, contagem regressiva, status "você está ganhando / foi superado") · carteira · meus lances ·
meus arremates (comprovante compartilhável) · painel do leiloeiro (buscar itens, criar e cancelar lotes, resultados) ·
**auditoria pública** e **comprovante público** (sem login) · tema claro/escuro · layout responsivo (mobile-first).

## O que você precisa

Node.js 20+ (testado com 22) e o backend rodando em `http://localhost:8000`.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

O `vite.config.ts` já faz proxy de `/api` (inclusive WebSocket) para `localhost:8000`, então **não há CORS nem
variáveis para configurar** em desenvolvimento.

Contas de demonstração (senha `demo1234`): `leiloeiro@demo.com`, `ana@demo.com`, `bruno@demo.com`.
Na tela de login há botões de acesso rápido a elas.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento com hot reload |
| `npm run build` | checa os tipos (`tsc`) e gera `dist/` |
| `npm test` | testes unitários (Vitest): dinheiro, relógio do servidor, regras de lance, validação do formulário de lote |

## Produção: um único serviço

O backend sabe servir este front. Depois de `npm run build`, rode o backend com a variável apontando para o `dist`:

```bash
FRONTEND_DIST=/caminho/para/frontend/dist uvicorn app.main:app --port 8000
```

Tudo passa a responder em `http://localhost:8000` (front + API + WebSocket), sem CORS. É assim que o deploy deve ser feito.
Deixe `VITE_API_URL` vazio (padrão) para o front chamar o mesmo domínio.

## Arquitetura (Clean Architecture por feature)

```
src/
  app/            roteador, layout, injeção de dependências (di.ts), QueryClient
  core/           http (fetch + ApiError), relógio sincronizado com o servidor, formatadores, tema
  shared/ui/      Button, Card, Badge, Input/Select, Modal, Toast, Tabs, Countdown, LotImage...
  features/<feature>/
    domain/       entidades, interfaces de repositório e regras puras (validação, mapeamento de erros)
    data/         repositórios HTTP (implementam as interfaces do domain)
    presentation/ páginas, componentes e hooks (React Query + zustand)
```

Regras: `domain` não importa nada de `data`/`presentation`; `presentation` nunca chama `fetch` — usa os
repositórios expostos por `app/di.ts` (o papel que o GetIt faz no Flutter). Os stores do zustand
(`authStore`, `theme`) funcionam como Cubits: estado pequeno e tipado + métodos de ação.

Features: `auth`, `lots` (vitrine + sala), `wallet`, `bids` (meus lances/arremates), `seller`, `audit` (auditoria + comprovante).

## Decisões e comportamentos que merecem atenção

* **Tempo real:** a sala abre `WS /api/ws/lots/:id`. A cada evento o lote é rebuscado via REST. Se o socket cair, o
  front reconecta com backoff exponencial e faz polling a cada 5 s enquanto estiver desconectado (indicador "Reconectando…").
* **Sem atualização otimista:** o lance só aparece depois que o servidor confirma. Todas as mensagens de erro de lance
  (abaixo do mínimo, saldo insuficiente, já está ganhando, lote não iniciado/encerrado/cancelado) vêm do servidor.
* **Contagem regressiva:** usa o horário do servidor (`server_time`) em vez do relógio do navegador, para todos verem o mesmo tempo.
  Quando chega a zero, o lote é rebuscado e o resultado final aparece.
* **Imagens:** vêm do site do museu (API externa). Se falharem, a interface mostra um placeholder com as iniciais da obra.
* **Busca de itens (leiloeiro):** se a API externa estiver instável, o painel avisa que está mostrando resultados em cache.
* **Dinheiro:** sempre em centavos inteiros; só é formatado na borda. Campos aceitam `1.234,56`, `1234,56` e `1234.56`.
* **Token:** guardado em `localStorage` (com `try/catch`); se for rejeitado pela API, a sessão é encerrada.
* **Acessibilidade:** foco visível, `aria-live` para mudanças de status, rótulos em todos os campos, respeito a `prefers-reduced-motion`.

## Limitações

* Não há camada de mock: o front depende do backend de pé para funcionar.
* Sem testes de componentes (apenas lógica pura); o fluxo completo foi validado com um navegador real contra o backend.
