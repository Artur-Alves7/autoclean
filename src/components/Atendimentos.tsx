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
const campo = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const rotulo = "block space-y-1 text-sm font-medium";

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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Fila de atendimentos</h1>
        {!abrirForm && (
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => setAbrirForm(true)}
          >
            Novo atendimento
          </button>
        )}
      </div>
      {abrirForm && <NovoAtendimento perfilId={perfilId} onFechar={() => setAbrirForm(false)} />}
      {fila.isLoading && <p className="text-muted-foreground">Carregando fila...</p>}
      {fila.error && <p className="text-destructive">{mensagemErro(fila.error)}</p>}
      {fila.data?.length === 0 && (
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
          Nenhum atendimento ativo.
        </div>
      )}
      <ul className="space-y-3">
        {fila.data?.map((item, indice) => (
          <li key={item.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {indice + 1}. {item.nome_cliente_snapshot}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.veiculo_snapshot} · {item.categoria_veiculo_snapshot}
                </p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                {ROTULOS[item.status]}
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Serviço:</span> {item.servico_snapshot}
              </p>
              <p>
                <span className="text-muted-foreground">Chegada:</span>{" "}
                {formatarDataHora(item.chegou_em)}
              </p>
              <p>
                <span className="text-muted-foreground">Valor:</span>{" "}
                {item.valor_final == null ? "Informar depois" : formatarDinheiro(item.valor_final)}
              </p>
              <p>
                <span className="text-muted-foreground">Lavadores:</span>{" "}
                {item.lavadores.map((l) => l.nome).join(", ") || "Não vinculados"}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <button
                className="font-medium text-primary hover:underline"
                onClick={() => setAcao({ item, tipo: "avancar" })}
              >
                {ACAO[item.status]}
              </button>
              <button
                className="text-destructive hover:underline"
                onClick={() => setAcao({ item, tipo: "cancelar" })}
              >
                Cancelar
              </button>
              {papel === "administrador" && item.lavadores.length === 0 && (
                <button
                  className="text-primary hover:underline"
                  onClick={() => setAcao({ item, tipo: "participantes" })}
                >
                  Corrigir lavadores
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
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
    } else if (!novoVeiculo && !veiculoId) setVeiculoId(veiculos.data[0].id);
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
    <form onSubmit={enviar} className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex justify-between">
        <h2 className="text-lg font-semibold">Novo atendimento</h2>
        <button type="button" className="text-sm text-muted-foreground" onClick={onFechar}>
          Fechar
        </button>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Cliente</legend>
        {cliente ? (
          <div className="flex justify-between rounded-md border p-3 text-sm">
            <span>
              {cliente.nome_completo} · {cliente.telefone}
            </span>
            <button
              type="button"
              className="text-primary"
              onClick={() => {
                setCliente(null);
                setVeiculoId("");
              }}
            >
              Trocar
            </button>
          </div>
        ) : novoCliente ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={rotulo}>
              Nome
              <input
                className={campo}
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
                value={dadosCliente.telefone}
                onChange={(e) => setDadosCliente({ ...dadosCliente, telefone: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="text-left text-sm text-primary"
              onClick={() => setNovoCliente(false)}
            >
              Buscar existente
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              className={campo}
              placeholder="Buscar por nome, telefone ou placa"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <ul className="divide-y rounded-md border empty:hidden">
              {clientes.data?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full p-2 text-left text-sm"
                    onClick={() => setCliente(c)}
                  >
                    {c.nome_completo} · {c.telefone}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="text-sm text-primary"
              onClick={() => {
                setNovoCliente(true);
                setNovoVeiculo(true);
                setDadosCliente({ nome_completo: busca, telefone: "" });
              }}
            >
              + Cadastrar cliente
            </button>
          </div>
        )}
      </fieldset>
      {(cliente || novoCliente) && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Veículo</legend>
          {cliente && !novoVeiculo && !!veiculos.data?.length && (
            <div className="space-y-1">
              {veiculos.data.map((v) => (
                <label key={v.id} className="flex gap-2 text-sm">
                  <input
                    type="radio"
                    checked={veiculoId === v.id}
                    onChange={() => setVeiculoId(v.id)}
                  />
                  {v.marca} {v.modelo}
                  {v.placa ? ` · ${v.placa}` : ""} ({v.categorias_veiculo?.nome})
                </label>
              ))}
              <button
                type="button"
                className="text-sm text-primary"
                onClick={() => {
                  setNovoVeiculo(true);
                  setVeiculoId("");
                }}
              >
                + Outro veículo
              </button>
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
                  {chave[0].toUpperCase() + chave.slice(1)}
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
                <button
                  type="button"
                  className="text-left text-sm text-primary"
                  onClick={() => {
                    setNovoVeiculo(false);
                    setVeiculoId(veiculos.data![0].id);
                  }}
                >
                  Usar veículo existente
                </button>
              )}
            </div>
          )}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
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
          <legend className="mb-1 text-sm font-medium">Lavadores</legend>
          {auxiliares.data?.lavadores.map((o) => (
            <label key={o.id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={lavadores.includes(o.id)}
                onChange={() => alternarLavador(o.id)}
              />
              {o.nome}
            </label>
          ))}
        </fieldset>
      </div>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={valorDepois}
          onChange={(e) => setValorDepois(e.target.checked)}
        />
        Informar valor depois
      </label>
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
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <button
        disabled={salvar.isPending}
        className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
      >
        {salvar.isPending ? "Registrando..." : "Registrar chegada"}
      </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-xl bg-background p-5">
        <div className="flex justify-between">
          <h2 className="font-semibold">
            {tipo === "participantes"
              ? "Corrigir lavadores"
              : cancelando
                ? "Cancelar atendimento"
                : ACAO[item.status]}
          </h2>
          <button onClick={aoFechar}>Fechar</button>
        </div>
        {tipo === "participantes" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Participantes</legend>
            {opcoesLavadores.data?.map((lavador) => (
              <label key={lavador.id} className="flex gap-2 text-sm">
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
              <input className={campo} value={valor} onChange={(e) => setValor(e.target.value)} />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Pagamentos</legend>
              {pagamentos.map((p, i) => (
                <div key={i} className="flex gap-2">
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
                        {f}
                      </option>
                    ))}
                  </select>
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
                  {pagamentos.length > 1 && (
                    <button
                      onClick={() => setPagamentos((lista) => lista.filter((_, n) => n !== i))}
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
              <button
                className="text-sm text-primary"
                onClick={() =>
                  setPagamentos((lista) => [...lista, { forma_pagamento: "pix", valor: "" }])
                }
              >
                + Dividir pagamento
              </button>
            </fieldset>
          </>
        )}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        <button
          disabled={salvar.isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => salvar.mutate()}
        >
          {salvar.isPending ? "Salvando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
