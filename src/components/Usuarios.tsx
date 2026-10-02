import { Button } from "@/components/ui/button";
import { LoaderCircle, MailPlus, UsersRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { supabase } from "@/integrations/supabase/client";
import { db, mensagemErro } from "@/lib/supabase-db";

type Usuario = {
  id: string;
  nome_completo: string;
  telefone: string | null;
  ativo: boolean;
  papeis_perfil: { papel: "administrador" | "lavador" }[];
};

export function Usuarios() {
  const qc = useQueryClient();
  const [convite, setConvite] = useState({
    email: "",
    nome_completo: "",
    telefone: "",
    papel: "lavador",
  });
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const usuarios = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const { data, error } = await db()
        .from("perfis")
        .select("id, nome_completo, telefone, ativo, papeis_perfil(papel)")
        .order("nome_completo");
      if (error) throw error;
      return data as unknown as Usuario[];
    },
  });
  const alterar = useMutation({
    mutationFn: async ({
      id,
      ativo,
      papel,
    }: {
      id: string;
      ativo: boolean;
      papel: "administrador" | "lavador";
    }) => {
      const { error } = await db().rpc("rpc_atualizar_perfil_usuario", {
        p_perfil_id: id,
        p_ativo: ativo,
        p_papel: papel,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
    onError: (erro) => setMensagem(mensagemErro(erro)),
  });

  async function convidar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setMensagem(null);
    setEnviando(true);
    try {
      const { error } = await supabase.functions.invoke("convidar-usuario", { body: convite });
      if (error) return setMensagem(mensagemErro(error));
      setMensagem("Convite enviado e perfil preparado para o primeiro acesso.");
      setConvite({ email: "", nome_completo: "", telefone: "", papel: "lavador" });
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (erro) {
      setMensagem(mensagemErro(erro));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="lc-page">
      <div className="lc-page-heading">
        <div>
          <span className="lc-eyebrow">Equipe</span>
          <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Organize o acesso da equipe e os perfis de cada usuário.
          </p>
        </div>
      </div>
      <form onSubmit={convidar} className="lc-panel grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <MailPlus className="size-5 text-primary" aria-hidden="true" />
            Convidar para a equipe
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O acesso começa com um convite enviado por e-mail.
          </p>
        </div>
        <label className="lc-label">
          E-mail
          <input
            required
            type="email"
            autoComplete="email"
            className="lc-field"
            placeholder="E-mail"
            value={convite.email}
            onChange={(e) => setConvite({ ...convite, email: e.target.value })}
          />
        </label>
        <label className="lc-label">
          Nome completo
          <input
            required
            autoComplete="name"
            className="lc-field"
            placeholder="Nome completo"
            value={convite.nome_completo}
            onChange={(e) => setConvite({ ...convite, nome_completo: e.target.value })}
          />
        </label>
        <label className="lc-label">
          Telefone <span className="font-normal text-muted-foreground">(opcional)</span>
          <input
            className="lc-field"
            placeholder="Telefone opcional"
            type="tel"
            autoComplete="tel"
            value={convite.telefone}
            onChange={(e) => setConvite({ ...convite, telefone: e.target.value })}
          />
        </label>
        <label className="lc-label">
          Perfil de acesso
          <select
            className="lc-field"
            value={convite.papel}
            onChange={(e) => setConvite({ ...convite, papel: e.target.value })}
          >
            <option value="lavador">Lavador</option>
            <option value="administrador">Administrador</option>
          </select>
        </label>
        <div className="border-t pt-4 sm:col-span-2">
          <Button disabled={enviando} aria-busy={enviando} className="w-full sm:w-auto">
            {enviando ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <MailPlus aria-hidden="true" />
            )}
            {enviando ? "Enviando convite..." : "Enviar convite"}
          </Button>
        </div>
      </form>
      {mensagem && (
        <p role="status" className="lc-message">
          {mensagem}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border bg-card shadow-[var(--shadow-panel)]">
        <h2 className="flex items-center gap-2 border-b px-5 py-4 text-sm font-semibold">
          <UsersRound className="size-4 text-primary" aria-hidden="true" />
          Usuários cadastrados
        </h2>
        {usuarios.isLoading && (
          <p role="status" className="p-5 text-sm text-muted-foreground">
            Carregando usuários...
          </p>
        )}
        {usuarios.error && (
          <p role="alert" className="lc-message m-4">
            {mensagemErro(usuarios.error)}
          </p>
        )}
        {usuarios.data?.length === 0 && <p className="lc-empty m-4">Nenhum usuário encontrado.</p>}
        <table className="lc-table lc-responsive-table">
          <caption className="sr-only">Usuários, perfis de acesso e situação</caption>
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">Nome</th>
              <th className="p-3">Papel</th>
              <th className="p-3">Situação</th>
              <th className="p-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.data?.map((usuario) => (
              <tr key={usuario.id} className="border-b last:border-0">
                <td data-label="Nome" className="font-semibold">
                  {usuario.nome_completo}
                </td>
                <td data-label="Perfil">
                  <select
                    className="lc-field"
                    aria-label={`Perfil de ${usuario.nome_completo}`}
                    disabled={alterar.isPending}
                    value={usuario.papeis_perfil[0]?.papel ?? "lavador"}
                    onChange={(e) =>
                      alterar.mutate({
                        id: usuario.id,
                        ativo: usuario.ativo,
                        papel: e.target.value as "administrador" | "lavador",
                      })
                    }
                  >
                    <option value="lavador">Lavador</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </td>
                <td data-label="Situação">
                  <span
                    className="lc-status w-fit"
                    data-status={usuario.ativo ? "entregue" : "cancelado"}
                  >
                    {usuario.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td data-label="Ação">
                  <Button
                    variant="outline"
                    className="text-primary"
                    size="sm"
                    disabled={alterar.isPending}
                    onClick={() =>
                      alterar.mutate({
                        id: usuario.id,
                        ativo: !usuario.ativo,
                        papel: usuario.papeis_perfil[0]?.papel ?? "lavador",
                      })
                    }
                  >
                    {usuario.ativo ? "Desativar" : "Ativar"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
