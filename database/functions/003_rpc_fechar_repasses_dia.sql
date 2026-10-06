-- Wrapper RPC utilizado pelo frontend para executar a Procedure com segurança.

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
  v_reaberto boolean := false;
begin
  if not public.lc_usuario_eh_admin() then
    raise exception 'Somente administrador pode fechar repasses' using errcode = '42501';
  end if;
  if p_data_operacao is null
     or p_data_operacao > (current_timestamp at time zone 'America/Fortaleza')::date then
    raise exception 'Informe uma data de operação válida';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lavaclean:fechamento:' || p_data_operacao::text, 0)
  );

  select fechamento.id, fechamento.status
    into v_id, v_status
  from public.fechamentos_diarios fechamento
  where fechamento.data_operacao = p_data_operacao;

  if v_status = 'confirmado' then
    return v_id;
  end if;
  v_reaberto := v_id is not null;

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
      and (
        ajuste.criado_em::date <= p_data_operacao
        or exists (
          select 1
          from public.itens_fechamento item
          where item.fechamento_diario_id = v_id
            and item.atendimento_id = ajuste.atendimento_id
        )
      )
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
    select 1
    from public.itens_fechamento item
    where item.fechamento_diario_id = v_id
  ) then
    raise exception 'Não há repasses ou ajustes pendentes para confirmar nesta data';
  end if;

  update public.fechamentos_diarios
  set status = 'confirmado',
      confirmado_por_perfil_id = v_perfil,
      confirmado_em = now(),
      observacoes = coalesce(nullif(trim(p_observacoes), ''), observacoes)
  where id = v_id;

  if v_reaberto then
    insert into public.historico_fechamentos (
      fechamento_diario_id,
      acao,
      motivo,
      alterado_por_perfil_id
    ) values (
      v_id,
      'reconfirmado',
      coalesce(
        nullif(trim(p_observacoes), ''),
        'Fechamento reconfirmado após novos lançamentos'
      ),
      v_perfil
    );
  end if;

  return v_id;
end
$$;

revoke all on function public.rpc_fechar_repasses_dia(date, uuid[], text)
  from public, anon;
grant execute on function public.rpc_fechar_repasses_dia(date, uuid[], text)
  to authenticated;
