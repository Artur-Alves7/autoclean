type DadosNovoVeiculo = {
  categoria_veiculo_id: string;
  marca: string;
  modelo: string;
  placa?: string;
  cor?: string;
};

export function montarPayloadNovoVeiculo(clienteId: string, veiculo: DadosNovoVeiculo) {
  return {
    cliente_id: clienteId,
    categoria_veiculo_id: veiculo.categoria_veiculo_id,
    marca: veiculo.marca,
    modelo: veiculo.modelo,
    placa: veiculo.placa ? veiculo.placa.toUpperCase() : null,
    cor: veiculo.cor || null,
  };
}
