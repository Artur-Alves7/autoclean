# Revisão do convite e validação manual

## Estado da entrega

Base consultada em 02/10/2026: `main`, commit
`a9dbbf2a88b127462420f60d236d0549894911d8`.
Antes da edição, os hashes dos 106 arquivos versionados locais correspondiam
à árvore desse commit. A cópia de trabalho é uma exportação sem diretório
`.git`; não há branch local, commit novo ou push desta revisão.

Esta revisão não aplica SQL, não altera migrations, não publica o front-end,
não faz deploy e não cria dados em produção.

Arquivos da revisão:

- `supabase/functions/convidar-usuario/index.ts`: inicialização do runtime e
  composição do handler, mantendo a chave administrativa no servidor.
- `supabase/functions/convidar-usuario/handler.ts`: lógica existente de convite,
  agora testável, com CORS, validação explícita da sessão e respostas HTTP.
- `supabase/config.toml`: seção `[functions.convidar-usuario]` com
  `verify_jwt = true`; `project_id` preservado.
- `src/test/convidar-usuario.test.ts`: testes do handler com dependências simuladas.
- `docs/validacao-convite.md`: este roteiro.

O arquivo antigo `supabase/functions/convidar-usuario/config.toml` foi preservado.
A configuração por função que deve acompanhar a CLI está no arquivo central
`supabase/config.toml`.

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
pnpm build
```

Os testes exercitam objetos Request/Response reais, mas simulam o Auth e o banco.
Eles cobrem preflight, métodos, falta de autenticação, JWT inválido, usuário
sem papel administrador, falhas de configuração/permissão, entrada inválida,
erros da Admin API, falhas de persistência e sucesso com perfil novo/existente.
Não validam entrega de e-mail, configuração do gateway, RLS em execução ou o
runtime Deno hospedado. O build do front-end também não faz essa validação.

Resultado executado nesta revisão:

- 4 arquivos de testes passaram, com 45 testes (37 novos e 8 existentes).
- ESLint dos três arquivos TypeScript alterados/adicionados: passou, sem erros.
- Build Vite/Nitro: passou. Permanecem avisos de chunk maior que 500 kB,
  resolução de caminhos e opção de divisão de código do empacotador.
- Lint global não foi executado nesta revisão; o resultado acima é direcionado.
- Nenhuma chamada à função em produção nem teste com login real foi executado.

## Enviar à main — ação manual

1. Use um clone Git autenticado do repositório conectado ao Lovable. Se ainda
   não tiver um, clone `https://github.com/Artur-Alves7/lavaclean.git`.
2. Verifique alterações locais antes de atualizar; preserve trabalho não relacionado.
3. Execute:

```sh
git status --short
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

4. Se a main tiver avançado desde o commit-base acima, compare as mudanças
   antes de copiar os cinco arquivos desta revisão. Não sobrescreva alterações
   posteriores. Copie somente os cinco arquivos listados, preservando seus caminhos.
5. Rode os testes, lint direcionado e build acima. Revise o diff e envie:

```sh
git diff --check
git diff --stat
git add supabase/functions/convidar-usuario/index.ts supabase/functions/convidar-usuario/handler.ts supabase/config.toml src/test/convidar-usuario.test.ts docs/validacao-convite.md
git diff --cached
git commit -m "Corrige CORS e respostas HTTP do convite de usuários"
git push origin main
```

Não inclua `.env`, dependências nem arquivos de build. Não use force push.

## Redeploy no Supabase — ação manual

Depois de revisar e enviar o commit, use a CLI autenticada na raiz do clone:

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
