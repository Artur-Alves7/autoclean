import { Button } from "@/components/ui/button";
import { CheckCheck, LoaderCircle, Wallet } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { Papel } from "@/lib/acesso";
import { reaisParaCentavos } from "@/lib/regras";
import { db, formatarDinheiro, formatarDataHora, mensagemErro } from "@/lib/supabase-db";

type AtendimentoFechamento = {
  id: string;
  entregue_em: string;
  nome_cliente_snapshot: string;
  veiculo_snapshot: string;
  valor_final: number;
  valor_empresa_snapshot: number;
  total_pago: number;
  lavadores: { perfil_id: string; nome: string; ordem_rateio: number }[];
};

type Repasse = {
  id: string;
  valor: number;
  atendimentos: { nome_cliente_snapshot: string; veiculo_snapshot: string } | null;
  fechamentos_diarios: { data_operacao: string; status: string } | null;
};

export function Fechamentos({ perfilId, papel }: { perfilId: string; papel: Papel }) {
  const qc = useQueryClient();
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [pendentes, setPendentes] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const atendimentos = useQuery({
    queryKey: ["atendimentos-fechamento", data],
    enabled: papel === "administrador",
    queryFn: async () => {
      const inicio = `${data}T00:00:00`;
      const fim = `${data}T23:59:59.999`;
      const { data: linhas, error } = await db()
        .from("vw_painel_atendimentos")
        .select(
          "id, entregue_em, nome_cliente_snapshot, veiculo_snapshot, valor_final, valor_empresa_snapshot, total_pago, lavadores",
        )
        .eq("status", "entregue")
        .gte("entregue_em", inicio)
        .lte("entregue_em", fim)
        .order("entregue_em");
      if (error) throw error;
      return linhas as unknown as AtendimentoFechamento[];
    },
  });

  const meusRepasses = useQuery({
    queryKey: ["meus-repasses", perfilId],
    enabled: papel === "lavador",
    queryFn: async () => {
      const { data: linhas, error } = await db()
        .from("itens_fechamento")
        .select(
          "id, valor, criado_em, atendimentos(nome_cliente_snapshot, veiculo_snapshot), fechamentos_diarios(data_operacao, status)",
        )
        .eq("tipo_destinatario", "lavador")
        .eq("perfil_destinatario_id", perfilId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      // O cliente genérico não infere as relações muitos-para-um desta consulta.
      return (linhas ?? []) as unknown as Repasse[];
    },
  });

  const resumo = useMemo(() => {
    const incluidos = (atendimentos.data ?? []).filter((item) => !pendentes.includes(item.id));
    const porLavador = new Map<string, { nome: string; valor: number }>();
    incluidos.forEach((item) => {
      const restanteCentavos = Math.round(
        (Number(item.valor_final) - Number(item.valor_empresa_snapshot)) * 100,
      );
      const base = item.lavadores.length ? Math.floor(restanteCentavos / item.lavadores.length) : 0;
      const sobra = item.lavadores.length ? restanteCentavos % item.lavadores.length : 0;
      item.lavadores.forEach((lavador, indice) => {
        const atual = porLavador.get(lavador.perfil_id) ?? { nome: lavador.nome, valor: 0 };
        atual.valor += (base + (indice < sobra ? 1 : 0)) / 100;
        porLavador.set(lavador.perfil_id, atual);
      });
    });
    return {
      empresa: incluidos.reduce((total, item) => total + Number(item.valor_empresa_snapshot), 0),
      total: incluidos.reduce((total, item) => total + Number(item.valor_final), 0),
      inconsistentes: incluidos.filter(
        (item) =>
          Number(item.total_pago) !== Number(item.valor_final) ||
          item.lavadores.length === 0 ||
          Number(item.valor_empresa_snapshot) > Number(item.valor_final),
      ).length,
      porLavador: [...porLavador.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [atendimentos.data, pendentes]);

  const fechar = useMutation({
    mutationFn: async () => {
      if (resumo.inconsistentes)
        throw new Error("Corrija as pendências antes de confirmar o fechamento.");
      const { error } = await db().rpc("rpc_fechar_repasses_dia", {
        p_data_operacao: data,
        p_atendimentos_pendentes: pendentes,
        p_observacoes: pendentes.length ? "Atendimentos deixados para fechamento posterior." : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMensagem("Fechamento confirmado. Os lançamentos são imutáveis.");
      qc.invalidateQueries({ queryKey: ["atendimentos-fechamento"] });
    },
    onError: (erro) => setMensagem(mensagemErro(erro)),
  });
  const corrigir = useMutation({
    mutationFn: async (item: AtendimentoFechamento) => {
      const valorTexto = window.prompt(
        "Novo valor final (R$)",
        String(item.valor_final).replace(".", ","),
      );
      if (valorTexto === null) return;
      const forma = window
        .prompt("Forma de pagamento: dinheiro, pix, debito, credito ou outro", "pix")
        ?.toLowerCase();
      if (!forma || !["dinheiro", "pix", "debito", "credito", "outro"].includes(forma))
        throw new Error("Forma de pagamento inválida.");
      const motivo = window.prompt("Motivo da correção (obrigatório)");
      if (!motivo || motivo.trim().length < 5) throw new Error("Informe o motivo da correção.");
      const centavos = reaisParaCentavos(valorTexto);
      if (centavos <= 0) throw new Error("Informe um valor final maior que zero.");
      const { error } = await db().rpc("rpc_corrigir_atendimento_entregue", {
        p_atendimento_id: item.id,
        p_valor_final: centavos / 100,
        p_pagamentos: [{ forma_pagamento: forma, valor_centavos: centavos }],
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMensagem("Correção registrada no histórico.");
      qc.invalidateQueries({ queryKey: ["atendimentos-fechamento"] });
    },
    onError: (erro) => setMensagem(mensagemErro(erro)),
  });

  if (papel === "lavador") {
    return (
      <section className="lc-page">
        <div className="lc-page-heading">
          <div>
            <span className="lc-eyebrow">Financeiro</span>
            <h1 className="mt-2">Meus repasses</h1>
            <p>Acompanhe os valores registrados para você.</p>
          </div>
        </div>
        {meusRepasses.isLoading && (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando repasses...
          </p>
        )}
        {meusRepasses.error && (
          <p role="alert" className="lc-message">
            {mensagemErro(meusRepasses.error)}
          </p>
        )}
        {meusRepasses.data?.length === 0 && (
          <div className="lc-empty">
            <Wallet aria-hidden="true" />
            Nenhum repasse registrado.
          </div>
        )}
        <ul className="space-y-2">
          {meusRepasses.data?.map((item) => (
            <li key={item.id} className="lc-panel text-sm">
              <strong>{formatarDinheiro(item.valor)}</strong> ·{" "}
              {item.atendimentos?.veiculo_snapshot ?? "Atendimento"}
              <span className="ml-2 text-muted-foreground">
                {item.fechamentos_diarios?.data_operacao}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="lc-page">
      <div className="lc-page-heading">
        <div>
          <span className="lc-eyebrow">Financeiro</span>
          <h1 className="text-2xl font-bold tracking-tight">Fechamento diário</h1>
          <p className="text-sm text-muted-foreground">
            Atendimentos pendentes ficam explicitamente para outro fechamento.
          </p>
        </div>
        <label className="lc-label w-full sm:w-auto">
          Data do fechamento
          <input
            type="date"
            className="lc-field"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
      </div>
      {atendimentos.isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando atendimentos do dia...
        </p>
      )}
      {atendimentos.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(atendimentos.error)}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo
          rotulo="Total recebido"
          valor={atendimentos.data ? formatarDinheiro(resumo.total) : "—"}
        />
        <Resumo
          rotulo="Parte da empresa"
          valor={atendimentos.data ? formatarDinheiro(resumo.empresa) : "—"}
        />
        <Resumo
          rotulo="Pendências impeditivas"
          valor={atendimentos.data ? String(resumo.inconsistentes) : "—"}
        />
      </div>
      {!!resumo.porLavador.length && (
        <div className="lc-panel">
          <h2 className="mb-2 font-medium">Valores por lavador</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {resumo.porLavador.map((item) => (
              <li key={item.nome} className="flex justify-between gap-3">
                <span>{item.nome}</span>
                <strong>{formatarDinheiro(item.valor)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Revisão dos atendimentos</h2>
        <p className="text-xs text-muted-foreground">
          Marque os que ficarão para outro fechamento.
        </p>
      </div>
      {atendimentos.data?.length === 0 && (
        <div className="lc-empty">
          <Wallet aria-hidden="true" />
          Nenhum atendimento entregue nesta data.
        </div>
      )}
      <ul className="space-y-3">
        {atendimentos.data?.map((item) => {
          const inconsistente =
            Number(item.total_pago) !== Number(item.valor_final) ||
            item.lavadores.length === 0 ||
            Number(item.valor_empresa_snapshot) > Number(item.valor_final);
          return (
            <li key={item.id} className="lc-panel text-sm">
              <div className="flex flex-wrap items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Deixar atendimento de ${item.nome_cliente_snapshot} para outro fechamento`}
                  className="mt-1"
                  checked={pendentes.includes(item.id)}
                  onChange={() =>
                    setPendentes((lista) =>
                      lista.includes(item.id)
                        ? lista.filter((id) => id !== item.id)
                        : [...lista, item.id],
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <strong>{item.nome_cliente_snapshot}</strong> · {item.veiculo_snapshot} ·{" "}
                  {formatarDinheiro(item.valor_final)}
                  <br />
                  <span className={inconsistente ? "text-destructive" : "text-muted-foreground"}>
                    {formatarDataHora(item.entregue_em)} · Pago: {formatarDinheiro(item.total_pago)}{" "}
                    · {item.lavadores.length} lavador(es)
                    {inconsistente ? " · Corrigir antes de fechar" : ""}
                  </span>
                </span>
                <Button
                  variant="outline"
                  type="button"
                  className="ml-auto self-start text-primary hover:underline"
                  disabled={corrigir.isPending}
                  onClick={() => corrigir.mutate(item)}
                >
                  Corrigir
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        disabled={fechar.isPending || !atendimentos.data?.length}
        aria-busy={fechar.isPending}
        onClick={() => fechar.mutate()}
        className="w-full sm:w-fit"
      >
        {fechar.isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <CheckCheck aria-hidden="true" />
        )}
        {fechar.isPending ? "Confirmando..." : "Confirmar fechamento"}
      </Button>
      {mensagem && (
        <p role="status" className="lc-message">
          {mensagem}
        </p>
      )}
    </section>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="lc-panel">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{valor}</p>
    </div>
  );
}
