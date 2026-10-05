import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CarFront,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Droplets,
  LoaderCircle,
  PencilLine,
  Plus,
  UsersRound,
  XCircle,
} from "lucide-react";
import { DialogoFormulario } from "@/components/DialogoFormulario";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";

import type { Papel } from "@/lib/acesso";
import {
  dataHoraLocalInput,
  momentoLocalParaIso,
  montarParametrosNovoAtendimento,
  prepararBuscaCliente,
} from "@/lib/atendimento";
import { dataLocalIso, deslocarDataLocal, intervaloDataLocal } from "@/lib/fechamento";
import { formatarPlaca, formatarTelefone } from "@/lib/formatacao";
import {
  proximoStatus,
  reaisParaCentavos,
  somaPagamentosCentavos,
  type PagamentoEntrada,
  type StatusAtendimento,
  validarEntrega,
} from "@/lib/regras";
import { db, formatarDataHora, formatarDinheiro, mensagemErro } from "@/lib/supabase-db";

const STATUS_ATIVOS: StatusAtendimento[] = ["aguardando", "em_lavagem", "pronto_para_retirada"];
const ETAPAS = [
  { status: "aguardando", nome: "Aguardando", icone: Clock3 },
  { status: "em_lavagem", nome: "Em lavagem", icone: Droplets },
  { status: "pronto_para_retirada", nome: "Pronto para retirada", icone: CheckCheck },
  { status: "entregue", nome: "Concluídos", icone: CheckCheck },
] as const;
const ACAO: Partial<Record<StatusAtendimento, string>> = {
  aguardando: "Iniciar lavagem",
  em_lavagem: "Marcar como pronto",
  pronto_para_retirada: "Registrar entrega",
};
const campo = "lc-field";
const rotulo = "lc-label";
const NOMES_PAGAMENTO: Record<PagamentoEntrada["forma_pagamento"], string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
  outro: "Outro",
};

type Lavador = { perfil_id: string; nome: string; ordem_rateio: number };
type Pagamento = {
  forma_pagamento: PagamentoEntrada["forma_pagamento"];
  valor: number;
};
type ItemFila = {
  id: string;
  status: StatusAtendimento;
  chegou_em: string;
  lavagem_iniciada_em: string | null;
  pronto_em: string | null;
  entregue_em: string | null;
  agendado_para: string | null;
  valor_final: number | null;
  nome_cliente_snapshot: string;
  veiculo_snapshot: string;
  categoria_veiculo_snapshot: string;
  servico_snapshot: string;
  cliente_id: string;
  veiculo_id: string;
  servico_id: string;
  observacoes: string | null;
  lavadores: Lavador[];
  pagamentos: Pagamento[];
};
type Cliente = { id: string; nome_completo: string; telefone: string };
type Veiculo = {
  id: string;
  marca: string;
  modelo: string;
  placa: string | null;
  cor: string | null;
  categorias_veiculo: { nome: string } | null;
};
type Opcao = { id: string; nome: string };

