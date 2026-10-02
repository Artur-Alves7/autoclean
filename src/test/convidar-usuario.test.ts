import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { criarHandlerConvite } from "../../supabase/functions/convidar-usuario/handler";

const corpoValido = {
  email: "lavador@example.com",
  nome_completo: "Lavador de teste",
  papel: "lavador",
};

function preparar(existente = false) {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "admin-teste" } }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const invite = vi.fn().mockResolvedValue({ data: { user: { id: "auth-teste" } }, error: null });
  const buscar = vi.fn().mockResolvedValue({
    data: existente ? { id: "perfil-teste" } : null,
    error: null,
  });
  const salvar = vi.fn().mockResolvedValue({ data: { id: "perfil-teste" }, error: null });
  const remover = vi.fn().mockResolvedValue({ error: null });
  const papel = vi.fn().mockResolvedValue({ error: null });
  const select = () => ({ single: salvar });
  const inserir = vi.fn(() => ({ select }));
  const atualizar = vi.fn(() => ({ eq: () => ({ select }) }));
  const from = vi
    .fn()
    .mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle: buscar }) }) })
    .mockReturnValueOnce({ insert: inserir, update: atualizar })
    .mockReturnValueOnce({ delete: () => ({ eq: remover }) })
    .mockReturnValueOnce({ insert: papel });
  const createClient = vi
    .fn()
    .mockReturnValueOnce({ auth: { getUser }, rpc })
    .mockReturnValueOnce({ auth: { admin: { inviteUserByEmail: invite } }, from });
  const getEnv = vi.fn((nome: string): string | undefined =>
    nome === "SUPABASE_URL" ? "https://teste.invalid" : "valor-simulado",
  );
  const handler = criarHandlerConvite({
    createClient: createClient as unknown as Parameters<
      typeof criarHandlerConvite
    >[0]["createClient"],
    getEnv,
  });
  return {
    handler,
    createClient,
    getEnv,
    getUser,
    rpc,
    invite,
    from,
    buscar,
    salvar,
    remover,
    papel,
    inserir,
    atualizar,
  };
}

