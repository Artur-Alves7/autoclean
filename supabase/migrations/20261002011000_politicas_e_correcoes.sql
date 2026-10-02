-- Políticas e rotinas complementares. Aplicar somente após 20261002010000.
-- A migração é aditiva e não remove dados nem objetos de negócio existentes.

alter table public.perfis enable row level security;
alter table public.papeis_perfil enable row level security;
alter table public.clientes enable row level security;
alter table public.veiculos enable row level security;
alter table public.categorias_veiculo enable row level security;
alter table public.servicos_lavagem enable row level security;
alter table public.atendimentos enable row level security;
alter table public.pagamentos enable row level security;
alter table public.historico_status enable row level security;
alter table public.historico_alteracoes enable row level security;
alter table public.fechamentos_diarios enable row level security;
alter table public.itens_fechamento enable row level security;

drop policy if exists lc_perfis_select on public.perfis;
create policy lc_perfis_select on public.perfis for select to authenticated
using ((public.lc_perfil_atual_id() is not null and ativo) or public.lc_usuario_eh_admin() or id = public.lc_perfil_atual_id());
drop policy if exists lc_perfis_admin on public.perfis;
create policy lc_perfis_admin on public.perfis for all to authenticated
using (public.lc_usuario_eh_admin()) with check (public.lc_usuario_eh_admin());

drop policy if exists lc_papeis_select on public.papeis_perfil;
create policy lc_papeis_select on public.papeis_perfil for select to authenticated
using (public.lc_perfil_atual_id() is not null);
drop policy if exists lc_papeis_admin on public.papeis_perfil;
create policy lc_papeis_admin on public.papeis_perfil for all to authenticated
using (public.lc_usuario_eh_admin()) with check (public.lc_usuario_eh_admin());

drop policy if exists lc_clientes_operacao on public.clientes;
create policy lc_clientes_operacao on public.clientes for select to authenticated
using (public.lc_perfil_atual_id() is not null);
drop policy if exists lc_clientes_admin_escrita on public.clientes;
create policy lc_clientes_admin_escrita on public.clientes for update to authenticated
using (public.lc_usuario_eh_admin()) with check (public.lc_usuario_eh_admin());

drop policy if exists lc_veiculos_operacao on public.veiculos;
create policy lc_veiculos_operacao on public.veiculos for select to authenticated
using (public.lc_perfil_atual_id() is not null);
drop policy if exists lc_veiculos_admin_escrita on public.veiculos;
create policy lc_veiculos_admin_escrita on public.veiculos for update to authenticated
using (public.lc_usuario_eh_admin()) with check (public.lc_usuario_eh_admin());

drop policy if exists lc_categorias_leitura on public.categorias_veiculo;
create policy lc_categorias_leitura on public.categorias_veiculo for select to authenticated
using (public.lc_perfil_atual_id() is not null);
drop policy if exists lc_categorias_admin on public.categorias_veiculo;
create policy lc_categorias_admin on public.categorias_veiculo for all to authenticated
using (public.lc_usuario_eh_admin()) with check (public.lc_usuario_eh_admin());

drop policy if exists lc_servicos_leitura on public.servicos_lavagem;
create policy lc_servicos_leitura on public.servicos_lavagem for select to authenticated
using (public.lc_perfil_atual_id() is not null);
drop policy if exists lc_servicos_admin on public.servicos_lavagem;
create policy lc_servicos_admin on public.servicos_lavagem for all to authenticated
using (public.lc_usuario_eh_admin()) with check (public.lc_usuario_eh_admin());

drop policy if exists lc_atendimentos_select on public.atendimentos;
create policy lc_atendimentos_select on public.atendimentos for select to authenticated
using (public.lc_pode_ver_atendimento(id));

drop policy if exists lc_pagamentos_select on public.pagamentos;
create policy lc_pagamentos_select on public.pagamentos for select to authenticated
using (public.lc_pode_ver_atendimento(atendimento_id));

