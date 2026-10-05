import { describe, expect, it } from "vitest";

import { formatarPlaca, formatarTelefone, normalizarEmail } from "@/lib/formatacao";

describe("formatação automática", () => {
  it.each([
    ["8", "(8"],
    ["85", "(85)"],
    ["85999999999", "(85) 99999-9999"],
    ["(85) 3333-4444", "(85) 3333-4444"],
    ["85999999999999", "(85) 99999-9999"],
  ])("formata telefone brasileiro: %s", (entrada, esperado) => {
    expect(formatarTelefone(entrada)).toBe(esperado);
  });

  it.each([
    ["abc1d23", "ABC-1D23"],
    ["abc-1234", "ABC-1234"],
    ["abc 1d23 extra", "ABC-1D23"],
  ])("formata placa brasileira: %s", (entrada, esperado) => {
    expect(formatarPlaca(entrada)).toBe(esperado);
  });

  it("normaliza o e-mail sem alterar o conteúdo interno", () => {
    expect(normalizarEmail(" Usuario.Teste@EXEMPLO.COM ")).toBe("usuario.teste@exemplo.com");
  });
});
