import { describe, expect, it } from "vitest";

import { montarPayloadNovoVeiculo } from "@/lib/veiculo";

describe("cadastro de veículo", () => {
  it("envia placa e deixa placa_normalizada para o banco calcular", () => {
    const payload = montarPayloadNovoVeiculo("cliente-1", {
      categoria_veiculo_id: "d5319fa3-36ef-4f7d-a5ae-4f5399ea0e18",
      marca: "Fiat",
      modelo: "Argo",
      placa: "abc-1d23",
      cor: "Prata",
    });

    expect(payload).toEqual({
      cliente_id: "cliente-1",
      categoria_veiculo_id: "d5319fa3-36ef-4f7d-a5ae-4f5399ea0e18",
      marca: "Fiat",
      modelo: "Argo",
      placa: "ABC-1D23",
      cor: "Prata",
    });
    expect(payload).not.toHaveProperty("placa_normalizada");
  });

  it("envia placa nula sem tentar preencher placa_normalizada", () => {
    const payload = montarPayloadNovoVeiculo("cliente-2", {
      categoria_veiculo_id: "d5319fa3-36ef-4f7d-a5ae-4f5399ea0e18",
      marca: "Honda",
      modelo: "CG 160",
    });

    expect(payload.placa).toBeNull();
    expect(payload).not.toHaveProperty("placa_normalizada");
  });
});