function requisicao(
  body: unknown = corpoValido,
  authorization: string | null = "Bearer jwt-simulado",
) {
  return new Request("https://teste.invalid/convidar-usuario", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function conferir(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
    "authorization, x-client-info, apikey, content-type",
  );
  const body = await response.json();
  if (status >= 400) {
    expect(body.erro).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(/detalhe-interno|valor-simulado/);
  }
  return body;
}

describe("contrato HTTP da função de convite (Supabase simulado)", () => {
  it("responde ao preflight sem autenticação nem configuração de secrets", async () => {
    const m = preparar();
    m.getEnv.mockReturnValue(undefined);
    const response = await m.handler(
      new Request("https://teste.invalid", {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.teste.invalid",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")?.split(", ")).toEqual([
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
    ]);
    expect(m.getEnv).not.toHaveBeenCalled();
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT", "DELETE", "PATCH"])("rejeita %s com 405 e Allow", async (method) => {
    const m = preparar();
    const response = await m.handler(new Request("https://teste.invalid", { method }));
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
    await conferir(response, 405);
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it.each([null, "Basic invalido", "Bearer "])(
    "rejeita autorização ausente/malformada: %s",
    async (auth) => {
      const m = preparar();
      await conferir(await m.handler(requisicao(corpoValido, auth)), 401);
      expect(m.createClient).not.toHaveBeenCalled();
    },
  );

  it("valida o JWT e bloqueia token inválido antes de consultar o papel", async () => {
    const m = preparar();
    m.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    await conferir(await m.handler(requisicao()), 401);
    expect(m.getUser).toHaveBeenCalledWith("jwt-simulado");
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.invite).not.toHaveBeenCalled();
    expect(m.createClient).toHaveBeenCalledTimes(1);
  });

  it("rejeita sessão sem usuário", async () => {
    const m = preparar();
    m.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await conferir(await m.handler(requisicao()), 401);
    expect(m.invite).not.toHaveBeenCalled();
  });

  it("rejeita lavador com 403 sem criar cliente administrativo nem enviar e-mail", async () => {
    const m = preparar();
    m.rpc.mockResolvedValue({ data: false, error: null });
    await conferir(await m.handler(requisicao()), 403);
    expect(m.rpc).toHaveBeenCalledWith("lc_usuario_eh_admin");
    expect(m.createClient).toHaveBeenCalledTimes(1);
    expect(m.invite).not.toHaveBeenCalled();
  });

  it("retorna 500 quando não consegue consultar a permissão", async () => {
    const m = preparar();
    m.rpc.mockResolvedValue({ data: null, error: { message: "detalhe-interno" } });
    await conferir(await m.handler(requisicao()), 500);
    expect(m.invite).not.toHaveBeenCalled();
  });

  it("retorna 502 se o serviço de autenticação falhar", async () => {
    const m = preparar();
    m.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    await conferir(await m.handler(requisicao()), 502);
    expect(m.invite).not.toHaveBeenCalled();
  });

  it("retorna 500 quando falta configuração, sem expor valores", async () => {
    const m = preparar();
    m.getEnv.mockReturnValue(undefined);
    await conferir(await m.handler(requisicao()), 500);
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { ...corpoValido, nome_completo: " " },
    { ...corpoValido, email: 123 },
    { ...corpoValido, email: "email-invalido" },
    { ...corpoValido, papel: "root" },
    { ...corpoValido, telefone: {} },
  ])("rejeita corpo inválido: %j", async (body) => {
    const m = preparar();
    await conferir(await m.handler(requisicao(body)), 400);
    expect(m.invite).not.toHaveBeenCalled();
  });

  it("retorna 400 para JSON malformado", async () => {
    const m = preparar();
    await conferir(
      await m.handler(
        new Request("https://teste.invalid", {
          method: "POST",
          headers: { Authorization: "Bearer jwt-simulado" },
          body: "{",
        }),
      ),
      400,
    );
    expect(m.invite).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 422, code: "email_exists" }, 409],
    [{ status: 422, code: "user_already_exists" }, 409],
    [{ status: 429 }, 429],
    [{ status: 422 }, 400],
    [{ status: 503 }, 502],
    [{ status: 401 }, 502],
  ])("mapeia erro da Admin API %j para %i", async (error, status) => {
    const m = preparar();
    m.invite.mockResolvedValue({
      data: { user: null },
      error: { ...error, message: "detalhe-interno" },
    });
    await conferir(await m.handler(requisicao()), status);
    expect(m.from).not.toHaveBeenCalled();
  });

  it.each([false, true])("mantém fluxo de sucesso com perfil existente=%s", async (existente) => {
    const m = preparar(existente);
    const body = await conferir(await m.handler(requisicao()), 200);
    expect(body).toEqual({ usuario_id: "auth-teste", perfil_id: "perfil-teste" });
    expect(m.createClient).toHaveBeenCalledTimes(2);
    expect(m.invite).toHaveBeenCalledWith(corpoValido.email, {
      data: { nome_completo: corpoValido.nome_completo, telefone: null, papel: "lavador" },
    });
    expect(existente ? m.atualizar : m.inserir).toHaveBeenCalledTimes(1);
    expect(m.papel).toHaveBeenCalledWith({ perfil_id: "perfil-teste", papel: "lavador" });
  });

  it.each(["buscar", "salvar", "remover", "papel"] as const)(
    "retorna 500 na falha de persistência: %s",
    async (etapa) => {
      const m = preparar();
      m[etapa].mockResolvedValue({ data: null, error: { message: "detalhe-interno" } });
      await conferir(await m.handler(requisicao()), 500);
    },
  );

  it("não expõe detalhes de exceções inesperadas", async () => {
    const m = preparar();
    m.invite.mockRejectedValue(new Error("detalhe-interno valor-simulado"));
    await conferir(await m.handler(requisicao()), 500);
  });

  it("mantém o projeto e a verificação JWT na configuração central", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).toMatch(/^project_id = "jkhfhyrwkwzpoteenkyh"/);
    expect(config).toMatch(/\[functions\.convidar-usuario\]\s+verify_jwt = true/);
  });
});
