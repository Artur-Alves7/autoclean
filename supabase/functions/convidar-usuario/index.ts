import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey)
      throw new Error("Secrets da função não configurados.");

    const authorization = request.headers.get("Authorization");
    if (!authorization) return resposta({ erro: "Não autenticado." }, 401);
    const usuarioClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: permitido, error: permissaoErro } =
      await usuarioClient.rpc("lc_usuario_eh_admin");
    if (permissaoErro || !permitido)
      return resposta({ erro: "Somente administradores podem convidar usuários." }, 403);

    const entrada = await request.json();
    if (
      !entrada.email ||
      !entrada.nome_completo ||
      !["administrador", "lavador"].includes(entrada.papel)
    ) {
      return resposta({ erro: "Dados do convite inválidos." }, 400);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.inviteUserByEmail(entrada.email, {
      data: {
        nome_completo: entrada.nome_completo,
        telefone: entrada.telefone || null,
        papel: entrada.papel,
      },
    });
    if (error) throw error;
    const perfilValores = {
      usuario_auth_id: data.user.id,
      nome_completo: String(entrada.nome_completo).trim(),
      telefone: entrada.telefone ? String(entrada.telefone).trim() : null,
      ativo: true,
    };
    const { data: existente, error: buscaErro } = await admin
      .from("perfis")
      .select("id")
      .eq("usuario_auth_id", data.user.id)
      .maybeSingle();
    if (buscaErro) throw buscaErro;
    const resultadoPerfil = existente
      ? await admin
          .from("perfis")
          .update(perfilValores)
          .eq("id", existente.id)
          .select("id")
          .single()
      : await admin.from("perfis").insert(perfilValores).select("id").single();
    if (resultadoPerfil.error) throw resultadoPerfil.error;
    const perfil = resultadoPerfil.data;
    const { error: removerPapelErro } = await admin
      .from("papeis_perfil")
      .delete()
      .eq("perfil_id", perfil.id);
    if (removerPapelErro) throw removerPapelErro;
    const { error: papelErro } = await admin
      .from("papeis_perfil")
      .insert({ perfil_id: perfil.id, papel: entrada.papel });
    if (papelErro) throw papelErro;
    return resposta({ usuario_id: data.user.id, perfil_id: perfil.id }, 200);
  } catch (erro) {
    return resposta({ erro: erro instanceof Error ? erro.message : "Erro inesperado." }, 400);
  }
});

function resposta(corpo: unknown, status: number) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
