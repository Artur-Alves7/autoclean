import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { criarHandlerConvite } from "./handler.ts";

export default {
  fetch: criarHandlerConvite({ createClient, getEnv: (nome) => Deno.env.get(nome) }),
};
