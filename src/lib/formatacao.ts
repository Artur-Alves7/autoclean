export function formatarTelefone(valor: string) {
  const numeros = valor.replace(/\D/g, "").slice(0, 11);
  if (!numeros) return "";
  if (numeros.length === 1) return `(${numeros}`;
  if (numeros.length === 2) return `(${numeros})`;

  const ddd = numeros.slice(0, 2);
  const telefone = numeros.slice(2);
  if (telefone.length <= 4) return `(${ddd}) ${telefone}`;

  const tamanhoPrefixo = numeros.length === 11 ? 5 : 4;
  return `(${ddd}) ${telefone.slice(0, tamanhoPrefixo)}-${telefone.slice(tamanhoPrefixo)}`;
}

export function formatarPlaca(valor: string) {
  const placa = valor
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
  if (placa.length <= 3) return placa;
  return `${placa.slice(0, 3)}-${placa.slice(3)}`;
}

export function normalizarEmail(valor: string) {
  return valor.trim().toLowerCase();
}
