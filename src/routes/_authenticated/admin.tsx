import { createFileRoute, redirect } from "@tanstack/react-router";
import { AreaLayout } from "@/components/AreaLayout";

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
      <div className="rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold text-foreground">Olá, {acesso.nome}!</h1>
        <p className="mt-2 text-muted-foreground">Bem-vindo à área administrativa. Em breve: atendimentos, clientes e fechamentos.</p>
      </div>
    </AreaLayout>
  );
}
