-- Migration aditiva. Aplicar manualmente depois de revisar no Supabase SQL Editor.
-- Não recria tabelas nem altera dados existentes.

create or replace function public.lc_perfil_atual_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id
  from public.perfis p
  where p.usuario_auth_id = auth.uid()
    and p.ativo
  limit 1
$$;

create or replace function public.lc_usuario_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.papeis_perfil pp
    join public.perfis p on p.id = pp.perfil_id
    where p.usuario_auth_id = auth.uid()
      and p.ativo
      and pp.papel = 'administrador'
  )
$$;

create or replace function public.lc_pode_ver_atendimento(p_atendimento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.lc_usuario_eh_admin()
    or (public.lc_perfil_atual_id() is not null and exists (
      select 1 from public.atendimentos a
      where a.id = p_atendimento_id
        and a.status in ('aguardando', 'em_lavagem', 'pronto_para_retirada')
    ))
    or exists (
      select 1 from public.atendimento_lavadores al
      where al.atendimento_id = p_atendimento_id
        and al.lavador_perfil_id = public.lc_perfil_atual_id()
    )
$$;

revoke all on function public.lc_perfil_atual_id() from public;
revoke all on function public.lc_usuario_eh_admin() from public;
revoke all on function public.lc_pode_ver_atendimento(uuid) from public;
grant execute on function public.lc_perfil_atual_id() to authenticated;
grant execute on function public.lc_usuario_eh_admin() to authenticated;
grant execute on function public.lc_pode_ver_atendimento(uuid) to authenticated;

alter table public.atendimento_lavadores enable row level security;
drop policy if exists lc_atendimento_lavadores_select on public.atendimento_lavadores;
create policy lc_atendimento_lavadores_select on public.atendimento_lavadores
for select to authenticated
using (public.lc_pode_ver_atendimento(atendimento_id));

drop policy if exists lc_atendimento_lavadores_insert on public.atendimento_lavadores;
create policy lc_atendimento_lavadores_insert on public.atendimento_lavadores
for insert to authenticated
with check (
  public.lc_usuario_eh_admin()
  or exists (
    select 1 from public.atendimentos a
    where a.id = atendimento_id
      and a.criado_por_perfil_id = public.lc_perfil_atual_id()
  )
);

create or replace view public.vw_painel_atendimentos
with (security_invoker = true)
as
select
  a.id,
  a.status,
  a.chegou_em,
  a.lavagem_iniciada_em,
  a.pronto_em,
  a.entregue_em,
  a.cancelado_em,
  a.motivo_cancelamento,
  a.valor_final,
  a.valor_empresa_snapshot,
  a.observacoes,
  a.nome_cliente_snapshot,
  a.veiculo_snapshot,
  a.categoria_veiculo_snapshot,
  a.servico_snapshot,
  a.cliente_id,
  a.veiculo_id,
  coalesce((select sum(p.valor) from public.pagamentos p where p.atendimento_id = a.id), 0)::numeric(12,2) as total_pago,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'perfil_id', al.lavador_perfil_id,
        'nome', pf.nome_completo,
        'ordem_rateio', al.ordem_rateio
      ) order by al.ordem_rateio
    )
    from public.atendimento_lavadores al
    join public.perfis pf on pf.id = al.lavador_perfil_id
    where al.atendimento_id = a.id
  ), '[]'::jsonb) as lavadores
from public.atendimentos a;

grant select on public.vw_painel_atendimentos to authenticated;

