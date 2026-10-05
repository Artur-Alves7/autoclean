import { createFileRoute, redirect } from "@tanstack/react-router";
import { PainelSistema } from "@/components/PainelSistema";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (context.acesso.papel !== "administrador") throw redirect({ to: "/lavador" });
  },
  head: () => ({
    meta: [
      { title: "Área administrativa — Auto Clean" },
      { name: "description", content: "Painel inicial do administrador do Auto Clean." },
      { property: "og:title", content: "Área administrativa — Auto Clean" },
      { property: "og:description", content: "Painel inicial do administrador do Auto Clean." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { acesso } = Route.useRouteContext();
  return <PainelSistema perfilId={acesso.perfilId} papel={acesso.papel} nome={acesso.nome} />;
}
