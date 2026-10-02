export type OrigemDefinicaoSenha = "convite" | "recuperacao";

export function origemDoRetornoAuth(href: string): OrigemDefinicaoSenha | null {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const tipo = hash.get("type") ?? url.searchParams.get("type");
  if (tipo === "recovery") return "recuperacao";
  if (tipo === "invite") return "convite";
  return null;
}

export function validarNovaSenha(senha: string, confirmacao: string) {
  if (senha.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (senha !== confirmacao) return "As senhas não coincidem.";
  return null;
}
