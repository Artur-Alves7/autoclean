-- Corrige fechamento duplicado, preserva lançamentos confirmados e permite carregar pendências.
-- Migration aditiva: não reaplicar migrations anteriores no Supabase Cloud.

create or replace function public.rpc_listar_atendimentos_fechamento(p_data_operacao date)
returns setof public.vw_painel_atendimentos
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode revisar o fechamento' using errcode = '42501';
  end if;
  if p_data_operacao is null or p_data_operacao > current_date then
    raise exception 'Informe uma data de operação válida';
  end if;

  return query
  select painel.*
  from public.vw_painel_atendimentos painel
  where painel.status = 'entregue'
    and painel.entregue_em::date <= p_data_operacao
    and not exists (
      select 1
      from public.itens_fechamento item
      where item.atendimento_id = painel.id
        and item.tipo_lancamento = 'repasse'
    )
  order by painel.entregue_em;
end
$$;

revoke all on function public.rpc_listar_atendimentos_fechamento(date) from public;
grant execute on function public.rpc_listar_atendimentos_fechamento(date) to authenticated;

create or replace function public.rpc_corrigir_atendimento_entregue(
  p_atendimento_id uuid,
  p_valor_final numeric,
  p_pagamentos jsonb,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_anterior jsonb;
  v_pagamento jsonb;
  v_total numeric(12,2) := 0;
  v_valor_pagamento_centavos bigint;
  v_perfil uuid := public.lc_perfil_atual_id();
  v_ja_fechado boolean;
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode corrigir atendimento entregue' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da correção';
  end if;
  if p_valor_final <= 0 then
    raise exception 'Valor final inválido';
  end if;

  select jsonb_build_object(
    'valor_final', atendimento.valor_final,
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'forma_pagamento', pagamento.forma_pagamento,
        'valor', pagamento.valor
      ))
      from public.pagamentos pagamento
      where pagamento.atendimento_id = atendimento.id
    ), '[]'::jsonb)
  )
  into v_anterior
  from public.atendimentos atendimento
  where atendimento.id = p_atendimento_id
    and atendimento.status = 'entregue'
  for update;

  if v_anterior is null then
    raise exception 'Atendimento entregue não encontrado';
  end if;

  for v_pagamento in
    select * from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb))
  loop
    v_valor_pagamento_centavos := (v_pagamento->>'valor_centavos')::bigint;
    if v_valor_pagamento_centavos <= 0 then
      raise exception 'Valor de pagamento inválido';
    end if;
    v_total := v_total + v_valor_pagamento_centavos / 100.0;
  end loop;

  if v_total <> p_valor_final then
    raise exception 'A soma dos pagamentos deve ser igual ao valor final';
  end if;

  select exists (
    select 1
    from public.itens_fechamento item
    where item.atendimento_id = p_atendimento_id
      and item.tipo_lancamento = 'repasse'
  ) into v_ja_fechado;

  delete from public.pagamentos where atendimento_id = p_atendimento_id;
  for v_pagamento in select * from jsonb_array_elements(p_pagamentos)
  loop
    insert into public.pagamentos (
      atendimento_id,
      forma_pagamento,
      valor,
      recebido_por_perfil_id
    ) values (
      p_atendimento_id,
      (v_pagamento->>'forma_pagamento')::public.forma_pagamento,
      (v_pagamento->>'valor_centavos')::bigint / 100.0,
      v_perfil
    );
  end loop;

  update public.atendimentos
  set valor_final = p_valor_final
  where id = p_atendimento_id;

  insert into public.historico_alteracoes (
    atendimento_id,
    campo_alterado,
    valor_anterior,
    valor_novo,
    motivo,
    alterado_por_perfil_id
  ) values (
    p_atendimento_id,
    'valor_final_pagamentos',
    v_anterior,
    jsonb_build_object('valor_final', p_valor_final, 'pagamentos', p_pagamentos),
    trim(p_motivo),
    v_perfil
  );

  if v_ja_fechado then
    with movimentos_anteriores as (
      select
        item.tipo_destinatario,
        item.perfil_destinatario_id,
        round(item.valor * 100)::bigint as valor_centavos,
        coalesce(item.item_origem_id, item.id) as item_origem_id
      from public.itens_fechamento item
      where item.atendimento_id = p_atendimento_id

      union all

      select
        ajuste.tipo_destinatario,
        ajuste.perfil_destinatario_id,
        round(ajuste.valor * 100)::bigint as valor_centavos,
        ajuste.item_origem_id
      from public.ajustes_repasse_pendentes ajuste
      where ajuste.atendimento_id = p_atendimento_id
        and ajuste.processado_em is null
    ), distribuicao_anterior as (
      select
        movimento.tipo_destinatario,
        movimento.perfil_destinatario_id,
        sum(movimento.valor_centavos)::bigint as valor_centavos,
        (array_remove(array_agg(movimento.item_origem_id), null))[1] as item_origem_id
      from movimentos_anteriores movimento
      group by movimento.tipo_destinatario, movimento.perfil_destinatario_id
    )
    insert into public.ajustes_repasse_pendentes (
      atendimento_id,
      item_origem_id,
      tipo_destinatario,
      perfil_destinatario_id,
      valor,
      motivo,
      criado_por_perfil_id
    )
    select
      p_atendimento_id,
      anterior.item_origem_id,
      coalesce(novo.tipo_destinatario, anterior.tipo_destinatario),
      coalesce(novo.perfil_destinatario_id, anterior.perfil_destinatario_id),
      (coalesce(novo.valor_centavos, 0) - coalesce(anterior.valor_centavos, 0)) / 100.0,
      trim(p_motivo),
      v_perfil
    from distribuicao_anterior anterior
    full join (select * from public.fn_calcular_repasse(p_atendimento_id)) novo
      on novo.tipo_destinatario = anterior.tipo_destinatario
      and novo.perfil_destinatario_id is not distinct from anterior.perfil_destinatario_id
    where coalesce(novo.valor_centavos, 0) <> coalesce(anterior.valor_centavos, 0);
  end if;
end
$$;

revoke all on function public.rpc_corrigir_atendimento_entregue(uuid, numeric, jsonb, text) from public;
grant execute on function public.rpc_corrigir_atendimento_entregue(uuid, numeric, jsonb, text) to authenticated;

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

  if v_id is not null then
    if v_status = 'confirmado' then
      return v_id;
    end if;
    raise exception 'Já existe um fechamento em elaboração para esta data';
  end if;

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
      and ajuste.criado_em::date <= p_data_operacao
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
      confirmado_em = now()
  where id = v_id;

  return v_id;
end
$$;

revoke all on function public.rpc_fechar_repasses_dia(date, uuid[], text) from public;
grant execute on function public.rpc_fechar_repasses_dia(date, uuid[], text) to authenticated;

create or replace function public.lc_bloquear_item_fechamento_confirmado()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_fechamento_id uuid;
begin
  if tg_op = 'INSERT' then
    v_fechamento_id := new.fechamento_diario_id;
  else
    v_fechamento_id := old.fechamento_diario_id;
  end if;

  if exists (
    select 1
    from public.fechamentos_diarios fechamento
    where fechamento.id = v_fechamento_id
      and fechamento.status = 'confirmado'
  ) then
    raise exception 'Lançamento de fechamento confirmado é imutável';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists trg_lc_item_fechamento_imutavel on public.itens_fechamento;
create trigger trg_lc_item_fechamento_imutavel
before insert or update or delete on public.itens_fechamento
for each row execute function public.lc_bloquear_item_fechamento_confirmado();
