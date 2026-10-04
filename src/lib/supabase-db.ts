import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export const db = () => supabase as unknown as SupabaseClient;

export function mensagemErro(erro: unknown) {
  const mensagem = (erro as { message?: string; code?: string })?.message ?? "";
  const codigo = (erro as { code?: string })?.code ?? "";
  if (codigo === "23505" && /placa/i.test(mensagem))
    return "Já existe um veículo cadastrado com esta placa.";
  if (codigo === "23505" && /fechamentos_diarios_data_operacao_key|data_operacao/i.test(mensagem)) {
    return "O fechamento desta data já foi confirmado.";
  }
  if (/row-level security|permission|42501/i.test(`${codigo} ${mensagem}`)) {
    return "Você não tem permissão para realizar esta ação.";
  }
  if (/fetch|network/i.test(mensagem)) return "Falha de conexão. Verifique sua internet.";
  return mensagem || "Erro inesperado. Tente novamente.";
}

export const formatarDinheiro = (valor: number) =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatarDataHora = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
