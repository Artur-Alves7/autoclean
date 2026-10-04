import { Button } from "@/components/ui/button";
import { DialogoFormulario } from "@/components/DialogoFormulario";
import { CarFront, Droplets, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { db, formatarDinheiro, mensagemErro } from "@/lib/supabase-db";

type Categoria = { id: string; nome: string; valor_empresa: number; ativo: boolean };
type Servico = { id: string; nome: string; descricao: string | null; ativo: boolean };
type EdicaoConfiguracao =
  | { tipo: "categoria"; id: string; nome: string; valorEmpresa: string }
  | { tipo: "servico"; id: string; nome: string; descricao: string };

export function Configuracoes() {
  const qc = useQueryClient();
  const [categoria, setCategoria] = useState({ nome: "", valor_empresa: "" });
  const [servico, setServico] = useState({ nome: "", descricao: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<EdicaoConfiguracao | null>(null);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
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
      setErroEdicao(null);
      setEdicao(null);
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
    },
    onError: (e) => {
      const mensagem = mensagemErro(e);
      setErro(mensagem);
      setErroEdicao(mensagem);
    },
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
    <section className="lc-page">
      <div className="lc-page-heading">
        <div>
          <span className="lc-eyebrow">Administração</span>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie categorias e serviços. Os valores dos atendimentos anteriores são preservados.
          </p>
        </div>
      </div>
      {erro && (
        <p role="alert" className="lc-message">
          {erro}
        </p>
      )}
      {dados.isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando configurações...
        </p>
      )}
      {dados.error && (
        <p role="alert" className="lc-message">
          {mensagemErro(dados.error)}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="lc-panel">
          <h2 className="mb-5 flex items-center gap-2 font-semibold">
            <CarFront className="size-5 text-primary" aria-hidden="true" />
            Categorias de veículo
          </h2>
          <form className="mb-5 grid gap-4 rounded-xl bg-muted/50 p-4" onSubmit={criarCategoria}>
            <label className="lc-label">
              Nome da categoria
              <input
                className="lc-field"
                placeholder="Nome"
                value={categoria.nome}
                onChange={(e) => setCategoria({ ...categoria, nome: e.target.value })}
              />
            </label>
            <label className="lc-label">
              Parte da empresa (R$)
              <input
                className="lc-field"
                placeholder="Parte da empresa"
                inputMode="decimal"
                value={categoria.valor_empresa}
                onChange={(e) => setCategoria({ ...categoria, valor_empresa: e.target.value })}
              />
            </label>
            <Button
              disabled={salvar.isPending}
              aria-busy={salvar.isPending}
              className="justify-self-start"
            >
              <Plus aria-hidden="true" />
              {salvar.isPending ? "Salvando..." : "Adicionar categoria"}
            </Button>
          </form>
          <ul className="divide-y">
            {dados.data?.categorias.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
              >
                <span>
                  {item.nome} · {formatarDinheiro(item.valor_empresa)} {!item.ativo && "· Inativa"}
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="text-primary"
                    size="sm"
                    disabled={salvar.isPending}
                    onClick={() => {
                      setErroEdicao(null);
                      setEdicao({
                        tipo: "categoria",
                        id: item.id,
                        nome: item.nome,
                        valorEmpresa: String(item.valor_empresa).replace(".", ","),
                      });
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    className="text-primary"
                    size="sm"
                    disabled={salvar.isPending}
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
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {dados.data?.categorias.length === 0 && (
            <p className="lc-empty">Nenhuma categoria cadastrada.</p>
          )}
        </div>
        <div className="lc-panel">
          <h2 className="mb-5 flex items-center gap-2 font-semibold">
            <Droplets className="size-5 text-primary" aria-hidden="true" />
            Serviços
          </h2>
          <form className="mb-5 grid gap-4 rounded-xl bg-muted/50 p-4" onSubmit={criarServico}>
            <label className="lc-label">
              Nome do serviço
              <input
                className="lc-field"
                placeholder="Nome"
                value={servico.nome}
                onChange={(e) => setServico({ ...servico, nome: e.target.value })}
              />
            </label>
            <label className="lc-label">
              Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
              <input
                className="lc-field"
                placeholder="Descrição opcional"
                value={servico.descricao}
                onChange={(e) => setServico({ ...servico, descricao: e.target.value })}
              />
            </label>
            <Button
              disabled={salvar.isPending}
              aria-busy={salvar.isPending}
              className="justify-self-start"
            >
              <Plus aria-hidden="true" />
              {salvar.isPending ? "Salvando..." : "Adicionar serviço"}
            </Button>
          </form>
          <ul className="divide-y">
            {dados.data?.servicos.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
              >
                <span>
                  {item.nome} {!item.ativo && "· Inativo"}
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="text-primary"
                    size="sm"
                    disabled={salvar.isPending}
                    onClick={() => {
                      setErroEdicao(null);
                      setEdicao({
                        tipo: "servico",
                        id: item.id,
                        nome: item.nome,
                        descricao: item.descricao ?? "",
                      });
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    className="text-primary"
                    size="sm"
                    disabled={salvar.isPending}
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
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {dados.data?.servicos.length === 0 && (
            <p className="lc-empty">Nenhum serviço cadastrado.</p>
          )}
        </div>
      </div>
      <DialogoFormulario
        aberto={!!edicao}
        titulo={edicao?.tipo === "categoria" ? "Editar categoria" : "Editar serviço"}
        descricao={
          edicao?.tipo === "categoria"
            ? "Atualize o nome e a parte da empresa para os próximos atendimentos."
            : "Atualize as informações exibidas na seleção de serviços."
        }
        erro={erroEdicao}
        salvando={salvar.isPending}
        aoFechar={() => {
          setEdicao(null);
          setErroEdicao(null);
        }}
        aoEnviar={() => {
          if (!edicao) return;
          setErroEdicao(null);
          if (edicao.tipo === "categoria") {
            const valor = Number(edicao.valorEmpresa.replace(",", "."));
            if (!edicao.nome.trim() || !Number.isFinite(valor) || valor < 0) {
              setErroEdicao("Informe um nome e um valor válido para a categoria.");
              return;
            }
            salvar.mutate(() =>
              db()
                .from("categorias_veiculo")
                .update({ nome: edicao.nome.trim(), valor_empresa: valor })
                .eq("id", edicao.id),
            );
            return;
          }
          if (!edicao.nome.trim()) {
            setErroEdicao("Informe o nome do serviço.");
            return;
          }
          salvar.mutate(() =>
            db()
              .from("servicos_lavagem")
              .update({
                nome: edicao.nome.trim(),
                descricao: edicao.descricao.trim() || null,
              })
              .eq("id", edicao.id),
          );
        }}
      >
        <label className="lc-label">
          {edicao?.tipo === "categoria" ? "Nome da categoria" : "Nome do serviço"}
          <input
            className="lc-field"
            autoFocus
            value={edicao?.nome ?? ""}
            onChange={(evento) =>
              setEdicao((atual) => (atual ? { ...atual, nome: evento.target.value } : atual))
            }
          />
        </label>
        {edicao?.tipo === "categoria" && (
          <label className="lc-label">
            Parte da empresa (R$)
            <input
              className="lc-field"
              inputMode="decimal"
              value={edicao.valorEmpresa}
              onChange={(evento) => setEdicao({ ...edicao, valorEmpresa: evento.target.value })}
            />
          </label>
        )}
        {edicao?.tipo === "servico" && (
          <label className="lc-label">
            Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
            <textarea
              className="lc-field min-h-24 resize-y"
              value={edicao.descricao}
              onChange={(evento) => setEdicao({ ...edicao, descricao: evento.target.value })}
            />
          </label>
        )}
      </DialogoFormulario>
    </section>
  );
}
