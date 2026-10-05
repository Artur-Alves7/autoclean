import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("migration de repasses por data do atendimento", () => {
  const sql = readFileSync(
    "supabase/migrations/20261005050000_repasses_por_data_atendimento.sql",
    "utf8",
  );

  it("seleciona somente atendimentos da data local de chegada", () => {
    expect(sql).toMatch(
      /painel\.chegou_em at time zone 'America\/Fortaleza'\)::date = p_data_operacao/i,
    );
    expect(sql).not.toMatch(/painel\.entregue_em::date\s*<=\s*p_data_operacao/i);
  });

  it("fecha o repasse na data local de chegada e preserva a data real da entrega", () => {
    expect(sql).toMatch(
      /atendimento\.chegou_em at time zone 'America\/Fortaleza'\)::date = p_data_operacao/i,
    );
    expect(sql).not.toMatch(/update\s+public\.atendimentos/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.(pagamentos|itens_fechamento)/i);
  });
});
