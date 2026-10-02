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
    enabled: busca.trim().length >= 2,
    queryFn: async () => {
      const termo = busca.trim().replace(/[%,()]/g, "");
      const placa = termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const [porCliente, porPlaca] = await Promise.all([
        db()
          .from("clientes")
          .select("id, nome_completo, telefone, observacoes, ativo")
          .or(`nome_completo.ilike.%${termo}%,telefone.ilike.%${termo}%`)
          .order("nome_completo")
          .limit(20),
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
      return [...mapa.values()];
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
          .order("criado_em", { ascending: false }),
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
    <section className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Clientes e veículos</h1>
        <p className="text-sm text-muted-foreground">Pesquise por nome, telefone ou placa.</p>
      </div>
      <input
        className="w-full rounded-md border bg-background px-3 py-2"
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
        placeholder="Nome, telefone ou placa"
      />
      {clientes.isFetching && <p className="text-sm text-muted-foreground">Buscando...</p>}
      {clientes.error && <p className="text-sm text-destructive">{mensagemErro(clientes.error)}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_2fr]">
        <ul className="divide-y rounded-lg border bg-card">
          {clientes.data?.map((cliente) => (
            <li key={cliente.id}>
              <button
                className="w-full px-4 py-3 text-left hover:bg-accent"
                onClick={() => setSelecionado(cliente)}
                type="button"
              >
                <span className="block font-medium">{cliente.nome_completo}</span>
                <span className="text-sm text-muted-foreground">{cliente.telefone}</span>
                {!cliente.ativo && <span className="ml-2 text-xs text-destructive">Inativo</span>}
              </button>
            </li>
          ))}
        </ul>

        {selecionado && (
          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{selecionado.nome_completo}</h2>
                <p className="text-sm text-muted-foreground">{selecionado.telefone}</p>
              </div>
              {papel === "administrador" && (
                <div className="flex gap-2">
                  <button
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
                  </button>
                  <button
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
                  </button>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 font-medium">Veículos</h3>
              {detalhes.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
              <ul className="space-y-2">
                {detalhes.data?.veiculos.map((veiculo) => (
                  <li key={veiculo.id} className="rounded-md border p-3 text-sm">
                    <div className="flex justify-between gap-2">
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
                          <button
                            type="button"
                            className="text-primary hover:underline"
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
                          </button>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() =>
                              atualizar.mutate({
                                tabela: "veiculos",
                                id: veiculo.id,
                                valores: { ativo: !veiculo.ativo },
                              })
                            }
                          >
                            {veiculo.ativo ? "Desativar" : "Reativar"}
                          </button>
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
                            {atendimento.servico_snapshot} · {atendimento.status}
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
                    <span className="ml-2 font-medium">{atendimento.status}</span>
                  </li>
                ))}
                {detalhes.data?.atendimentos.length === 0 && (
                  <li className="text-muted-foreground">Sem atendimentos.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
      {mensagem && (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
    </section>
  );
}
