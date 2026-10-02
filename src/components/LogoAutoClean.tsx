import { useState } from "react";
import { cn } from "@/lib/utils";

/** Exibe o arquivo original inteiro; não recorta nem transforma a identidade. */
export function LogoAutoClean({ className }: { className?: string }) {
  const [indisponivel, setIndisponivel] = useState(false);
  if (indisponivel) return null;
  return (
    <img
      src="/auto-clean-logo.jpeg"
      alt="Lava Rápido Auto Clean"
      width={1024}
      height={1024}
      className={cn("object-contain", className)}
      onError={() => setIndisponivel(true)}
    />
  );
}
