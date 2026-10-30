import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw, Server, WalletCards } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { dataLocalIso } from "@/lib/fechamento";
import { formatarDinheiro, mensagemErro } from "@/lib/supabase-db";
import { supabase } from "@/integrations/supabase/client";

type ResumoOperacao = {
  data_operacao: string;
  quantidade_atendimentos: number;
  total_recebido_centavos: number;
  total_empresa_centavos: number;
  total_equipe_centavos: number;
  atualizado_em: string;
  origem: "redis" | "supabase";
  cache: "acerto" | "atualizado" | "indisponivel" | "desabilitado";
};

async function consultarResumo(dataOperacao: string, atualizarCache = false) {
  const { data, error } = await supabase.functions.invoke("resumo-operacao-cache", {
    body: { data_operacao: dataOperacao, atualizar_cache: atualizarCache },
  });
  if (error) throw error;
  if (!ehResumoOperacao(data)) throw new Error("A resposta do resumo diário é inválida.");
  return data;
}

function ehResumoOperacao(valor: unknown): valor is ResumoOperacao {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "data_operacao" in valor &&
    typeof valor.data_operacao === "string" &&
    "quantidade_atendimentos" in valor &&
    typeof valor.quantidade_atendimentos === "number" &&
    "total_recebido_centavos" in valor &&
    typeof valor.total_recebido_centavos === "number" &&
    "total_empresa_centavos" in valor &&
    typeof valor.total_empresa_centavos === "number" &&
    "total_equipe_centavos" in valor &&
    typeof valor.total_equipe_centavos === "number" &&
    "origem" in valor &&
    (valor.origem === "redis" || valor.origem === "supabase") &&
    "cache" in valor &&
    typeof valor.cache === "string"
  );
}

function mensagemCache(resumo: ResumoOperacao) {
  if (resumo.cache === "acerto") return "Carregado do cache Redis";
  if (resumo.cache === "atualizado") return "Consultado no Supabase e atualizado no Redis";
  if (resumo.cache === "indisponivel") return "Consultado no Supabase; Redis indisponível";
  return "Consultado no Supabase; cache ainda não configurado";
}

export function ResumoOperacaoCache() {
  const [dataOperacao, setDataOperacao] = useState(dataLocalIso());
  const queryClient = useQueryClient();
  const resumo = useQuery({
    queryKey: ["resumo-operacao-cache", dataOperacao],
    queryFn: () => consultarResumo(dataOperacao),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const atualizar = useMutation({
    mutationFn: () => consultarResumo(dataOperacao, true),
    onSuccess: (dados) => {
      queryClient.setQueryData(["resumo-operacao-cache", dataOperacao], dados);
    },
  });
  const dados = atualizar.data ?? resumo.data;
  const carregando = resumo.isLoading || atualizar.isPending;
  const erro = atualizar.error ?? resumo.error;

  return (
    <article className="lc-panel border-primary/10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-sm">
            <WalletCards aria-hidden="true" />
          </span>
          <div>
            <span className="lc-eyebrow">Resumo operacional</span>
            <h2 className="mt-1 text-lg font-semibold">Movimento diário em cache</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Consulta rápida para conferência dos valores registrados no dia.
            </p>
          </div>
        </div>
        <label className="grid gap-1 text-sm font-medium">
          Data da operação
          <input
            aria-label="Data do resumo operacional"
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            max={dataLocalIso()}
            onChange={(evento) => setDataOperacao(evento.target.value)}
            type="date"
            value={dataOperacao}
          />
        </label>
      </div>

      {carregando ? (
        <p className="mt-6 text-sm text-muted-foreground">Carregando resumo da operação...</p>
      ) : erro ? (
        <div className="mt-6 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar o resumo: {mensagemErro(erro)}
        </div>
      ) : dados ? (
        <>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResumoItem
              titulo="Atendimentos concluídos"
              valor={String(dados.quantidade_atendimentos)}
            />
            <ResumoItem
              titulo="Total recebido"
              valor={formatarDinheiro(dados.total_recebido_centavos / 100)}
            />
            <ResumoItem
              titulo="Parte da empresa"
              valor={formatarDinheiro(dados.total_empresa_centavos / 100)}
            />
            <ResumoItem
              titulo="Parte da equipe"
              valor={formatarDinheiro(dados.total_equipe_centavos / 100)}
            />
          </dl>
          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {dados.origem === "redis" ? (
                <Server aria-hidden="true" size={15} />
              ) : (
                <Database aria-hidden="true" size={15} />
              )}
              {mensagemCache(dados)}
            </p>
            <Button
              aria-busy={atualizar.isPending}
              disabled={atualizar.isPending}
              onClick={() => atualizar.mutate()}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw
                aria-hidden="true"
                className={atualizar.isPending ? "animate-spin" : undefined}
              />
              Atualizar dados
            </Button>
          </div>
        </>
      ) : null}
    </article>
  );
}

function ResumoItem({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </dt>
      <dd className="mt-2 text-xl font-bold tabular-nums text-foreground">{valor}</dd>
    </div>
  );
}
