type OpcoesClienteSupabase = {
  global?: { headers: Record<string, string> };
  auth: { autoRefreshToken: false; persistSession: false };
};

type Resultado<T, E = unknown> = { data: T; error: E | null };
type ErroSupabase = { status?: number };
type LinhaAtendimento = {
  id: string;
  valor_final: number | string | null;
  valor_empresa_snapshot: number | string | null;
  total_pago: number | string | null;
};

type ConsultaAtendimentos = {
  eq: (coluna: string, valor: string) => ConsultaAtendimentos;
  gte: (coluna: string, valor: string) => ConsultaAtendimentos;
  lt: (coluna: string, valor: string) => Promise<Resultado<LinhaAtendimento[]>>;
};

type ClienteSupabase = {
  auth: {
    getUser: (token: string) => Promise<Resultado<{ user: { id: string } | null }, ErroSupabase>>;
  };
  rpc: (nome: string) => Promise<Resultado<boolean | null>>;
  from: (tabela: string) => { select: (colunas: string) => ConsultaAtendimentos };
};

type CriarClienteSupabase = (
  url: string,
  chave: string,
  opcoes: OpcoesClienteSupabase,
) => ClienteSupabase;

export type ResumoOperacaoCache = {
  data_operacao: string;
  quantidade_atendimentos: number;
  total_recebido_centavos: number;
  total_empresa_centavos: number;
  total_equipe_centavos: number;
  atualizado_em: string;
  origem: "redis" | "supabase";
  cache: "acerto" | "atualizado" | "indisponivel" | "desabilitado";
};

const TTL_SEGUNDOS = 60;
const FUSO_OPERACAO = "-03:00";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function criarHandlerResumoOperacao({
  createClient,
  getEnv,
  fetchImpl = fetch,
  agora = () => new Date().toISOString(),
}: {
  createClient: CriarClienteSupabase;
  getEnv: (nome: string) => string | undefined;
  fetchImpl?: typeof fetch;
  agora?: () => string;
}) {
  return async function atenderResumoOperacao(request: Request) {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST")
      return resposta({ erro: "Método não permitido." }, 405, { Allow: "POST, OPTIONS" });

    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return resposta({ erro: "Não autenticado." }, 401);

    let entrada: unknown;
    try {
      entrada = await request.json();
    } catch {
      return resposta({ erro: "Corpo da requisição deve ser um JSON válido." }, 400);
    }
    if (!ehEntradaValida(entrada)) return resposta({ erro: "Data de operação inválida." }, 400);

    const supabaseUrl = getEnv("SUPABASE_URL");
    const anonKey = getEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey)
      return resposta({ erro: "Serviço de resumo não configurado." }, 500);

    try {
      const usuario = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: autenticacao, error: erroAutenticacao } = await usuario.auth.getUser(token);
      if (
        erroAutenticacao &&
        ((erroAutenticacao.status ?? 0) === 429 || (erroAutenticacao.status ?? 0) >= 500)
      )
        return resposta({ erro: "Não foi possível validar a sessão. Tente novamente." }, 502);
      if (erroAutenticacao || !autenticacao.user)
        return resposta({ erro: "Sessão inválida ou expirada." }, 401);

      const { data: permitido, error: erroPermissao } = await usuario.rpc("lc_usuario_eh_admin");
      if (erroPermissao) return resposta({ erro: "Não foi possível verificar a permissão." }, 500);
      if (permitido !== true)
        return resposta({ erro: "Somente administradores podem consultar este resumo." }, 403);

      const chaveCache = `autoclean:resumo-operacao:v1:${entrada.data_operacao}`;
      const redisUrl = getEnv("UPSTASH_REDIS_REST_URL");
      const redisToken = getEnv("UPSTASH_REDIS_REST_TOKEN");
      const redisConfigurado = Boolean(redisUrl && redisToken);

      if (redisConfigurado && !entrada.atualizar_cache) {
        const cache = await lerCache(redisUrl!, redisToken!, chaveCache, fetchImpl);
        if (cache) return resposta({ ...cache, origem: "redis", cache: "acerto" });
      }

      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const intervalo = intervaloUtc(entrada.data_operacao);
      const { data: atendimentos, error: erroConsulta } = await admin
        .from("vw_painel_atendimentos")
        .select("id, valor_final, valor_empresa_snapshot, total_pago")
        .eq("status", "entregue")
        .gte("chegou_em", intervalo.inicio)
        .lt("chegou_em", intervalo.fim);
      if (erroConsulta)
        return resposta({ erro: "Não foi possível consultar os dados do Supabase." }, 502);

      const resumo: ResumoOperacaoCache = {
        ...calcularResumo(entrada.data_operacao, atendimentos ?? [], agora()),
        origem: "supabase",
        cache: redisConfigurado ? "atualizado" : "desabilitado",
      };

      if (redisConfigurado) {
        const salvo = await salvarCache(redisUrl!, redisToken!, chaveCache, resumo, fetchImpl);
        if (!salvo) resumo.cache = "indisponivel";
      }
      return resposta(resumo);
    } catch {
      return resposta({ erro: "Não foi possível carregar o resumo da operação." }, 502);
    }
  };
}

