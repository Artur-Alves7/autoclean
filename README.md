# Auto Clean

Sistema operacional do lava-jato Auto Clean, integrado a Lovable, Supabase Cloud e GitHub. O front-end usa React 19 com TanStack Start/Query; autenticação, PostgreSQL, RLS, RPCs e Edge Functions ficam no Supabase.

## Funcionalidades

- fila operacional pela view `vw_painel_atendimentos`;
- cadastro transacional de cliente, veículo, atendimento e lavadores;
- fluxo `aguardando` → `em_lavagem` → `pronto_para_retirada` → `entregue`, com cancelamento motivado;
- preço pendente explícito e pagamentos divididos na saída;
- clientes, veículos e histórico, sem exclusão física;
- categorias, serviços e usuários administrados por perfil;
- repasses exatos em centavos pela function `fn_calcular_repasse`;
- fechamento pela procedure `sp_fechar_repasses_dia`, com ajustes auditados posteriores;
- acesso separado para administrador e lavador, protegido por RLS e funções `SECURITY DEFINER` com `search_path` fixo.

## Desenvolvimento local

Requer Node.js 20+ e pnpm, npm ou Bun. Não versione `.env`.

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

O cliente espera as variáveis públicas já usadas pelo projeto (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`). A chave `service_role` nunca deve existir no navegador.

## Banco: aplicação manual

O esquema inicial já existe no Supabase Cloud. Não reaplique migrations antigas nem recrie tabelas. Revise e aplique, nesta ordem, somente as migrations novas ainda ausentes no ambiente:

1. `supabase/migrations/20261002010000_operacao_segura_lavaclean.sql` — helpers seguros, correção versionada da recursão de RLS, view, function de rateio, RPCs transacionais e procedure de fechamento;
2. `supabase/migrations/20261002011000_politicas_e_correcoes.sql` — políticas das tabelas usadas, administração de usuários e correção auditada;
3. `supabase/migrations/20261002012000_ajustes_repasse.sql` — ajustes posteriores sem mutar lançamentos confirmados.
4. `supabase/migrations/20261002013000_fechamento_diario_idempotente.sql` — fechamento idempotente por data, carregamento de pendências anteriores e consumo atômico de ajustes.
5. `supabase/migrations/20261002014000_reforco_permissoes.sql` — escrita de participantes restrita às RPCs, correção administrativa somente em atendimentos ativos e validações estritas de pagamento na entrega.

Antes de aplicar, faça backup e compare os objetos/políticas existentes no painel. Os arquivos usam `create or replace`, `create table if not exists` e políticas com nomes `lc_*`; não alteram nem apagam dados de negócio. A migration inicial do banco não está neste repositório, portanto o histórico versionado não prova sozinho o estado atual do ambiente Cloud.

## Convite de usuários

A função `supabase/functions/convidar-usuario` valida o JWT do chamador e confirma no banco que ele é administrador. Depois, usa a Admin API apenas no servidor para convidar o usuário e preparar perfil/papel.

Configure no ambiente da Edge Function, nunca no front-end:

- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`.

Faça o deploy da função somente depois das migrations e mantenha `verify_jwt = true`. Não há cadastro público.

## Segurança e operação

A matriz detalhada está em [`docs/matriz-permissoes.md`](docs/matriz-permissoes.md). Atendimentos ativos são visíveis aos operadores; depois de entregues/cancelados, o lavador consulta apenas os atendimentos em que participou. Operações administrativas também são validadas no banco.

Fechamentos confirmados e seus lançamentos não podem ser editados/excluídos. Uma correção posterior gera histórico e diferenças pendentes vinculadas ao lançamento original; o fechamento seguinte consome essas diferenças como `ajuste`.

## Sincronização com Lovable

Faça commit dos arquivos, envie ao repositório GitHub conectado e só então sincronize/abra no Lovable. As migrations e Edge Function precisam de aplicação/deploy manual no Supabase; um push no GitHub não altera o banco por si só.
