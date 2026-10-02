# Revisão do convite e validação manual

## Estado da entrega

Revisão atualizada em 02/10/2026 na branch local
`codex/etapa-1-auditoria`, após o commit de auditoria `abdf106`. A base da
branch corresponde à `main` no commit `cad6776` e na árvore Git
`0cbb2bc3fee85113d0acde2b6f753d400631920f`.

Esta revisão não aplica SQL, não altera migrations, não publica o front-end,
não faz deploy e não cria dados em produção.

Arquivos da revisão:

- `supabase/functions/convidar-usuario/index.ts`: inicialização do runtime e
  composição do handler, mantendo a chave administrativa no servidor.
- `supabase/functions/convidar-usuario/handler.ts`: lógica existente de convite,
  com CORS, validação explícita da sessão, respostas HTTP e contratos locais de
  tipo compatíveis com o TypeScript do front-end e com o runtime Deno.
- `supabase/config.toml`: seção `[functions.convidar-usuario]` com
  `verify_jwt = true`; `project_id` preservado.
- `supabase/functions/convidar-usuario/config.toml`: verificação JWT explícita
  também na configuração local da função.
- `src/test/convidar-usuario.test.ts`: testes do handler, das duas configurações
  JWT e da separação da chave administrativa.
- `docs/validacao-convite.md`: este roteiro.

A configuração central é a referência usada pela CLI do projeto. A configuração
local foi preservada por compatibilidade; ambas exigem `verify_jwt = true`.

## Contrato HTTP

Todas as respostas geradas pelo handler incluem os cabeçalhos CORS.
`OPTIONS` não exige sessão e permite `POST, OPTIONS`, além de
`authorization, x-client-info, apikey, content-type`.

| Status | Situação                                                           |
| ------ | ------------------------------------------------------------------ |
| 204    | Preflight OPTIONS                                                  |
| 200    | Convite enviado e perfil/papel preparados                          |
| 400    | JSON/dados inválidos ou dados recusados pelo Auth                  |
| 401    | Bearer ausente, malformado ou sessão inválida/expirada             |
| 403    | Usuário autenticado sem autorização de administrador               |
| 405    | Método diferente de POST/OPTIONS; inclui Allow                     |
| 409    | E-mail/usuário já existente                                        |
| 429    | Limite de envio de convites                                        |
| 500    | Configuração, consulta de permissão, persistência ou falha interna |
| 502    | Falha no serviço de autenticação/convite                           |

O JWT é validado com `auth.getUser` antes da RPC `lc_usuario_eh_admin`.
Só depois dessas verificações o cliente administrativo é criado.
Mensagens internas do Supabase e valores de secrets não são retornados.
O gateway pode rejeitar um JWT antes de executar o handler; seu corpo de erro
pode ser diferente.

## Testes locais

Na raiz do projeto, com dependências instaladas:

```sh
pnpm test
pnpm exec eslint supabase/functions/convidar-usuario/index.ts supabase/functions/convidar-usuario/handler.ts src/test/convidar-usuario.test.ts
pnpm exec tsc --noEmit
pnpm build
```

Os testes exercitam objetos Request/Response reais, mas simulam o Auth e o banco.
Eles cobrem preflight, métodos, falta de autenticação, JWT inválido, usuário
sem papel administrador, falhas de configuração/permissão, entrada inválida,
erros da Admin API, falhas de persistência e sucesso com perfil novo/existente.
Não validam entrega de e-mail, configuração do gateway, RLS em execução ou o
runtime Deno hospedado. O build do front-end também não faz essa validação.

Resultado executado nesta revisão:

- teste direcionado da função: 38 testes aprovados;
- suíte completa: 5 arquivos e 52 testes aprovados;
- ESLint dos três arquivos TypeScript da etapa: passou, sem erros;
- `tsc --noEmit`: passou após remover do handler o import remoto usado somente
  para tipagem;
- Build Vite/Nitro: passou. Permanecem avisos de chunk maior que 500 kB,
  resolução de caminhos e opção de divisão de código do empacotador.
