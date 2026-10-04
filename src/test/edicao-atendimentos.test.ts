import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("edição completa dos atendimentos", () => {
  const sql = readFileSync(
    "supabase/migrations/20261005020000_edicao_completa_atendimentos.sql",
    "utf8",
  );

  it("expõe as formas de pagamento no painel sem alterar os dados", () => {
    expect(sql).toMatch(/jsonb_agg\([\s\S]+forma_pagamento[\s\S]+as pagamentos/i);
    expect(sql).not.toMatch(/truncate table|drop table/i);
  });

  it("mantém a edição restrita ao administrador e auditada", () => {
    expect(sql).toMatch(/if not public\.lc_usuario_eh_admin\(\)/i);
    expect(sql).toMatch(/'edicao_completa'/i);
    expect(sql).toMatch(/insert into public\.historico_alteracoes/i);
    expect(sql).toMatch(/revoke all[\s\S]+from public, anon/i);
  });

  it("reaproveita a correção financeira para preservar os repasses concluídos", () => {
    expect(sql).toMatch(/if v_atendimento\.status = 'entregue'/i);
    expect(sql).toMatch(/rpc_corrigir_atendimento_entregue/i);
    expect(sql).toMatch(/pagamentos só podem ser editados em atendimento concluído/i);
  });
});
