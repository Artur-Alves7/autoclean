import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cadastro de veículo para cliente existente", () => {
  const sql = readFileSync(
    "supabase/migrations/20261005030000_adicionar_veiculo_cliente.sql",
    "utf8",
  );

  it("mantém a chave normalizada sob responsabilidade do banco", () => {
    expect(sql).toMatch(/insert into public\.veiculos/i);
    expect(sql).toMatch(/marca,\s*modelo,\s*placa,\s*cor/i);
    expect(sql).not.toMatch(/insert into[\s\S]+placa_normalizada/i);
  });

  it("valida perfil, cliente e categoria antes do cadastro", () => {
    expect(sql).toMatch(/lc_perfil_atual_id\(\) is null/i);
    expect(sql).toMatch(/cliente\.ativo/i);
    expect(sql).toMatch(/categoria\.ativo/i);
    expect(sql).toMatch(/grant execute[\s\S]+to authenticated/i);
  });
});
