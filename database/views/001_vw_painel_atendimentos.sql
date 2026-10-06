-- View utilizada pela fila, histórico, fechamento e relatórios.

create or replace view public.vw_painel_atendimentos
with (security_invoker = true)
as
select
  atendimento.id,
  atendimento.status,
  atendimento.chegou_em,
  atendimento.lavagem_iniciada_em,
  atendimento.pronto_em,
  atendimento.entregue_em,
  atendimento.cancelado_em,
  atendimento.motivo_cancelamento,
  atendimento.valor_final,
  atendimento.valor_empresa_snapshot,
  atendimento.observacoes,
  atendimento.nome_cliente_snapshot,
  atendimento.veiculo_snapshot,
  atendimento.categoria_veiculo_snapshot,
  atendimento.servico_snapshot,
  atendimento.cliente_id,
  atendimento.veiculo_id,
  coalesce((
    select sum(pagamento.valor)
    from public.pagamentos pagamento
    where pagamento.atendimento_id = atendimento.id
  ), 0)::numeric(12,2) as total_pago,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'perfil_id', participante.lavador_perfil_id,
        'nome', perfil.nome_completo,
        'ordem_rateio', participante.ordem_rateio
      ) order by participante.ordem_rateio
    )
    from public.atendimento_lavadores participante
    join public.perfis perfil on perfil.id = participante.lavador_perfil_id
    where participante.atendimento_id = atendimento.id
  ), '[]'::jsonb) as lavadores,
  atendimento.agendado_para,
  atendimento.servico_id,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'forma_pagamento', pagamento.forma_pagamento,
        'valor', pagamento.valor
      ) order by pagamento.pago_em, pagamento.id
    )
    from public.pagamentos pagamento
    where pagamento.atendimento_id = atendimento.id
  ), '[]'::jsonb) as pagamentos
from public.atendimentos atendimento;

grant select on public.vw_painel_atendimentos to authenticated;
