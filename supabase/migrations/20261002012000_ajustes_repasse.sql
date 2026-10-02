-- Mantém fechamentos confirmados imutáveis e leva diferenças auditadas ao próximo fechamento.

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

alter table public.ajustes_repasse_pendentes enable row level security;
drop policy if exists lc_ajustes_admin on public.ajustes_repasse_pendentes;
create policy lc_ajustes_admin on public.ajustes_repasse_pendentes for select to authenticated
using (public.lc_usuario_eh_admin());

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
  v_perfil uuid := public.lc_perfil_atual_id();
  v_ja_fechado boolean;
begin
  if not public.lc_usuario_eh_admin() then raise exception 'Somente administrador pode corrigir atendimento entregue' using errcode = '42501'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo da correção'; end if;
  if p_valor_final <= 0 then raise exception 'Valor final inválido'; end if;
  select jsonb_build_object(
    'valor_final', a.valor_final,
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('forma_pagamento', p.forma_pagamento, 'valor', p.valor)) from public.pagamentos p where p.atendimento_id = a.id), '[]'::jsonb)
  ) into v_anterior from public.atendimentos a where a.id = p_atendimento_id and a.status = 'entregue' for update;
  if v_anterior is null then raise exception 'Atendimento entregue não encontrado'; end if;
  for v_pagamento in select * from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) loop
    v_total := v_total + (v_pagamento->>'valor_centavos')::bigint / 100.0;
  end loop;
  if v_total <> p_valor_final then raise exception 'A soma dos pagamentos deve ser igual ao valor final'; end if;
  select exists (select 1 from public.itens_fechamento where atendimento_id = p_atendimento_id and tipo_lancamento = 'repasse') into v_ja_fechado;
  delete from public.pagamentos where atendimento_id = p_atendimento_id;
  for v_pagamento in select * from jsonb_array_elements(p_pagamentos) loop
    insert into public.pagamentos (atendimento_id, forma_pagamento, valor, recebido_por_perfil_id)
    values (p_atendimento_id, (v_pagamento->>'forma_pagamento')::public.forma_pagamento, (v_pagamento->>'valor_centavos')::bigint / 100.0, v_perfil);
  end loop;
  update public.atendimentos set valor_final = p_valor_final where id = p_atendimento_id;
  insert into public.historico_alteracoes (atendimento_id, campo_alterado, valor_anterior, valor_novo, motivo, alterado_por_perfil_id)
  values (p_atendimento_id, 'valor_final_pagamentos', v_anterior, jsonb_build_object('valor_final', p_valor_final, 'pagamentos', p_pagamentos), trim(p_motivo), v_perfil);

  if v_ja_fechado then
    insert into public.ajustes_repasse_pendentes (
      atendimento_id, item_origem_id, tipo_destinatario, perfil_destinatario_id, valor, motivo, criado_por_perfil_id
    )
    select p_atendimento_id, antigo.item_origem_id,
      coalesce(novo.tipo_destinatario, antigo.tipo_destinatario),
      coalesce(novo.perfil_destinatario_id, antigo.perfil_destinatario_id),
      (coalesce(novo.valor_centavos, 0) - coalesce(antigo.valor_centavos, 0)) / 100.0,
      trim(p_motivo), v_perfil
    from (
      select i.tipo_destinatario, i.perfil_destinatario_id, sum(round(i.valor * 100))::bigint valor_centavos, (array_agg(i.id order by i.criado_em))[1] item_origem_id
      from public.itens_fechamento i where i.atendimento_id = p_atendimento_id and i.tipo_lancamento = 'repasse'
      group by i.tipo_destinatario, i.perfil_destinatario_id
    ) antigo
    full join (select * from public.fn_calcular_repasse(p_atendimento_id)) novo
      on novo.tipo_destinatario = antigo.tipo_destinatario
      and novo.perfil_destinatario_id is not distinct from antigo.perfil_destinatario_id
    where coalesce(novo.valor_centavos, 0) <> coalesce(antigo.valor_centavos, 0);
  end if;
end
$$;

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
  call public.sp_fechar_repasses_dia(p_data_operacao, public.lc_perfil_atual_id(), p_atendimentos_pendentes, p_observacoes, v_id);
  insert into public.itens_fechamento (
    fechamento_diario_id, atendimento_id, tipo_destinatario, perfil_destinatario_id, tipo_lancamento, valor, item_origem_id
  )
  select v_id, a.atendimento_id, a.tipo_destinatario, a.perfil_destinatario_id, 'ajuste', a.valor, a.item_origem_id
  from public.ajustes_repasse_pendentes a where a.processado_em is null;
  update public.ajustes_repasse_pendentes set processado_em = now(), fechamento_destino_id = v_id where processado_em is null;
  return v_id;
end
$$;
revoke all on function public.rpc_fechar_repasses_dia(date, uuid[], text) from public;
grant execute on function public.rpc_fechar_repasses_dia(date, uuid[], text) to authenticated;

create or replace function public.lc_bloquear_item_fechamento_confirmado()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.fechamentos_diarios f where f.id = old.fechamento_diario_id and f.status = 'confirmado') then
    raise exception 'Lançamento de fechamento confirmado é imutável';
  end if;
  return old;
end
$$;
drop trigger if exists trg_lc_item_fechamento_imutavel on public.itens_fechamento;
create trigger trg_lc_item_fechamento_imutavel before update or delete on public.itens_fechamento
for each row execute function public.lc_bloquear_item_fechamento_confirmado();
