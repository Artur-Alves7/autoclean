import { useState } from "react";
import { cn } from "@/lib/utils";

/** Mantém uma área de segurança ao redor da arte para evitar cortes nos cantos. */
export function LogoAutoClean({ className }: { className?: string }) {
  const [indisponivel, setIndisponivel] = useState(false);
  if (indisponivel) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center overflow-hidden bg-black p-[6%]",
        className,
      )}
    >
      <img
        src="/auto-clean-logo.jpeg"
        alt="Lava Rápido Auto Clean"
        width={1024}
        height={1024}
        className="size-full object-contain"
        onError={() => setIndisponivel(true)}
      />
    </span>
  );
}