function ehEntradaValida(
  entrada: unknown,
): entrada is { data_operacao: string; atualizar_cache?: boolean } {
  const data =
    typeof entrada === "object" && entrada !== null && "data_operacao" in entrada
      ? entrada.data_operacao
      : null;
  return (
    typeof entrada === "object" &&
    entrada !== null &&
    typeof data === "string" &&
    ehDataIso(data) &&
    (!("atualizar_cache" in entrada) || typeof entrada.atualizar_cache === "boolean")
  );
}

function ehDataIso(data: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, dia!)).toISOString().slice(0, 10) === data;
}

function intervaloUtc(data: string) {
  return {
    inicio: new Date(`${data}T00:00:00${FUSO_OPERACAO}`).toISOString(),
    fim: new Date(`${proximaData(data)}T00:00:00${FUSO_OPERACAO}`).toISOString(),
  };
}

function proximaData(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, dia! + 1)).toISOString().slice(0, 10);
}

function calcularResumo(
  dataOperacao: string,
  atendimentos: LinhaAtendimento[],
  atualizadoEm: string,
) {
  return atendimentos.reduce(
    (resumo, atendimento) => {
      const valorFinal = centavos(atendimento.valor_final);
      const valorEmpresa = Math.min(centavos(atendimento.valor_empresa_snapshot), valorFinal);
      resumo.quantidade_atendimentos += 1;
      resumo.total_recebido_centavos += centavos(atendimento.total_pago);
      resumo.total_empresa_centavos += valorEmpresa;
      resumo.total_equipe_centavos += Math.max(0, valorFinal - valorEmpresa);
      return resumo;
    },
    {
      data_operacao: dataOperacao,
      quantidade_atendimentos: 0,
      total_recebido_centavos: 0,
      total_empresa_centavos: 0,
      total_equipe_centavos: 0,
      atualizado_em: atualizadoEm,
    },
  );
}

function centavos(valor: number | string | null) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

async function lerCache(url: string, token: string, chave: string, fetchImpl: typeof fetch) {
  try {
    const respostaRedis = await fetchImpl(
      `${url.replace(/\/$/, "")}/get/${encodeURIComponent(chave)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!respostaRedis.ok) return null;
    const corpo = (await respostaRedis.json()) as { result?: string | null };
    if (typeof corpo.result !== "string") return null;
    const resumo = JSON.parse(corpo.result) as ResumoOperacaoCache;
    return resumo.data_operacao && Number.isInteger(resumo.quantidade_atendimentos) ? resumo : null;
  } catch {
    return null;
  }
}

async function salvarCache(
  url: string,
  token: string,
  chave: string,
  resumo: ResumoOperacaoCache,
  fetchImpl: typeof fetch,
) {
  try {
    const respostaRedis = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", chave, JSON.stringify(resumo), "EX", String(TTL_SEGUNDOS)]),
    });
    return respostaRedis.ok;
  } catch {
    return false;
  }
}

function resposta(corpo: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...corsHeaders, ...headers, "Content-Type": "application/json" },
  });
}
