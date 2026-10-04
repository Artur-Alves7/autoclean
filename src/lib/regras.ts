export type StatusAtendimento =
  "aguardando" | "em_lavagem" | "pronto_para_retirada" | "entregue" | "cancelado";

export type PagamentoEntrada = {
  forma_pagamento: "dinheiro" | "pix" | "debito" | "credito" | "outro";
  valor_centavos: number;
};

const TRANSICOES: Record<StatusAtendimento, readonly StatusAtendimento[]> = {
  aguardando: ["em_lavagem", "cancelado"],
  em_lavagem: ["pronto_para_retirada", "cancelado"],
  pronto_para_retirada: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

export function podeTransicionar(de: StatusAtendimento, para: StatusAtendimento) {
  return TRANSICOES[de].includes(para);
}

export function reaisParaCentavos(valor: string | number) {
  let numero: number;
  if (typeof valor === "number") {
    numero = valor;
  } else {
    const texto = valor.trim();
    if (!/^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/.test(texto)) {
      throw new Error("Informe um valor monetário válido, com no máximo dois centavos.");
    }
    numero = Number(texto.replace(",", "."));
  }
  if (!Number.isFinite(numero) || numero < 0) throw new Error("Informe um valor monetário válido.");
  return Math.round((numero + Number.EPSILON) * 100);
}

export function centavosParaReais(valorCentavos: number) {
  return valorCentavos / 100;
}

export function somaPagamentosCentavos(pagamentos: readonly PagamentoEntrada[]) {
  return pagamentos.reduce((total, pagamento) => total + pagamento.valor_centavos, 0);
}

export function validarEntrega(
  valorFinalCentavos: number | null,
  lavadores: number,
  pagamentos: readonly PagamentoEntrada[],
) {
  if (valorFinalCentavos == null) return "Informe o valor final antes da entrega.";
  if (!Number.isInteger(valorFinalCentavos) || valorFinalCentavos <= 0) {
    return "Informe um valor final maior que zero.";
  }
  if (lavadores < 1) return "Vincule pelo menos um lavador antes da entrega.";
  if (!pagamentos.length) return "Informe pelo menos uma forma de pagamento.";
  if (
    pagamentos.some(
      (pagamento) => !Number.isInteger(pagamento.valor_centavos) || pagamento.valor_centavos <= 0,
    )
  ) {
    return "Cada pagamento deve ter um valor maior que zero.";
  }
  if (somaPagamentosCentavos(pagamentos) !== valorFinalCentavos) {
    return "A soma dos pagamentos deve ser exatamente igual ao valor final.";
  }
  return null;
}

export function dividirRepasseCentavos(
  totalCentavos: number,
  empresaCentavos: number,
  quantidadeLavadores: number,
) {
  if (
    !Number.isInteger(totalCentavos) ||
    !Number.isInteger(empresaCentavos) ||
    totalCentavos < 0 ||
    empresaCentavos < 0
  ) {
    throw new Error("Valores de repasse devem ser centavos inteiros não negativos.");
  }
  if (empresaCentavos > totalCentavos)
    throw new Error("A parte da empresa não pode superar o valor final.");
  if (quantidadeLavadores < 1 || !Number.isInteger(quantidadeLavadores)) {
    throw new Error("Informe pelo menos um lavador.");
  }
  const restante = totalCentavos - empresaCentavos;
  const base = Math.floor(restante / quantidadeLavadores);
  const sobra = restante % quantidadeLavadores;
  return Array.from(
    { length: quantidadeLavadores },
    (_, indice) => base + (indice < sobra ? 1 : 0),
  );
}

export function proximoStatus(status: StatusAtendimento) {
  if (status === "aguardando") return "em_lavagem" as const;
  if (status === "em_lavagem") return "pronto_para_retirada" as const;
  if (status === "pronto_para_retirada") return "entregue" as const;
  return null;
}
