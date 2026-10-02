import { useState } from "react";
import { CarFront, Settings2, UsersRound, Wallet, LayoutDashboard } from "lucide-react";

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
const ICONES = {
  atendimentos: LayoutDashboard,
  clientes: CarFront,
  fechamentos: Wallet,
  configuracoes: Settings2,
  usuarios: UsersRound,
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
      secao={ROTULOS[aba]}
      navigation={
        <nav className="space-y-1" aria-label="Seções do sistema">
          {abas.map((item) => {
            const Icone = ICONES[item];
            return (
              <button
                key={item}
                type="button"
                aria-current={aba === item ? "page" : undefined}
                onClick={(evento) => {
                  setAba(item);
                  const menu = evento.currentTarget.closest("details");
                  if (menu) menu.open = false;
                  document.getElementById("conteudo-principal")?.focus();
                }}
                className="lc-nav-item"
              >
                <Icone aria-hidden="true" />
                {ROTULOS[item]}
              </button>
            );
          })}
        </nav>
      }
    >
      {aba === "atendimentos" && <FilaAtendimentos perfilId={perfilId} papel={papel} />}
      {aba === "clientes" && <ClientesVeiculos papel={papel} />}
      {aba === "fechamentos" && <Fechamentos perfilId={perfilId} papel={papel} />}
      {aba === "configuracoes" && papel === "administrador" && <Configuracoes />}
      {aba === "usuarios" && papel === "administrador" && <Usuarios />}
    </AreaLayout>
  );
}