- O nome da variável `SUPABASE_SERVICE_ROLE_KEY` não aparece no bundle público,
  no cliente Supabase do navegador nem no componente de usuários; seu uso pela
  função continua restrito ao código de servidor.
- O lint global continua com as falhas preexistentes registradas em
  `docs/auditoria-estado-atual.md`; elas não pertencem à função de convite.
- Nenhum convite real foi enviado e nenhum teste com login real foi executado.

## Commit e envio — ações separadas

Esta etapa deve permanecer em um commit próprio na branch de trabalho. Antes do
commit local, execute:

```sh
git status --short
git diff --check
git diff --stat
git diff --cached
```

Não houve push nesta etapa. Quando houver autorização explícita, envie a branch
sem force push e integre-a à `main` preservando um commit por etapa. Não inclua
`.env`, dependências, arquivos de build, tokens ou chaves administrativas.

## Estado observado no Supabase Cloud

Em 02/10/2026 foram realizadas somente duas chamadas sem credenciais e sem
efeito sobre dados:

- `OPTIONS` respondeu `204` pelo Supabase Edge Runtime e incluiu
  `Access-Control-Allow-Origin: *`, os quatro cabeçalhos permitidos e
  `Access-Control-Allow-Methods: POST, OPTIONS`;
- `POST` com corpo vazio e sem `Authorization` respondeu `401` no gateway, com
  o código público `UNAUTHORIZED_NO_AUTH_HEADER`.

Essas evidências confirmam que a função está publicada, que o preflight com os
cabeçalhos revisados está ativo e que o gateway exige JWT. Elas não comprovam
os caminhos autenticados de administrador/lavador, a entrega de e-mail, a
presença dos secrets ou a persistência de perfil e papel. Nenhuma chave, token,
sessão ou cookie foi registrado neste documento.

## Redeploy no Supabase — ação manual

Esta etapa não fez redeploy. Quando houver autorização explícita e o commit já
estiver integrado ao repositório, use a CLI autenticada na raiz do clone:

```sh
supabase functions deploy convidar-usuario --project-ref jkhfhyrwkwzpoteenkyh
```

Não use `--no-verify-jwt`, `db push` nem comandos de migrations.
O deploy precisa incluir **index.ts e handler.ts**. Se usar o editor do painel,
adicione/atualize os dois arquivos e confira a verificação JWT nas configurações
da função; colar só o index.ts não é suficiente.

Confira no ambiente da função a disponibilidade de `SUPABASE_URL`,
`SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, sem copiar seus valores
para o front-end, repositório, logs ou chat.

Após o deploy manual, estes testes não precisam de credenciais:

```sh
curl -i -X OPTIONS 'https://jkhfhyrwkwzpoteenkyh.supabase.co/functions/v1/convidar-usuario' \
  -H 'Origin: https://exemplo.invalid' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization, x-client-info, apikey, content-type'

curl -i -X POST 'https://jkhfhyrwkwzpoteenkyh.supabase.co/functions/v1/convidar-usuario' \
  -H 'Content-Type: application/json' --data '{}'
