-- Permite cadastrar outro veículo para um cliente existente sem expor escrita direta na tabela.
-- A placa normalizada continua sendo calculada exclusivamente pelo banco.

create or replace function public.rpc_adicionar_veiculo_cliente(
  p_cliente_id uuid,
  p_categoria_veiculo_id uuid,
  p_marca text,
  p_modelo text,
  p_placa text default null,
  p_cor text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_veiculo_id uuid;
begin
  if public.lc_perfil_atual_id() is null then
    raise exception 'Perfil ativo não encontrado' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clientes cliente where cliente.id = p_cliente_id and cliente.ativo
  ) then
    raise exception 'Cliente ativo não encontrado';
  end if;
  if not exists (
    select 1
    from public.categorias_veiculo categoria
    where categoria.id = p_categoria_veiculo_id and categoria.ativo
  ) then
    raise exception 'Categoria ativa não encontrada';
  end if;
  if length(trim(coalesce(p_marca, ''))) < 1 or length(trim(coalesce(p_modelo, ''))) < 1 then
    raise exception 'Informe a marca e o modelo do veículo';
  end if;

  insert into public.veiculos (
    cliente_id,
    categoria_veiculo_id,
    marca,
    modelo,
    placa,
    cor
  ) values (
    p_cliente_id,
    p_categoria_veiculo_id,
    trim(p_marca),
    trim(p_modelo),
    nullif(upper(trim(p_placa)), ''),
    nullif(trim(p_cor), '')
  )
  returning id into v_veiculo_id;

  return v_veiculo_id;
end
$$;

revoke all on function public.rpc_adicionar_veiculo_cliente(uuid, uuid, text, text, text, text)
  from public, anon;
grant execute on function public.rpc_adicionar_veiculo_cliente(uuid, uuid, text, text, text, text)
  to authenticated;
