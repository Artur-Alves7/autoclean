import { reaisParaCentavos } from "@/lib/regras";

type ClienteNovo = {
  nome_completo: string;
  telefone: string;
};

type VeiculoNovo = {
  categoria_veiculo_id: string;
  marca: string;
  modelo: string;
  placa: string;
  cor: string;
  observacoes: string;
};

type EntradaNovoAtendimento = {
  servicoId: string;
  lavadores: string[];
  clienteId: string | null;
  clienteNovo: ClienteNovo | null;
  veiculoId: string | null;
  veiculoNovo: VeiculoNovo | null;
  valorDepois: boolean;
  valor: string;
  observacoes: string;
};

export function prepararBuscaCliente(valor: string) {
  const termo = valor.trim().replace(/[%(),]/g, "");
  return {
    termo,
    placa: termo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
  };
}

export function montarParametrosNovoAtendimento(entrada: EntradaNovoAtendimento) {
  const lavadores = [...new Set(entrada.lavadores.filter(Boolean))];
  if (!entrada.servicoId) throw new Error("Selecione o serviço.");
  if (!lavadores.length) throw new Error("Selecione pelo menos um lavador.");
  if (!entrada.clienteId && !entrada.clienteNovo) throw new Error("Informe o cliente.");
  if (!entrada.veiculoId && !entrada.veiculoNovo) throw new Error("Informe o veículo.");

  let valorFinal: number | null = null;
  if (!entrada.valorDepois) {
    const centavos = reaisParaCentavos(entrada.valor);
    if (centavos <= 0) throw new Error("Informe um valor final maior que zero.");
    valorFinal = centavos / 100;
  }

  return {
    p_servico_id: entrada.servicoId,
    p_lavadores: lavadores,
    p_cliente_id: entrada.clienteId,
    p_cliente: entrada.clienteNovo
      ? {
          nome_completo: entrada.clienteNovo.nome_completo.trim(),
          telefone: entrada.clienteNovo.telefone.trim(),
        }
      : null,
    p_veiculo_id: entrada.veiculoId,
    p_veiculo: entrada.veiculoNovo
      ? {
          categoria_veiculo_id: entrada.veiculoNovo.categoria_veiculo_id,
          marca: entrada.veiculoNovo.marca.trim(),
          modelo: entrada.veiculoNovo.modelo.trim(),
          placa: entrada.veiculoNovo.placa.trim().toUpperCase() || null,
          cor: entrada.veiculoNovo.cor.trim() || null,
          observacoes: entrada.veiculoNovo.observacoes.trim() || null,
        }
      : null,
    p_valor_final: valorFinal,
    p_observacoes: entrada.observacoes.trim() || null,
  };
}
