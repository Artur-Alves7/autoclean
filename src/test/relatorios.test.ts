import { describe, expect, it } from "vitest";

import { gerarCsv } from "@/lib/relatorios";

describe("relatórios CSV", () => {
  it("gera colunas separadas por ponto e vírgula", () => {
    expect(gerarCsv(["Cliente", "Valor"], [["Maria", "R$ 50,00"]])).toBe(
      '"Cliente";"Valor"\r\n"Maria";"R$ 50,00"',
    );
  });

  it("preserva textos com aspas, separadores e quebras de linha", () => {
    expect(gerarCsv(["Observação"], [['Lavagem "premium"; completa\nfinalizada']])).toBe(
      '"Observação"\r\n"Lavagem ""premium""; completa\nfinalizada"',
    );
  });

  it("representa valores ausentes como células vazias", () => {
    expect(gerarCsv(["Um", "Dois"], [[null, undefined]])).toBe('"Um";"Dois"\r\n"";""');
  });
});
