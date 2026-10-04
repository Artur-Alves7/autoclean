import { Check, CircleCheck, Clock3, Droplets, X } from "lucide-react";
import type { StatusAtendimento } from "@/lib/regras";

const statusVisual = {
  aguardando: { rotulo: "Aguardando", icone: Clock3 },
  em_lavagem: { rotulo: "Em lavagem", icone: Droplets },
  pronto_para_retirada: { rotulo: "Pronto para retirada", icone: CircleCheck },
  entregue: { rotulo: "Concluído", icone: Check },
  cancelado: { rotulo: "Cancelado", icone: X },
} satisfies Record<StatusAtendimento, { rotulo: string; icone: typeof Check }>;

export function StatusBadge({ status }: { status: string }) {
  const visual = statusVisual[status as StatusAtendimento];
  if (!visual) return <span className="lc-status">{status}</span>;
  const Icone = visual.icone;
  return (
    <span className="lc-status" data-status={status}>
      <Icone aria-hidden="true" />
      {visual.rotulo}
    </span>
  );
}
