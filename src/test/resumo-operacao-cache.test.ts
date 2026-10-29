import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { criarHandlerResumoOperacao } from "../../supabase/functions/resumo-operacao-cache/handler";

const DATA = "2026-10-29";

const atendimentos = [
  { id: "a-1", valor_final: 50.01, valor_empresa_snapshot: 10, total_pago: 50.01 },
  { id: "a-2", valor_final: 20, valor_empresa_snapshot: 5, total_pago: 20 },
];

function preparar({ redis = true }: { redis?: boolean } = {}) {
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "admin-teste" } }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const lt = vi.fn().mockResolvedValue({ data: atendimentos, error: null });
  const gte = vi.fn(() => ({ lt }));
  const eq = vi.fn(() => ({ gte }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const createClient = vi
    .fn()
    .mockReturnValueOnce({ auth: { getUser }, rpc })
    .mockReturnValueOnce({ from });
  const fetchImpl = vi.fn();
  const getEnv = vi.fn((nome: string): string | undefined => {
    const valores: Record<string, string | undefined> = {
      SUPABASE_URL: "https://teste.supabase.co",
      SUPABASE_ANON_KEY: "anon-teste",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-somente-servidor",
      UPSTASH_REDIS_REST_URL: redis ? "https://redis.teste.upstash.io" : undefined,
      UPSTASH_REDIS_REST_TOKEN: redis ? "redis-token-somente-servidor" : undefined,
    };
    return valores[nome];
  });
  const handler = criarHandlerResumoOperacao({
    createClient: createClient as unknown as Parameters<
      typeof criarHandlerResumoOperacao
    >[0]["createClient"],
    getEnv,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    agora: () => "2026-10-29T18:00:00.000Z",
  });
  return { handler, getUser, rpc, gte, lt, from, createClient, fetchImpl, getEnv };
}

function requisicao(
  body: unknown = { data_operacao: DATA },
  authorization: string | null = "Bearer jwt-simulado",
) {
  return new Request("https://teste.invalid/resumo-operacao-cache", {
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
  return response.json();
}

describe("resumo diário com Redis (Supabase simulado)", () => {
  it("responde ao preflight sem validar sessão ou carregar secrets", async () => {
    const m = preparar();
    const response = await m.handler(new Request("https://teste.invalid", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(m.getEnv).not.toHaveBeenCalled();
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it.each([null, "Basic invalido", "Bearer "])("rejeita autorização inválida: %s", async (auth) => {
    const m = preparar();
    await conferir(await m.handler(requisicao({ data_operacao: DATA }, auth)), 401);
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it.each([{}, { data_operacao: "2026-02-30" }, { data_operacao: "29/10/2026" }])(
    "rejeita data inválida: %j",
    async (body) => {
      const m = preparar();
      await conferir(await m.handler(requisicao(body)), 400);
      expect(m.createClient).not.toHaveBeenCalled();
    },
  );

  it("bloqueia lavador sem consultar Redis ou Supabase administrativo", async () => {
    const m = preparar();
    m.rpc.mockResolvedValue({ data: false, error: null });
    await conferir(await m.handler(requisicao()), 403);
    expect(m.createClient).toHaveBeenCalledTimes(1);
    expect(m.fetchImpl).not.toHaveBeenCalled();
    expect(m.from).not.toHaveBeenCalled();
  });

  it("retorna 502 quando o serviço de autenticação está indisponível", async () => {
    const m = preparar();
    m.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    await conferir(await m.handler(requisicao()), 502);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("entrega um cache hit sem consultar a View no Supabase", async () => {
    const m = preparar();
    m.fetchImpl.mockResolvedValue(
      new Response(
        JSON.stringify({
          result: JSON.stringify({
            data_operacao: DATA,
            quantidade_atendimentos: 9,
            total_recebido_centavos: 9900,
            total_empresa_centavos: 2000,
            total_equipe_centavos: 7900,
            atualizado_em: "2026-10-29T17:59:00.000Z",
            origem: "supabase",
            cache: "atualizado",
          }),
        }),
        { status: 200 },
      ),
    );

    const body = await conferir(await m.handler(requisicao()), 200);
    expect(body).toMatchObject({ origem: "redis", cache: "acerto", quantidade_atendimentos: 9 });
    expect(m.from).not.toHaveBeenCalled();
    expect(m.fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(m.fetchImpl.mock.calls[0]?.[0])).toContain(
      `/get/autoclean%3Aresumo-operacao%3Av1%3A${DATA}`,
    );
  });

  it("consulta Supabase e grava um cache miss no Redis por 60 segundos", async () => {
    const m = preparar();
    m.fetchImpl
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "OK" }), { status: 200 }));

    const body = await conferir(await m.handler(requisicao()), 200);
    expect(body).toMatchObject({
      origem: "supabase",
      cache: "atualizado",
      quantidade_atendimentos: 2,
      total_recebido_centavos: 7001,
      total_empresa_centavos: 1500,
      total_equipe_centavos: 5501,
    });
    expect(m.from).toHaveBeenCalledWith("vw_painel_atendimentos");
    expect(m.gte).toHaveBeenCalledWith("chegou_em", "2026-10-29T03:00:00.000Z");
    expect(m.lt).toHaveBeenCalledWith("chegou_em", "2026-10-30T03:00:00.000Z");
    expect(m.fetchImpl).toHaveBeenCalledTimes(2);
    expect(m.fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(m.fetchImpl.mock.calls[1]?.[1]?.body).toContain('"EX","60"');
  });

  it("força a atualização sem ler o cache anterior", async () => {
    const m = preparar();
    m.fetchImpl.mockResolvedValue(new Response(JSON.stringify({ result: "OK" }), { status: 200 }));

    const body = await conferir(
      await m.handler(requisicao({ data_operacao: DATA, atualizar_cache: true })),
      200,
    );
    expect(body).toMatchObject({ origem: "supabase", cache: "atualizado" });
    expect(m.from).toHaveBeenCalledWith("vw_painel_atendimentos");
    expect(m.fetchImpl).toHaveBeenCalledTimes(1);
    expect(m.fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("mantém o resumo disponível pelo Supabase quando Redis falha", async () => {
    const m = preparar();
    m.fetchImpl.mockRejectedValue(new Error("redis indisponível"));

    const body = await conferir(await m.handler(requisicao()), 200);
    expect(body).toMatchObject({ origem: "supabase", cache: "indisponivel" });
    expect(m.from).toHaveBeenCalledWith("vw_painel_atendimentos");
    expect(m.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("continua pelo Supabase enquanto Redis não está configurado", async () => {
    const m = preparar({ redis: false });
    const body = await conferir(await m.handler(requisicao()), 200);
    expect(body).toMatchObject({ origem: "supabase", cache: "desabilitado" });
    expect(m.fetchImpl).not.toHaveBeenCalled();
  });

  it("mantém JWT obrigatório e secrets somente no servidor", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    const functionConfig = readFileSync(
      "supabase/functions/resumo-operacao-cache/config.toml",
      "utf8",
    );
    const handler = readFileSync("supabase/functions/resumo-operacao-cache/handler.ts", "utf8");
    const interfaceRelatorios = readFileSync("src/components/ResumoOperacaoCache.tsx", "utf8");

    expect(config).toMatch(/\[functions\.resumo-operacao-cache\]\s+verify_jwt = true/);
    expect(functionConfig).toMatch(/^verify_jwt = true\s*$/);
    expect(handler).toContain('getEnv("UPSTASH_REDIS_REST_TOKEN")');
    expect(interfaceRelatorios).not.toMatch(/UPSTASH_REDIS_REST_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
  });
});