export function FilaAtendimentos({
  perfilId,
  papel,
  dataInicial,
  abrirNovoInicial = false,
  onFluxoInicialConsumido,
}: {
  perfilId: string;
  papel: Papel;
  dataInicial?: string | undefined;
  abrirNovoInicial?: boolean;
  onFluxoInicialConsumido?: () => void;
}) {
  const qc = useQueryClient();
  const hoje = dataLocalIso();
  const [data, setData] = useState(dataInicial ?? hoje);
  const [abrirForm, setAbrirForm] = useState(abrirNovoInicial);
  const [acao, setAcao] = useState<{
    item: ItemFila;
    tipo: "avancar" | "cancelar" | "participantes" | "editar";
  } | null>(null);
  const intervalo = intervaloDataLocal(data);
  const fila = useQuery({
    queryKey: ["fila-atendimentos", data],
    queryFn: async () => {
      const { data, error } = await db()
        .from("vw_painel_atendimentos")
        .select(
          "id, status, chegou_em, lavagem_iniciada_em, pronto_em, entregue_em, agendado_para, valor_final, nome_cliente_snapshot, veiculo_snapshot, categoria_veiculo_snapshot, servico_snapshot, cliente_id, veiculo_id, servico_id, observacoes, lavadores, pagamentos",
        )
        .gte("chegou_em", intervalo.inicio)
        .lt("chegou_em", intervalo.fim)
        .order("chegou_em");
      if (error) throw error;
      return data as unknown as ItemFila[];
    },
  });

  const atualizar = () => qc.invalidateQueries({ queryKey: ["fila-atendimentos"] });
  return (
    <section className="lc-page">
      <div className="lc-page-heading">
        <div>
          <span className="lc-eyebrow">Operação</span>
          <h1 className="mt-2">Central de atendimentos</h1>
          <p>Acompanhe todos os atendimentos do dia, da chegada à conclusão.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {!abrirForm && (
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setData(hoje);
                setAbrirForm(true);
              }}
            >
              <Plus aria-hidden="true" />
              Novo atendimento
            </Button>
          )}
        </div>
      </div>
      {abrirForm && (
        <NovoAtendimento
          perfilId={perfilId}
          dataInicial={dataInicial}
          onFechar={(dataDestino) => {
            setAbrirForm(false);
            if (dataDestino) setData(dataDestino);
            onFluxoInicialConsumido?.();
          }}
        />
      )}
      <div className="lc-panel flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="lc-eyebrow">Dia da operação</p>
          <p className="mt-1 flex items-center gap-2 font-semibold">
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
            onClick={() => setData((atual) => deslocarDataLocal(atual, -1))}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <label className="lc-label min-w-0 sm:w-44">
            <span className="sr-only">Selecionar data da operação</span>
            <input
              type="date"
              className="lc-field"
              value={data}
              onChange={(evento) => setData(evento.target.value || hoje)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo dia"
            onClick={() => setData((atual) => deslocarDataLocal(atual, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {fila.isLoading && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Carregando atendimentos...
        </p>
      )}
      {fila.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(fila.error)}
        </p>
      )}
      {fila.data?.length === 0 && (
        <div className="lc-empty">
          <CarFront aria-hidden="true" />
          <p className="font-semibold text-foreground">Nenhum atendimento neste dia.</p>
          {data === hoje && (
            <p className="mt-1">Use “Novo atendimento” para registrar a próxima chegada.</p>
          )}
        </div>
      )}
      {ETAPAS.map(({ status, nome, icone: Icone }) => {
        const itens = fila.data?.filter((item) => item.status === status) ?? [];
        return (
          <section key={status} className="lc-panel !p-0" aria-labelledby={`etapa-${status}`}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 sm:py-4">
              <h2 id={`etapa-${status}`} className="flex items-center gap-2 font-semibold">
                <span className="lc-status !rounded-lg !p-2" data-status={status}>
                  <Icone className="!size-4" aria-hidden="true" />
                </span>
                {nome}
              </h2>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">
                {itens.length}
              </span>
            </div>
            {itens.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground sm:px-5">
                Nenhum atendimento nesta etapa.
              </p>
            ) : (
              <ul className="divide-y">
                {itens.map((item, indice) => (
                  <CartaoAtendimento
                    key={item.id}
                    item={item}
                    ordem={indice + 1}
                    papel={papel}
                    onAcao={(tipo) => setAcao({ item, tipo })}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {!!fila.data?.some((item) => item.status === "cancelado") && (
        <section className="lc-panel !p-0" aria-labelledby="etapa-cancelados">
          <div className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
            <XCircle className="size-4 text-destructive" aria-hidden="true" />
            <h2 id="etapa-cancelados" className="font-semibold">
              Cancelados
            </h2>
          </div>
          <ul className="divide-y">
            {fila.data
              .filter((item) => item.status === "cancelado")
              .map((item, indice) => (
                <CartaoAtendimento
                  key={item.id}
                  item={item}
                  ordem={indice + 1}
                  papel={papel}
                  onAcao={(tipo) => setAcao({ item, tipo })}
                />
              ))}
          </ul>
        </section>
      )}
      {acao?.tipo === "editar" && (
        <EditarAtendimento
          item={acao.item}
          aoFechar={() => setAcao(null)}
          aoSalvar={() => {
            setAcao(null);
            atualizar();
          }}
        />
      )}
      {acao && acao.tipo !== "editar" && (
        <AcaoAtendimento
          item={acao.item}
          tipo={acao.tipo}
          papel={papel}
          aoFechar={() => setAcao(null)}
          aoSalvar={() => {
            setAcao(null);
            atualizar();
          }}
        />
      )}
    </section>
  );
}

function CartaoAtendimento({
  item,
  ordem,
  papel,
  onAcao,
}: {
  item: ItemFila;
  ordem: number;
  papel: Papel;
  onAcao: (tipo: "avancar" | "cancelar" | "participantes" | "editar") => void;
}) {
  const ativo = STATUS_ATIVOS.includes(item.status);
  return (
    <li className="group p-4 transition-colors hover:bg-muted/25 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
            {String(ordem).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold">{item.nome_cliente_snapshot}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {item.veiculo_snapshot} · {item.categoria_veiculo_snapshot}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {item.agendado_para && item.status === "aguardando" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-accent px-2.5 py-1 text-xs font-semibold text-primary">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              Agendamento
            </span>
          )}
          <StatusBadge status={item.status} />
        </div>
      </div>
      <dl className="my-4 grid grid-cols-1 gap-x-4 gap-y-4 text-sm min-[380px]:grid-cols-2 lg:grid-cols-5">
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">Serviço</dt>
          <dd className="font-medium">{item.servico_snapshot}</dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">
            {item.agendado_para ? "Agendado para" : "Chegada"}
          </dt>
          <dd className="font-medium">{formatarDataHora(item.chegou_em)}</dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">Valor</dt>
          <dd className="font-semibold tabular-nums">
            {item.valor_final == null ? (
              <span className="text-[var(--status-wait-fg)]">Valor pendente</span>
            ) : (
              formatarDinheiro(item.valor_final)
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <UsersRound className="size-3" aria-hidden="true" />
            Lavadores
          </dt>
          <dd className="font-medium">
            {item.lavadores.map((lavador) => lavador.nome).join(", ") || "Não vinculados"}
          </dd>
        </div>
        <div>
          <dt className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <CreditCard className="size-3" aria-hidden="true" />
            Pagamento
          </dt>
          <dd className="font-medium">
            {(item.pagamentos ?? []).length
              ? item.pagamentos
                  .map((pagamento) => NOMES_PAGAMENTO[pagamento.forma_pagamento])
                  .join(" + ")
              : "Pendente"}
          </dd>
        </div>
      </dl>
      {(ativo || papel === "administrador") && (
        <div className="flex flex-col items-stretch gap-2 border-t border-dashed pt-3 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
          {ativo && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-primary/20 bg-accent text-primary hover:border-primary"
                onClick={() => onAcao("avancar")}
              >
                {ACAO[item.status]}
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                onClick={() => onAcao("cancelar")}
              >
                Cancelar
              </Button>
            </>
          )}
          {papel === "administrador" && (
            <Button size="sm" variant="outline" onClick={() => onAcao("editar")}>
              <PencilLine aria-hidden="true" />
              Editar informações
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

const clienteSchema = z.object({
  nome_completo: z.string().trim().min(2, "Informe o nome do cliente.").max(120),
  telefone: z
    .string()
    .trim()
    .regex(/^[\d\s()+-]{8,20}$/, "Telefone inválido."),
});
const veiculoSchema = z.object({
  categoria_veiculo_id: z.string().uuid("Selecione a categoria."),
  marca: z.string().trim().min(1, "Informe a marca.").max(60),
  modelo: z.string().trim().min(1, "Informe o modelo.").max(60),
  placa: z.string().trim().max(10),
  cor: z.string().trim().max(30),
  observacoes: z.string().trim().max(500),
});

function NovoAtendimento({
  perfilId,
  dataInicial,
  onFechar,
}: {
  perfilId: string;
  dataInicial?: string | undefined;
  onFechar: (dataDestino?: string) => void;
}) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [novoCliente, setNovoCliente] = useState(false);
  const [dadosCliente, setDadosCliente] = useState({ nome_completo: "", telefone: "" });
  const [veiculoId, setVeiculoId] = useState("");
  const [novoVeiculo, setNovoVeiculo] = useState(false);
  const [veiculo, setVeiculo] = useState({
    categoria_veiculo_id: "",
    marca: "",
    modelo: "",
    placa: "",
    cor: "",
    observacoes: "",
  });
  const [servicoId, setServicoId] = useState("");
  const [lavadores, setLavadores] = useState<string[]>([]);
  const [valorDepois, setValorDepois] = useState(true);
  const [valor, setValor] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const atendimentoRetroativo = Boolean(dataInicial && dataInicial < dataLocalIso());
  const [tipoHorario, setTipoHorario] = useState<"agora" | "personalizado">(
    atendimentoRetroativo ? "personalizado" : "agora",
  );
  const [dataHora, setDataHora] = useState(() =>
    atendimentoRetroativo ? `${dataInicial}T12:00` : dataHoraLocalInput(),
  );
  const [erro, setErro] = useState<string | null>(null);
  const enviando = useRef(false);
  void perfilId;

  useEffect(() => {
    const id = setTimeout(() => setBuscaDeb(busca.trim()), 300);
    return () => clearTimeout(id);
  }, [busca]);
  const clientes = useQuery({
    queryKey: ["busca-clientes", buscaDeb],
    enabled: buscaDeb.length >= 2 && !cliente,
    queryFn: async () => {
      const { termo, telefone, placa } = prepararBuscaCliente(buscaDeb);
      const filtroTelefone = telefone ? `,telefone.ilike.%${telefone}%` : "";
      const [porCliente, porPlaca] = await Promise.all([
        db()
          .from("clientes")
          .select("id, nome_completo, telefone")
          .eq("ativo", true)
          .or(`nome_completo.ilike.%${termo}%,telefone.ilike.%${termo}%${filtroTelefone}`)
          .limit(10),
        placa.length >= 3
          ? db()
              .from("veiculos")
              .select("clientes(id, nome_completo, telefone, ativo)")
              .ilike("placa_normalizada", `%${placa}%`)
              .limit(10)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (porCliente.error) throw porCliente.error;
      if (porPlaca.error) throw porPlaca.error;
      const mapa = new Map<string, Cliente>();
      (porCliente.data as Cliente[]).forEach((item) => mapa.set(item.id, item));
      (porPlaca.data as unknown as { clientes: (Cliente & { ativo: boolean }) | null }[]).forEach(
        ({ clientes: item }) => {
          if (item?.ativo) mapa.set(item.id, item);
        },
      );
      return [...mapa.values()];
    },
  });
  const veiculos = useQuery({
    queryKey: ["veiculos-cliente", cliente?.id],
    enabled: !!cliente,
    queryFn: async () => {
      const { data, error } = await db()
        .from("veiculos")
        .select("id, marca, modelo, placa, cor, categorias_veiculo(nome)")
        .eq("cliente_id", cliente!.id)
        .eq("ativo", true)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as unknown as Veiculo[];
    },
  });
  const auxiliares = useQuery({
    queryKey: ["auxiliares-atendimento"],
    queryFn: async () => {
      const [categorias, servicos, papeis] = await Promise.all([
        db().from("categorias_veiculo").select("id, nome").eq("ativo", true).order("nome"),
        db().from("servicos_lavagem").select("id, nome").eq("ativo", true).order("nome"),
        db()
          .from("papeis_perfil")
          .select("perfil_id, perfis(id, nome_completo, ativo)")
          .eq("papel", "lavador"),
      ]);
      if (categorias.error) throw categorias.error;
      if (servicos.error) throw servicos.error;
      if (papeis.error) throw papeis.error;
      const lista = (
        papeis.data as unknown as {
          perfis: { id: string; nome_completo: string; ativo: boolean } | null;
        }[]
      ).flatMap((p) =>
        p.perfis?.ativo ? [{ id: p.perfis.id, nome: p.perfis.nome_completo }] : [],
      );
      return {
        categorias: categorias.data as Opcao[],
        servicos: servicos.data as Opcao[],
        lavadores: lista,
      };
    },
  });
  useEffect(() => {
    if (!veiculos.data) return;
    if (!veiculos.data.length) {
      setNovoVeiculo(true);
      setVeiculoId("");
    } else if (!novoVeiculo && !veiculoId) setVeiculoId(veiculos.data[0]!.id);
  }, [veiculos.data, novoVeiculo, veiculoId]);

  const salvar = useMutation({
    mutationFn: async () => {
      const clienteNovo = cliente ? null : clienteSchema.parse(dadosCliente);
      const veiculoNovo = novoVeiculo || !veiculoId ? veiculoSchema.parse(veiculo) : null;
      const parametros = montarParametrosNovoAtendimento({
        servicoId,
        lavadores,
        clienteId: cliente?.id ?? null,
        clienteNovo,
        veiculoId: veiculoNovo ? null : veiculoId,
        veiculoNovo,
        valorDepois,
        valor,
        observacoes,
        momentoOperacao: tipoHorario === "personalizado" ? momentoLocalParaIso(dataHora) : null,
      });
      const { error } = await db().rpc("rpc_criar_atendimento", parametros);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fila-atendimentos"] });
      onFechar(tipoHorario === "personalizado" ? dataHora.slice(0, 10) : dataLocalIso());
    },
    onError: (e) =>
      setErro(
        e instanceof z.ZodError ? (e.issues[0]?.message ?? "Dados inválidos.") : mensagemErro(e),
      ),
    onSettled: () => {
      enviando.current = false;
    },
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando.current || salvar.isPending) return;
    setErro(null);
    if (!cliente && !novoCliente) return setErro("Selecione ou cadastre um cliente.");
    if (!servicoId) return setErro("Selecione o serviço.");
    if (!lavadores.length) return setErro("Selecione pelo menos um lavador.");
    enviando.current = true;
    salvar.mutate();
  }
  const alternarLavador = (id: string) =>
    setLavadores((lista) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]));
  const momentoEscolhido = tipoHorario === "personalizado" ? new Date(dataHora) : null;
  const horarioFuturo = Boolean(
    momentoEscolhido && !Number.isNaN(momentoEscolhido.getTime()) && momentoEscolhido > new Date(),
  );
  const textoAcao =
    tipoHorario === "agora"
      ? "Registrar chegada"
      : horarioFuturo
        ? "Criar agendamento"
        : "Registrar atendimento retroativo";

  return (
    <form
      onSubmit={enviar}
      className="lc-panel space-y-6 border-primary/25"
      aria-label="Registrar chegada"
    >
      <div className="flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Novo atendimento ou agendamento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Registre agora ou escolha qualquer data e horário.
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          className="text-sm text-muted-foreground"
          onClick={() => onFechar()}
        >
          Fechar
        </Button>
      </div>
      <fieldset className="lc-form-section space-y-3">
        <legend>
          <span className="lc-step">01</span>Data e horário
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="lc-choice">
            <input
              type="radio"
              name="tipo-horario"
              checked={tipoHorario === "agora"}
              onChange={() => setTipoHorario("agora")}
            />
            Atendimento agora
          </label>
          <label className="lc-choice">
            <input
              type="radio"
              name="tipo-horario"
              checked={tipoHorario === "personalizado"}
              onChange={() => setTipoHorario("personalizado")}
            />
            Escolher data e horário
          </label>
        </div>
        {tipoHorario === "personalizado" && (
          <div className="rounded-xl border bg-muted/40 p-4">
            <label className={rotulo}>
              Data e horário do atendimento
              <input
                className={campo}
                type="datetime-local"
                value={dataHora}
                onChange={(evento) => setDataHora(evento.target.value)}
              />
            </label>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {horarioFuturo
                ? "Será salvo como agendamento futuro."
                : "Será registrado no histórico como atendimento retroativo."}
            </p>
          </div>
        )}
      </fieldset>
      <fieldset className="lc-form-section space-y-3">
        <legend>
          <span className="lc-step">02</span>Cliente
        </legend>
        {cliente ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-accent p-3 text-sm">
            <span>
              {cliente.nome_completo} · {formatarTelefone(cliente.telefone)}
            </span>
            <Button
              variant="outline"
              type="button"
              className="text-primary"
              onClick={() => {
                setCliente(null);
                setVeiculoId("");
              }}
            >
              Trocar
            </Button>
          </div>
        ) : novoCliente ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={rotulo}>
              Nome
              <input
                className={campo}
                autoComplete="name"
                value={dadosCliente.nome_completo}
                onChange={(e) =>
                  setDadosCliente({ ...dadosCliente, nome_completo: e.target.value })
                }
              />
            </label>
            <label className={rotulo}>
              Telefone
              <input
                className={campo}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={dadosCliente.telefone}
                onChange={(e) =>
                  setDadosCliente({ ...dadosCliente, telefone: formatarTelefone(e.target.value) })
                }
              />
            </label>
            <Button
              variant="outline"
              type="button"
              className="text-left text-sm text-primary"
              onClick={() => setNovoCliente(false)}
            >
              Buscar existente
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className={campo}
              aria-label="Buscar cliente por nome, telefone ou placa"
              placeholder="Buscar por nome, telefone ou placa"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {clientes.isFetching && (
              <p role="status" className="text-sm text-muted-foreground">
                Buscando clientes...
              </p>
            )}
            {clientes.error && (
              <p role="alert" className="lc-message">
                {mensagemErro(clientes.error)}
              </p>
            )}
            {clientes.data?.length === 0 && buscaDeb.length >= 2 && (
              <p className="text-sm text-muted-foreground">
                Nenhum cliente encontrado. Você pode cadastrá-lo abaixo.
              </p>
            )}
            <ul className="divide-y rounded-md border empty:hidden">
              {clientes.data?.map((c) => (
                <li key={c.id}>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full p-2 text-left text-sm"
                    onClick={() => setCliente(c)}
                  >
                    {c.nome_completo} · {formatarTelefone(c.telefone)}
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              type="button"
              className="text-sm text-primary"
              onClick={() => {
                setNovoCliente(true);
                setNovoVeiculo(true);
                setDadosCliente({ nome_completo: busca, telefone: "" });
              }}
            >
              + Cadastrar cliente
            </Button>
          </div>
        )}
      </fieldset>
      {(cliente || novoCliente) && (
        <fieldset className="lc-form-section space-y-3">
          <legend>
            <span className="lc-step">03</span>Veículo
          </legend>
          {veiculos.isFetching && (
            <p role="status" className="text-sm text-muted-foreground">
              Carregando veículos...
            </p>
          )}
          {veiculos.error && (
            <p role="alert" className="lc-message">
              {mensagemErro(veiculos.error)}
            </p>
          )}
          {cliente && !novoVeiculo && !!veiculos.data?.length && (
            <div className="space-y-1">
              {veiculos.data.map((v) => (
                <label key={v.id} className="lc-choice">
                  <input
                    type="radio"
                    checked={veiculoId === v.id}
                    onChange={() => setVeiculoId(v.id)}
                  />
                  {v.marca} {v.modelo}
                  {v.placa ? ` · ${formatarPlaca(v.placa)}` : " · Sem placa"} (
                  {v.categorias_veiculo?.nome})
                </label>
              ))}
              <Button
                variant="outline"
                type="button"
                className="text-sm text-primary"
                onClick={() => {
                  setNovoVeiculo(true);
                  setVeiculoId("");
                }}
              >
                + Outro veículo
              </Button>
            </div>
          )}
          {(novoVeiculo || novoCliente) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={rotulo}>
                Categoria
                <select
                  className={campo}
                  value={veiculo.categoria_veiculo_id}
                  onChange={(e) => setVeiculo({ ...veiculo, categoria_veiculo_id: e.target.value })}
                >
                  <option value="">Selecione</option>
                  {auxiliares.data?.categorias.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </label>
              {(["marca", "modelo", "placa", "cor"] as const).map((chave) => (
                <label key={chave} className={rotulo}>
                  {chave.charAt(0).toUpperCase() + chave.slice(1)}
                  {(chave === "placa" || chave === "cor") && (
                    <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
                  )}
                  <input
                    className={`${campo} ${chave === "placa" ? "uppercase" : ""}`}
                    maxLength={chave === "placa" ? 8 : undefined}
                    placeholder={chave === "placa" ? "ABC-1D23" : undefined}
                    value={veiculo[chave]}
                    onChange={(e) =>
                      setVeiculo({
                        ...veiculo,
                        [chave]: chave === "placa" ? formatarPlaca(e.target.value) : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
              <label className={`${rotulo} sm:col-span-2`}>
                Observações do veículo
                <textarea
                  className={campo}
                  value={veiculo.observacoes}
                  onChange={(e) => setVeiculo({ ...veiculo, observacoes: e.target.value })}
                />
              </label>
              {cliente && !!veiculos.data?.length && (
                <Button
                  variant="outline"
                  type="button"
                  className="text-left text-sm text-primary"
                  onClick={() => {
                    setNovoVeiculo(false);
                    setVeiculoId(veiculos.data![0]!.id);
                  }}
                >
                  Usar veículo existente
                </Button>
              )}
            </div>
          )}
        </fieldset>
      )}
      <fieldset className="lc-form-section">
        <legend>
          <span className="lc-step">04</span>Serviço e equipe
        </legend>
        {auxiliares.isLoading && (
          <p role="status" className="mb-3 text-sm text-muted-foreground">
            Carregando serviços e equipe...
          </p>
        )}
        {auxiliares.error && (
          <p role="alert" className="lc-message mb-3">
            {mensagemErro(auxiliares.error)}
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={rotulo}>
            Serviço
            <select
              className={campo}
              value={servicoId}
              onChange={(e) => setServicoId(e.target.value)}
            >
              <option value="">Selecione</option>
              {auxiliares.data?.servicos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Lavadores</legend>
            <div className="grid gap-2">
              {auxiliares.data?.lavadores.map((o) => (
                <label key={o.id} className="lc-choice">
                  <input
                    type="checkbox"
                    checked={lavadores.includes(o.id)}
                    onChange={() => alternarLavador(o.id)}
                  />
                  {o.nome}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </fieldset>
      <fieldset className="lc-form-section space-y-4">
        <legend>
          <span className="lc-step">05</span>Valor e observações
        </legend>
        <label className="lc-choice">
          <input
            type="checkbox"
            checked={valorDepois}
            onChange={(e) => setValorDepois(e.target.checked)}
          />
          Informar valor depois
        </label>
        <p className="text-xs text-muted-foreground">
          O pagamento é registrado na saída do veículo.
        </p>
        {!valorDepois && (
          <label className={rotulo}>
            Valor final (R$)
            <input
              className={campo}
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </label>
        )}
        <label className={rotulo}>
          Observações
          <textarea
            className={campo}
            maxLength={500}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </label>
      </fieldset>
      {erro && (
        <p role="alert" className="lc-message">
          {erro}
        </p>
      )}
      <Button
        type="submit"
        disabled={salvar.isPending}
        aria-busy={salvar.isPending}
        className="w-full"
      >
        {salvar.isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
        {salvar.isPending ? "Registrando..." : textoAcao}
      </Button>
    </form>
  );
}

function EditarAtendimento({
  item,
  aoFechar,
  aoSalvar,
}: {
  item: ItemFila;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [clienteId, setClienteId] = useState(item.cliente_id ?? "");
  const [veiculoId, setVeiculoId] = useState(item.veiculo_id ?? "");
  const [servicoId, setServicoId] = useState(item.servico_id ?? "");
  const [dataHora, setDataHora] = useState(() => dataHoraLocalInput(new Date(item.chegou_em)));
  const [valor, setValor] = useState(
    item.valor_final == null ? "" : String(item.valor_final).replace(".", ","),
  );
  const [observacoes, setObservacoes] = useState(item.observacoes ?? "");
  const [lavadores, setLavadores] = useState(item.lavadores.map((lavador) => lavador.perfil_id));
  const [pagamentos, setPagamentos] = useState<
    { forma_pagamento: PagamentoEntrada["forma_pagamento"]; valor: string }[]
  >(() =>
    (item.pagamentos ?? []).length
      ? item.pagamentos.map((pagamento) => ({
          forma_pagamento: pagamento.forma_pagamento,
          valor: String(pagamento.valor).replace(".", ","),
        }))
      : [{ forma_pagamento: "pix", valor }],
  );
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const concluido = item.status === "entregue";

  const opcoes = useQuery({
    queryKey: ["opcoes-edicao-atendimento"],
    queryFn: async () => {
      const [clientes, servicos, papeis] = await Promise.all([
        db().from("clientes").select("id, nome_completo, telefone").order("nome_completo"),
        db().from("servicos_lavagem").select("id, nome").order("nome"),
        db()
          .from("papeis_perfil")
          .select("perfis(id, nome_completo, ativo)")
          .eq("papel", "lavador"),
      ]);
      if (clientes.error) throw clientes.error;
      if (servicos.error) throw servicos.error;
      if (papeis.error) throw papeis.error;
      return {
        clientes: clientes.data as Cliente[],
        servicos: servicos.data as Opcao[],
        lavadores: (
          papeis.data as unknown as {
            perfis: { id: string; nome_completo: string; ativo: boolean } | null;
          }[]
        ).flatMap((papel) =>
          papel.perfis?.ativo ? [{ id: papel.perfis.id, nome: papel.perfis.nome_completo }] : [],
        ),
      };
    },
  });
  const veiculos = useQuery({
    queryKey: ["veiculos-edicao-atendimento", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await db()
        .from("veiculos")
        .select("id, marca, modelo, placa, cor, categorias_veiculo(nome)")
        .eq("cliente_id", clienteId)
        .order("marca")
        .order("modelo");
      if (error) throw error;
      return data as unknown as Veiculo[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!clienteId || !veiculoId || !servicoId) {
        throw new Error("Selecione cliente, veículo e serviço.");
      }
      if (!lavadores.length) throw new Error("Selecione pelo menos um lavador.");
      if (motivo.trim().length < 5) throw new Error("Informe o motivo da edição.");
      const valorCentavos = valor.trim() ? reaisParaCentavos(valor) : null;
      if (valorCentavos !== null && valorCentavos <= 0) {
        throw new Error("Informe um valor final maior que zero.");
      }
      const listaPagamentos: PagamentoEntrada[] = concluido
        ? pagamentos.map((pagamento) => ({
            forma_pagamento: pagamento.forma_pagamento,
            valor_centavos: reaisParaCentavos(pagamento.valor),
          }))
        : [];
      if (concluido) {
        const validacao = validarEntrega(valorCentavos, lavadores.length, listaPagamentos);
        if (validacao) throw new Error(validacao);
      }
      const { error } = await db().rpc("rpc_editar_atendimento", {
        p_atendimento_id: item.id,
        p_cliente_id: clienteId,
        p_veiculo_id: veiculoId,
        p_servico_id: servicoId,
        p_lavadores: lavadores,
        p_chegou_em: momentoLocalParaIso(dataHora),
        p_valor_final: valorCentavos == null ? null : valorCentavos / 100,
        p_observacoes: observacoes.trim() || null,
        p_pagamentos: listaPagamentos,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: aoSalvar,
    onError: (falha) => setErro(mensagemErro(falha)),
  });

  return (
    <DialogoFormulario
      aberto
      titulo="Editar informações do atendimento"
      descricao={`${item.nome_cliente_snapshot} · ${item.veiculo_snapshot}`}
      erro={erro || (opcoes.error ? mensagemErro(opcoes.error) : null)}
      salvando={salvar.isPending}
      textoConfirmar="Salvar atendimento"
      aoFechar={aoFechar}
      aoEnviar={() => {
        setErro(null);
        salvar.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={rotulo}>
          Cliente
          <select
            className={campo}
            value={clienteId}
            onChange={(evento) => {
              setClienteId(evento.target.value);
              setVeiculoId("");
            }}
          >
            <option value="">Selecione</option>
            {opcoes.data?.clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nome_completo}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Veículo
          <select
            className={campo}
            value={veiculoId}
            onChange={(evento) => setVeiculoId(evento.target.value)}
          >
            <option value="">Selecione</option>
            {veiculos.data?.map((veiculo) => (
              <option key={veiculo.id} value={veiculo.id}>
                {veiculo.marca} {veiculo.modelo}
                {veiculo.placa ? ` · ${veiculo.placa}` : " · Sem placa"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={rotulo}>
          Serviço
          <select
            className={campo}
            value={servicoId}
            onChange={(evento) => setServicoId(evento.target.value)}
          >
            <option value="">Selecione</option>
            {opcoes.data?.servicos.map((servico) => (
              <option key={servico.id} value={servico.id}>
                {servico.nome}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          Data e horário
          <input
            className={campo}
            type="datetime-local"
            value={dataHora}
            onChange={(evento) => setDataHora(evento.target.value)}
          />
        </label>
      </div>
      <label className={rotulo}>
        Valor final (R$) <span className="font-normal text-muted-foreground">(opcional)</span>
        <input
          className={campo}
          inputMode="decimal"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Lavadores participantes</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {opcoes.data?.lavadores.map((lavador) => (
            <label key={lavador.id} className="lc-choice">
              <input
                type="checkbox"
                checked={lavadores.includes(lavador.id)}
                onChange={() =>
                  setLavadores((lista) =>
                    lista.includes(lavador.id)
                      ? lista.filter((id) => id !== lavador.id)
                      : [...lista, lavador.id],
                  )
                }
              />
              {lavador.nome}
            </label>
          ))}
        </div>
      </fieldset>
      {concluido && (
        <fieldset className="space-y-3 rounded-xl border bg-muted/35 p-4">
          <legend className="px-1 text-sm font-semibold">Pagamentos</legend>
          {pagamentos.map((pagamento, indice) => (
            <div key={indice} className="grid grid-cols-2 gap-2">
              <label className={rotulo}>
                Forma {indice + 1}
                <select
                  className={campo}
                  value={pagamento.forma_pagamento}
                  onChange={(evento) =>
                    setPagamentos((lista) =>
                      lista.map((atual, posicao) =>
                        posicao === indice
                          ? {
                              ...atual,
                              forma_pagamento: evento.target
                                .value as PagamentoEntrada["forma_pagamento"],
                            }
                          : atual,
                      ),
                    )
                  }
                >
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="debito">Débito</option>
                  <option value="credito">Crédito</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
              <label className={rotulo}>
                Valor (R$)
                <input
                  className={campo}
                  inputMode="decimal"
                  value={pagamento.valor}
                  onChange={(evento) =>
                    setPagamentos((lista) =>
                      lista.map((atual, posicao) =>
                        posicao === indice ? { ...atual, valor: evento.target.value } : atual,
                      ),
                    )
                  }
                />
              </label>
              {pagamentos.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="col-span-2 text-destructive"
                  onClick={() =>
                    setPagamentos((lista) => lista.filter((_, posicao) => posicao !== indice))
                  }
                >
                  Remover pagamento
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setPagamentos((lista) => [...lista, { forma_pagamento: "pix", valor: "" }])
            }
          >
            + Dividir pagamento
          </Button>
        </fieldset>
      )}
      <label className={rotulo}>
        Observações <span className="font-normal text-muted-foreground">(opcional)</span>
        <textarea
          className={`${campo} min-h-20 resize-y`}
          value={observacoes}
          onChange={(evento) => setObservacoes(evento.target.value)}
        />
      </label>
      <label className={rotulo}>
        Motivo da edição
        <textarea
          className={`${campo} min-h-20 resize-y`}
          placeholder="Explique por que as informações foram alteradas"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
        />
      </label>
    </DialogoFormulario>
  );
}

function AcaoAtendimento({
  item,
  tipo,
  papel,
  aoFechar,
  aoSalvar,
}: {
  item: ItemFila;
  tipo: "avancar" | "cancelar" | "participantes";
  papel: Papel;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const cancelando = tipo === "cancelar";
  const [gatilho] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const destino = cancelando ? "cancelado" : proximoStatus(item.status);
  const baseMomento =
    destino === "em_lavagem"
      ? item.chegou_em
      : destino === "pronto_para_retirada"
        ? (item.lavagem_iniciada_em ?? item.chegou_em)
        : (item.pronto_em ?? item.lavagem_iniciada_em ?? item.chegou_em);
  const [momentoRetroativo, setMomentoRetroativo] = useState(() => {
    const base = new Date(baseMomento);
    base.setMinutes(base.getMinutes() + 30);
    return dataHoraLocalInput(base > new Date() ? new Date() : base);
  });
  const permiteMomentoRetroativo = papel === "administrador";
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState(
    item.valor_final == null ? "" : String(item.valor_final).replace(".", ","),
  );
  const [pagamentos, setPagamentos] = useState<
    { forma_pagamento: PagamentoEntrada["forma_pagamento"]; valor: string }[]
  >([{ forma_pagamento: "pix", valor }]);
  const [erro, setErro] = useState<string | null>(null);
  const salvandoRef = useRef(false);
  const [lavadores, setLavadores] = useState<string[]>(item.lavadores.map((l) => l.perfil_id));
  const opcoesLavadores = useQuery({
    queryKey: ["lavadores-ativos"],
    enabled: tipo === "participantes",
    queryFn: async () => {
      const { data, error } = await db()
        .from("papeis_perfil")
        .select("perfis(id, nome_completo, ativo)")
        .eq("papel", "lavador");
      if (error) throw error;
      return (
        data as unknown as {
          perfis: { id: string; nome_completo: string; ativo: boolean } | null;
        }[]
      ).flatMap((p) => (p.perfis?.ativo ? [p.perfis] : []));
    },
  });
  const salvar = useMutation({
    mutationFn: async () => {
      if (tipo === "participantes") {
        if (!lavadores.length) throw new Error("Selecione pelo menos um lavador.");
        const { error } = await db().rpc("rpc_definir_participantes", {
          p_atendimento_id: item.id,
          p_lavadores: lavadores,
        });
        if (error) throw error;
        return;
      }
      if (!destino) throw new Error("Transição inválida.");
      if (cancelando && motivo.trim().length < 3)
        throw new Error("Informe o motivo do cancelamento.");
      let lista: PagamentoEntrada[] | null = null;
      let valorFinal = item.valor_final;
      if (destino === "entregue") {
        const valorFinalCentavos = reaisParaCentavos(valor);
        valorFinal = valorFinalCentavos / 100;
        lista = pagamentos.map((p) => ({
          forma_pagamento: p.forma_pagamento,
          valor_centavos: reaisParaCentavos(p.valor),
        }));
        const validacao = validarEntrega(valorFinalCentavos, item.lavadores.length, lista);
        if (validacao) throw new Error(validacao);
      }
      const { error } = await db().rpc("rpc_avancar_atendimento", {
        p_atendimento_id: item.id,
        p_novo_status: destino,
        p_motivo: motivo.trim() || null,
        p_valor_final: valorFinal,
        p_pagamentos: lista,
        p_momento_operacao: permiteMomentoRetroativo
          ? momentoLocalParaIso(momentoRetroativo)
          : null,
      });
      if (error) throw error;
    },
    onSuccess: aoSalvar,
    onError: (e) => setErro(mensagemErro(e)),
  });
  const entrega = destino === "entregue";
  const resumoPagamento = (() => {
    if (!entrega) return null;
    try {
      const valorFinalCentavos = reaisParaCentavos(valor);
      const totalCentavos = somaPagamentosCentavos(
        pagamentos.map((pagamento) => ({
          forma_pagamento: pagamento.forma_pagamento,
          valor_centavos: reaisParaCentavos(pagamento.valor),
        })),
      );
      return { valorFinalCentavos, totalCentavos };
    } catch {
      return null;
    }
  })();
  const confirmar = () => {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setErro(null);
    salvar.mutate(undefined, {
      onSettled: () => {
        salvandoRef.current = false;
      },
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar();
      }}
    >
      <DialogContent
        className="lc-workspace max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-card"
        onCloseAutoFocus={(evento) => {
          evento.preventDefault();
          gatilho?.focus();
        }}
      >
        <div className="pr-6">
          <DialogTitle>
            {tipo === "participantes"
              ? "Corrigir lavadores"
              : cancelando
                ? "Cancelar atendimento"
                : ACAO[item.status]}
          </DialogTitle>
          <DialogDescription className="mt-2">
            {item.nome_cliente_snapshot} · {item.veiculo_snapshot}
          </DialogDescription>
        </div>
        {tipo === "participantes" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Participantes</legend>
            {opcoesLavadores.data?.map((lavador) => (
              <label key={lavador.id} className="lc-choice">
                <input
                  type="checkbox"
                  checked={lavadores.includes(lavador.id)}
                  onChange={() =>
                    setLavadores((lista) =>
                      lista.includes(lavador.id)
                        ? lista.filter((id) => id !== lavador.id)
                        : [...lista, lavador.id],
                    )
                  }
                />
                {lavador.nome_completo}
              </label>
            ))}
          </fieldset>
        )}
        {cancelando && (
          <label className={rotulo}>
            Motivo
            <textarea
              className={campo}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
        )}
        {entrega && (
          <>
            <label className={rotulo}>
              Valor final (R$)
              <input
                className={campo}
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Pagamentos</legend>
              {pagamentos.map((p, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 items-end gap-2 rounded-xl border bg-muted/50 p-3"
                >
                  <label className={rotulo}>
                    Forma {i + 1}
                    <select
                      className={campo}
                      value={p.forma_pagamento}
                      onChange={(e) =>
                        setPagamentos((lista) =>
                          lista.map((x, n) =>
                            n === i
                              ? {
                                  ...x,
                                  forma_pagamento: e.target
                                    .value as PagamentoEntrada["forma_pagamento"],
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      {["dinheiro", "pix", "debito", "credito", "outro"].map((f) => (
                        <option key={f} value={f}>
                          {
                            {
                              dinheiro: "Dinheiro",
                              pix: "PIX",
                              debito: "Débito",
                              credito: "Crédito",
                              outro: "Outro",
                            }[f]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={rotulo}>
                    Valor (R$)
                    <input
                      className={campo}
                      inputMode="decimal"
                      placeholder="Valor"
                      value={p.valor}
                      onChange={(e) =>
                        setPagamentos((lista) =>
                          lista.map((x, n) => (n === i ? { ...x, valor: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  {pagamentos.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="col-span-2 text-destructive"
                      aria-label={`Remover pagamento ${i + 1}`}
                      onClick={() => setPagamentos((lista) => lista.filter((_, n) => n !== i))}
                    >
                      Remover
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="text-sm text-primary"
                onClick={() =>
                  setPagamentos((lista) => [...lista, { forma_pagamento: "pix", valor: "" }])
                }
              >
                + Dividir pagamento
              </Button>
              {resumoPagamento && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Total informado: {formatarDinheiro(resumoPagamento.totalCentavos / 100)} ·{" "}
                  {resumoPagamento.totalCentavos === resumoPagamento.valorFinalCentavos
                    ? "Valor conferido"
                    : resumoPagamento.totalCentavos < resumoPagamento.valorFinalCentavos
                      ? `Falta ${formatarDinheiro(
                          (resumoPagamento.valorFinalCentavos - resumoPagamento.totalCentavos) /
                            100,
                        )}`
                      : `Excede ${formatarDinheiro(
                          (resumoPagamento.totalCentavos - resumoPagamento.valorFinalCentavos) /
                            100,
                        )}`}
                </p>
              )}
            </fieldset>
            {pagamentos.some((pagamento) => pagamento.forma_pagamento === "pix") && (
              <section
                className="rounded-2xl border bg-card p-4 text-center"
                aria-label="Pagamento por PIX"
              >
                <h3 className="font-semibold">Pagamento por PIX</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mostre este QR Code ao cliente para realizar o pagamento.
                </p>
                <img
                  src="/pix-lava-rapido.jpeg"
                  alt="QR Code PIX do Auto Clean"
                  loading="lazy"
                  decoding="async"
                  className="mx-auto mt-4 aspect-square w-full max-w-72 rounded-xl border bg-white object-contain p-2"
                />
              </section>
            )}
          </>
        )}
        {permiteMomentoRetroativo && tipo !== "participantes" && (
          <label className={rotulo}>
            Data e horário desta etapa
            <input
              aria-label="Data e horário desta etapa"
              className={campo}
              type="datetime-local"
              max={dataHoraLocalInput()}
              value={momentoRetroativo}
              onChange={(evento) => setMomentoRetroativo(evento.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              A etapa e o pagamento serão registrados na data informada.
            </span>
          </label>
        )}
        {erro && (
          <p role="alert" className="lc-message">
            {erro}
          </p>
        )}
        <Button
          type="button"
          disabled={salvar.isPending}
          aria-busy={salvar.isPending}
          className="w-full"
          onClick={confirmar}
        >
          {salvar.isPending ? "Salvando..." : "Confirmar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
