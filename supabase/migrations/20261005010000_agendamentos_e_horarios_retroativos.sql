-- Permite registrar um atendimento agora, em um horário passado ou como agendamento futuro.
-- Migration aditiva: preserva todos os atendimentos e fluxos existentes.

alter table public.atendimentos
  add column if not exists agendado_para timestamptz;

comment on column public.atendimentos.agendado_para is
  'Horário originalmente escolhido quando o atendimento foi criado como agendamento futuro.';

alter function public.rpc_criar_atendimento(uuid, uuid[], uuid, jsonb, uuid, jsonb, numeric, text)
  rename to lc_criar_atendimento_base;

revoke all on function public.lc_criar_atendimento_base(uuid, uuid[], uuid, jsonb, uuid, jsonb, numeric, text)
  from public, anon, authenticated;

create function public.rpc_criar_atendimento(
  p_servico_id uuid,
  p_lavadores uuid[],
  p_cliente_id uuid default null,
  p_cliente jsonb default null,
  p_veiculo_id uuid default null,
  p_veiculo jsonb default null,
  p_valor_final numeric default null,
  p_observacoes text default null,
  p_momento_operacao timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_atendimento_id uuid;
  v_momento timestamptz := coalesce(p_momento_operacao, clock_timestamp());
begin
  v_atendimento_id := public.lc_criar_atendimento_base(
    p_servico_id,
    p_lavadores,
    p_cliente_id,
    p_cliente,
    p_veiculo_id,
    p_veiculo,
    p_valor_final,
    p_observacoes
  );

  update public.atendimentos
  set
    chegou_em = v_momento,
    agendado_para = case when v_momento > clock_timestamp() then v_momento else null end
  where id = v_atendimento_id;

  update public.historico_status
  set alterado_em = v_momento
  where atendimento_id = v_atendimento_id
    and status_anterior is null
    and status_novo = 'aguardando';

  return v_atendimento_id;
end
$$;

revoke all on function public.rpc_criar_atendimento(uuid, uuid[], uuid, jsonb, uuid, jsonb, numeric, text, timestamptz)
  from public, anon;
grant execute on function public.rpc_criar_atendimento(uuid, uuid[], uuid, jsonb, uuid, jsonb, numeric, text, timestamptz)
  to authenticated;

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
  a.agendado_para
from public.atendimentos a;

grant select on public.vw_painel_atendimentos to authenticated;
