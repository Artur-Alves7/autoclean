-- Function avaliada: calcula a parte da empresa e o rateio exato dos lavadores.

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
  select
    round(atendimento.valor_final * 100)::bigint,
    round(atendimento.valor_empresa_snapshot * 100)::bigint
    into v_total, v_empresa
  from public.atendimentos atendimento
  where atendimento.id = p_atendimento_id;

  if v_total is null then
    raise exception 'Atendimento sem valor final';
  end if;
  if v_empresa > v_total then
    raise exception 'Valor da empresa supera o valor final';
  end if;

  select count(*)::integer
    into v_quantidade
  from public.atendimento_lavadores participante
  where participante.atendimento_id = p_atendimento_id;

  if v_quantidade = 0 then
    raise exception 'Atendimento sem lavadores';
  end if;

  tipo_destinatario := 'empresa';
  perfil_destinatario_id := null;
  ordem_rateio := 0;
  valor_centavos := v_empresa;
  return next;

  v_restante := v_total - v_empresa;

  return query
  select
    'lavador'::public.tipo_destinatario,
    participante.lavador_perfil_id,
    participante.ordem_rateio,
    (v_restante / v_quantidade)
      + case
          when participante.ordem_rateio <= (v_restante % v_quantidade) then 1
          else 0
        end
  from public.atendimento_lavadores participante
  where participante.atendimento_id = p_atendimento_id
  order by participante.ordem_rateio;
end
$$;

grant execute on function public.fn_calcular_repasse(uuid) to authenticated;