create or replace function public.fn_calcular_repasse(p_atendimento_id uuid)
returns table (
  tipo_destinatario public.tipo_destinatario,
  perfil_destinatario_id uuid,
  ordem_rateio integer,
  valor_centavos bigint
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
  v_empresa bigint;
  v_restante bigint;
  v_quantidade integer;
begin
  select round(a.valor_final * 100)::bigint, round(a.valor_empresa_snapshot * 100)::bigint
    into v_total, v_empresa
  from public.atendimentos a
  where a.id = p_atendimento_id;

  if v_total is null then raise exception 'Atendimento sem valor final'; end if;
  if v_empresa > v_total then raise exception 'Valor da empresa supera o valor final'; end if;

  select count(*)::integer into v_quantidade
  from public.atendimento_lavadores al
  where al.atendimento_id = p_atendimento_id;
  if v_quantidade = 0 then raise exception 'Atendimento sem lavadores'; end if;

  tipo_destinatario := 'empresa';
  perfil_destinatario_id := null;
  ordem_rateio := 0;
  valor_centavos := v_empresa;
  return next;

  v_restante := v_total - v_empresa;
  return query
  select
    'lavador'::public.tipo_destinatario,
    al.lavador_perfil_id,
    al.ordem_rateio,
    (v_restante / v_quantidade) + case when al.ordem_rateio <= (v_restante % v_quantidade) then 1 else 0 end
  from public.atendimento_lavadores al
  where al.atendimento_id = p_atendimento_id
  order by al.ordem_rateio;
end
$$;

grant execute on function public.fn_calcular_repasse(uuid) to authenticated;

create or replace function public.rpc_criar_atendimento(
  p_servico_id uuid,
  p_lavadores uuid[],
  p_cliente_id uuid default null,
  p_cliente jsonb default null,
  p_veiculo_id uuid default null,
  p_veiculo jsonb default null,
  p_valor_final numeric default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_perfil uuid := public.lc_perfil_atual_id();
  v_cliente_id uuid := p_cliente_id;
  v_veiculo_id uuid := p_veiculo_id;
  v_atendimento_id uuid;
  v_cliente_nome text;
  v_veiculo_nome text;
  v_categoria_nome text;
  v_valor_empresa numeric(12,2);
  v_servico_nome text;
  v_lavador uuid;
  v_ordem integer := 0;
begin
  if v_perfil is null then raise exception 'Perfil ativo não encontrado' using errcode = '42501'; end if;
  if coalesce(array_length(p_lavadores, 1), 0) = 0 then raise exception 'Selecione pelo menos um lavador'; end if;
  if p_valor_final is not null and p_valor_final <= 0 then raise exception 'Valor final inválido'; end if;

  select s.nome into v_servico_nome from public.servicos_lavagem s where s.id = p_servico_id and s.ativo;
  if v_servico_nome is null then raise exception 'Serviço ativo não encontrado'; end if;

  if v_cliente_id is null then
    insert into public.clientes (nome_completo, telefone, observacoes)
    values (trim(p_cliente->>'nome_completo'), trim(p_cliente->>'telefone'), nullif(trim(p_cliente->>'observacoes'), ''))
    returning id, nome_completo into v_cliente_id, v_cliente_nome;
  else
    select c.nome_completo into v_cliente_nome from public.clientes c where c.id = v_cliente_id and c.ativo;
    if v_cliente_nome is null then raise exception 'Cliente ativo não encontrado'; end if;
  end if;

  if v_veiculo_id is null then
    select cv.nome, cv.valor_empresa into v_categoria_nome, v_valor_empresa
    from public.categorias_veiculo cv
    where cv.id = (p_veiculo->>'categoria_veiculo_id')::uuid and cv.ativo;
    if v_categoria_nome is null then raise exception 'Categoria ativa não encontrada'; end if;

    insert into public.veiculos (
      cliente_id, categoria_veiculo_id, marca, modelo, placa, cor, observacoes
    ) values (
      v_cliente_id,
      (p_veiculo->>'categoria_veiculo_id')::uuid,
      trim(p_veiculo->>'marca'),
      trim(p_veiculo->>'modelo'),
      nullif(upper(trim(p_veiculo->>'placa')), ''),
      nullif(trim(p_veiculo->>'cor'), ''),
      nullif(trim(p_veiculo->>'observacoes'), '')
    ) returning id, concat_ws(' ', marca, modelo, nullif(placa, '')) into v_veiculo_id, v_veiculo_nome;
  else
    select concat_ws(' ', v.marca, v.modelo, nullif(v.placa, '')), cv.nome, cv.valor_empresa
      into v_veiculo_nome, v_categoria_nome, v_valor_empresa
    from public.veiculos v
    join public.categorias_veiculo cv on cv.id = v.categoria_veiculo_id
    where v.id = v_veiculo_id and v.cliente_id = v_cliente_id and v.ativo;
    if v_veiculo_nome is null then raise exception 'Veículo ativo não encontrado para o cliente'; end if;
  end if;

  insert into public.atendimentos (
    cliente_id, veiculo_id, servico_id, criado_por_perfil_id, valor_final, observacoes,
    nome_cliente_snapshot, veiculo_snapshot, categoria_veiculo_snapshot, servico_snapshot, valor_empresa_snapshot
  ) values (
    v_cliente_id, v_veiculo_id, p_servico_id, v_perfil, p_valor_final, nullif(trim(p_observacoes), ''),
    v_cliente_nome, v_veiculo_nome, v_categoria_nome, v_servico_nome, v_valor_empresa
  ) returning id into v_atendimento_id;

  foreach v_lavador in array p_lavadores loop
    if not exists (
      select 1 from public.perfis p
      join public.papeis_perfil pp on pp.perfil_id = p.id and pp.papel = 'lavador'
      where p.id = v_lavador and p.ativo
    ) then raise exception 'Lavador ativo inválido'; end if;
    v_ordem := v_ordem + 1;
    insert into public.atendimento_lavadores (atendimento_id, lavador_perfil_id, ordem_rateio)
    values (v_atendimento_id, v_lavador, v_ordem);
  end loop;

  insert into public.historico_status (atendimento_id, status_anterior, status_novo, alterado_por_perfil_id)
  values (v_atendimento_id, null, 'aguardando', v_perfil);
  return v_atendimento_id;
end
$$;

revoke all on function public.rpc_criar_atendimento(uuid, uuid[], uuid, jsonb, uuid, jsonb, numeric, text) from public;
grant execute on function public.rpc_criar_atendimento(uuid, uuid[], uuid, jsonb, uuid, jsonb, numeric, text) to authenticated;

create or replace function public.rpc_definir_participantes(p_atendimento_id uuid, p_lavadores uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_perfil uuid := public.lc_perfil_atual_id();
  v_lavador uuid;
  v_ordem integer := 0;
begin
  if coalesce(array_length(p_lavadores, 1), 0) = 0 then raise exception 'Selecione pelo menos um lavador'; end if;
  if not public.lc_usuario_eh_admin() and not exists (
    select 1 from public.atendimentos a where a.id = p_atendimento_id and a.criado_por_perfil_id = v_perfil and a.status <> 'entregue'
  ) then raise exception 'Sem permissão para corrigir participantes' using errcode = '42501'; end if;

  delete from public.atendimento_lavadores where atendimento_id = p_atendimento_id;
  foreach v_lavador in array p_lavadores loop
    v_ordem := v_ordem + 1;
    insert into public.atendimento_lavadores (atendimento_id, lavador_perfil_id, ordem_rateio)
    values (p_atendimento_id, v_lavador, v_ordem);
  end loop;
  insert into public.historico_alteracoes (atendimento_id, campo_alterado, valor_novo, motivo, alterado_por_perfil_id)
  values (p_atendimento_id, 'lavadores', to_jsonb(p_lavadores), 'Correção de participantes', v_perfil);
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
  v_total_pago numeric(12,2);
  v_pagamento jsonb;
begin
  select status, coalesce(p_valor_final, valor_final) into v_status, v_valor
  from public.atendimentos where id = p_atendimento_id for update;
  if v_status is null or not public.lc_pode_ver_atendimento(p_atendimento_id) then
    raise exception 'Atendimento não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if p_novo_status = 'cancelado' and nullif(trim(p_motivo), '') is null then raise exception 'Informe o motivo do cancelamento'; end if;
  if not (
    (v_status = 'aguardando' and p_novo_status in ('em_lavagem', 'cancelado')) or
    (v_status = 'em_lavagem' and p_novo_status in ('pronto_para_retirada', 'cancelado')) or
    (v_status = 'pronto_para_retirada' and p_novo_status in ('entregue', 'cancelado'))
  ) then raise exception 'Transição de status inválida'; end if;

  if p_pagamentos is not null then
    delete from public.pagamentos where atendimento_id = p_atendimento_id;
    for v_pagamento in select * from jsonb_array_elements(p_pagamentos) loop
      insert into public.pagamentos (atendimento_id, forma_pagamento, valor, recebido_por_perfil_id)
      values (
        p_atendimento_id,
        (v_pagamento->>'forma_pagamento')::public.forma_pagamento,
        (v_pagamento->>'valor_centavos')::bigint / 100.0,
        v_perfil
      );
    end loop;
  end if;

  if p_novo_status = 'entregue' then
    if v_valor is null then raise exception 'Informe o valor final antes da entrega'; end if;
    if not exists (select 1 from public.atendimento_lavadores where atendimento_id = p_atendimento_id) then
      raise exception 'Vincule pelo menos um lavador antes da entrega';
    end if;
    select coalesce(sum(valor), 0) into v_total_pago from public.pagamentos where atendimento_id = p_atendimento_id;
    if v_total_pago <> v_valor then raise exception 'A soma dos pagamentos deve ser igual ao valor final'; end if;
  end if;

  update public.atendimentos set
    status = p_novo_status,
    valor_final = v_valor,
    lavagem_iniciada_em = case when p_novo_status = 'em_lavagem' then now() else lavagem_iniciada_em end,
    pronto_em = case when p_novo_status = 'pronto_para_retirada' then now() else pronto_em end,
    entregue_em = case when p_novo_status = 'entregue' then now() else entregue_em end,
    cancelado_em = case when p_novo_status = 'cancelado' then now() else cancelado_em end,
    motivo_cancelamento = case when p_novo_status = 'cancelado' then trim(p_motivo) else motivo_cancelamento end
  where id = p_atendimento_id;

  insert into public.historico_status (atendimento_id, status_anterior, status_novo, motivo, alterado_por_perfil_id)
  values (p_atendimento_id, v_status, p_novo_status, nullif(trim(p_motivo), ''), v_perfil);
end
$$;

revoke all on function public.rpc_avancar_atendimento(uuid, public.status_atendimento, text, numeric, jsonb) from public;
grant execute on function public.rpc_avancar_atendimento(uuid, public.status_atendimento, text, numeric, jsonb) to authenticated;

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
  insert into public.fechamentos_diarios (data_operacao, criado_por_perfil_id, confirmado_por_perfil_id, confirmado_em, observacoes, status)
  values (p_data_operacao, p_criado_por, p_criado_por, now(), nullif(trim(p_observacoes), ''), 'confirmado')
  returning id into p_fechamento_id;

  for v_atendimento in
    select a.id
    from public.atendimentos a
    where a.status = 'entregue'
      and a.entregue_em::date = p_data_operacao
      and not (a.id = any(coalesce(p_atendimentos_pendentes, '{}'::uuid[])))
      and not exists (select 1 from public.itens_fechamento i where i.atendimento_id = a.id and i.tipo_lancamento = 'repasse')
  loop
    if (select coalesce(sum(p.valor), 0) from public.pagamentos p where p.atendimento_id = v_atendimento.id)
       <> (select a.valor_final from public.atendimentos a where a.id = v_atendimento.id) then
      raise exception 'Atendimento % possui pagamento inconsistente', v_atendimento.id;
    end if;
    for v_repasse in select * from public.fn_calcular_repasse(v_atendimento.id) loop
      insert into public.itens_fechamento (
        fechamento_diario_id, atendimento_id, tipo_destinatario, perfil_destinatario_id, tipo_lancamento, valor
      ) values (
        p_fechamento_id, v_atendimento.id, v_repasse.tipo_destinatario, v_repasse.perfil_destinatario_id,
        'repasse', v_repasse.valor_centavos / 100.0
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
declare v_id uuid;
begin
  call public.sp_fechar_repasses_dia(
    p_data_operacao,
    public.lc_perfil_atual_id(),
    p_atendimentos_pendentes,
    p_observacoes,
    v_id
  );
  return v_id;
end
$$;

grant execute on function public.rpc_fechar_repasses_dia(date, uuid[], text) to authenticated;

create or replace function public.lc_bloquear_fechamento_confirmado()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'confirmado' then raise exception 'Fechamento confirmado é imutável'; end if;
  return new;
end
$$;

drop trigger if exists trg_lc_fechamento_confirmado_imutavel on public.fechamentos_diarios;
create trigger trg_lc_fechamento_confirmado_imutavel
before update or delete on public.fechamentos_diarios
for each row execute function public.lc_bloquear_fechamento_confirmado();
