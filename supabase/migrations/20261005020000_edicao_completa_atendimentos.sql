-- Exibe pagamentos na central e permite ao administrador corrigir qualquer etapa com auditoria.
-- Migration aditiva: não reaplicar migrations anteriores no Supabase Cloud.

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
  ), '[]'::jsonb) as lavadores,
  a.agendado_para,
  a.servico_id,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'forma_pagamento', p.forma_pagamento,
        'valor', p.valor
      ) order by p.pago_em, p.id
    )
    from public.pagamentos p
    where p.atendimento_id = a.id
  ), '[]'::jsonb) as pagamentos
from public.atendimentos a;

grant select on public.vw_painel_atendimentos to authenticated;

create or replace function public.rpc_editar_atendimento(
  p_atendimento_id uuid,
  p_cliente_id uuid,
  p_veiculo_id uuid,
  p_servico_id uuid,
  p_lavadores uuid[],
  p_chegou_em timestamptz,
  p_valor_final numeric,
  p_observacoes text,
  p_pagamentos jsonb,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_perfil uuid := public.lc_perfil_atual_id();
  v_atendimento public.atendimentos%rowtype;
  v_cliente_nome text;
  v_veiculo_nome text;
  v_categoria_nome text;
  v_valor_empresa numeric(12,2);
  v_servico_nome text;
  v_lavador uuid;
  v_ordem integer := 0;
  v_anterior jsonb;
  v_novo jsonb;
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode editar atendimentos' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da edição';
  end if;
  if p_chegou_em is null then
    raise exception 'Informe a data e o horário do atendimento';
  end if;
  if p_valor_final is not null and p_valor_final <= 0 then
    raise exception 'Informe um valor final maior que zero';
  end if;
  if coalesce(cardinality(p_lavadores), 0) = 0 then
    raise exception 'Selecione pelo menos um lavador';
  end if;
  if cardinality(p_lavadores) <> (
    select count(distinct lavador_id)
    from unnest(p_lavadores) as lavadores(lavador_id)
  ) then
    raise exception 'Não repita o mesmo lavador';
  end if;

  select atendimento.*
    into v_atendimento
  from public.atendimentos atendimento
  where atendimento.id = p_atendimento_id
  for update;

  if v_atendimento.id is null then
    raise exception 'Atendimento não encontrado';
  end if;
  if v_atendimento.status <> 'aguardando' and p_chegou_em > clock_timestamp() then
    raise exception 'Somente um atendimento aguardando pode ter horário futuro';
  end if;
  if v_atendimento.status = 'entregue' and p_valor_final is null then
    raise exception 'Atendimento concluído precisa ter valor final';
  end if;

  select cliente.nome_completo
    into v_cliente_nome
  from public.clientes cliente
  where cliente.id = p_cliente_id;
  if v_cliente_nome is null then raise exception 'Cliente não encontrado'; end if;

  select
    concat_ws(' ', veiculo.marca, veiculo.modelo, nullif(veiculo.placa, '')),
    categoria.nome,
    categoria.valor_empresa
    into v_veiculo_nome, v_categoria_nome, v_valor_empresa
  from public.veiculos veiculo
  join public.categorias_veiculo categoria on categoria.id = veiculo.categoria_veiculo_id
  where veiculo.id = p_veiculo_id
    and veiculo.cliente_id = p_cliente_id;
  if v_veiculo_nome is null then raise exception 'Veículo não encontrado para o cliente'; end if;

  select servico.nome
    into v_servico_nome
  from public.servicos_lavagem servico
  where servico.id = p_servico_id;
  if v_servico_nome is null then raise exception 'Serviço não encontrado'; end if;

  foreach v_lavador in array p_lavadores loop
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

  v_anterior := jsonb_build_object(
    'cliente_id', v_atendimento.cliente_id,
    'veiculo_id', v_atendimento.veiculo_id,
    'servico_id', v_atendimento.servico_id,
    'chegou_em', v_atendimento.chegou_em,
    'valor_final', v_atendimento.valor_final,
    'observacoes', v_atendimento.observacoes,
    'lavadores', coalesce((
      select jsonb_agg(al.lavador_perfil_id order by al.ordem_rateio)
      from public.atendimento_lavadores al
      where al.atendimento_id = p_atendimento_id
    ), '[]'::jsonb),
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object('forma_pagamento', p.forma_pagamento, 'valor', p.valor))
      from public.pagamentos p
      where p.atendimento_id = p_atendimento_id
    ), '[]'::jsonb)
  );

  update public.atendimentos
  set
    cliente_id = p_cliente_id,
    veiculo_id = p_veiculo_id,
    servico_id = p_servico_id,
    chegou_em = p_chegou_em,
    agendado_para = case
      when v_atendimento.status = 'aguardando' and p_chegou_em > clock_timestamp() then p_chegou_em
      else null
    end,
    valor_final = case when v_atendimento.status = 'entregue' then valor_final else p_valor_final end,
    observacoes = nullif(trim(p_observacoes), ''),
    nome_cliente_snapshot = v_cliente_nome,
    veiculo_snapshot = v_veiculo_nome,
    categoria_veiculo_snapshot = v_categoria_nome,
    servico_snapshot = v_servico_nome,
    valor_empresa_snapshot = v_valor_empresa
  where id = p_atendimento_id;

  delete from public.atendimento_lavadores where atendimento_id = p_atendimento_id;
  foreach v_lavador in array p_lavadores loop
    v_ordem := v_ordem + 1;
    insert into public.atendimento_lavadores (atendimento_id, lavador_perfil_id, ordem_rateio)
    values (p_atendimento_id, v_lavador, v_ordem);
  end loop;

  if v_atendimento.status = 'entregue' then
    perform public.rpc_corrigir_atendimento_entregue(
      p_atendimento_id,
      p_valor_final,
      p_pagamentos,
      trim(p_motivo)
    );
  elsif p_pagamentos is not null
        and jsonb_typeof(p_pagamentos) = 'array'
        and jsonb_array_length(p_pagamentos) > 0 then
    raise exception 'Pagamentos só podem ser editados em atendimento concluído';
  end if;

  v_novo := jsonb_build_object(
    'cliente_id', p_cliente_id,
    'veiculo_id', p_veiculo_id,
    'servico_id', p_servico_id,
    'chegou_em', p_chegou_em,
    'valor_final', p_valor_final,
    'observacoes', nullif(trim(p_observacoes), ''),
    'lavadores', to_jsonb(p_lavadores),
    'pagamentos', coalesce(p_pagamentos, '[]'::jsonb)
  );

  insert into public.historico_alteracoes (
    atendimento_id,
    campo_alterado,
    valor_anterior,
    valor_novo,
    motivo,
    alterado_por_perfil_id
  ) values (
    p_atendimento_id,
    'edicao_completa',
    v_anterior,
    v_novo,
    trim(p_motivo),
    v_perfil
  );
end
$$;

revoke all on function public.rpc_editar_atendimento(
  uuid, uuid, uuid, uuid, uuid[], timestamptz, numeric, text, jsonb, text
) from public, anon;
grant execute on function public.rpc_editar_atendimento(
  uuid, uuid, uuid, uuid, uuid[], timestamptz, numeric, text, jsonb, text
) to authenticated;