drop policy if exists lc_historico_status_select on public.historico_status;
create policy lc_historico_status_select on public.historico_status for select to authenticated
using (public.lc_pode_ver_atendimento(atendimento_id));
drop policy if exists lc_historico_alteracoes_select on public.historico_alteracoes;
create policy lc_historico_alteracoes_select on public.historico_alteracoes for select to authenticated
using (public.lc_pode_ver_atendimento(atendimento_id));

drop policy if exists lc_fechamentos_select on public.fechamentos_diarios;
create policy lc_fechamentos_select on public.fechamentos_diarios for select to authenticated
using (
  public.lc_usuario_eh_admin()
  or exists (
    select 1 from public.itens_fechamento i
    where i.fechamento_diario_id = id
      and i.perfil_destinatario_id = public.lc_perfil_atual_id()
  )
);
drop policy if exists lc_itens_fechamento_select on public.itens_fechamento;
create policy lc_itens_fechamento_select on public.itens_fechamento for select to authenticated
using (public.lc_usuario_eh_admin() or perfil_destinatario_id = public.lc_perfil_atual_id());

create or replace function public.rpc_atualizar_perfil_usuario(
  p_perfil_id uuid,
  p_ativo boolean,
  p_papel public.papel_usuario
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode alterar usuários' using errcode = '42501';
  end if;
  if p_perfil_id = public.lc_perfil_atual_id() and not p_ativo then
    raise exception 'Você não pode desativar o próprio perfil';
  end if;
  update public.perfis set ativo = p_ativo where id = p_perfil_id;
  if not found then raise exception 'Perfil não encontrado'; end if;
  delete from public.papeis_perfil where perfil_id = p_perfil_id;
  insert into public.papeis_perfil (perfil_id, papel) values (p_perfil_id, p_papel);
end
$$;
revoke all on function public.rpc_atualizar_perfil_usuario(uuid, boolean, public.papel_usuario) from public;
grant execute on function public.rpc_atualizar_perfil_usuario(uuid, boolean, public.papel_usuario) to authenticated;

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
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode corrigir atendimento entregue' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'Informe o motivo da correção'; end if;
  if p_valor_final <= 0 then raise exception 'Valor final inválido'; end if;
  if exists (select 1 from public.itens_fechamento where atendimento_id = p_atendimento_id) then
    raise exception 'Atendimento já incluído em fechamento e não pode ser alterado';
  end if;
  select jsonb_build_object(
    'valor_final', a.valor_final,
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('forma_pagamento', p.forma_pagamento, 'valor', p.valor)) from public.pagamentos p where p.atendimento_id = a.id), '[]'::jsonb)
  ) into v_anterior
  from public.atendimentos a where a.id = p_atendimento_id and a.status = 'entregue' for update;
  if v_anterior is null then raise exception 'Atendimento entregue não encontrado'; end if;
  for v_pagamento in select * from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) loop
    v_total := v_total + (v_pagamento->>'valor_centavos')::bigint / 100.0;
  end loop;
  if v_total <> p_valor_final then raise exception 'A soma dos pagamentos deve ser igual ao valor final'; end if;
  delete from public.pagamentos where atendimento_id = p_atendimento_id;
  for v_pagamento in select * from jsonb_array_elements(p_pagamentos) loop
    insert into public.pagamentos (atendimento_id, forma_pagamento, valor, recebido_por_perfil_id)
    values (p_atendimento_id, (v_pagamento->>'forma_pagamento')::public.forma_pagamento, (v_pagamento->>'valor_centavos')::bigint / 100.0, v_perfil);
  end loop;
  update public.atendimentos set valor_final = p_valor_final where id = p_atendimento_id;
  insert into public.historico_alteracoes (atendimento_id, campo_alterado, valor_anterior, valor_novo, motivo, alterado_por_perfil_id)
  values (p_atendimento_id, 'valor_final_pagamentos', v_anterior, jsonb_build_object('valor_final', p_valor_final, 'pagamentos', p_pagamentos), trim(p_motivo), v_perfil);
end
$$;
revoke all on function public.rpc_corrigir_atendimento_entregue(uuid, numeric, jsonb, text) from public;
grant execute on function public.rpc_corrigir_atendimento_entregue(uuid, numeric, jsonb, text) to authenticated;
