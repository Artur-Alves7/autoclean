import { createFileRoute, redirect } from "@tanstack/react-router";
import { AreaLayout } from "@/components/AreaLayout";
import { FilaAtendimentos } from "@/components/Atendimentos";

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
      <FilaAtendimentos perfilId={acesso.perfilId} />
    </AreaLayout>
  );
}
