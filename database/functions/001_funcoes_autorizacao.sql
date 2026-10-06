-- Funções auxiliares usadas pelos recursos acadêmicos.

create or replace function public.lc_perfil_atual_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select perfil.id
  from public.perfis perfil
  where perfil.usuario_auth_id = auth.uid()
    and perfil.ativo
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
    from public.papeis_perfil papel
    join public.perfis perfil on perfil.id = papel.perfil_id
    where perfil.usuario_auth_id = auth.uid()
      and perfil.ativo
      and papel.papel = 'administrador'
  )
$$;

revoke all on function public.lc_perfil_atual_id() from public, anon;
revoke all on function public.lc_usuario_eh_admin() from public, anon;
grant execute on function public.lc_perfil_atual_id() to authenticated;
grant execute on function public.lc_usuario_eh_admin() to authenticated;
