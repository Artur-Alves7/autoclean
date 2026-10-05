import { describe, expect, it } from "vitest";

import {
  dataDentroDoRelatorio,
  gerarCsv,
  intervaloRelatorio,
  sufixoRelatorio,
  type FiltroRelatorio,
} from "@/lib/relatorios";

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

  it("monta um intervalo inclusivo para dia e período", () => {
    const filtro: FiltroRelatorio = {
      escopo: "periodo",
      data: "2026-10-05",
      inicio: "2026-10-01",
      fim: "2026-10-05",
    };
    const intervalo = intervaloRelatorio(filtro)!;
    expect(intervalo.inicio).toContain("2026-10-01");
    expect(intervalo.fim).toContain("2026-10-06");
    expect(sufixoRelatorio(filtro)).toBe("2026-10-01-a-2026-10-05");
    expect(dataDentroDoRelatorio("2026-10-03", filtro)).toBe(true);
    expect(dataDentroDoRelatorio("2026-09-30", filtro)).toBe(false);
  });

  it("aceita todos os registros no histórico completo", () => {
    const filtro: FiltroRelatorio = {
      escopo: "historico",
      data: "",
      inicio: "",
      fim: "",
    };
    expect(intervaloRelatorio(filtro)).toBeNull();
    expect(dataDentroDoRelatorio(undefined, filtro)).toBe(true);
    expect(sufixoRelatorio(filtro)).toBe("historico-completo");
  });

  it("rejeita um período invertido", () => {
    expect(() =>
      intervaloRelatorio({
        escopo: "periodo",
        data: "2026-10-05",
        inicio: "2026-10-05",
        fim: "2026-10-01",
      }),
    ).toThrow("A data final não pode ser anterior à data inicial.");
  });
});
