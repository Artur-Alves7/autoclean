import { describe, expect, it } from "vitest";
import { origemDoRetornoAuth, validarNovaSenha } from "@/lib/auth";

describe("fluxos de primeiro acesso e recuperação", () => {
  it.each([
    ["https://app.teste.invalid/#type=invite&access_token=simulado", "convite"],
    ["https://app.teste.invalid/?type=recovery", "recuperacao"],
    ["https://app.teste.invalid/", null],
  ])("identifica a origem do retorno de autenticação em %s", (url, esperado) => {
    expect(origemDoRetornoAuth(url)).toBe(esperado);
  });

  it("exige ao menos oito caracteres para a nova senha", () => {
    expect(validarNovaSenha("curta", "curta")).toBe("A senha deve ter pelo menos 8 caracteres.");
  });

  it("exige que a confirmação coincida", () => {
    expect(validarNovaSenha("senha-segura", "senha-diferente")).toBe("As senhas não coincidem.");
  });

  it("aceita uma senha válida e confirmada", () => {
    expect(validarNovaSenha("senha-segura", "senha-segura")).toBeNull();
  });
});
