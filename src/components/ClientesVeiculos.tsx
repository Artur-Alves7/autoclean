import { Button } from "@/components/ui/button";
import { CarFront, Search, UsersRound } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { Papel } from "@/lib/acesso";
import { db, formatarDataHora, mensagemErro } from "@/lib/supabase-db";

type Cliente = {
  id: string;
  nome_completo: string;
  telefone: string;
  observacoes: string | null;
  ativo: boolean;
};

type Veiculo = {
  id: string;
  marca: string;
  modelo: string;
  placa: string | null;
  cor: string | null;
  observacoes: string | null;
  ativo: boolean;
  categorias_veiculo: { nome: string } | null;
};

export function ClientesVeiculos({ papel }: { papel: Papel }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const clientes = useQuery({
    queryKey: ["clientes", busca],
    queryFn: async () => {
      const termo = busca.trim().replace(/[%,()]/g, "");
      const placa = termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const consultaClientes = db()
        .from("clientes")
        .select("id, nome_completo, telefone, observacoes, ativo")
        .order("nome_completo");
      const [porCliente, porPlaca] = await Promise.all([
        termo
          ? consultaClientes.or(`nome_completo.ilike.%${termo}%,telefone.ilike.%${termo}%`)
          : consultaClientes,
        placa.length >= 3
          ? db()
              .from("veiculos")
              .select("clientes(id, nome_completo, telefone, observacoes, ativo)")
              .ilike("placa_normalizada", `%${placa}%`)
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (porCliente.error) throw porCliente.error;
      if (porPlaca.error) throw porPlaca.error;
      const mapa = new Map<string, Cliente>();
      (porCliente.data as Cliente[]).forEach((cliente) => mapa.set(cliente.id, cliente));
      (porPlaca.data as unknown as { clientes: Cliente | null }[]).forEach(
        ({ clientes: cliente }) => {
          if (cliente) mapa.set(cliente.id, cliente);
        },
      );
      return [...mapa.values()].sort((a, b) =>
        a.nome_completo.localeCompare(b.nome_completo, "pt-BR"),
      );
    },
  });

  const detalhes = useQuery({
    queryKey: ["cliente-detalhes", selecionado?.id],
    enabled: !!selecionado,
    queryFn: async () => {
      const [veiculos, atendimentos] = await Promise.all([
        db()
          .from("veiculos")
          .select("id, marca, modelo, placa, cor, observacoes, ativo, categorias_veiculo(nome)")
          .eq("cliente_id", selecionado!.id)
          .order("marca")
          .order("modelo"),
        db()
          .from("vw_painel_atendimentos")
          .select(
            "id, veiculo_id, chegou_em, status, veiculo_snapshot, servico_snapshot, valor_final",
          )
          .eq("cliente_id", selecionado!.id)
          .order("chegou_em", { ascending: false })
          .limit(50),
      ]);
      if (veiculos.error) throw veiculos.error;
      if (atendimentos.error) throw atendimentos.error;
      return {
        veiculos: veiculos.data as unknown as Veiculo[],
        atendimentos: atendimentos.data ?? [],
      };
    },
  });

  const atualizar = useMutation({
    mutationFn: async (entrada: {
      tabela: "clientes" | "veiculos";
      id: string;
      valores: Record<string, unknown>;
    }) => {
      const { error } = await db()
        .from(entrada.tabela)
        .update(entrada.valores)
        .eq("id", entrada.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setMensagem("Alteração salva.");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["cliente-detalhes"] });
    },
    onError: (erro) => setMensagem(mensagemErro(erro)),
  });

  return (
    <section className="lc-page">
      <div className="lc-page-heading">
        <div>
          <span className="lc-eyebrow">Relacionamento</span>
          <h1 className="text-2xl font-bold tracking-tight">Clientes e veículos</h1>
          <p className="text-sm text-muted-foreground">
            Consulte todos os cadastros em ordem alfabética ou filtre por nome, telefone ou placa.
          </p>
        </div>
      </div>
      <label className="lc-label">
        <span className="sr-only">Buscar cliente por nome, telefone ou placa</span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            className="lc-field !pl-10"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Nome, telefone ou placa"
          />
        </div>
      </label>
      {clientes.isFetching && (
        <p className="text-sm text-muted-foreground">Carregando clientes...</p>
      )}
      {clientes.error && <p className="text-sm text-destructive">{mensagemErro(clientes.error)}</p>}
      {clientes.data?.length === 0 && (
        <p className="lc-empty">
          {busca.trim()
            ? "Nenhum cliente encontrado para esta busca."
            : "Nenhum cliente cadastrado."}
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {clientes.data?.length ?? 0} cliente(s)
          </p>
          <ul className="max-h-[68dvh] divide-y overflow-y-auto rounded-xl border bg-card empty:hidden">
            {clientes.data?.map((cliente) => (
              <li key={cliente.id}>
                <Button
                  variant="outline"
                  className={`!block w-full !rounded-none !border-0 !px-4 !py-4 text-left !shadow-none ${selecionado?.id === cliente.id ? "bg-accent" : ""}`}
                  aria-pressed={selecionado?.id === cliente.id}
                  onClick={() => setSelecionado(cliente)}
                  type="button"
                >
                  <span className="block font-medium">{cliente.nome_completo}</span>
                  <span className="text-sm text-muted-foreground">{cliente.telefone}</span>
                  {!cliente.ativo && <span className="ml-2 text-xs text-destructive">Inativo</span>}
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {selecionado && (
          <div className="lc-panel space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <UsersRound className="size-5 text-primary" aria-hidden="true" />
                  {selecionado.nome_completo}
                </h2>
                <p className="text-sm text-muted-foreground">{selecionado.telefone}</p>
              </div>
              {papel === "administrador" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-sm"
                    onClick={() => {
                      const nome = window.prompt("Nome completo", selecionado.nome_completo);
                      if (nome === null) return;
                      const telefone = window.prompt("Telefone", selecionado.telefone);
                      if (telefone === null) return;
                      atualizar.mutate({
                        tabela: "clientes",
                        id: selecionado.id,
                        valores: { nome_completo: nome.trim(), telefone: telefone.trim() },
                      });
                      setSelecionado({
                        ...selecionado,
                        nome_completo: nome.trim(),
                        telefone: telefone.trim(),
                      });
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-sm"
                    onClick={() =>
                      atualizar.mutate({
                        tabela: "clientes",
                        id: selecionado.id,
                        valores: { ativo: !selecionado.ativo },
                      })
                    }
                  >
                    {selecionado.ativo ? "Desativar" : "Reativar"}
                  </Button>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <CarFront className="size-4 text-primary" aria-hidden="true" />
                Veículos
              </h3>
              {detalhes.error && (
                <p role="alert" className="lc-message mb-3">
                  {mensagemErro(detalhes.error)}
                </p>
              )}
              {detalhes.data?.veiculos.length === 0 && (
                <p className="lc-empty">Nenhum veículo cadastrado.</p>
              )}
              {detalhes.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
              <ul className="space-y-2">
                {detalhes.data?.veiculos.map((veiculo) => (
                  <li key={veiculo.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-3">
                      <span>
                        <strong>
                          {veiculo.marca} {veiculo.modelo}
                        </strong>
                        {veiculo.placa ? ` · ${veiculo.placa}` : " · Sem placa"}
                        {veiculo.cor ? ` · ${veiculo.cor}` : ""}
                        <span className="text-muted-foreground">
                          {" "}
                          · {veiculo.categorias_veiculo?.nome}
                        </span>
                      </span>
                      {papel === "administrador" && (
                        <span className="flex gap-2">
                          <Button
                            variant="outline"
                            type="button"
                            className="text-primary"
                            onClick={() => {
                              const marca = window.prompt("Marca", veiculo.marca);
                              if (marca === null) return;
                              const modelo = window.prompt("Modelo", veiculo.modelo);
                              if (modelo === null) return;
                              const placa = window.prompt("Placa opcional", veiculo.placa ?? "");
                              if (placa === null) return;
                              const cor = window.prompt("Cor opcional", veiculo.cor ?? "");
                              if (cor === null) return;
                              atualizar.mutate({
                                tabela: "veiculos",
                                id: veiculo.id,
                                valores: {
                                  marca: marca.trim(),
                                  modelo: modelo.trim(),
                                  placa: placa.trim() || null,
                                  cor: cor.trim() || null,
                                },
                              });
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            type="button"
                            className="text-primary"
                            onClick={() =>
                              atualizar.mutate({
                                tabela: "veiculos",
                                id: veiculo.id,
                                valores: { ativo: !veiculo.ativo },
                              })
                            }
                          >
                            {veiculo.ativo ? "Desativar" : "Reativar"}
                          </Button>
                        </span>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                      {detalhes.data.atendimentos
                        .filter((atendimento) => atendimento.veiculo_id === veiculo.id)
                        .slice(0, 5)
                        .map((atendimento) => (
                          <li key={atendimento.id}>
                            {formatarDataHora(atendimento.chegou_em)} ·{" "}
                            {atendimento.servico_snapshot} ·{" "}
                            <StatusBadge status={atendimento.status} />
                          </li>
                        ))}
                      {!detalhes.data.atendimentos.some(
                        (atendimento) => atendimento.veiculo_id === veiculo.id,
                      ) && <li>Sem atendimentos para este veículo.</li>}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-medium">Histórico de atendimentos</h3>
              <ul className="space-y-2 text-sm">
                {detalhes.data?.atendimentos.map((atendimento) => (
                  <li key={atendimento.id} className="rounded-md bg-muted p-3">
                    {formatarDataHora(atendimento.chegou_em)} · {atendimento.veiculo_snapshot} ·{" "}
                    {atendimento.servico_snapshot}
                    <span className="ml-2 inline-block">
                      <StatusBadge status={atendimento.status} />
                    </span>
                  </li>
                ))}
                {detalhes.data?.atendimentos.length === 0 && (
                  <li className="text-muted-foreground">Sem atendimentos.</li>
                )}
              </ul>
            </div>
          </div>
        )}
        {!selecionado && !!clientes.data?.length && (
          <div className="lc-empty hidden lg:block">
            <UsersRound aria-hidden="true" />
            Selecione um cliente para consultar seus veículos e atendimentos.
          </div>
        )}
      </div>
      {mensagem && (
        <p role="status" className="lc-message">
          {mensagem}
        </p>
      )}
    </section>
  );
}
