import { dividirRepasseCentavos, reaisParaCentavos } from "@/lib/regras";

type LavadorFechamento = {
  perfil_id: string;
  nome: string;
  ordem_rateio: number;
};

export type AtendimentoParaFechamento = {
  id: string;
  valor_final: number;
  valor_empresa_snapshot: number;
  total_pago: number;
  lavadores: LavadorFechamento[];
};

export function dataLocalIso(data = new Date()) {
  const deslocamento = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 10);
}

export function calcularResumoFechamento(
  atendimentos: readonly AtendimentoParaFechamento[],
  pendentes: readonly string[],
) {
  const pendentesSet = new Set(pendentes);
  const incluidos = atendimentos.filter((item) => !pendentesSet.has(item.id));
  const porLavador = new Map<string, { nome: string; valorCentavos: number }>();
  let empresaCentavos = 0;
  let totalCentavos = 0;
  let inconsistentes = 0;

  incluidos.forEach((item) => {
    const valorFinalCentavos = reaisParaCentavos(Number(item.valor_final));
    const valorEmpresaCentavos = reaisParaCentavos(Number(item.valor_empresa_snapshot));
    const totalPagoCentavos = reaisParaCentavos(Number(item.total_pago));
    totalCentavos += valorFinalCentavos;
    empresaCentavos += valorEmpresaCentavos;

    if (
      valorFinalCentavos <= 0 ||
      totalPagoCentavos !== valorFinalCentavos ||
      item.lavadores.length === 0 ||
      valorEmpresaCentavos > valorFinalCentavos
    ) {
      inconsistentes += 1;
      return;
    }

    const lavadores = [...item.lavadores].sort((a, b) => a.ordem_rateio - b.ordem_rateio);
    const rateios = dividirRepasseCentavos(
      valorFinalCentavos,
      valorEmpresaCentavos,
      lavadores.length,
    );
    lavadores.forEach((lavador, indice) => {
      const atual = porLavador.get(lavador.perfil_id) ?? {
        nome: lavador.nome,
        valorCentavos: 0,
      };
      atual.valorCentavos += rateios[indice]!;
      porLavador.set(lavador.perfil_id, atual);
    });
  });

  return {
    empresaCentavos,
    totalCentavos,
    inconsistentes,
    porLavador: [...porLavador.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}
