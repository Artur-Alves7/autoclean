// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Valores PÚBLICOS do Supabase (URL e chave anon/publishable). O .env não é versionado,
// então a publicação não o recebe; estes valores garantem que o site publicado conecte.
// Nunca coloque SUPABASE_SERVICE_ROLE_KEY aqui.
const SUPABASE_URL_PUBLICA = "https://jkhfhyrwkwzpoteenkyh.supabase.co";
const SUPABASE_CHAVE_PUBLICA =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraGZoeXJ3a3d6cG90ZWVua3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4ODE1MDEsImV4cCI6MjEwNjQ1NzUwMX0.XhVmxXhihJlYKI3kRXBylko9OZGBU1gZc0NdMtzlGAU";

const url = process.env["VITE_SUPABASE_URL"] || SUPABASE_URL_PUBLICA;
const chave = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || SUPABASE_CHAVE_PUBLICA;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(chave),
    },
  },
});
