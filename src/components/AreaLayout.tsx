import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export function AreaLayout({ titulo, nome, children }: { titulo: string; nome: string; children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div>
          <p className="text-lg font-bold text-primary">LavaClean</p>
          <p className="text-sm text-muted-foreground">{titulo}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-foreground sm:inline">{nome}</span>
          <button onClick={sair} disabled={saindo}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60">
            {saindo ? "Saindo..." : "Sair"}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  );
}
