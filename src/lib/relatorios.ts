export type CelulaRelatorio = string | number | null | undefined;
export type EscopoRelatorio = "dia" | "periodo" | "historico";

export type FiltroRelatorio = {
  escopo: EscopoRelatorio;
  data: string;
  inicio: string;
  fim: string;
};

export function intervaloRelatorio(filtro: FiltroRelatorio) {
  if (filtro.escopo === "historico") return null;
  const inicio = filtro.escopo === "dia" ? filtro.data : filtro.inicio;
  const fim = filtro.escopo === "dia" ? filtro.data : filtro.fim;
  if (!inicio || !fim) throw new Error("Informe as datas do relatório.");
  if (fim < inicio) throw new Error("A data final não pode ser anterior à data inicial.");

  const inicioLocal = new Date(`${inicio}T00:00:00`);
  const fimLocal = new Date(`${fim}T00:00:00`);
  fimLocal.setDate(fimLocal.getDate() + 1);
  return { inicio: inicioLocal.toISOString(), fim: fimLocal.toISOString() };
}

export function sufixoRelatorio(filtro: FiltroRelatorio) {
  if (filtro.escopo === "historico") return "historico-completo";
  if (filtro.escopo === "dia") return filtro.data;
  return `${filtro.inicio}-a-${filtro.fim}`;
}

export function dataDentroDoRelatorio(data: string | null | undefined, filtro: FiltroRelatorio) {
  if (filtro.escopo === "historico") return true;
  if (!data) return false;
  const dia = data.slice(0, 10);
  if (filtro.escopo === "dia") return dia === filtro.data;
  return dia >= filtro.inicio && dia <= filtro.fim;
}

function escaparCelula(valor: CelulaRelatorio) {
  const texto = valor == null ? "" : String(valor);
  return `"${texto.replaceAll('"', '""')}"`;
}

export function gerarCsv(cabecalhos: readonly string[], linhas: readonly CelulaRelatorio[][]) {
  return [cabecalhos, ...linhas].map((linha) => linha.map(escaparCelula).join(";")).join("\r\n");
}

export function baixarCsv(
  nomeArquivo: string,
  cabecalhos: readonly string[],
  linhas: readonly CelulaRelatorio[][],
) {
  const conteudo = `\uFEFF${gerarCsv(cabecalhos, linhas)}`;
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
