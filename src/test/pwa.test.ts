import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("instalação como aplicativo", () => {
  it("usa o nome oficial e a logo enviada nos ícones da PWA", () => {
    const manifesto = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
      name: string;
      short_name: string;
      icons: { src: string; purpose: string }[];
    };

    expect(manifesto.name).toBe("Lava Rápido Auto Clean");
    expect(manifesto.short_name).toBe("Auto Clean");
    expect(manifesto.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/pwa-192x192.png", purpose: "any" }),
        expect.objectContaining({ src: "/pwa-512x512.png", purpose: "any" }),
        expect.objectContaining({ src: "/pwa-maskable-512x512.png", purpose: "maskable" }),
      ]),
    );
    for (const icone of manifesto.icons) expect(existsSync(`public${icone.src}`)).toBe(true);
  });

  it("publica o manifesto, o ícone do iPhone e registra o service worker", () => {
    const raiz = readFileSync("src/routes/__root.tsx", "utf8");
    expect(raiz).toContain('rel: "manifest", href: "/manifest.webmanifest"');
    expect(raiz).toContain('rel: "apple-touch-icon", href: "/apple-touch-icon.png"');
    expect(raiz).toContain('navigator.serviceWorker.register("/sw.js")');
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
    expect(existsSync("public/sw.js")).toBe(true);
  });
});
