import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { criarHandlerResumoOperacao } from "./handler.ts";

export default {
  fetch: criarHandlerResumoOperacao({
    createClient: (url, chave, opcoes) => createClient(url, chave, opcoes),
    getEnv: (nome) => Deno.env.get(nome),
  }),
};
