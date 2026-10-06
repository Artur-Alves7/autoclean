-- Procedure avaliada: cria ou completa os itens de repasse de uma data operacional.

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
  if not public.lc_usuario_eh_admin()
     or p_criado_por <> public.lc_perfil_atual_id() then
    raise exception 'Somente administrador pode fechar repasses' using errcode = '42501';
  end if;
  if p_data_operacao is null
     or p_data_operacao > (current_timestamp at time zone 'America/Fortaleza')::date then
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
      and (atendimento.chegou_em at time zone 'America/Fortaleza')::date = p_data_operacao
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

revoke all on procedure public.sp_fechar_repasses_dia(date, uuid, uuid[], text, uuid)
  from public, anon, authenticated;
