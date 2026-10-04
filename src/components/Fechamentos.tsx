import { Button } from "@/components/ui/button";
import { DialogoFormulario } from "@/components/DialogoFormulario";
import {
  Building2,
  CalendarDays,
  CarFront,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  ReceiptText,
  type LucideIcon,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import type { Papel } from "@/lib/acesso";
import {
  calcularResumoFechamento,
  dataLocalIso,
  deslocarDataLocal,
  intervaloDataLocal,
} from "@/lib/fechamento";
import { reaisParaCentavos } from "@/lib/regras";
import { db, formatarDinheiro, formatarDataHora, mensagemErro } from "@/lib/supabase-db";

type AtendimentoFechamento = {
  id: string;
  entregue_em: string;
  nome_cliente_snapshot: string;
  veiculo_snapshot: string;
  servico_snapshot: string;
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

type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito" | "outro";

type CorrecaoAtendimento = {
  item: AtendimentoFechamento;
  valor: string;
  forma: FormaPagamento;
  motivo: string;
};

export function Fechamentos({ perfilId, papel }: { perfilId: string; papel: Papel }) {
  const qc = useQueryClient();
  const hoje = dataLocalIso();
  const [data, setData] = useState(hoje);
  const [visao, setVisao] = useState<"movimento" | "fechamento">("movimento");
  const [pendentes, setPendentes] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [correcao, setCorrecao] = useState<CorrecaoAtendimento | null>(null);
  const [erroCorrecao, setErroCorrecao] = useState<string | null>(null);
  const fechandoRef = useRef(false);
  const intervalo = intervaloDataLocal(data);

  const atendimentos = useQuery({
    queryKey: ["atendimentos-fechamento", data],
    enabled: papel === "administrador" && visao === "fechamento",
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
    enabled: papel === "administrador" && visao === "fechamento",
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

  const historicoDia = useQuery({
    queryKey: ["historico-atendimentos", data],
    enabled: papel === "administrador" && visao === "movimento",
    queryFn: async () => {
      const { data: linhas, error } = await db()
        .from("vw_painel_atendimentos")
        .select(
          "id, entregue_em, nome_cliente_snapshot, veiculo_snapshot, servico_snapshot, valor_final, valor_empresa_snapshot, total_pago, lavadores",
        )
        .eq("status", "entregue")
        .gte("entregue_em", intervalo.inicio)
        .lt("entregue_em", intervalo.fim)
        .order("entregue_em");
      if (error) throw error;
      return (linhas ?? []) as unknown as AtendimentoFechamento[];
    },
  });

  const ajustesPendentes = useQuery({
    queryKey: ["ajustes-repasse-pendentes", data],
    enabled: papel === "administrador" && visao === "fechamento",
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
  const resumoDia = useMemo(
    () => calcularResumoFechamento(historicoDia.data ?? [], []),
    [historicoDia.data],
  );
  const repassesPorDia = useMemo(() => {
    const grupos = new Map<string, Repasse[]>();
    for (const repasse of meusRepasses.data ?? []) {
      const dia = repasse.fechamentos_diarios?.data_operacao ?? "Sem data";
      grupos.set(dia, [...(grupos.get(dia) ?? []), repasse]);
    }
    return [...grupos.entries()].sort(([dataA], [dataB]) => dataB.localeCompare(dataA));
  }, [meusRepasses.data]);
  const totalMeusRepasses = (meusRepasses.data ?? []).reduce(
    (total, item) => total + Number(item.valor),
    0,
  );

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
    mutationFn: async (entrada: CorrecaoAtendimento) => {
      if (entrada.motivo.trim().length < 5) throw new Error("Informe o motivo da correção.");
      const centavos = reaisParaCentavos(entrada.valor);
      if (centavos <= 0) throw new Error("Informe um valor final maior que zero.");
      const { error } = await db().rpc("rpc_corrigir_atendimento_entregue", {
        p_atendimento_id: entrada.item.id,
        p_valor_final: centavos / 100,
        p_pagamentos: [{ forma_pagamento: entrada.forma, valor_centavos: centavos }],
        p_motivo: entrada.motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCorrecao(null);
      setErroCorrecao(null);
      setMensagem("Correção registrada no histórico.");
      qc.invalidateQueries({ queryKey: ["atendimentos-fechamento"] });
      qc.invalidateQueries({ queryKey: ["ajustes-repasse-pendentes"] });
    },
    onError: (erro) => setErroCorrecao(mensagemErro(erro)),
  });
  const selecionarData = (novaData: string) => {
    setData(novaData || hoje);
    setPendentes([]);
    setMensagem(null);
  };

  if (papel === "lavador") {
    return (
      <section className="lc-page">
        <div className="lc-page-heading">
          <div>
            <span className="lc-eyebrow">Financeiro</span>
            <h1 className="mt-2">Meus repasses</h1>
            <p>Consulte seus valores por dia e os veículos vinculados a cada repasse.</p>
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
        {!!meusRepasses.data?.length && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Resumo
              rotulo="Total acumulado"
              valor={formatarDinheiro(totalMeusRepasses)}
              icone={Wallet}
              destaque
            />
            <Resumo
              rotulo="Dias com repasse"
              valor={String(repassesPorDia.length)}
              icone={CalendarDays}
            />
            <Resumo
              rotulo="Serviços repassados"
              valor={String(meusRepasses.data.length)}
              icone={CarFront}
            />
          </div>
        )}
        <div className="space-y-5">
          {repassesPorDia.map(([dia, repasses]) => {
            const total = repasses.reduce((soma, item) => soma + Number(item.valor), 0);
            return (
              <details key={dia} className="lc-panel group" open={dia === repassesPorDia[0]?.[0]}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="lc-eyebrow">Dia do fechamento</p>
                    <h2
                      id={`repasse-${dia}`}
                      className="mt-1 flex items-center gap-2 font-semibold"
                    >
                      <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                      {dia === "Sem data"
                        ? dia
                        : new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR")}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Meu valor no dia</p>
                      <strong className="text-lg tabular-nums text-primary">
                        {formatarDinheiro(total)}
                      </strong>
                    </div>
                    <ChevronDown
                      className="size-5 text-muted-foreground transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </div>
                </summary>
                <div className="mt-4 border-t pt-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    {repasses.length} serviço(s) neste fechamento
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {repasses.map((item) => (
                      <li key={item.id} className="rounded-xl border bg-muted/40 p-3 text-sm">
                        <strong>{formatarDinheiro(item.valor)}</strong>
                        <p className="mt-1 text-muted-foreground">
                          {item.atendimentos?.veiculo_snapshot ?? "Atendimento"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="lc-page">
      <div className="lc-page-heading">
        <div>
          <span className="lc-eyebrow">Financeiro</span>
          <h1 className="text-2xl font-bold tracking-tight">Repasses e fechamento</h1>
          <p className="text-sm text-muted-foreground">
            Consulte o movimento de cada dia e faça o fechamento em uma etapa separada.
          </p>
        </div>
      </div>

      <div className="lc-panel flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="lc-eyebrow">Dia em análise</p>
          <p className="mt-1 flex items-center gap-2 font-semibold capitalize">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            {new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Dia anterior"
            onClick={() => selecionarData(deslocarDataLocal(data, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <label className="lc-label min-w-0 sm:w-44">
            <span className="sr-only">Selecionar data dos repasses</span>
            <input
              type="date"
              max={hoje}
              className="lc-field"
              value={data}
              onChange={(evento) => selecionarData(evento.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo dia"
            disabled={data >= hoje}
            onClick={() => selecionarData(deslocarDataLocal(data, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div
        className="grid grid-cols-2 rounded-xl border bg-muted/60 p-1"
        role="tablist"
        aria-label="Visualização financeira"
      >
        <button
          type="button"
          role="tab"
          aria-selected={visao === "movimento"}
          className="rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors aria-selected:bg-card aria-selected:text-primary aria-selected:shadow-sm"
          onClick={() => setVisao("movimento")}
        >
          Movimento do dia
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={visao === "fechamento"}
          className="rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors aria-selected:bg-card aria-selected:text-primary aria-selected:shadow-sm"
          onClick={() => setVisao("fechamento")}
        >
          Preparar fechamento
        </button>
      </div>

      {visao === "fechamento" && atendimentos.isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando atendimentos do dia...
        </p>
      )}
      {visao === "fechamento" && atendimentos.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(atendimentos.error)}
        </p>
      )}
      {visao === "fechamento" && fechamentoDia.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(fechamentoDia.error)}
        </p>
      )}
      {visao === "fechamento" && ajustesPendentes.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(ajustesPendentes.error)}
        </p>
      )}
      {visao === "movimento" && historicoDia.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(historicoDia.error)}
        </p>
      )}

      {visao === "movimento" ? (
        <>
          <div>
            <p className="lc-eyebrow">Movimento do dia selecionado</p>
            <h2 className="mt-1 text-lg font-semibold">Como o valor foi distribuído</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Considera somente os serviços concluídos nesta data.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Resumo
              rotulo="Total recebido"
              valor={historicoDia.data ? formatarDinheiro(resumoDia.totalCentavos / 100) : "—"}
              icone={ReceiptText}
              destaque
            />
            <Resumo
              rotulo="Parte da empresa"
              valor={historicoDia.data ? formatarDinheiro(resumoDia.empresaCentavos / 100) : "—"}
              icone={Building2}
            />
            <Resumo
              rotulo="Parte da equipe"
              valor={
                historicoDia.data
                  ? formatarDinheiro((resumoDia.totalCentavos - resumoDia.empresaCentavos) / 100)
                  : "—"
              }
              icone={UsersRound}
            />
          </div>
          {!!resumoDia.porLavador.length && (
            <section aria-labelledby="repasses-lavadores">
              <div className="mb-3">
                <h2 id="repasses-lavadores" className="font-semibold">
                  Repasses por lavador
                </h2>
                <p className="text-sm text-muted-foreground">
                  Valor individual correspondente aos serviços do dia.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {resumoDia.porLavador.map((item) => (
                  <Resumo
                    key={item.nome}
                    rotulo={item.nome}
                    valor={formatarDinheiro(item.valorCentavos / 100)}
                    icone={UsersRound}
                  />
                ))}
              </div>
            </section>
          )}
          {historicoDia.isLoading && (
            <p role="status" className="text-sm text-muted-foreground">
              Carregando serviços concluídos...
            </p>
          )}
          {historicoDia.data?.length === 0 && (
            <div className="lc-empty">
              <CarFront aria-hidden="true" />
              Nenhum serviço concluído nesta data.
            </div>
          )}
          {!!historicoDia.data?.length && (
            <section className="lc-panel !p-0" aria-labelledby="servicos-do-dia">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
                <div>
                  <h2 id="servicos-do-dia" className="font-semibold">
                    Serviços concluídos
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {historicoDia.data.length} veículo(s) no dia
                  </p>
                </div>
                <CarFront className="size-5 text-primary" aria-hidden="true" />
              </div>
              <ul className="divide-y">
                {historicoDia.data.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5"
                  >
                    <span>
                      <strong>{item.nome_cliente_snapshot}</strong>
                      <span className="block text-muted-foreground">
                        {item.veiculo_snapshot} · {item.servico_snapshot}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatarDinheiro(item.valor_final)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <div className="rounded-xl border border-primary/20 bg-accent p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-primary">
              <CircleAlert className="size-4" aria-hidden="true" />
              Valores disponíveis para fechamento
            </p>
            <p className="mt-1 text-muted-foreground">
              Esta etapa também pode incluir atendimentos pendentes de dias anteriores. Revise a
              lista antes de confirmar.
            </p>
          </div>
          {jaConfirmado && (
            <p role="status" className="lc-message">
              Fechamento desta data já confirmado. Novos atendimentos e ajustes serão considerados
              no próximo fechamento.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Resumo
              rotulo="Total a distribuir"
              valor={atendimentos.data ? formatarDinheiro(resumo.totalCentavos / 100) : "—"}
              icone={ReceiptText}
              destaque
            />
            <Resumo
              rotulo="Parte da empresa"
              valor={atendimentos.data ? formatarDinheiro(resumo.empresaCentavos / 100) : "—"}
              icone={Building2}
            />
            <Resumo
              rotulo="Itens para corrigir"
              valor={atendimentos.data ? String(resumo.inconsistentes) : "—"}
              icone={CircleAlert}
            />
            <Resumo
              rotulo="Ajustes auditados"
              valor={
                ajustesPendentes.data
                  ? `${ajustesPendentes.data.length} · ${formatarDinheiro(totalAjustesCentavos / 100)}`
                  : "—"
              }
              icone={Wallet}
            />
          </div>
          {!!resumo.porLavador.length && (
            <section aria-labelledby="distribuicao-lavadores">
              <div className="mb-3">
                <h2 id="distribuicao-lavadores" className="font-semibold">
                  Distribuição para a equipe
                </h2>
                <p className="text-sm text-muted-foreground">
                  Estes são os valores que serão registrados ao confirmar.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {resumo.porLavador.map((item) => (
                  <Resumo
                    key={item.nome}
                    rotulo={item.nome}
                    valor={formatarDinheiro(item.valorCentavos / 100)}
                    icone={UsersRound}
                  />
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="revisao-fechamento">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="revisao-fechamento" className="font-semibold">
                  Atendimentos incluídos
                </h2>
                <p className="text-sm text-muted-foreground">
                  Marque somente o que deve ficar para um fechamento posterior.
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                {atendimentos.data?.length ?? 0} atendimento(s)
              </span>
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
                        <span
                          className={inconsistente ? "text-destructive" : "text-muted-foreground"}
                        >
                          {formatarDataHora(item.entregue_em)} · Pago:{" "}
                          {formatarDinheiro(item.total_pago)} · {item.lavadores.length} lavador(es)
                          {inconsistente ? " · Corrigir antes de fechar" : ""}
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        type="button"
                        className="ml-auto self-start"
                        disabled={corrigir.isPending}
                        onClick={() => {
                          setErroCorrecao(null);
                          setCorrecao({
                            item,
                            valor: String(item.valor_final).replace(".", ","),
                            forma: "pix",
                            motivo: "",
                          });
                        }}
                      >
                        Corrigir
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="lc-panel flex flex-col gap-4 border-primary/20 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Tudo conferido?</p>
              <p className="text-sm text-muted-foreground">
                A confirmação registra os valores da empresa e de cada lavador.
              </p>
            </div>
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
          </div>
        </>
      )}
      {mensagem && (
        <p role="status" className="lc-message">
          {mensagem}
        </p>
      )}
      <DialogoFormulario
        aberto={!!correcao}
        titulo="Corrigir atendimento entregue"
        descricao={
          correcao
            ? `${correcao.item.nome_cliente_snapshot} · ${correcao.item.veiculo_snapshot}`
            : "Revise os dados financeiros do atendimento."
        }
        erro={erroCorrecao}
        salvando={corrigir.isPending}
        textoConfirmar="Registrar correção"
        aoFechar={() => {
          setCorrecao(null);
          setErroCorrecao(null);
        }}
        aoEnviar={() => {
          if (correcao) corrigir.mutate(correcao);
        }}
      >
        <label className="lc-label">
          Novo valor final (R$)
          <input
            className="lc-field"
            inputMode="decimal"
            autoFocus
            value={correcao?.valor ?? ""}
            onChange={(evento) =>
              setCorrecao((atual) => (atual ? { ...atual, valor: evento.target.value } : atual))
            }
          />
        </label>
        <label className="lc-label">
          Forma de pagamento
          <select
            className="lc-field"
            value={correcao?.forma ?? "pix"}
            onChange={(evento) =>
              setCorrecao((atual) =>
                atual ? { ...atual, forma: evento.target.value as FormaPagamento } : atual,
              )
            }
          >
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="debito">Cartão de débito</option>
            <option value="credito">Cartão de crédito</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label className="lc-label">
          Motivo da correção
          <textarea
            className="lc-field min-h-24 resize-y"
            placeholder="Explique por que o valor foi alterado"
            value={correcao?.motivo ?? ""}
            onChange={(evento) =>
              setCorrecao((atual) => (atual ? { ...atual, motivo: evento.target.value } : atual))
            }
          />
        </label>
      </DialogoFormulario>
    </section>
  );
}

function Resumo({
  rotulo,
  valor,
  icone: Icone,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  icone?: LucideIcon;
  destaque?: boolean;
}) {
  return (
    <div className={`lc-panel ${destaque ? "border-primary/25 bg-accent" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{rotulo}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{valor}</p>
        </div>
        {Icone && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icone className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
