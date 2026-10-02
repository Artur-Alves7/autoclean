import { describe, expect, it } from "vitest";

import {
  dividirRepasseCentavos,
  podeTransicionar,
  reaisParaCentavos,
  somaPagamentosCentavos,
  validarEntrega,
} from "@/lib/regras";

describe("regras operacionais", () => {
  it("aceita somente transições válidas", () => {
    expect(podeTransicionar("aguardando", "em_lavagem")).toBe(true);
    expect(podeTransicionar("em_lavagem", "pronto_para_retirada")).toBe(true);
    expect(podeTransicionar("pronto_para_retirada", "entregue")).toBe(true);
    expect(podeTransicionar("entregue", "aguardando")).toBe(false);
  });

  it("converte dinheiro sem perder centavos", () => {
    expect(reaisParaCentavos("10,01")).toBe(1001);
    expect(reaisParaCentavos(0.1 + 0.2)).toBe(30);
  });

  it("distribui centavos restantes por ordem de rateio", () => {
    const lavadores = dividirRepasseCentavos(10003, 4000, 4);
    expect(lavadores).toEqual([1501, 1501, 1501, 1500]);
    expect(lavadores.reduce((total, valor) => total + valor, 4000)).toBe(10003);
  });

  it("bloqueia entrega com pagamento inconsistente", () => {
    const pagamentos = [
      { forma_pagamento: "pix" as const, valor_centavos: 5000 },
      { forma_pagamento: "dinheiro" as const, valor_centavos: 2500 },
    ];
    expect(somaPagamentosCentavos(pagamentos)).toBe(7500);
    expect(validarEntrega(8000, 2, pagamentos)).toMatch(/exatamente igual/);
    expect(validarEntrega(7500, 2, pagamentos)).toBeNull();
  });
});
