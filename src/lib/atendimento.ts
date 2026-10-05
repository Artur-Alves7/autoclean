import { reaisParaCentavos } from "@/lib/regras";
import { formatarPlaca, formatarTelefone } from "@/lib/formatacao";

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
  momentoOperacao?: string | null;
};

export function prepararBuscaCliente(valor: string) {
  const termo = valor.trim().replace(/[%(),]/g, "");
  const digitosTelefone = valor.replace(/\D/g, "").slice(0, 11);
  return {
    termo,
    telefone: digitosTelefone ? digitosTelefone.split("").join("%") : "",
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
          telefone: formatarTelefone(entrada.clienteNovo.telefone),
        }
      : null,
    p_veiculo_id: entrada.veiculoId,
    p_veiculo: entrada.veiculoNovo
      ? {
          categoria_veiculo_id: entrada.veiculoNovo.categoria_veiculo_id,
          marca: entrada.veiculoNovo.marca.trim(),
          modelo: entrada.veiculoNovo.modelo.trim(),
          placa: formatarPlaca(entrada.veiculoNovo.placa) || null,
          cor: entrada.veiculoNovo.cor.trim() || null,
          observacoes: entrada.veiculoNovo.observacoes.trim() || null,
        }
      : null,
    p_valor_final: valorFinal,
    p_observacoes: entrada.observacoes.trim() || null,
    p_momento_operacao: entrada.momentoOperacao || null,
  };
}

export function momentoLocalParaIso(valor: string) {
  if (!valor) throw new Error("Informe a data e o horário.");
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) throw new Error("Data ou horário inválido.");
  return data.toISOString();
}

export function dataHoraLocalInput(data = new Date()) {
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
