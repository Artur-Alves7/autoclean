import { LoaderCircle, PencilLine } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

export function DialogoFormulario({
  aberto,
  titulo,
  descricao,
  erro,
  salvando = false,
  textoConfirmar = "Salvar alterações",
  aoFechar,
  aoEnviar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  erro?: string | null;
  salvando?: boolean;
  textoConfirmar?: string;
  aoFechar: () => void;
  aoEnviar: () => void;
  children: ReactNode;
}) {
  function enviar(evento: FormEvent) {
    evento.preventDefault();
    aoEnviar();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(novoEstado) => {
        if (!novoEstado && !salvando) aoFechar();
      }}
    >
      <DialogContent className="lc-workspace max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border-primary/20 bg-card p-0 shadow-2xl sm:max-w-lg">
        <div className="border-b bg-muted/35 px-5 py-5 pr-12 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <PencilLine className="size-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle>{titulo}</DialogTitle>
              <DialogDescription className="mt-1.5 leading-relaxed">{descricao}</DialogDescription>
            </div>
          </div>
        </div>
        <form className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6" onSubmit={enviar}>
          <div className="grid gap-4">{children}</div>
          {erro && (
            <p role="alert" className="lc-message">
              {erro}
            </p>
          )}
          <DialogFooter className="gap-2 border-t pt-5 sm:space-x-0">
            <Button type="button" variant="outline" disabled={salvando} onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando} aria-busy={salvando}>
              {salvando && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {salvando ? "Salvando..." : textoConfirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
