import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Papel = "administrador" | "lavador";
export type Acesso = {
  perfilId: string;
  nome: string;
  papel: Papel;
  primeiroAcessoPendente: boolean;
};

export class AcessoNegado extends Error {}

// Untyped view of the client: generated types don't list these tables yet.
const db = () => supabase as unknown as SupabaseClient;

export async function carregarAcesso(): Promise<Acesso | null> {
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) return null;

  const { data: perfil, error: pe } = await db()
    .from("perfis")
    .select("id, nome_completo, ativo")
    .eq("usuario_auth_id", u.user.id)
    .maybeSingle();
  if (pe) throw new Error("Não foi possível consultar seu perfil. Tente novamente.");
  if (!perfil)
    throw new AcessoNegado(
      "Seu usuário não possui um perfil cadastrado no LavaClean. Procure o administrador.",
    );
  if (!perfil.ativo) throw new AcessoNegado("Seu perfil está inativo. Procure o administrador.");

  const { data: papeis, error: re } = await db()
    .from("papeis_perfil")
    .select("papel")
    .eq("perfil_id", perfil.id);
  if (re) throw new Error("Não foi possível consultar seu papel de acesso. Tente novamente.");
  const lista = (papeis ?? []).map((p: { papel: string }) => p.papel);
  const papel: Papel | null = lista.includes("administrador")
    ? "administrador"
    : lista.includes("lavador")
      ? "lavador"
      : null;
  if (!papel)
    throw new AcessoNegado(
      "Seu perfil não possui um papel de acesso válido. Procure o administrador.",
    );

  return {
    perfilId: perfil.id,
    nome: perfil.nome_completo,
    papel,
    primeiroAcessoPendente: u.user.user_metadata?.["primeiro_acesso_pendente"] === true,
  };
}

export const destinoDoPapel = (p: Papel) => (p === "administrador" ? "/admin" : "/lavador");
