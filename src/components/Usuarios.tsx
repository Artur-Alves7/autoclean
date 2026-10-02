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
    setMensagem(null);
    const { error } = await supabase.functions.invoke("convidar-usuario", { body: convite });
    if (error) return setMensagem(mensagemErro(error));
    setMensagem("Convite enviado e perfil preparado para o primeiro acesso.");
    setConvite({ email: "", nome_completo: "", telefone: "", papel: "lavador" });
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Convites passam por uma Edge Function protegida; não há cadastro público.
        </p>
      </div>
      <form onSubmit={convidar} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <input
          required
          type="email"
          className="rounded-md border px-3 py-2"
          placeholder="E-mail"
          value={convite.email}
          onChange={(e) => setConvite({ ...convite, email: e.target.value })}
        />
        <input
          required
          className="rounded-md border px-3 py-2"
          placeholder="Nome completo"
          value={convite.nome_completo}
          onChange={(e) => setConvite({ ...convite, nome_completo: e.target.value })}
        />
        <input
          className="rounded-md border px-3 py-2"
          placeholder="Telefone opcional"
          value={convite.telefone}
          onChange={(e) => setConvite({ ...convite, telefone: e.target.value })}
        />
        <select
          className="rounded-md border px-3 py-2"
          value={convite.papel}
          onChange={(e) => setConvite({ ...convite, papel: e.target.value })}
        >
          <option value="lavador">Lavador</option>
          <option value="administrador">Administrador</option>
        </select>
        <button className="rounded-md bg-primary px-3 py-2 text-primary-foreground sm:col-span-2">
          Enviar convite
        </button>
      </form>
      {mensagem && (
        <p role="status" className="text-sm">
          {mensagem}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
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
                <td className="p-3">{usuario.nome_completo}</td>
                <td className="p-3">
                  <select
                    className="rounded-md border px-2 py-1"
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
                <td className="p-3">{usuario.ativo ? "Ativo" : "Inativo"}</td>
                <td className="p-3">
                  <button
                    className="text-primary hover:underline"
                    onClick={() =>
                      alterar.mutate({
                        id: usuario.id,
                        ativo: !usuario.ativo,
                        papel: usuario.papeis_perfil[0]?.papel ?? "lavador",
                      })
                    }
                  >
                    {usuario.ativo ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
