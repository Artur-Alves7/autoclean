import { Button } from "@/components/ui/button";
import { CheckCheck, LoaderCircle, Wallet } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import type { Papel } from "@/lib/acesso";
import { calcularResumoFechamento, dataLocalIso } from "@/lib/fechamento";
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
  const hoje = dataLocalIso();
  const [data, setData] = useState(hoje);
  const [pendentes, setPendentes] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const fechandoRef = useRef(false);

  const atendimentos = useQuery({
    queryKey: ["atendimentos-fechamento", data],
    enabled: papel === "administrador",
    queryFn: async () => {
      const { data: linhas, error } = await db().rpc("rpc_listar_atendimentos_fechamento", {
        p_data_operacao: data,
      });
      if (error) throw error;
      return linhas as unknown as AtendimentoFechamento[];
    },
  });

  const fechamentoDia = useQuery({
    queryKey: ["fechamento-diario", data],
    enabled: papel === "administrador",
    queryFn: async () => {
      const { data: linha, error } = await db()
        .from("fechamentos_diarios")
        .select("id, status, confirmado_em")
        .eq("data_operacao", data)
        .maybeSingle();
      if (error) throw error;
      return linha as { id: string; status: string; confirmado_em: string | null } | null;
    },
  });

  const ajustesPendentes = useQuery({
    queryKey: ["ajustes-repasse-pendentes", data],
    enabled: papel === "administrador",
    queryFn: async () => {
      const { data: linhas, error } = await db()
        .from("ajustes_repasse_pendentes")
        .select("id, valor")
        .is("processado_em", null)
        .lte("criado_em", `${data}T23:59:59.999`);
      if (error) throw error;
      return (linhas ?? []) as { id: string; valor: number }[];
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
    return calcularResumoFechamento(atendimentos.data ?? [], pendentes);
  }, [atendimentos.data, pendentes]);

  const totalAjustesCentavos = (ajustesPendentes.data ?? []).reduce(
    (total, item) => total + reaisParaCentavos(Number(item.valor)),
    0,
  );
  const jaConfirmado = fechamentoDia.data?.status === "confirmado";
  const possuiRepasses = Boolean(atendimentos.data?.some((item) => !pendentes.includes(item.id)));
  const possuiLancamentos = possuiRepasses || Boolean(ajustesPendentes.data?.length);

  const fechar = useMutation({
    mutationFn: async () => {
      if (jaConfirmado) throw new Error("O fechamento desta data já foi confirmado.");
      if (resumo.inconsistentes)
        throw new Error("Corrija as pendências antes de confirmar o fechamento.");
      const { data: fechamentoId, error } = await db().rpc("rpc_fechar_repasses_dia", {
        p_data_operacao: data,
        p_atendimentos_pendentes: pendentes,
        p_observacoes: pendentes.length ? "Atendimentos deixados para fechamento posterior." : null,
      });
      if (error) throw error;
      return fechamentoId as string;
    },
    onSuccess: (fechamentoId) => {
      qc.setQueryData(["fechamento-diario", data], {
        id: fechamentoId,
        status: "confirmado",
        confirmado_em: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["atendimentos-fechamento"] });
      qc.invalidateQueries({ queryKey: ["ajustes-repasse-pendentes"] });
    },
    onError: (erro) => setMensagem(mensagemErro(erro)),
  });
  const confirmarFechamento = () => {
    if (fechandoRef.current || jaConfirmado) return;
    fechandoRef.current = true;
    setMensagem(null);
    fechar.mutate(undefined, {
      onSettled: () => {
        fechandoRef.current = false;
      },
    });
  };
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
      qc.invalidateQueries({ queryKey: ["ajustes-repasse-pendentes"] });
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
            Pendências de dias anteriores são carregadas até entrarem em um fechamento.
          </p>
        </div>
        <label className="lc-label w-full sm:w-auto">
          Data do fechamento
          <input
            type="date"
            max={hoje}
            className="lc-field"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              setPendentes([]);
              setMensagem(null);
            }}
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
      {fechamentoDia.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(fechamentoDia.error)}
        </p>
      )}
      {ajustesPendentes.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(ajustesPendentes.error)}
        </p>
      )}
      {jaConfirmado && (
        <p role="status" className="lc-message">
          Fechamento desta data já confirmado. Novos atendimentos e ajustes serão considerados no
          próximo fechamento.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Resumo
          rotulo="Total recebido"
          valor={atendimentos.data ? formatarDinheiro(resumo.totalCentavos / 100) : "—"}
        />
        <Resumo
          rotulo="Parte da empresa"
          valor={atendimentos.data ? formatarDinheiro(resumo.empresaCentavos / 100) : "—"}
        />
        <Resumo
          rotulo="Pendências impeditivas"
          valor={atendimentos.data ? String(resumo.inconsistentes) : "—"}
        />
        <Resumo
          rotulo="Ajustes pendentes"
          valor={
            ajustesPendentes.data
              ? `${ajustesPendentes.data.length} · ${formatarDinheiro(totalAjustesCentavos / 100)}`
              : "—"
          }
        />
      </div>
      {!!resumo.porLavador.length && (
        <div className="lc-panel">
          <h2 className="mb-2 font-medium">Valores por lavador</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {resumo.porLavador.map((item) => (
              <li key={item.nome} className="flex justify-between gap-3">
                <span>{item.nome}</span>
                <strong>{formatarDinheiro(item.valorCentavos / 100)}</strong>
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
          Nenhum atendimento elegível até esta data.
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
                  disabled={jaConfirmado}
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
        disabled={
          fechar.isPending ||
          fechamentoDia.isLoading ||
          ajustesPendentes.isLoading ||
          jaConfirmado ||
          !possuiLancamentos
        }
        aria-busy={fechar.isPending}
        onClick={confirmarFechamento}
        className="w-full sm:w-fit"
      >
        {fechar.isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <CheckCheck aria-hidden="true" />
        )}
        {fechar.isPending
          ? "Confirmando..."
          : jaConfirmado
            ? "Fechamento confirmado"
            : "Confirmar fechamento"}
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
