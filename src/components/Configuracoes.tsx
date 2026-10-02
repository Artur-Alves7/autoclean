import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { db, formatarDinheiro, mensagemErro } from "@/lib/supabase-db";

type Categoria = { id: string; nome: string; valor_empresa: number; ativo: boolean };
type Servico = { id: string; nome: string; descricao: string | null; ativo: boolean };

export function Configuracoes() {
  const qc = useQueryClient();
  const [categoria, setCategoria] = useState({ nome: "", valor_empresa: "" });
  const [servico, setServico] = useState({ nome: "", descricao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const dados = useQuery({
    queryKey: ["configuracoes"],
    queryFn: async () => {
      const [categorias, servicos] = await Promise.all([
        db().from("categorias_veiculo").select("id, nome, valor_empresa, ativo").order("nome"),
        db().from("servicos_lavagem").select("id, nome, descricao, ativo").order("nome"),
      ]);
      if (categorias.error) throw categorias.error;
      if (servicos.error) throw servicos.error;
      return { categorias: categorias.data as Categoria[], servicos: servicos.data as Servico[] };
    },
  });
  const salvar = useMutation({
    mutationFn: async (acao: () => PromiseLike<{ error: unknown }>) => {
      const { error } = await acao();
      if (error) throw error;
    },
    onSuccess: () => {
      setErro(null);
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
    },
    onError: (e) => setErro(mensagemErro(e)),
  });

  function criarCategoria(evento: FormEvent) {
    evento.preventDefault();
    const valor = Number(categoria.valor_empresa.replace(",", "."));
    if (!categoria.nome.trim() || !Number.isFinite(valor) || valor < 0)
      return setErro("Preencha a categoria e o valor da empresa.");
    salvar.mutate(() =>
      db().from("categorias_veiculo").insert({ nome: categoria.nome.trim(), valor_empresa: valor }),
    );
    setCategoria({ nome: "", valor_empresa: "" });
  }

  function criarServico(evento: FormEvent) {
    evento.preventDefault();
    if (!servico.nome.trim()) return setErro("Informe o nome do serviço.");
    salvar.mutate(() =>
      db()
        .from("servicos_lavagem")
        .insert({ nome: servico.nome.trim(), descricao: servico.descricao.trim() || null }),
    );
    setServico({ nome: "", descricao: "" });
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Alterações não modificam snapshots de atendimentos antigos.
        </p>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold">Categorias de veículo</h2>
          <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]" onSubmit={criarCategoria}>
            <input
              className="rounded-md border px-3 py-2"
              placeholder="Nome"
              value={categoria.nome}
              onChange={(e) => setCategoria({ ...categoria, nome: e.target.value })}
            />
            <input
              className="rounded-md border px-3 py-2"
              placeholder="Parte da empresa"
              inputMode="decimal"
              value={categoria.valor_empresa}
              onChange={(e) => setCategoria({ ...categoria, valor_empresa: e.target.value })}
            />
            <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground">
              Adicionar
            </button>
          </form>
          <ul className="divide-y">
            {dados.data?.categorias.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {item.nome} · {formatarDinheiro(item.valor_empresa)} {!item.ativo && "· Inativa"}
                </span>
                <span className="flex gap-2">
                  <button
                    className="text-primary hover:underline"
                    onClick={() => {
                      const nome = window.prompt("Nome da categoria", item.nome);
                      if (nome === null) return;
                      const valorTexto = window.prompt(
                        "Parte da empresa (R$)",
                        String(item.valor_empresa).replace(".", ","),
                      );
                      if (valorTexto === null) return;
                      const valor = Number(valorTexto.replace(",", "."));
                      if (!nome.trim() || !Number.isFinite(valor) || valor < 0)
                        return setErro("Dados da categoria inválidos.");
                      salvar.mutate(() =>
                        db()
                          .from("categorias_veiculo")
                          .update({ nome: nome.trim(), valor_empresa: valor })
                          .eq("id", item.id),
                      );
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="text-primary hover:underline"
                    onClick={() =>
                      salvar.mutate(() =>
                        db()
                          .from("categorias_veiculo")
                          .update({ ativo: !item.ativo })
                          .eq("id", item.id),
                      )
                    }
                  >
                    {item.ativo ? "Desativar" : "Ativar"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold">Serviços</h2>
          <form className="mb-4 space-y-2" onSubmit={criarServico}>
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Nome"
              value={servico.nome}
              onChange={(e) => setServico({ ...servico, nome: e.target.value })}
            />
            <input
              className="w-full rounded-md border px-3 py-2"
              placeholder="Descrição opcional"
              value={servico.descricao}
              onChange={(e) => setServico({ ...servico, descricao: e.target.value })}
            />
            <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground">
              Adicionar
            </button>
          </form>
          <ul className="divide-y">
            {dados.data?.servicos.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {item.nome} {!item.ativo && "· Inativo"}
                </span>
                <span className="flex gap-2">
                  <button
                    className="text-primary hover:underline"
                    onClick={() => {
                      const nome = window.prompt("Nome do serviço", item.nome);
                      if (nome === null) return;
                      const descricao = window.prompt("Descrição opcional", item.descricao ?? "");
                      if (descricao === null) return;
                      if (!nome.trim()) return setErro("Informe o nome do serviço.");
                      salvar.mutate(() =>
                        db()
                          .from("servicos_lavagem")
                          .update({ nome: nome.trim(), descricao: descricao.trim() || null })
                          .eq("id", item.id),
                      );
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="text-primary hover:underline"
                    onClick={() =>
                      salvar.mutate(() =>
                        db()
                          .from("servicos_lavagem")
                          .update({ ativo: !item.ativo })
                          .eq("id", item.id),
                      )
                    }
                  >
                    {item.ativo ? "Desativar" : "Ativar"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
