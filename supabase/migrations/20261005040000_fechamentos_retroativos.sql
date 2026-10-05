-- Permite lançamentos retroativos e reabertura auditada de fechamentos confirmados.
-- Migration aditiva: não reaplicar migrations anteriores no Supabase Cloud.

create table if not exists public.historico_fechamentos (
  id uuid primary key default gen_random_uuid(),
  fechamento_diario_id uuid not null references public.fechamentos_diarios(id),
  acao text not null check (acao in ('reaberto', 'reconfirmado')),
  motivo text not null,
  alterado_por_perfil_id uuid not null references public.perfis(id),
  alterado_em timestamptz not null default now()
);

alter table public.historico_fechamentos enable row level security;
drop policy if exists lc_historico_fechamentos_admin on public.historico_fechamentos;
create policy lc_historico_fechamentos_admin
on public.historico_fechamentos for select to authenticated
using (public.lc_usuario_eh_admin());

revoke insert, update, delete on public.historico_fechamentos from authenticated;
grant select on public.historico_fechamentos to authenticated;

create or replace function public.lc_bloquear_fechamento_confirmado()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'confirmado' then
    if tg_op = 'UPDATE'
       and new.status = 'rascunho'
       and pg_catalog.current_setting('lavaclean.reabrindo_fechamento', true) = 'on'
       and public.lc_usuario_eh_admin() then
      return new;
    end if;
    raise exception 'Fechamento confirmado é imutável';
  end if;
  return new;
end
$$;

create or replace function public.rpc_reabrir_fechamento_dia(
  p_data_operacao date,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_status public.status_fechamento;
  v_perfil uuid := public.lc_perfil_atual_id();
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode reabrir fechamento' using errcode = '42501';
  end if;
  if p_data_operacao is null or p_data_operacao > current_date then
    raise exception 'Informe uma data de operação válida';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da reabertura';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lavaclean:fechamento:' || p_data_operacao::text, 0)
  );

  select fechamento.id, fechamento.status
    into v_id, v_status
  from public.fechamentos_diarios fechamento
  where fechamento.data_operacao = p_data_operacao
  for update;

  if v_id is null then
    raise exception 'Não existe fechamento confirmado nesta data';
  end if;
  if v_status <> 'confirmado' then
    raise exception 'O fechamento desta data já está aberto';
  end if;

  perform pg_catalog.set_config('lavaclean.reabrindo_fechamento', 'on', true);
  update public.fechamentos_diarios
  set status = 'rascunho',
      confirmado_por_perfil_id = null,
      confirmado_em = null
  where id = v_id;
  perform pg_catalog.set_config('lavaclean.reabrindo_fechamento', 'off', true);

  insert into public.historico_fechamentos (
    fechamento_diario_id,
    acao,
    motivo,
    alterado_por_perfil_id
  ) values (
    v_id,
    'reaberto',
    trim(p_motivo),
    v_perfil
  );

  return v_id;
end
$$;

revoke all on function public.rpc_reabrir_fechamento_dia(date, text) from public, anon;
grant execute on function public.rpc_reabrir_fechamento_dia(date, text) to authenticated;

create or replace function public.rpc_listar_ajustes_fechamento(p_data_operacao date)
returns setof public.ajustes_repasse_pendentes
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode revisar ajustes' using errcode = '42501';
  end if;
  if p_data_operacao is null or p_data_operacao > current_date then
    raise exception 'Informe uma data de operação válida';
  end if;

  return query
  select ajuste.*
  from public.ajustes_repasse_pendentes ajuste
  where ajuste.processado_em is null
    and (
      ajuste.criado_em::date <= p_data_operacao
      or exists (
        select 1
        from public.itens_fechamento item
        join public.fechamentos_diarios fechamento
          on fechamento.id = item.fechamento_diario_id
        where item.atendimento_id = ajuste.atendimento_id
          and fechamento.data_operacao = p_data_operacao
          and fechamento.status = 'rascunho'
      )
    )
  order by ajuste.criado_em;
end
$$;

revoke all on function public.rpc_listar_ajustes_fechamento(date) from public, anon;
grant execute on function public.rpc_listar_ajustes_fechamento(date) to authenticated;

