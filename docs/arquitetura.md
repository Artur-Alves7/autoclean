# Arquitetura do Auto Clean

## Visão geral

O Auto Clean é uma aplicação web React executada com TanStack Start. O navegador usa a chave
pública do projeto para acessar Supabase Auth, PostgREST e RPCs. As autorizações efetivas ficam
no PostgreSQL por meio de RLS e funções validadoras. A única operação administrativa que exige
`service_role` é o convite de usuários, realizado exclusivamente pela Edge Function.

```text
Navegador
  -> React e TanStack Router
  -> cliente Supabase com JWT do usuário
  -> Auth, View, tabelas com RLS e RPCs PostgreSQL
  -> resultado reapresentado nas telas

Administrador
  -> tela de usuários
  -> Edge Function convidar-usuario
  -> validação do JWT e do papel
  -> Supabase Admin API no servidor
```

## Camadas

### Interface e rotas

- `src/routes`: sessão, proteção das áreas e primeiro acesso;
- `src/components`: atendimentos, clientes, repasses, relatórios, configurações e usuários;
- `src/styles.css`: tokens visuais e comportamento responsivo;
- `public`: logo, PWA, QR Code Pix e demais recursos públicos.

### Regras do frontend

- `src/lib/regras.ts`: validações de pagamentos e entrega;
- `src/lib/fechamento.ts`: cálculos de apresentação e rateio em centavos;
- `src/lib/formatacao.ts`: máscaras e normalização de entrada;
- `src/lib/relatorios.ts`: geração segura dos arquivos de relatório;
- `src/lib/acesso.ts`: leitura do perfil e direcionamento por papel.

Essas validações melhoram a experiência, mas não substituem as regras do banco.

### Integração com Supabase

- `src/integrations/supabase/client.ts`: cliente utilizado no navegador;
- `src/integrations/supabase/auth-middleware.ts`: propagação e renovação da sessão;
- `src/integrations/supabase/types.ts`: tipos gerados a partir do esquema atual.
- `supabase/functions/convidar-usuario`: operação administrativa isolada no servidor.

### Banco de dados

- tabelas relacionais armazenam cadastros, operação, pagamentos e fechamentos;
- `vw_painel_atendimentos` consolida dados usados por diversas telas;
- RPCs encapsulam escritas compostas e revalidam o usuário;
- `fn_calcular_repasse` faz a divisão financeira em centavos;
- `sp_fechar_repasses_dia` registra os itens do fechamento em uma transação;
- RLS restringe leituras e escritas diretas conforme o perfil.

As migrations em `supabase/migrations` são o histórico operacional. A pasta `database` contém
cópias acadêmicas identificáveis dos objetos principais e não substitui as migrations.

## Fluxo integrado de fechamento

```text
Fechamentos.tsx
  -> rpc_listar_atendimentos_fechamento(data)
  -> vw_painel_atendimentos
  -> administrador revisa o movimento
  -> rpc_fechar_repasses_dia(data, pendências, observações)
  -> sp_fechar_repasses_dia(...)
  -> fn_calcular_repasse(atendimento)
  -> itens_fechamento
  -> tela apresenta empresa e lavadores
```

Esse fluxo utiliza View, Function e Procedure com finalidades diferentes: consulta consolidada,
cálculo financeiro e processo transacional.

## Fluxo de atendimento

```text
Atendimentos.tsx
  -> rpc_criar_atendimento
  -> cliente, veículo, snapshots, participantes e histórico
  -> rpc_avancar_atendimento
  -> validação de transição, valor e pagamentos
  -> histórico_status
  -> vw_painel_atendimentos
  -> central atualizada
```

## Segurança e permissões

1. Supabase Auth emite o JWT da sessão.
2. As rotas carregam perfil e papel para orientar a interface.
3. RLS controla o acesso direto às tabelas.
4. RPCs `SECURITY DEFINER` verificam identidade, papel e consistência dos dados.
5. Rotinas privilegiadas fixam o `search_path` para reduzir risco de resolução indevida.
6. A Edge Function de convite valida o JWT e o papel antes de usar a Admin API.
7. `SUPABASE_SERVICE_ROLE_KEY` existe somente nos segredos da Edge Function.

A matriz detalhada está em [`matriz-permissoes.md`](matriz-permissoes.md).

## Decisões de integridade

- valores são comparados e divididos em centavos;
- snapshots preservam nomes e valores relevantes do momento do atendimento;
- `placa_normalizada` é gerada pelo banco e nunca enviada pelo frontend;
- fechamentos confirmados são imutáveis, exceto pela reabertura auditada;
- alterações posteriores geram históricos e ajustes, sem apagar o lançamento anterior;
- o repasse usa a data de chegada/agendamento no fuso `America/Fortaleza`.

## Implantação

- push no GitHub sincroniza o código com o Lovable conectado;
- migrations precisam de revisão e aplicação manual no Supabase;
- Edge Functions precisam de deploy separado;
- segredos de produção não fazem parte do repositório;
- o projeto privado deve conceder acesso individual aos avaliadores necessários.
