import { createFileRoute, redirect } from "@tanstack/react-router";
import { AreaLayout } from "@/components/AreaLayout";
import { FilaAtendimentos } from "@/components/Atendimentos";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (context.acesso.papel !== "administrador") throw redirect({ to: "/lavador" });
  },
  head: () => ({
    meta: [
      { title: "Área administrativa — LavaClean" },
      { name: "description", content: "Painel inicial do administrador do LavaClean." },
      { property: "og:title", content: "Área administrativa — LavaClean" },
      { property: "og:description", content: "Painel inicial do administrador do LavaClean." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { acesso } = Route.useRouteContext();
  return (
    <AreaLayout titulo="Área administrativa" nome={acesso.nome}>
      <FilaAtendimentos perfilId={acesso.perfilId} />
    </AreaLayout>
  );
}
