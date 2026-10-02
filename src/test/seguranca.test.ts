import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reforco = readFileSync("supabase/migrations/20261002014000_reforco_permissoes.sql", "utf8");
const politicas = readFileSync(
  "supabase/migrations/20261002011000_politicas_e_correcoes.sql",
  "utf8",
);

describe("segurança e permissões do banco", () => {
  it("mantém leitura operacional e restringe escritas administrativas por RLS", () => {
    expect(politicas).toMatch(
      /lc_clientes_operacao[\s\S]*for select to authenticated[\s\S]*lc_perfil_atual_id\(\) is not null/,
    );
    expect(politicas).toMatch(
      /lc_clientes_admin_escrita[\s\S]*for update to authenticated[\s\S]*lc_usuario_eh_admin\(\)/,
    );
    expect(politicas).toMatch(
      /lc_categorias_admin[\s\S]*for all to authenticated[\s\S]*lc_usuario_eh_admin\(\)/,
    );
    expect(politicas).toMatch(
      /lc_servicos_admin[\s\S]*for all to authenticated[\s\S]*lc_usuario_eh_admin\(\)/,
    );
    expect(politicas).toMatch(
      /lc_itens_fechamento_select[\s\S]*lc_usuario_eh_admin\(\) or perfil_destinatario_id = public\.lc_perfil_atual_id\(\)/,
    );
  });

  it("fecha a escrita direta de participantes e exige administrador na RPC", () => {
    expect(reforco).toContain(
      "revoke insert, update, delete on public.atendimento_lavadores from authenticated",
    );
    expect(reforco).toMatch(
      /rpc_definir_participantes[\s\S]*if not public\.lc_usuario_eh_admin\(\)[\s\S]*errcode = '42501'/,
    );
    expect(reforco).toContain(
      "v_status not in ('aguardando', 'em_lavagem', 'pronto_para_retirada')",
    );
    expect(reforco).toMatch(
      /join public\.papeis_perfil papel[\s\S]*papel\.papel = 'lavador'[\s\S]*perfil\.ativo/,
    );
  });

  it("aceita valor e pagamentos somente na entrega e exige valores positivos", () => {
    expect(reforco).toContain(
      "p_novo_status <> 'entregue' and (p_valor_final is not null or p_pagamentos is not null)",
    );
    expect(reforco).toContain("v_valor is null or v_valor <= 0");
    expect(reforco).toContain("jsonb_array_length(p_pagamentos) = 0");
    expect(reforco).toContain(
      "v_valor_pagamento_centavos is null or v_valor_pagamento_centavos <= 0",
    );
    expect(reforco).toContain("nullif(trim(v_pagamento->>'forma_pagamento'), '') is null");
    expect(reforco).toContain("v_total_pago_centavos <> round(v_valor * 100)::bigint");
  });

  it("fixa search_path e remove execução pública das funções revisadas", () => {
    const funcoesDefiner = reforco.match(/security definer/gi) ?? [];
    const searchPaths = reforco.match(/set search_path = pg_catalog, public/gi) ?? [];
    expect(funcoesDefiner).toHaveLength(2);
    expect(searchPaths).toHaveLength(funcoesDefiner.length);
    expect(reforco).toContain(
      "revoke all on function public.rpc_definir_participantes(uuid, uuid[]) from public",
    );
    expect(reforco).toMatch(
      /revoke all on function public\.rpc_avancar_atendimento\([\s\S]*?\) from public/,
    );
    expect(reforco).toContain(
      "revoke all on function public.fn_calcular_repasse(uuid) from public",
    );
  });
});
