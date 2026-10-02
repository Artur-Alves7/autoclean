-- Reforça as permissões operacionais e validações de pagamento.
-- Migration aditiva: não reaplicar migrations anteriores no Supabase Cloud.

drop policy if exists lc_atendimento_lavadores_insert on public.atendimento_lavadores;
revoke insert, update, delete on public.atendimento_lavadores from authenticated;

create or replace function public.rpc_definir_participantes(
  p_atendimento_id uuid,
  p_lavadores uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_perfil uuid := public.lc_perfil_atual_id();
  v_status public.status_atendimento;
  v_lavador uuid;
  v_ordem integer := 0;
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode corrigir participantes' using errcode = '42501';
  end if;
  if coalesce(array_length(p_lavadores, 1), 0) = 0 then
    raise exception 'Selecione pelo menos um lavador';
  end if;
  if cardinality(p_lavadores) <> (
    select count(distinct lavador_id)
    from unnest(p_lavadores) as lavadores(lavador_id)
  ) then
    raise exception 'Não repita o mesmo lavador';
  end if;

  select atendimento.status
    into v_status
  from public.atendimentos atendimento
  where atendimento.id = p_atendimento_id
  for update;

  if v_status is null then
    raise exception 'Atendimento não encontrado';
  end if;
  if v_status not in ('aguardando', 'em_lavagem', 'pronto_para_retirada') then
    raise exception 'Participantes só podem ser corrigidos em atendimento ativo';
  end if;

  foreach v_lavador in array p_lavadores
  loop
    if not exists (
      select 1
      from public.perfis perfil
      join public.papeis_perfil papel
        on papel.perfil_id = perfil.id
       and papel.papel = 'lavador'
      where perfil.id = v_lavador
        and perfil.ativo
    ) then
      raise exception 'Lavador ativo inválido';
    end if;
  end loop;

  delete from public.atendimento_lavadores
  where atendimento_id = p_atendimento_id;

  foreach v_lavador in array p_lavadores
  loop
    v_ordem := v_ordem + 1;
    insert into public.atendimento_lavadores (
      atendimento_id,
      lavador_perfil_id,
      ordem_rateio
    ) values (
      p_atendimento_id,
      v_lavador,
      v_ordem
    );
  end loop;

  insert into public.historico_alteracoes (
    atendimento_id,
    campo_alterado,
    valor_novo,
    motivo,
    alterado_por_perfil_id
  ) values (
    p_atendimento_id,
    'lavadores',
    to_jsonb(p_lavadores),
    'Correção de participantes',
    v_perfil
  );
end
$$;

revoke all on function public.rpc_definir_participantes(uuid, uuid[]) from public;
grant execute on function public.rpc_definir_participantes(uuid, uuid[]) to authenticated;

create or replace function public.rpc_avancar_atendimento(
  p_atendimento_id uuid,
  p_novo_status public.status_atendimento,
  p_motivo text default null,
  p_valor_final numeric default null,
  p_pagamentos jsonb default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_perfil uuid := public.lc_perfil_atual_id();
  v_status public.status_atendimento;
  v_valor numeric(12,2);
  v_total_pago_centavos bigint := 0;
  v_valor_pagamento_centavos bigint;
  v_pagamento jsonb;
begin
  select atendimento.status, coalesce(p_valor_final, atendimento.valor_final)
    into v_status, v_valor
  from public.atendimentos atendimento
  where atendimento.id = p_atendimento_id
  for update;

  if v_status is null or not public.lc_pode_ver_atendimento(p_atendimento_id) then
    raise exception 'Atendimento não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if p_novo_status <> 'entregue' and (p_valor_final is not null or p_pagamentos is not null) then
    raise exception 'Valor final e pagamentos só podem ser informados na entrega';
  end if;
  if p_novo_status = 'cancelado' and length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento';
  end if;
  if not (
    (v_status = 'aguardando' and p_novo_status in ('em_lavagem', 'cancelado')) or
    (v_status = 'em_lavagem' and p_novo_status in ('pronto_para_retirada', 'cancelado')) or
    (v_status = 'pronto_para_retirada' and p_novo_status in ('entregue', 'cancelado'))
  ) then
    raise exception 'Transição de status inválida';
  end if;

  if p_novo_status = 'entregue' then
    if v_valor is null or v_valor <= 0 then
      raise exception 'Informe um valor final maior que zero antes da entrega';
    end if;
    if not exists (
      select 1
      from public.atendimento_lavadores
      where atendimento_id = p_atendimento_id
    ) then
      raise exception 'Vincule pelo menos um lavador antes da entrega';
    end if;
    if p_pagamentos is null
       or jsonb_typeof(p_pagamentos) <> 'array'
       or jsonb_array_length(p_pagamentos) = 0 then
      raise exception 'Informe pelo menos uma forma de pagamento';
    end if;

    for v_pagamento in select * from jsonb_array_elements(p_pagamentos)
    loop
      v_valor_pagamento_centavos := (v_pagamento->>'valor_centavos')::bigint;
      if v_valor_pagamento_centavos is null or v_valor_pagamento_centavos <= 0 then
        raise exception 'Valor de pagamento inválido';
      end if;
      if nullif(trim(v_pagamento->>'forma_pagamento'), '') is null then
        raise exception 'Forma de pagamento inválida';
      end if;
      perform (v_pagamento->>'forma_pagamento')::public.forma_pagamento;
      v_total_pago_centavos := v_total_pago_centavos + v_valor_pagamento_centavos;
    end loop;

    if v_total_pago_centavos <> round(v_valor * 100)::bigint then
      raise exception 'A soma dos pagamentos deve ser igual ao valor final';
    end if;

    delete from public.pagamentos
    where atendimento_id = p_atendimento_id;

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
  end if;

  update public.atendimentos
  set status = p_novo_status,
      valor_final = v_valor,
      lavagem_iniciada_em = case
        when p_novo_status = 'em_lavagem' then now()
        else lavagem_iniciada_em
      end,
      pronto_em = case
        when p_novo_status = 'pronto_para_retirada' then now()
        else pronto_em
      end,
      entregue_em = case
        when p_novo_status = 'entregue' then now()
        else entregue_em
      end,
      cancelado_em = case
        when p_novo_status = 'cancelado' then now()
        else cancelado_em
      end,
      motivo_cancelamento = case
        when p_novo_status = 'cancelado' then trim(p_motivo)
        else motivo_cancelamento
      end
  where id = p_atendimento_id;

  insert into public.historico_status (
    atendimento_id,
    status_anterior,
    status_novo,
    motivo,
    alterado_por_perfil_id
  ) values (
    p_atendimento_id,
    v_status,
    p_novo_status,
    nullif(trim(p_motivo), ''),
    v_perfil
  );
end
$$;

revoke all on function public.rpc_avancar_atendimento(
  uuid,
  public.status_atendimento,
  text,
  numeric,
  jsonb
) from public;
grant execute on function public.rpc_avancar_atendimento(
  uuid,
  public.status_atendimento,
  text,
  numeric,
  jsonb
) to authenticated;

revoke all on function public.fn_calcular_repasse(uuid) from public;
grant execute on function public.fn_calcular_repasse(uuid) to authenticated;
