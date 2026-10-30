# Cache de resumo da operação

Esta Edge Function será o único ponto de contato entre a interface e o Redis.
Ela receberá uma data de operação, validará a sessão do usuário no Supabase e
entregará o resumo financeiro diário usado nos relatórios.

## Estratégia

O cache segue o padrão **cache-aside**:

1. A função procura a chave `autoclean:resumo-operacao:v1:<data>` no Redis.
2. Em caso de acerto, devolve o dado armazenado com `origem: "redis"`.
3. Em caso de ausência, consulta o Supabase, salva o resultado no Redis por 60
   segundos e responde com `origem: "supabase"`.
4. Uma atualização solicitada pela interface renova a chave para demonstrar a
   atualização do cache.

A chave não contém dados pessoais. A função e o Redis são acessados somente no
servidor; `UPSTASH_REDIS_REST_TOKEN` nunca é enviado ao navegador.

## Variáveis necessárias

Cadastre os valores como Secrets da Edge Function, sem versioná-los:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

As variáveis do Supabase usadas pela função (`SUPABASE_URL`, chave administrativa
e chave de publicação) são fornecidas pelo ambiente da própria plataforma.

## Contrato HTTP

`POST /functions/v1/resumo-operacao-cache`

```json
{ "data_operacao": "2026-10-29", "atualizar_cache": false }
```

A função aceita somente administradores autenticados. A resposta não contém
clientes, veículos ou outros dados pessoais: ela informa a quantidade de
atendimentos, os totais em centavos, a origem (`redis` ou `supabase`) e o
estado do cache.
