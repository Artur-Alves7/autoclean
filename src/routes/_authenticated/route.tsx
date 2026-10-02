import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AcessoNegado, carregarAcesso } from "@/lib/acesso";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    let acesso;
    try {
      acesso = await carregarAcesso();
    } catch (e) {
      if (e instanceof AcessoNegado) await supabase.auth.signOut();
      throw redirect({ to: "/", search: e instanceof Error ? { msg: e.message } : {} });
    }
    if (!acesso) throw redirect({ to: "/" });
    return { acesso };
  },
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>
  ),
  component: () => <Outlet />,
});
