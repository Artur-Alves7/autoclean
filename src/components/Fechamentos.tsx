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
      return linhas ?? [];
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
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Meus repasses</h1>
        {meusRepasses.isLoading && <p>Carregando...</p>}
        <ul className="space-y-2">
          {meusRepasses.data?.map((item) => (
            <li key={item.id} className="rounded-lg border bg-card p-3 text-sm">
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
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Fechamento diário</h1>
          <p className="text-sm text-muted-foreground">
            Atendimentos pendentes ficam explicitamente para outro fechamento.
          </p>
        </div>
        <label className="text-sm">
          Data
          <input
            type="date"
            className="ml-2 rounded-md border px-3 py-2"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo rotulo="Total recebido" valor={formatarDinheiro(resumo.total)} />
        <Resumo rotulo="Parte da empresa" valor={formatarDinheiro(resumo.empresa)} />
        <Resumo rotulo="Pendências impeditivas" valor={String(resumo.inconsistentes)} />
      </div>
      {!!resumo.porLavador.length && (
        <div className="rounded-lg border bg-card p-4">
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
      <ul className="space-y-2">
        {atendimentos.data?.map((item) => {
          const inconsistente =
            Number(item.total_pago) !== Number(item.valor_final) ||
            item.lavadores.length === 0 ||
            Number(item.valor_empresa_snapshot) > Number(item.valor_final);
          return (
            <li key={item.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  checked={pendentes.includes(item.id)}
                  onChange={() =>
                    setPendentes((lista) =>
                      lista.includes(item.id)
                        ? lista.filter((id) => id !== item.id)
                        : [...lista, item.id],
                    )
                  }
                />
                <span>
                  <strong>{item.nome_cliente_snapshot}</strong> · {item.veiculo_snapshot} ·{" "}
                  {formatarDinheiro(item.valor_final)}
                  <br />
                  <span className={inconsistente ? "text-destructive" : "text-muted-foreground"}>
                    {formatarDataHora(item.entregue_em)} · Pago: {formatarDinheiro(item.total_pago)}{" "}
                    · {item.lavadores.length} lavador(es)
                    {inconsistente ? " · Corrigir antes de fechar" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="ml-auto self-start text-primary hover:underline"
                  onClick={() => corrigir.mutate(item)}
                >
                  Corrigir
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        disabled={fechar.isPending || !atendimentos.data?.length}
        onClick={() => fechar.mutate()}
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {fechar.isPending ? "Confirmando..." : "Confirmar fechamento"}
      </button>
      {mensagem && (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
    </section>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{rotulo}</p>
      <p className="text-lg font-semibold">{valor}</p>
    </div>
  );
}