create or replace procedure public.sp_fechar_repasses_dia(
  p_data_operacao date,
  p_criado_por uuid,
  p_atendimentos_pendentes uuid[],
  p_observacoes text,
  inout p_fechamento_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_atendimento record;
  v_repasse record;
begin
  if not public.lc_usuario_eh_admin() or p_criado_por <> public.lc_perfil_atual_id() then
    raise exception 'Somente administrador pode fechar repasses' using errcode = '42501';
  end if;
  if p_data_operacao is null or p_data_operacao > current_date then
    raise exception 'Informe uma data de operação válida';
  end if;

  if p_fechamento_id is null then
    insert into public.fechamentos_diarios (
      data_operacao,
      criado_por_perfil_id,
      confirmado_por_perfil_id,
      confirmado_em,
      observacoes,
      status
    ) values (
      p_data_operacao,
      p_criado_por,
      null,
      null,
      nullif(trim(p_observacoes), ''),
      'rascunho'
    )
    returning id into p_fechamento_id;
  elsif not exists (
    select 1
    from public.fechamentos_diarios fechamento
    where fechamento.id = p_fechamento_id
      and fechamento.data_operacao = p_data_operacao
      and fechamento.status = 'rascunho'
  ) then
    raise exception 'Fechamento em elaboração não encontrado';
  end if;

  for v_atendimento in
    select atendimento.id
    from public.atendimentos atendimento
    where atendimento.status = 'entregue'
      and atendimento.entregue_em::date <= p_data_operacao
      and not (
        atendimento.id = any(coalesce(p_atendimentos_pendentes, '{}'::uuid[]))
      )
      and not exists (
        select 1
        from public.itens_fechamento item
        where item.atendimento_id = atendimento.id
          and item.tipo_lancamento = 'repasse'
      )
  loop
    if (
      select coalesce(sum(pagamento.valor), 0)
      from public.pagamentos pagamento
      where pagamento.atendimento_id = v_atendimento.id
    ) <> (
      select atendimento.valor_final
      from public.atendimentos atendimento
      where atendimento.id = v_atendimento.id
    ) then
      raise exception 'Atendimento % possui pagamento inconsistente', v_atendimento.id;
    end if;

    for v_repasse in
      select * from public.fn_calcular_repasse(v_atendimento.id)
    loop
      insert into public.itens_fechamento (
        fechamento_diario_id,
        atendimento_id,
        tipo_destinatario,
        perfil_destinatario_id,
        tipo_lancamento,
        valor
      ) values (
        p_fechamento_id,
        v_atendimento.id,
        v_repasse.tipo_destinatario,
        v_repasse.perfil_destinatario_id,
        'repasse',
        v_repasse.valor_centavos / 100.0
      );
    end loop;
  end loop;
end
$$;

revoke all on procedure public.sp_fechar_repasses_dia(date, uuid, uuid[], text, uuid) from public;

create or replace function public.rpc_fechar_repasses_dia(
  p_data_operacao date,
  p_atendimentos_pendentes uuid[] default '{}'::uuid[],
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_status public.status_fechamento;
  v_perfil uuid := public.lc_perfil_atual_id();
  v_reaberto boolean := false;
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode fechar repasses' using errcode = '42501';
  end if;
  if p_data_operacao is null or p_data_operacao > current_date then
    raise exception 'Informe uma data de operação válida';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lavaclean:fechamento:' || p_data_operacao::text, 0)
  );

  select fechamento.id, fechamento.status
    into v_id, v_status
  from public.fechamentos_diarios fechamento
  where fechamento.data_operacao = p_data_operacao;

  if v_status = 'confirmado' then
    return v_id;
  end if;
  v_reaberto := v_id is not null;

  call public.sp_fechar_repasses_dia(
    p_data_operacao,
    v_perfil,
    p_atendimentos_pendentes,
    p_observacoes,
    v_id
  );

  with ajustes_processados as (
    update public.ajustes_repasse_pendentes ajuste
    set processado_em = now(), fechamento_destino_id = v_id
    where ajuste.processado_em is null
      and (
        ajuste.criado_em::date <= p_data_operacao
        or exists (
          select 1
          from public.itens_fechamento item
          where item.fechamento_diario_id = v_id
            and item.atendimento_id = ajuste.atendimento_id
        )
      )
    returning
      ajuste.atendimento_id,
      ajuste.tipo_destinatario,
      ajuste.perfil_destinatario_id,
      ajuste.valor,
      ajuste.item_origem_id
  )
  insert into public.itens_fechamento (
    fechamento_diario_id,
    atendimento_id,
    tipo_destinatario,
    perfil_destinatario_id,
    tipo_lancamento,
    valor,
    item_origem_id
  )
  select
    v_id,
    ajuste.atendimento_id,
    ajuste.tipo_destinatario,
    ajuste.perfil_destinatario_id,
    'ajuste',
    ajuste.valor,
    ajuste.item_origem_id
  from ajustes_processados ajuste;

  if not exists (
    select 1 from public.itens_fechamento item where item.fechamento_diario_id = v_id
  ) then
    raise exception 'Não há repasses ou ajustes pendentes para confirmar nesta data';
  end if;

  update public.fechamentos_diarios
  set status = 'confirmado',
      confirmado_por_perfil_id = v_perfil,
      confirmado_em = now(),
      observacoes = coalesce(nullif(trim(p_observacoes), ''), observacoes)
  where id = v_id;

  if v_reaberto then
    insert into public.historico_fechamentos (
      fechamento_diario_id,
      acao,
      motivo,
      alterado_por_perfil_id
    ) values (
      v_id,
      'reconfirmado',
      coalesce(nullif(trim(p_observacoes), ''), 'Fechamento reconfirmado após novos lançamentos'),
      v_perfil
    );
  end if;

  return v_id;
end
$$;

revoke all on function public.rpc_fechar_repasses_dia(date, uuid[], text) from public, anon;
grant execute on function public.rpc_fechar_repasses_dia(date, uuid[], text) to authenticated;

alter function public.rpc_avancar_atendimento(
  uuid,
  public.status_atendimento,
  text,
  numeric,
  jsonb
) rename to lc_avancar_atendimento_base;

revoke all on function public.lc_avancar_atendimento_base(
  uuid,
  public.status_atendimento,
  text,
  numeric,
  jsonb
) from public, anon, authenticated;

create function public.rpc_avancar_atendimento(
  p_atendimento_id uuid,
  p_novo_status public.status_atendimento,
  p_motivo text default null,
  p_valor_final numeric default null,
  p_pagamentos jsonb default null,
  p_momento_operacao timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_momento timestamptz := coalesce(p_momento_operacao, clock_timestamp());
  v_chegada timestamptz;
begin
  select atendimento.chegou_em
    into v_chegada
  from public.atendimentos atendimento
  where atendimento.id = p_atendimento_id;

  if v_chegada is null then
    raise exception 'Atendimento não encontrado';
  end if;
  if p_momento_operacao is not null and not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode registrar movimentação retroativa' using errcode = '42501';
  end if;
  if v_momento > clock_timestamp() then
    raise exception 'A movimentação não pode ser registrada no futuro';
  end if;
  if v_momento < v_chegada then
    raise exception 'A movimentação não pode ser anterior à chegada';
  end if;

  perform public.lc_avancar_atendimento_base(
    p_atendimento_id,
    p_novo_status,
    p_motivo,
    p_valor_final,
    p_pagamentos
  );

  if p_momento_operacao is not null then
    update public.atendimentos
    set lavagem_iniciada_em = case
          when p_novo_status = 'em_lavagem' then v_momento
          else lavagem_iniciada_em
        end,
        pronto_em = case
          when p_novo_status = 'pronto_para_retirada' then v_momento
          else pronto_em
        end,
        entregue_em = case
          when p_novo_status = 'entregue' then v_momento
          else entregue_em
        end,
        cancelado_em = case
          when p_novo_status = 'cancelado' then v_momento
          else cancelado_em
        end
    where id = p_atendimento_id;

    update public.historico_status
    set alterado_em = v_momento
    where id = (
      select historico.id
      from public.historico_status historico
      where historico.atendimento_id = p_atendimento_id
        and historico.status_novo = p_novo_status
      order by historico.alterado_em desc
      limit 1
    );
  end if;
end
$$;

revoke all on function public.rpc_avancar_atendimento(
  uuid,
  public.status_atendimento,
  text,
  numeric,
  jsonb,
  timestamptz
) from public, anon;
grant execute on function public.rpc_avancar_atendimento(
  uuid,
  public.status_atendimento,
  text,
  numeric,
  jsonb,
  timestamptz
) to authenticated;
