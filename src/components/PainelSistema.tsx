import { useState } from "react";

import { AreaLayout } from "@/components/AreaLayout";
import { FilaAtendimentos } from "@/components/Atendimentos";
import { ClientesVeiculos } from "@/components/ClientesVeiculos";
import { Configuracoes } from "@/components/Configuracoes";
import { Fechamentos } from "@/components/Fechamentos";
import { Usuarios } from "@/components/Usuarios";
import type { Papel } from "@/lib/acesso";

type Aba = "atendimentos" | "clientes" | "fechamentos" | "configuracoes" | "usuarios";

const ROTULOS: Record<Aba, string> = {
  atendimentos: "Atendimentos",
  clientes: "Clientes e veículos",
  fechamentos: "Repasses",
  configuracoes: "Configurações",
  usuarios: "Usuários",
};

export function PainelSistema({
  perfilId,
  papel,
  nome,
}: {
  perfilId: string;
  papel: Papel;
  nome: string;
}) {
  const [aba, setAba] = useState<Aba>("atendimentos");
  const abas: Aba[] =
    papel === "administrador"
      ? ["atendimentos", "clientes", "fechamentos", "configuracoes", "usuarios"]
      : ["atendimentos", "clientes", "fechamentos"];

  return (
    <AreaLayout
      titulo={papel === "administrador" ? "Área administrativa" : "Área do lavador"}
      nome={nome}
    >
      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Seções do sistema">
        {abas.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setAba(item)}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
              aba === item
                ? "bg-primary text-primary-foreground"
                : "border bg-card text-foreground hover:bg-accent"
            }`}
          >
            {ROTULOS[item]}
          </button>
        ))}
      </nav>

      {aba === "atendimentos" && <FilaAtendimentos perfilId={perfilId} papel={papel} />}
      {aba === "clientes" && <ClientesVeiculos papel={papel} />}
      {aba === "fechamentos" && <Fechamentos perfilId={perfilId} papel={papel} />}
      {aba === "configuracoes" && papel === "administrador" && <Configuracoes />}
      {aba === "usuarios" && papel === "administrador" && <Usuarios />}
    </AreaLayout>
  );
}
