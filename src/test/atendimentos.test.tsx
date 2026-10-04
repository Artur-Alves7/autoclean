import { describe, expect, it } from "vitest";

import {
  dataHoraLocalInput,
  momentoLocalParaIso,
  montarParametrosNovoAtendimento,
  prepararBuscaCliente,
} from "@/lib/atendimento";
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

describe("payload do novo atendimento", () => {
  const base = {
    servicoId: "servico-teste",
    lavadores: ["lavador-1", "lavador-2", "lavador-1"],
    clienteId: null,
    clienteNovo: { nome_completo: " Cliente de teste ", telefone: " 85999999999 " },
    veiculoId: null,
    veiculoNovo: {
      categoria_veiculo_id: "d5319fa3-36ef-4f7d-a5ae-4f5399ea0e18",
      marca: " Honda ",
      modelo: " CG 160 ",
      placa: "",
      cor: "",
      observacoes: "",
    },
    valorDepois: true,
    valor: "",
    observacoes: "",
  };

  it("mantém valor pendente, placa opcional e participantes únicos", () => {
    const parametros = montarParametrosNovoAtendimento(base);

    expect(parametros).toMatchObject({
      p_servico_id: "servico-teste",
      p_lavadores: ["lavador-1", "lavador-2"],
      p_cliente_id: null,
      p_cliente: { nome_completo: "Cliente de teste", telefone: "85999999999" },
      p_veiculo_id: null,
      p_veiculo: {
        marca: "Honda",
        modelo: "CG 160",
        placa: null,
        cor: null,
        observacoes: null,
      },
      p_valor_final: null,
      p_observacoes: null,
      p_momento_operacao: null,
    });
    expect(parametros.p_veiculo).not.toHaveProperty("placa_normalizada");
  });

  it("normaliza placa e valor informado sem perder centavos", () => {
    const parametros = montarParametrosNovoAtendimento({
      ...base,
      valorDepois: false,
      valor: "89,90",
      veiculoNovo: { ...base.veiculoNovo, placa: " abc-1d23 " },
    });

    expect(parametros.p_valor_final).toBe(89.9);
    expect(parametros.p_veiculo?.placa).toBe("ABC-1D23");
  });

  it.each(["", "0", "0,00"])('rejeita valor informado inválido: "%s"', (valor) => {
    expect(() => montarParametrosNovoAtendimento({ ...base, valorDepois: false, valor })).toThrow(
      /maior que zero|monetário válido/,
    );
  });

  it("reutiliza cliente e veículo existentes sem recriar registros", () => {
    const parametros = montarParametrosNovoAtendimento({
      ...base,
      clienteId: "cliente-existente",
      clienteNovo: null,
      veiculoId: "veiculo-existente",
      veiculoNovo: null,
    });

    expect(parametros.p_cliente_id).toBe("cliente-existente");
    expect(parametros.p_cliente).toBeNull();
    expect(parametros.p_veiculo_id).toBe("veiculo-existente");
    expect(parametros.p_veiculo).toBeNull();
  });

  it("envia ao banco o momento personalizado em formato ISO", () => {
    const momento = momentoLocalParaIso("2026-10-05T14:30");
    const parametros = montarParametrosNovoAtendimento({
      ...base,
      momentoOperacao: momento,
    });

    expect(parametros.p_momento_operacao).toBe(new Date("2026-10-05T14:30").toISOString());
  });

  it("formata a data local para o campo de data e horário", () => {
    expect(dataHoraLocalInput(new Date(2026, 9, 5, 14, 30))).toBe("2026-10-05T14:30");
  });

  it("rejeita data ou horário personalizado inválido", () => {
    expect(() => momentoLocalParaIso("")).toThrow("Informe a data e o horário.");
    expect(() => momentoLocalParaIso("data-inválida")).toThrow("Data ou horário inválido.");
  });
});

describe("busca de cliente e veículo", () => {
  it("normaliza a placa de busca sem alterar o termo exibido", () => {
    expect(prepararBuscaCliente(" abc-1d23 ")).toEqual({
      termo: "abc-1d23",
      placa: "ABC1D23",
    });
  });

  it("remove caracteres reservados do filtro PostgREST", () => {
    expect(prepararBuscaCliente("Cliente%,(Teste)")).toEqual({
      termo: "ClienteTeste",
      placa: "CLIENTETESTE",
    });
  });
});
