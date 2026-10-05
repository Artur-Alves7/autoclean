export type CelulaRelatorio = string | number | null | undefined;

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
