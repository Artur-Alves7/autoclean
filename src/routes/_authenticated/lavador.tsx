import { createFileRoute, redirect } from "@tanstack/react-router";
import { AreaLayout } from "@/components/AreaLayout";

export const Route = createFileRoute("/_authenticated/lavador")({
  beforeLoad: ({ context }) => {
    if (context.acesso.papel !== "lavador") throw redirect({ to: "/admin" });
  },
  head: () => ({
    meta: [
      { title: "Área do lavador — LavaClean" },
      { name: "description", content: "Painel inicial do lavador no LavaClean." },
      { property: "og:title", content: "Área do lavador — LavaClean" },
      { property: "og:description", content: "Painel inicial do lavador no LavaClean." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Lavador,
});

function Lavador() {
  const { acesso } = Route.useRouteContext();
  return (
    <AreaLayout titulo="Área do lavador" nome={acesso.nome}>
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold text-foreground">Olá, {acesso.nome}!</h1>
        <p className="mt-2 text-muted-foreground">Bem-vindo à sua área. Em breve você verá aqui seus atendimentos.</p>
      </div>
    </AreaLayout>
  );
}
