import { Button } from "@/components/ui/button";
import { DialogoFormulario } from "@/components/DialogoFormulario";
import { CarFront, Plus, Search, UsersRound } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { Papel } from "@/lib/acesso";
import { prepararBuscaCliente } from "@/lib/atendimento";
import { formatarPlaca, formatarTelefone } from "@/lib/formatacao";
import { db, formatarDataHora, mensagemErro } from "@/lib/supabase-db";
import { montarPayloadNovoVeiculo } from "@/lib/veiculo";

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

type EdicaoCadastro =
  | { tipo: "cliente"; id: string; nome: string; telefone: string }
  | { tipo: "veiculo"; id: string; marca: string; modelo: string; placa: string; cor: string };

const veiculoVazio = {
  categoria_veiculo_id: "",
  marca: "",
  modelo: "",
  placa: "",
  cor: "",
};

export function ClientesVeiculos({ papel }: { papel: Papel }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<EdicaoCadastro | null>(null);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const [novoVeiculo, setNovoVeiculo] = useState<typeof veiculoVazio | null>(null);
  const [erroNovoVeiculo, setErroNovoVeiculo] = useState<string | null>(null);

  const clientes = useQuery({
    queryKey: ["clientes", busca],
    queryFn: async () => {
      const { termo, telefone, placa } = prepararBuscaCliente(busca);
      const filtroTelefone = telefone ? `,telefone.ilike.%${telefone}%` : "";
      const consultaClientes = db()
        .from("clientes")
        .select("id, nome_completo, telefone, observacoes, ativo")
        .order("nome_completo");
      const [porCliente, porPlaca] = await Promise.all([
        termo
          ? consultaClientes.or(
              `nome_completo.ilike.%${termo}%,telefone.ilike.%${termo}%${filtroTelefone}`,
            )
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

  const categorias = useQuery({
    queryKey: ["categorias-veiculo-ativas"],
    enabled: !!novoVeiculo,
    queryFn: async () => {
      const { data, error } = await db()
        .from("categorias_veiculo")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const adicionarVeiculo = useMutation({
    mutationFn: async () => {
      if (!selecionado || !novoVeiculo) throw new Error("Selecione um cliente.");
      if (!novoVeiculo.categoria_veiculo_id) throw new Error("Selecione a categoria.");
      if (!novoVeiculo.marca.trim()) throw new Error("Informe a marca.");
      if (!novoVeiculo.modelo.trim()) throw new Error("Informe o modelo.");
      const payload = montarPayloadNovoVeiculo(selecionado.id, {
        ...novoVeiculo,
        marca: novoVeiculo.marca.trim(),
        modelo: novoVeiculo.modelo.trim(),
        placa: novoVeiculo.placa.trim(),
        cor: novoVeiculo.cor.trim(),
      });
      const { error } = await db().rpc("rpc_adicionar_veiculo_cliente", {
        p_cliente_id: payload.cliente_id,
        p_categoria_veiculo_id: payload.categoria_veiculo_id,
        p_marca: payload.marca,
        p_modelo: payload.modelo,
        p_placa: payload.placa,
        p_cor: payload.cor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovoVeiculo(null);
      setErroNovoVeiculo(null);
      setMensagem("Veículo adicionado ao cliente.");
      qc.invalidateQueries({ queryKey: ["cliente-detalhes", selecionado?.id] });
    },
    onError: (erro) => setErroNovoVeiculo(mensagemErro(erro)),
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
    onSuccess: (_, entrada) => {
      if (entrada.tabela === "clientes" && selecionado?.id === entrada.id) {
        setSelecionado((atual) => (atual ? { ...atual, ...entrada.valores } : atual));
      }
      setEdicao(null);
      setErroEdicao(null);
      setMensagem("Alteração salva.");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["cliente-detalhes"] });
    },
    onError: (erro) => {
      const texto = mensagemErro(erro);
      setMensagem(texto);
      setErroEdicao(texto);
    },
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
                  <span className="text-sm text-muted-foreground">
                    {formatarTelefone(cliente.telefone)}
                  </span>
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
                <p className="text-sm text-muted-foreground">
                  {formatarTelefone(selecionado.telefone)}
                </p>
              </div>
              {papel === "administrador" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-sm"
                    onClick={() => {
                      setErroEdicao(null);
                      setEdicao({
                        tipo: "cliente",
                        id: selecionado.id,
                        nome: selecionado.nome_completo,
                        telefone: formatarTelefone(selecionado.telefone),
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <CarFront className="size-4 text-primary" aria-hidden="true" />
                  Veículos
                </h3>
                <Button
                  type="button"
                  size="sm"
                  disabled={!selecionado.ativo}
                  onClick={() => {
                    setErroNovoVeiculo(null);
                    setNovoVeiculo({ ...veiculoVazio });
                  }}
                >
                  <Plus aria-hidden="true" />
                  Adicionar veículo
                </Button>
              </div>
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
                        {veiculo.placa ? ` · ${formatarPlaca(veiculo.placa)}` : " · Sem placa"}
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
                              setErroEdicao(null);
                              setEdicao({
                                tipo: "veiculo",
                                id: veiculo.id,
                                marca: veiculo.marca,
                                modelo: veiculo.modelo,
                                placa: formatarPlaca(veiculo.placa ?? ""),
                                cor: veiculo.cor ?? "",
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
      <DialogoFormulario
        aberto={!!edicao}
        titulo={edicao?.tipo === "veiculo" ? "Editar veículo" : "Editar cliente"}
        descricao={
          edicao?.tipo === "veiculo"
            ? "Atualize os dados usados nos próximos atendimentos."
            : "Mantenha os dados de contato do cliente atualizados."
        }
        erro={erroEdicao}
        salvando={atualizar.isPending}
        aoFechar={() => {
          setEdicao(null);
          setErroEdicao(null);
        }}
        aoEnviar={() => {
          if (!edicao) return;
          setErroEdicao(null);
          if (edicao.tipo === "cliente") {
            if (!edicao.nome.trim() || !edicao.telefone.trim()) {
              setErroEdicao("Informe o nome e o telefone do cliente.");
              return;
            }
            atualizar.mutate({
              tabela: "clientes",
              id: edicao.id,
              valores: {
                nome_completo: edicao.nome.trim(),
                telefone: formatarTelefone(edicao.telefone),
              },
            });
            return;
          }
          if (!edicao.marca.trim() || !edicao.modelo.trim()) {
            setErroEdicao("Informe a marca e o modelo do veículo.");
            return;
          }
          atualizar.mutate({
            tabela: "veiculos",
            id: edicao.id,
            valores: {
              marca: edicao.marca.trim(),
              modelo: edicao.modelo.trim(),
              placa: formatarPlaca(edicao.placa) || null,
              cor: edicao.cor.trim() || null,
            },
          });
        }}
      >
        {edicao?.tipo === "cliente" && (
          <>
            <label className="lc-label">
              Nome completo
              <input
                className="lc-field"
                autoFocus
                value={edicao.nome}
                onChange={(evento) => setEdicao({ ...edicao, nome: evento.target.value })}
              />
            </label>
            <label className="lc-label">
              Telefone
              <input
                className="lc-field"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={edicao.telefone}
                onChange={(evento) =>
                  setEdicao({ ...edicao, telefone: formatarTelefone(evento.target.value) })
                }
              />
            </label>
          </>
        )}
        {edicao?.tipo === "veiculo" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="lc-label">
                Marca
                <input
                  className="lc-field"
                  autoFocus
                  value={edicao.marca}
                  onChange={(evento) => setEdicao({ ...edicao, marca: evento.target.value })}
                />
              </label>
              <label className="lc-label">
                Modelo
                <input
                  className="lc-field"
                  value={edicao.modelo}
                  onChange={(evento) => setEdicao({ ...edicao, modelo: evento.target.value })}
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="lc-label">
                Placa <span className="font-normal text-muted-foreground">(opcional)</span>
                <input
                  className="lc-field uppercase"
                  maxLength={8}
                  placeholder="ABC-1D23"
                  value={edicao.placa}
                  onChange={(evento) =>
                    setEdicao({ ...edicao, placa: formatarPlaca(evento.target.value) })
                  }
                />
              </label>
              <label className="lc-label">
                Cor <span className="font-normal text-muted-foreground">(opcional)</span>
                <input
                  className="lc-field"
                  value={edicao.cor}
                  onChange={(evento) => setEdicao({ ...edicao, cor: evento.target.value })}
                />
              </label>
            </div>
          </>
        )}
      </DialogoFormulario>
      <DialogoFormulario
        aberto={!!novoVeiculo}
        titulo="Adicionar veículo"
        descricao={
          selecionado
            ? `Cadastre outro veículo para ${selecionado.nome_completo}.`
            : "Cadastre um veículo para o cliente selecionado."
        }
        erro={erroNovoVeiculo || (categorias.error ? mensagemErro(categorias.error) : null)}
        salvando={adicionarVeiculo.isPending}
        textoConfirmar="Adicionar veículo"
        aoFechar={() => {
          setNovoVeiculo(null);
          setErroNovoVeiculo(null);
        }}
        aoEnviar={() => {
          setErroNovoVeiculo(null);
          adicionarVeiculo.mutate();
        }}
      >
        <label className="lc-label">
          Categoria
          <select
            className="lc-field"
            autoFocus
            value={novoVeiculo?.categoria_veiculo_id ?? ""}
            onChange={(evento) =>
              setNovoVeiculo((atual) =>
                atual ? { ...atual, categoria_veiculo_id: evento.target.value } : atual,
              )
            }
          >
            <option value="">Selecione</option>
            {categorias.data?.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="lc-label">
            Marca
            <input
              className="lc-field"
              value={novoVeiculo?.marca ?? ""}
              onChange={(evento) =>
                setNovoVeiculo((atual) =>
                  atual ? { ...atual, marca: evento.target.value } : atual,
                )
              }
            />
          </label>
          <label className="lc-label">
            Modelo
            <input
              className="lc-field"
              value={novoVeiculo?.modelo ?? ""}
              onChange={(evento) =>
                setNovoVeiculo((atual) =>
                  atual ? { ...atual, modelo: evento.target.value } : atual,
                )
              }
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="lc-label">
            Placa <span className="font-normal text-muted-foreground">(opcional)</span>
            <input
              className="lc-field uppercase"
              maxLength={8}
              placeholder="ABC-1D23"
              value={novoVeiculo?.placa ?? ""}
              onChange={(evento) =>
                setNovoVeiculo((atual) =>
                  atual ? { ...atual, placa: formatarPlaca(evento.target.value) } : atual,
                )
              }
            />
          </label>
          <label className="lc-label">
            Cor <span className="font-normal text-muted-foreground">(opcional)</span>
            <input
              className="lc-field"
              value={novoVeiculo?.cor ?? ""}
              onChange={(evento) =>
                setNovoVeiculo((atual) => (atual ? { ...atual, cor: evento.target.value } : atual))
              }
            />
          </label>
        </div>
      </DialogoFormulario>
    </section>
  );
}
