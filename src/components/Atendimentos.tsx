import {
  ArrowRight,
  CarFront,
  CheckCheck,
  Clock3,
  Droplets,
  LoaderCircle,
  Plus,
  UsersRound,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";

import type { Papel } from "@/lib/acesso";
import {
  proximoStatus,
  reaisParaCentavos,
  type PagamentoEntrada,
  type StatusAtendimento,
  validarEntrega,
} from "@/lib/regras";
import { db, formatarDataHora, formatarDinheiro, mensagemErro } from "@/lib/supabase-db";

const STATUS_ATIVOS: StatusAtendimento[] = ["aguardando", "em_lavagem", "pronto_para_retirada"];
const ROTULOS: Record<StatusAtendimento, string> = {
  aguardando: "Aguardando",
  em_lavagem: "Em lavagem",
  pronto_para_retirada: "Pronto para retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};
const ACAO: Partial<Record<StatusAtendimento, string>> = {
  aguardando: "Iniciar lavagem",
  em_lavagem: "Marcar como pronto",
  pronto_para_retirada: "Registrar entrega",
};
const campo = "lc-field";
const rotulo = "lc-label";

type Lavador = { perfil_id: string; nome: string; ordem_rateio: number };
type ItemFila = {
  id: string;
  status: StatusAtendimento;
  chegou_em: string;
  valor_final: number | null;
  nome_cliente_snapshot: string;
  veiculo_snapshot: string;
  categoria_veiculo_snapshot: string;
  servico_snapshot: string;
  lavadores: Lavador[];
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

export function FilaAtendimentos({ perfilId, papel }: { perfilId: string; papel: Papel }) {
  const qc = useQueryClient();
  const [abrirForm, setAbrirForm] = useState(false);
  const [acao, setAcao] = useState<{
    item: ItemFila;
    tipo: "avancar" | "cancelar" | "participantes";
  } | null>(null);
  const fila = useQuery({
    queryKey: ["fila-atendimentos"],
    queryFn: async () => {
      const { data, error } = await db()
        .from("vw_painel_atendimentos")
        .select(
          "id, status, chegou_em, valor_final, nome_cliente_snapshot, veiculo_snapshot, categoria_veiculo_snapshot, servico_snapshot, lavadores",
        )
        .in("status", STATUS_ATIVOS)
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
          <h1 className="mt-2">Fila de atendimentos</h1>
          <p>Da chegada à entrega, acompanhe cada etapa.</p>
        </div>
        {!abrirForm && (
          <Button className="w-full sm:w-auto" onClick={() => setAbrirForm(true)}>
            <Plus aria-hidden="true" />
            Novo atendimento
          </Button>
        )}
      </div>
      {abrirForm && <NovoAtendimento perfilId={perfilId} onFechar={() => setAbrirForm(false)} />}
      <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Resumo da fila">
        {[
          { status: "aguardando", nome: "Aguardando", icone: Clock3 },
          { status: "em_lavagem", nome: "Em lavagem", icone: Droplets },
          { status: "pronto_para_retirada", nome: "Prontos para retirada", icone: CheckCheck },
        ].map(({ status, nome, icone: Icone }) => (
          <div key={status} className="lc-stat !gap-2 !p-3 sm:!gap-3 sm:!p-4">
            <span
              className="lc-status !hidden !rounded-xl !p-3 sm:!inline-flex"
              data-status={status}
            >
              <Icone className="!size-5" aria-hidden="true" />
            </span>
            <div>
              <strong>
                {fila.data ? fila.data.filter((item) => item.status === status).length : "—"}
              </strong>
              <p>{nome}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="lc-panel !p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Atendimentos ativos</h2>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden="true" />
            Ordem de chegada
          </span>
        </div>
        {fila.isLoading && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Carregando fila...
          </p>
        )}
        {fila.error && (
          <p role="alert" className="lc-message m-4">
            {mensagemErro(fila.error)}
          </p>
        )}
        {fila.data?.length === 0 && (
          <div className="lc-empty m-5">
            <CarFront aria-hidden="true" />
            <p className="font-semibold text-foreground">Nenhum atendimento ativo.</p>
            <p className="mt-1">Use “Novo atendimento” para registrar a próxima chegada.</p>
          </div>
        )}
        <ul className="divide-y">
          {fila.data?.map((item, indice) => (
            <li key={item.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                    {String(indice + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold">{item.nome_cliente_snapshot}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.veiculo_snapshot} · {item.categoria_veiculo_snapshot}
                    </p>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <dl className="my-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm xl:grid-cols-4">
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Serviço</dt>
                  <dd className="font-medium">{item.servico_snapshot}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Chegada</dt>
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
                    {item.lavadores.map((l) => l.nome).join(", ") || "Não vinculados"}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary/20 bg-accent text-primary hover:border-primary"
                  onClick={() => setAcao({ item, tipo: "avancar" })}
                >
                  {ACAO[item.status]}
                  <ArrowRight aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                  onClick={() => setAcao({ item, tipo: "cancelar" })}
                >
                  Cancelar
                </Button>
                {papel === "administrador" && item.lavadores.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAcao({ item, tipo: "participantes" })}
                  >
                    Corrigir lavadores
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      {acao && (
        <AcaoAtendimento
          item={acao.item}
          tipo={acao.tipo}
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

function NovoAtendimento({ perfilId, onFechar }: { perfilId: string; onFechar: () => void }) {
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
  const [erro, setErro] = useState<string | null>(null);
  void perfilId;

  useEffect(() => {
    const id = setTimeout(() => setBuscaDeb(busca.trim()), 300);
    return () => clearTimeout(id);
  }, [busca]);
  const clientes = useQuery({
    queryKey: ["busca-clientes", buscaDeb],
    enabled: buscaDeb.length >= 2 && !cliente,
    queryFn: async () => {
      const termo = buscaDeb.replace(/[%(),]/g, "");
      const placa = termo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const [porCliente, porPlaca] = await Promise.all([
        db()
          .from("clientes")
          .select("id, nome_completo, telefone")
          .eq("ativo", true)
          .or(`nome_completo.ilike.%${termo}%,telefone.ilike.%${termo}%`)
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
      const valorFinal = valorDepois ? null : reaisParaCentavos(valor) / 100;
      const { error } = await db().rpc("rpc_criar_atendimento", {
        p_servico_id: servicoId,
        p_lavadores: lavadores,
        p_cliente_id: cliente?.id ?? null,
        p_cliente: clienteNovo,
        p_veiculo_id: veiculoNovo ? null : veiculoId,
        p_veiculo: veiculoNovo,
        p_valor_final: valorFinal,
        p_observacoes: observacoes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fila-atendimentos"] });
      onFechar();
    },
    onError: (e) => setErro(mensagemErro(e)),
  });
  function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!cliente && !novoCliente) return setErro("Selecione ou cadastre um cliente.");
    if (!servicoId) return setErro("Selecione o serviço.");
    if (!lavadores.length) return setErro("Selecione pelo menos um lavador.");
    salvar.mutate();
  }
  const alternarLavador = (id: string) =>
    setLavadores((lista) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]));

  return (
    <form
      onSubmit={enviar}
      className="lc-panel space-y-6 border-primary/25"
      aria-label="Registrar chegada"
    >
      <div className="flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">Novo atendimento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Registre a chegada e organize a equipe.
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          className="text-sm text-muted-foreground"
          onClick={onFechar}
        >
          Fechar
        </Button>
      </div>
      <fieldset className="lc-form-section space-y-3">
        <legend>
          <span className="lc-step">01</span>Cliente
        </legend>
        {cliente ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-accent p-3 text-sm">
            <span>
              {cliente.nome_completo} · {cliente.telefone}
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
                value={dadosCliente.telefone}
                onChange={(e) => setDadosCliente({ ...dadosCliente, telefone: e.target.value })}
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
                    {c.nome_completo} · {c.telefone}
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
            <span className="lc-step">02</span>Veículo
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
                  {v.placa ? ` · ${v.placa}` : ""} ({v.categorias_veiculo?.nome})
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
                    className={campo}
                    value={veiculo[chave]}
                    onChange={(e) => setVeiculo({ ...veiculo, [chave]: e.target.value })}
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
          <span className="lc-step">03</span>Serviço e equipe
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
          <span className="lc-step">04</span>Valor e observações
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
      <Button disabled={salvar.isPending} aria-busy={salvar.isPending} className="w-full">
        {salvar.isPending ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
        {salvar.isPending ? "Registrando..." : "Registrar chegada"}
      </Button>
    </form>
  );
}

function AcaoAtendimento({
  item,
  tipo,
  aoFechar,
  aoSalvar,
}: {
  item: ItemFila;
  tipo: "avancar" | "cancelar" | "participantes";
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
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState(
    item.valor_final == null ? "" : String(item.valor_final).replace(".", ","),
  );
  const [pagamentos, setPagamentos] = useState([{ forma_pagamento: "pix", valor: valor }]);
  const [erro, setErro] = useState<string | null>(null);
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
      let lista: PagamentoEntrada[] = [];
      let valorFinal = item.valor_final;
      if (destino === "entregue") {
        valorFinal = reaisParaCentavos(valor) / 100;
        lista = pagamentos.map((p) => ({
          forma_pagamento: p.forma_pagamento as PagamentoEntrada["forma_pagamento"],
          valor_centavos: reaisParaCentavos(p.valor),
        }));
        const validacao = validarEntrega(reaisParaCentavos(valor), item.lavadores.length, lista);
        if (validacao) throw new Error(validacao);
      }
      const { error } = await db().rpc("rpc_avancar_atendimento", {
        p_atendimento_id: item.id,
        p_novo_status: destino,
        p_motivo: motivo.trim() || null,
        p_valor_final: valorFinal,
        p_pagamentos: lista,
      });
      if (error) throw error;
    },
    onSuccess: aoSalvar,
    onError: (e) => setErro(mensagemErro(e)),
  });
  const entrega = destino === "entregue";
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
                            n === i ? { ...x, forma_pagamento: e.target.value } : x,
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
                variant="outline"
                className="text-sm text-primary"
                onClick={() =>
                  setPagamentos((lista) => [...lista, { forma_pagamento: "pix", valor: "" }])
                }
              >
                + Dividir pagamento
              </Button>
            </fieldset>
          </>
        )}
        {erro && (
          <p role="alert" className="lc-message">
            {erro}
          </p>
        )}
        <Button
          disabled={salvar.isPending}
          aria-busy={salvar.isPending}
          className="w-full"
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Salvando..." : "Confirmar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
