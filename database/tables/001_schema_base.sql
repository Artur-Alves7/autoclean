-- Esquema acadêmico reconstruído do Auto Clean.
-- Use apenas em projeto Supabase local ou descartável. Não execute em produção.

create extension if not exists pgcrypto;

do $$ begin
  create type public.forma_pagamento as enum ('dinheiro', 'pix', 'debito', 'credito', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.papel_usuario as enum ('administrador', 'lavador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_atendimento as enum (
    'aguardando', 'em_lavagem', 'pronto_para_retirada', 'entregue', 'cancelado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.status_fechamento as enum ('rascunho', 'confirmado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_destinatario as enum ('empresa', 'lavador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_lancamento as enum ('repasse', 'ajuste');
exception when duplicate_object then null; end $$;

create table if not exists public.perfis (
  id uuid primary key default gen_random_uuid(),
  usuario_auth_id uuid not null unique references auth.users(id) on delete cascade,
  nome_completo text not null check (length(trim(nome_completo)) >= 2),
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.papeis_perfil (
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  papel public.papel_usuario not null,
  atribuido_em timestamptz not null default now(),
  primary key (perfil_id, papel)
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome_completo text not null check (length(trim(nome_completo)) >= 2),
  telefone text not null,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.categorias_veiculo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  valor_empresa numeric(12,2) not null check (valor_empresa >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.servicos_lavagem (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  categoria_veiculo_id uuid not null references public.categorias_veiculo(id),
  marca text not null,
  modelo text not null,
  placa text,
  placa_normalizada text generated always as (
    nullif(regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g'), '')
  ) stored,
  cor text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, cliente_id)
);

create unique index if not exists veiculos_placa_normalizada_key
  on public.veiculos (placa_normalizada)
  where placa_normalizada is not null;

create table if not exists public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  veiculo_id uuid not null,
  servico_id uuid not null references public.servicos_lavagem(id),
  criado_por_perfil_id uuid not null references public.perfis(id),
  status public.status_atendimento not null default 'aguardando',
  chegou_em timestamptz not null default now(),
  agendado_para timestamptz,
  lavagem_iniciada_em timestamptz,
  pronto_em timestamptz,
  entregue_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  valor_final numeric(12,2) check (valor_final is null or valor_final > 0),
  valor_empresa_snapshot numeric(12,2) not null check (valor_empresa_snapshot >= 0),
  observacoes text,
  nome_cliente_snapshot text not null,
  veiculo_snapshot text not null,
  categoria_veiculo_snapshot text not null,
  servico_snapshot text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fk_atendimentos_veiculo_cliente
    foreign key (veiculo_id, cliente_id) references public.veiculos(id, cliente_id)
);

create table if not exists public.atendimento_lavadores (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  lavador_perfil_id uuid not null references public.perfis(id),
  ordem_rateio integer not null check (ordem_rateio > 0),
  atribuido_em timestamptz not null default now(),
  unique (atendimento_id, lavador_perfil_id),
  unique (atendimento_id, ordem_rateio)
);

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  forma_pagamento public.forma_pagamento not null,
  valor numeric(12,2) not null check (valor > 0),
  pago_em timestamptz not null default now(),
  recebido_por_perfil_id uuid not null references public.perfis(id),
  criado_em timestamptz not null default now()
);

create table if not exists public.historico_status (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  status_anterior public.status_atendimento,
  status_novo public.status_atendimento not null,
  motivo text,
  alterado_por_perfil_id uuid references public.perfis(id),
  alterado_em timestamptz not null default now()
);

create table if not exists public.historico_alteracoes (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  campo_alterado text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text,
  alterado_por_perfil_id uuid references public.perfis(id),
  alterado_em timestamptz not null default now()
);

create table if not exists public.fechamentos_diarios (
  id uuid primary key default gen_random_uuid(),
  data_operacao date not null unique,
  status public.status_fechamento not null default 'rascunho',
  observacoes text,
  criado_por_perfil_id uuid not null references public.perfis(id),
  confirmado_por_perfil_id uuid references public.perfis(id),
  criado_em timestamptz not null default now(),
  confirmado_em timestamptz
);

create table if not exists public.itens_fechamento (
  id uuid primary key default gen_random_uuid(),
  fechamento_diario_id uuid not null references public.fechamentos_diarios(id),
  atendimento_id uuid not null references public.atendimentos(id),
  tipo_destinatario public.tipo_destinatario not null,
  perfil_destinatario_id uuid references public.perfis(id),
  tipo_lancamento public.tipo_lancamento not null default 'repasse',
  valor numeric(12,2) not null check (valor <> 0),
  item_origem_id uuid references public.itens_fechamento(id),
  criado_em timestamptz not null default now(),
  check (
    (tipo_destinatario = 'empresa' and perfil_destinatario_id is null)
    or (tipo_destinatario = 'lavador' and perfil_destinatario_id is not null)
  )
);

create table if not exists public.ajustes_repasse_pendentes (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id),
  item_origem_id uuid references public.itens_fechamento(id),
  tipo_destinatario public.tipo_destinatario not null,
  perfil_destinatario_id uuid references public.perfis(id),
  valor numeric(12,2) not null check (valor <> 0),
  motivo text not null,
  criado_por_perfil_id uuid not null references public.perfis(id),
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  fechamento_destino_id uuid references public.fechamentos_diarios(id)
);

create table if not exists public.historico_fechamentos (
  id uuid primary key default gen_random_uuid(),
  fechamento_diario_id uuid not null references public.fechamentos_diarios(id),
  acao text not null check (acao in ('reaberto', 'reconfirmado')),
  motivo text not null,
  alterado_por_perfil_id uuid not null references public.perfis(id),
  alterado_em timestamptz not null default now()
);

create index if not exists atendimentos_chegou_em_idx on public.atendimentos (chegou_em);
create index if not exists atendimentos_status_idx on public.atendimentos (status);
create index if not exists pagamentos_atendimento_id_idx on public.pagamentos (atendimento_id);
create index if not exists itens_fechamento_atendimento_id_idx
  on public.itens_fechamento (atendimento_id);

create or replace function public.lc_atualizar_timestamp()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.atualizado_em := now();
  return new;
end
$$;

drop trigger if exists trg_perfis_atualizado_em on public.perfis;
create trigger trg_perfis_atualizado_em before update on public.perfis
for each row execute function public.lc_atualizar_timestamp();

drop trigger if exists trg_clientes_atualizado_em on public.clientes;
create trigger trg_clientes_atualizado_em before update on public.clientes
for each row execute function public.lc_atualizar_timestamp();

drop trigger if exists trg_categorias_atualizado_em on public.categorias_veiculo;
create trigger trg_categorias_atualizado_em before update on public.categorias_veiculo
for each row execute function public.lc_atualizar_timestamp();

drop trigger if exists trg_servicos_atualizado_em on public.servicos_lavagem;
create trigger trg_servicos_atualizado_em before update on public.servicos_lavagem
for each row execute function public.lc_atualizar_timestamp();

drop trigger if exists trg_veiculos_atualizado_em on public.veiculos;
create trigger trg_veiculos_atualizado_em before update on public.veiculos
for each row execute function public.lc_atualizar_timestamp();

drop trigger if exists trg_atendimentos_atualizado_em on public.atendimentos;
create trigger trg_atendimentos_atualizado_em before update on public.atendimentos
for each row execute function public.lc_atualizar_timestamp();

alter table public.perfis enable row level security;
alter table public.papeis_perfil enable row level security;
alter table public.clientes enable row level security;
alter table public.categorias_veiculo enable row level security;
alter table public.servicos_lavagem enable row level security;
alter table public.veiculos enable row level security;
alter table public.atendimentos enable row level security;
alter table public.atendimento_lavadores enable row level security;
alter table public.pagamentos enable row level security;
alter table public.historico_status enable row level security;
alter table public.historico_alteracoes enable row level security;
alter table public.fechamentos_diarios enable row level security;
alter table public.itens_fechamento enable row level security;
alter table public.ajustes_repasse_pendentes enable row level security;
alter table public.historico_fechamentos enable row level security;
