import type { createClient as criarClienteSupabase } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function criarHandlerConvite({
  createClient,
  getEnv,
}: {
  createClient: typeof criarClienteSupabase;
  getEnv: (nome: string) => string | undefined;
}) {
  return async function atenderConvite(request: Request) {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST")
      return resposta({ erro: "Método não permitido." }, 405, { Allow: "POST, OPTIONS" });
    const authorization = request.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return resposta({ erro: "Não autenticado." }, 401);
    try {
      const supabaseUrl = getEnv("SUPABASE_URL");
      const anonKey = getEnv("SUPABASE_ANON_KEY");
      const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !anonKey || !serviceRoleKey)
        return resposta({ erro: "Serviço de convites não configurado." }, 500);

      const usuarioClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: autenticacao, error: autenticacaoErro } =
        await usuarioClient.auth.getUser(token);
      if (autenticacaoErro) {
        if (autenticacaoErro.status === 429 || (autenticacaoErro.status ?? 0) >= 500)
          return resposta({ erro: "Não foi possível validar a sessão. Tente novamente." }, 502);
        return resposta({ erro: "Sessão inválida ou expirada." }, 401);
      }
      if (!autenticacao.user) return resposta({ erro: "Sessão inválida ou expirada." }, 401);
      const { data: permitido, error: permissaoErro } =
        await usuarioClient.rpc("lc_usuario_eh_admin");
      if (permissaoErro) return resposta({ erro: "Não foi possível verificar a permissão." }, 500);
      if (permitido !== true)
        return resposta({ erro: "Somente administradores podem convidar usuários." }, 403);

      let entrada: unknown;
      try {
        entrada = await request.json();
      } catch {
        return resposta({ erro: "Corpo da requisição deve ser um JSON válido." }, 400);
      }
      if (
        typeof entrada !== "object" ||
        entrada === null ||
        !("email" in entrada) ||
        typeof entrada.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entrada.email.trim()) ||
        !("nome_completo" in entrada) ||
        typeof entrada.nome_completo !== "string" ||
        !entrada.nome_completo.trim() ||
        !("papel" in entrada) ||
        (entrada.papel !== "administrador" && entrada.papel !== "lavador") ||
        ("telefone" in entrada && entrada.telefone != null && typeof entrada.telefone !== "string")
      ) {
        return resposta({ erro: "Dados do convite inválidos." }, 400);
      }
      const telefone =
        "telefone" in entrada && typeof entrada.telefone === "string"
          ? entrada.telefone.trim() || null
          : null;
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin.auth.admin.inviteUserByEmail(entrada.email.trim(), {
        data: {
          nome_completo: entrada.nome_completo.trim(),
          telefone,
          papel: entrada.papel,
        },
      });
      if (error) {
        if (
          error.code === "email_exists" ||
          error.code === "user_already_exists" ||
          error.status === 409
        )
          return resposta({ erro: "Já existe um usuário com esse e-mail." }, 409);
        if (error.status === 429)
          return resposta(
            { erro: "Limite de convites atingido. Tente novamente mais tarde." },
            429,
          );
        if (error.status === 400 || error.status === 422)
          return resposta({ erro: "O serviço de autenticação recusou os dados do convite." }, 400);
        return resposta(
          { erro: "Não foi possível enviar o convite pelo serviço de autenticação." },
          502,
        );
      }
      if (!data.user) return resposta({ erro: "O serviço não retornou o usuário convidado." }, 502);
      const perfilValores = {
        usuario_auth_id: data.user.id,
        nome_completo: String(entrada.nome_completo).trim(),
        telefone,
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
    } catch {
      return resposta(
        {
          erro: "Não foi possível concluir o convite. Consulte o administrador antes de tentar novamente.",
        },
        500,
      );
    }
  };
}

function resposta(corpo: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, ...headers, "Content-Type": "application/json" },
  });
}