```

Espere 204 com CORS no primeiro e 401 no segundo. Se o gateway responder ao
preflight diretamente, confirme sucesso 2xx e os cabeçalhos necessários.
No navegador, confira também o OPTIONS/POST em Network ao usar a aplicação.
Não exporte HAR nem compartilhe cabeçalhos de autorização.

## Sincronização com Lovable — ação manual

- Abra o projeto já conectado a `Artur-Alves7/lavaclean`, branch main.
- Confirme no GitHub o novo commit e no editor Lovable o conteúdo atualizado
  de `supabase/config.toml` e os dois arquivos da função.
- Aguarde a atualização do preview e teste a área de usuários.
- Push/sincronização do código, publicação do site e deploy da Edge Function
  são etapas diferentes. Confira a versão do site público separadamente se
  decidir publicá-lo. Não presuma publicação apenas porque houve push.

## Checklist funcional — ainda não executado

Use preferencialmente um ambiente de homologação já preparado. Convites exigem
caixas de e-mail de teste que você controle; use nomes/telefones/veículos
fictícios. Não use e-mails aleatórios nem dados de clientes reais.
Se optar por produção, esses passos criarão registros e enviarão e-mails:
execute apenas quando decidir fazê-lo, manualmente.

- [ ] Administrador: entrar, abrir Usuários e convidar um lavador de teste.
      Esperar sucesso no POST e perfil ativo com papel lavador.
- [ ] Aceitação: abrir o e-mail numa sessão separada, aceitar o convite e
      confirmar entrada na área de lavador. Conferir o Site URL/redirecionamento
      do Auth se o link não voltar à aplicação. Testar também sair e entrar novamente.
      A versão atual não contém tela explícita para definir/redefinir senha;
      se o primeiro acesso ou o login posterior depender dela, registrar essa
      pendência, sem marcar o fluxo como concluído.
- [ ] Lavador: cadastrar cliente e veículo fictícios, testar placa vazia e placa
      válida, criar atendimento com preço pendente e associar dois participantes.
      Confirmar ausência de duplicação e de erro em placa_normalizada.
- [ ] Avançar aguardando → em_lavagem → pronto_para_retirada; verificar horários.
      Informar preço e pagamentos na saída. Confirmar bloqueio da entrega com
      valor ausente, sem participantes ou soma incorreta; depois entregar com
      pagamentos que somem exatamente o valor final.
- [ ] Cancelamento: usar outro atendimento de teste; verificar exigência de motivo.
- [ ] Administrador: revisar fechamento diário, deixar um atendimento pendente
      explicitamente e confirmar apenas registros elegíveis.
      Exemplo de rateio: valor final R$ 100,03, snapshot da empresa R$ 40,00,
      quatro lavadores → R$ 15,01 / R$ 15,01 / R$ 15,01 / R$ 15,00 na ordem de rateio.
      Preparar a categoria de teste antes do atendimento para obter esse snapshot.
- [ ] Ajuste posterior: corrigir com motivo um atendimento já fechado. Confirmar
      histórico, fechamento original imutável e diferença no fechamento seguinte,
      sem reaplicar o ajuste duas vezes. Exemplo: R$ 100,03 → R$ 101,03 produz
      diferença total de R$ 1,00, mantendo o snapshot da empresa.
- [ ] Permissões: lavador não gerencia usuários/categorias/serviços, não fecha
      repasses e não consulta repasses alheios; depois da entrega, vê somente
      atendimentos dos quais participou. Administrador consegue gerir essas áreas.
- [ ] Autorização da função: numa sessão de lavador em homologação, efetuar uma
      chamada autenticada de teste pelo cliente da aplicação e esperar 403.
      Para não enviar convites acidentalmente, usar corpo vazio. Sem papel admin,
      a rejeição deve ocorrer antes da validação do corpo (400 indicaria que a
      autorização não bloqueou o fluxo). Não colar/copiar tokens no console/chat.
      Conferir também bloqueio de RPCs administrativas/RLS, além dos botões ocultos.

Se ocorrer 500 depois de um convite, o Auth pode já ter enviado o e-mail antes
da falha de gravação de perfil/papel. O fluxo existente não é uma transação
única entre Auth e banco. Confira os registros no painel antes de repetir;
esta revisão de CORS/status não altera essa arquitetura.

Para testar a rejeição do lavador sem manipular tokens, no servidor de
desenvolvimento Vite apontado para homologação, entre como lavador e execute no
console do navegador:

```js
const { supabase } = await import("/src/integrations/supabase/client.ts");
const resultado = await supabase.functions.invoke("convidar-usuario", { body: {} });
console.log("Status do convite:", resultado.error?.context?.status);
```

Espere 403. Esse import é exclusivo do servidor Vite de desenvolvimento, não
do site compilado. Não imprima a sessão nem o objeto de erro completo; confira
apenas o status. O corpo vazio evita um convite válido caso haja permissão
administrativa indevida.

Referências: [CORS](https://supabase.com/docs/guides/functions/cors),
[configuração por função](https://supabase.com/docs/guides/functions/function-configuration)
e [códigos de erro do Auth](https://supabase.com/docs/guides/auth/debugging/error-codes).
