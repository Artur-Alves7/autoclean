import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { montarPayloadNovoVeiculo } from "@/lib/veiculo";

// Untyped view: generated types don't list these tables yet.
const db = () => supabase as unknown as SupabaseClient;

const STATUS_ATIVOS = ["aguardando", "em_lavagem", "pronto_para_retirada"] as const;
const ROTULO_STATUS: Record<string, string> = {
  aguardando: "Aguardando",
  em_lavagem: "Em lavagem",
  pronto_para_retirada: "Pronto para retirada",
};

type ItemFila = {
  id: string;
  status: string;
  chegou_em: string;
  valor_final: number | null;
  nome_cliente_snapshot: string;
  veiculo_snapshot: string;
  categoria_veiculo_snapshot: string;
  servico_snapshot: string;
  atendimento_lavadores: { ordem_rateio: number; perfis: { nome_completo: string } | null }[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hora = (d: string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const erroPt = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? "";
  if (/row-level security|permission|42501/i.test(m)) return "Você não tem permissão para esta ação.";
  if (/fetch|network/i.test(m)) return "Falha de conexão. Verifique sua internet.";
  return m || "Erro inesperado. Tente novamente.";
};

export function FilaAtendimentos({ perfilId }: { perfilId: string }) {
  const [abrirForm, setAbrirForm] = useState(false);
  const fila = useQuery({
    queryKey: ["fila-atendimentos"],
    queryFn: async () => {
      const { data, error } = await db()
        .from("atendimentos")
        .select(
          "id, status, chegou_em, valor_final, nome_cliente_snapshot, veiculo_snapshot, categoria_veiculo_snapshot, servico_snapshot, atendimento_lavadores(ordem_rateio, perfis(nome_completo))",
        )
        .in("status", STATUS_ATIVOS as unknown as string[])
        .order("chegou_em", { ascending: true });
      if (error) throw error;
      return data as unknown as ItemFila[];
    },
  });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Fila de atendimentos</h1>
        {!abrirForm && (
          <button onClick={() => setAbrirForm(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Novo atendimento
          </button>
        )}
      </div>

      {abrirForm && <NovoAtendimento perfilId={perfilId} onFechar={() => setAbrirForm(false)} />}

      {fila.isLoading && <p className="text-muted-foreground">Carregando fila...</p>}
      {fila.error && <p className="text-destructive">{erroPt(fila.error)}</p>}
      {fila.data && fila.data.length === 0 && (
        <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">Nenhum atendimento ativo no momento.</div>
      )}
      <ul className="space-y-3">
        {fila.data?.map((a, i) => (
          <li key={a.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{i + 1}. {a.nome_cliente_snapshot}</p>
                <p className="text-sm text-muted-foreground">{a.veiculo_snapshot} · {a.categoria_veiculo_snapshot}</p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                {ROTULO_STATUS[a.status] ?? a.status}
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-sm text-foreground sm:grid-cols-2">
              <p><span className="text-muted-foreground">Serviço:</span> {a.servico_snapshot}</p>
              <p><span className="text-muted-foreground">Chegada:</span> {hora(a.chegou_em)}</p>
              <p><span className="text-muted-foreground">Valor:</span> {a.valor_final != null ? brl(Number(a.valor_final)) : "Informar depois"}</p>
              <p><span className="text-muted-foreground">Lavadores:</span>{" "}
                {[...a.atendimento_lavadores].sort((x, y) => x.ordem_rateio - y.ordem_rateio)
                  .map((l) => l.perfis?.nome_completo ?? "—").join(", ") || "—"}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Cliente = { id: string; nome_completo: string; telefone: string };
type Veiculo = { id: string; marca: string; modelo: string; placa: string | null; cor: string | null; categorias_veiculo: { nome: string } | null };
type Opcao = { id: string; nome: string };

const clienteSchema = z.object({
  nome_completo: z.string().trim().min(2, "Informe o nome do cliente.").max(120, "Nome muito longo."),
  telefone: z.string().trim().regex(/^[\d\s()+-]{8,20}$/, "Telefone inválido."),
});
const veiculoSchema = z.object({
  categoria_veiculo_id: z.string().uuid("Selecione a categoria."),
  marca: z.string().trim().min(1, "Informe a marca.").max(60),
  modelo: z.string().trim().min(1, "Informe o modelo.").max(60),
  placa: z.string().trim().max(10, "Placa muito longa.").optional(),
  cor: z.string().trim().max(30).optional(),
});

const campo = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const rotulo = "block space-y-1 text-sm font-medium text-foreground";

function NovoAtendimento({ perfilId, onFechar }: { perfilId: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [novoCliente, setNovoCliente] = useState(false);
  const [nc, setNc] = useState({ nome_completo: "", telefone: "" });
  const [veiculoId, setVeiculoId] = useState<string>("");
  const [novoVeiculo, setNovoVeiculo] = useState(false);
  const [nv, setNv] = useState({ categoria_veiculo_id: "", marca: "", modelo: "", placa: "", cor: "" });
  const [servicoId, setServicoId] = useState("");
  const [lavadores, setLavadores] = useState<string[]>([]);
  const [depois, setDepois] = useState(true);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const clientes = useQuery({
    queryKey: ["busca-clientes", buscaDeb],
    enabled: buscaDeb.length >= 2 && !cliente,
    queryFn: async () => {
      const termo = buscaDeb.replace(/[%,()]/g, "");
      const { data, error } = await db().from("clientes").select("id, nome_completo, telefone")
        .eq("ativo", true).or(`nome_completo.ilike.%${termo}%,telefone.ilike.%${termo}%`)
        .order("nome_completo").limit(10);
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const veiculos = useQuery({
    queryKey: ["veiculos-cliente", cliente?.id],
    enabled: !!cliente,
    queryFn: async () => {
      const { data, error } = await db().from("veiculos")
        .select("id, marca, modelo, placa, cor, categorias_veiculo(nome)")
        .eq("cliente_id", cliente!.id).eq("ativo", true).order("criado_em", { ascending: false });
      if (error) throw error;
      return data as unknown as Veiculo[];
    },
  });

  const auxiliares = useQuery({
    queryKey: ["auxiliares-atendimento"],
    queryFn: async () => {
      const [cat, serv, pap] = await Promise.all([
        db().from("categorias_veiculo").select("id, nome").eq("ativo", true).order("nome"),
        db().from("servicos_lavagem").select("id, nome").eq("ativo", true).order("nome"),
        db().from("papeis_perfil").select("perfil_id, perfis(id, nome_completo, ativo)").eq("papel", "lavador"),
      ]);
      if (cat.error) throw cat.error;
      if (serv.error) throw serv.error;
      if (pap.error) throw pap.error;
      const lav = (pap.data as unknown as { perfis: { id: string; nome_completo: string; ativo: boolean } | null }[])
        .map((p) => p.perfis).filter((p): p is NonNullable<typeof p> => !!p && p.ativo)
        .map((p) => ({ id: p.id, nome: p.nome_completo })).sort((a, b) => a.nome.localeCompare(b.nome));
      return { categorias: cat.data as Opcao[], servicos: serv.data as Opcao[], lavadores: lav };
    },
  });

  useEffect(() => {
    if (veiculos.data) {
      if (veiculos.data.length === 0) { setNovoVeiculo(true); setVeiculoId(""); }
      else if (!novoVeiculo && !veiculoId) setVeiculoId(veiculos.data[0]!.id);
    }
  }, [veiculos.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = useMutation({
    mutationFn: async () => {
      // 1. Cliente
      let clienteId = cliente?.id;
      if (!clienteId) {
        const r = clienteSchema.safeParse(nc);
        if (!r.success) throw new Error(r.error.issues[0]!.message);
        const { data, error } = await db().from("clientes").insert(r.data).select("id").single();
        if (error) throw error;
        clienteId = data.id as string;
      }
      // 2. Veículo
      let vId = veiculoId;
      if (novoVeiculo || !vId) {
        const r = veiculoSchema.safeParse(nv);
        if (!r.success) throw new Error(r.error.issues[0]!.message);
        const { data, error } = await db()
          .from("veiculos")
          .insert(montarPayloadNovoVeiculo(clienteId, r.data))
          .select("id")
          .single();
        if (error) throw error;
        vId = data.id as string;
      }
      // 3. Atendimento (status e chegou_em ficam com os padrões do banco: aguardando / agora)
      const { data: at, error: ae } = await db().from("atendimentos").insert({
        cliente_id: clienteId,
        veiculo_id: vId,
        servico_id: servicoId,
        criado_por_perfil_id: perfilId,
        valor_final: depois ? null : Number(valor.replace(",", ".")),
        observacoes: obs.trim() || null,
      }).select("id").single();
      if (ae) throw ae;
      // 4. Lavadores participantes
      const { error: le } = await db().from("atendimento_lavadores").insert(
        lavadores.map((id, i) => ({ atendimento_id: at.id, lavador_perfil_id: id, ordem_rateio: i + 1 })),
      );
      if (le) throw new Error("O atendimento foi criado, mas não foi possível vincular os lavadores: " + erroPt(le));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fila-atendimentos"] });
      onFechar();
    },
    onError: (e) => {
      setErro(erroPt(e));
      qc.invalidateQueries({ queryKey: ["fila-atendimentos"] });
    },
  });

  function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (!cliente && !novoCliente) return setErro("Selecione ou cadastre um cliente.");
    if (!servicoId) return setErro("Selecione o serviço.");
    if (lavadores.length === 0) return setErro("Selecione pelo menos um lavador.");
    if (!depois) {
      const n = Number(valor.replace(",", "."));
      if (!valor.trim() || !Number.isFinite(n) || n <= 0 || n > 100000) return setErro("Informe um valor válido ou marque Informar depois.");
    }
    salvar.mutate();
  }

  const toggleLavador = (id: string) =>
    setLavadores((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  return (
    <form onSubmit={enviar} className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Novo atendimento</h2>
        <button type="button" onClick={onFechar} className="text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
      </div>

      {/* Cliente */}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-foreground">Cliente</legend>
        {cliente ? (
          <div className="flex items-center justify-between rounded-md border bg-muted p-3 text-sm">
            <span className="text-foreground">{cliente.nome_completo} · {cliente.telefone}</span>
            <button type="button" className="text-primary hover:underline"
              onClick={() => { setCliente(null); setVeiculoId(""); setNovoVeiculo(false); }}>Trocar</button>
          </div>
        ) : novoCliente ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={rotulo}><span>Nome</span>
              <input className={campo} value={nc.nome_completo} maxLength={120}
                onChange={(e) => setNc({ ...nc, nome_completo: e.target.value })} /></label>
            <label className={rotulo}><span>Telefone</span>
              <input className={campo} value={nc.telefone} maxLength={20} inputMode="tel"
                onChange={(e) => setNc({ ...nc, telefone: e.target.value })} /></label>
            <button type="button" className="text-left text-sm text-primary hover:underline"
              onClick={() => setNovoCliente(false)}>Buscar cliente existente</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input className={campo} placeholder="Buscar por nome ou telefone" value={busca} maxLength={60}
              onChange={(e) => setBusca(e.target.value)} />
            {clientes.isFetching && <p className="text-sm text-muted-foreground">Buscando...</p>}
            {clientes.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
            <ul className="divide-y rounded-md border empty:hidden">
              {clientes.data?.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setCliente(c); setNovoVeiculo(false); setVeiculoId(""); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent">
                    {c.nome_completo} <span className="text-muted-foreground">· {c.telefone}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="text-sm text-primary hover:underline"
              onClick={() => { setNovoCliente(true); setNovoVeiculo(true); setNc({ nome_completo: busca, telefone: "" }); }}>
              + Cadastrar novo cliente
            </button>
          </div>
        )}
      </fieldset>

      {/* Veículo */}
      {(cliente || novoCliente) && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-foreground">Veículo</legend>
          {cliente && !novoVeiculo && veiculos.data && veiculos.data.length > 0 && (
            <div className="space-y-2">
              {veiculos.data.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="radio" name="veiculo" checked={veiculoId === v.id} onChange={() => setVeiculoId(v.id)} />
                  {v.marca} {v.modelo}{v.placa ? ` · ${v.placa}` : ""}{v.cor ? ` · ${v.cor}` : ""}
                  <span className="text-muted-foreground">({v.categorias_veiculo?.nome})</span>
                </label>
              ))}
              <button type="button" className="text-sm text-primary hover:underline"
                onClick={() => { setNovoVeiculo(true); setVeiculoId(""); }}>+ Cadastrar outro veículo</button>
            </div>
          )}
          {veiculos.isLoading && cliente && <p className="text-sm text-muted-foreground">Carregando veículos...</p>}
          {(novoVeiculo || novoCliente) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={rotulo}><span>Categoria</span>
                <select className={campo} value={nv.categoria_veiculo_id}
                  onChange={(e) => setNv({ ...nv, categoria_veiculo_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {auxiliares.data?.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select></label>
              <label className={rotulo}><span>Marca</span>
                <input className={campo} value={nv.marca} maxLength={60} onChange={(e) => setNv({ ...nv, marca: e.target.value })} /></label>
              <label className={rotulo}><span>Modelo</span>
                <input className={campo} value={nv.modelo} maxLength={60} onChange={(e) => setNv({ ...nv, modelo: e.target.value })} /></label>
              <label className={rotulo}><span>Placa (opcional)</span>
                <input className={campo} value={nv.placa} maxLength={10} onChange={(e) => setNv({ ...nv, placa: e.target.value })} /></label>
              <label className={rotulo}><span>Cor (opcional)</span>
                <input className={campo} value={nv.cor} maxLength={30} onChange={(e) => setNv({ ...nv, cor: e.target.value })} /></label>
              {cliente && veiculos.data && veiculos.data.length > 0 && (
                <button type="button" className="self-end text-left text-sm text-primary hover:underline"
                  onClick={() => { setNovoVeiculo(false); setVeiculoId(veiculos.data![0]!.id); }}>Usar veículo existente</button>
              )}
            </div>
          )}
        </fieldset>
      )}

      {/* Serviço e lavadores */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={rotulo}><span>Serviço</span>
          <select className={campo} value={servicoId} onChange={(e) => setServicoId(e.target.value)}>
            <option value="">Selecione</option>
            {auxiliares.data?.servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select></label>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-foreground">Lavadores participantes</legend>
          {auxiliares.data?.lavadores.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum lavador ativo cadastrado.</p>
          )}
          <div className="space-y-1">
            {auxiliares.data?.lavadores.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={lavadores.includes(l.id)} onChange={() => toggleLavador(l.id)} />
                {l.nome}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {auxiliares.error && <p className="text-sm text-destructive">{erroPt(auxiliares.error)}</p>}

      {/* Valor */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={depois} onChange={(e) => setDepois(e.target.checked)} />
          Informar valor depois
        </label>
        {!depois && (
          <label className={rotulo}><span>Valor da lavagem (R$)</span>
            <input className={campo} inputMode="decimal" placeholder="0,00" value={valor} maxLength={10}
              onChange={(e) => setValor(e.target.value)} /></label>
        )}
        <label className={rotulo}><span>Observações (opcional)</span>
          <textarea className={campo} rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
        <p className="text-xs text-muted-foreground">A chegada é registrada agora, com status Aguardando. O pagamento é feito na saída.</p>
      </div>

      {erro && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</div>}

      <button type="submit" disabled={salvar.isPending}
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {salvar.isPending ? "Registrando..." : "Registrar chegada"}
      </button>
    </form>
  );
}
