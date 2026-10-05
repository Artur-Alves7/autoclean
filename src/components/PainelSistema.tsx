import { useState } from "react";
import {
  CarFront,
  FileSpreadsheet,
  LayoutDashboard,
  Settings2,
  UsersRound,
  Wallet,
} from "lucide-react";

import { AreaLayout } from "@/components/AreaLayout";
import { FilaAtendimentos } from "@/components/Atendimentos";
import { ClientesVeiculos } from "@/components/ClientesVeiculos";
import { Configuracoes } from "@/components/Configuracoes";
import { Fechamentos } from "@/components/Fechamentos";
import { Relatorios } from "@/components/Relatorios";
import { Usuarios } from "@/components/Usuarios";
import type { Papel } from "@/lib/acesso";

type Aba =
  "atendimentos" | "clientes" | "fechamentos" | "relatorios" | "configuracoes" | "usuarios";

const ROTULOS: Record<Aba, string> = {
  atendimentos: "Atendimentos",
  clientes: "Clientes e veículos",
  fechamentos: "Repasses",
  relatorios: "Relatórios",
  configuracoes: "Configurações",
  usuarios: "Usuários",
};
const ICONES = {
  atendimentos: LayoutDashboard,
  clientes: CarFront,
  fechamentos: Wallet,
  relatorios: FileSpreadsheet,
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
  const [atendimentoRetroativo, setAtendimentoRetroativo] = useState<string | null>(null);
  const [dataFechamentoRetroativo, setDataFechamentoRetroativo] = useState<string | null>(null);
  const abas: Aba[] =
    papel === "administrador"
      ? ["atendimentos", "clientes", "fechamentos", "relatorios", "configuracoes", "usuarios"]
      : ["atendimentos", "clientes", "fechamentos", "relatorios"];

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
      {aba === "atendimentos" && (
        <FilaAtendimentos
          key={atendimentoRetroativo ?? "atendimentos"}
          perfilId={perfilId}
          papel={papel}
          dataInicial={atendimentoRetroativo ?? undefined}
          abrirNovoInicial={!!atendimentoRetroativo}
          onFluxoInicialConsumido={() => setAtendimentoRetroativo(null)}
        />
      )}
      {aba === "clientes" && <ClientesVeiculos papel={papel} />}
      {aba === "fechamentos" && (
        <Fechamentos
          key={dataFechamentoRetroativo ?? "fechamentos"}
          perfilId={perfilId}
          papel={papel}
          dataInicial={dataFechamentoRetroativo ?? undefined}
          onRegistrarAtendimentoRetroativo={(data) => {
            setDataFechamentoRetroativo(data);
            setAtendimentoRetroativo(data);
            setAba("atendimentos");
          }}
        />
      )}
      {aba === "relatorios" && <Relatorios perfilId={perfilId} papel={papel} />}
      {aba === "configuracoes" && papel === "administrador" && <Configuracoes />}
      {aba === "usuarios" && papel === "administrador" && <Usuarios />}
    </AreaLayout>
  );
}
