# Matriz de permissões

| Recurso / ação                                    |               Administrador |                                Lavador |
| ------------------------------------------------- | --------------------------: | -------------------------------------: |
| Ver fila ativa                                    |                         Sim |                                    Sim |
| Criar atendimento e participantes                 |                         Sim |                                    Sim |
| Avançar status, cancelar e registrar pagamento    |                         Sim | Sim, quando o atendimento está visível |
| Ver atendimento concluído                         |                         Sim |                   Apenas se participou |
| Corrigir atendimento concluído                    | Sim, com motivo e auditoria |                                    Não |
| Pesquisar clientes/veículos e histórico permitido |                         Sim |                                    Sim |
| Editar/desativar cliente ou veículo               |                         Sim |                                    Não |
| Gerenciar categorias e serviços                   |                         Sim |                                    Não |
| Convidar, ativar e definir papel de usuários      |                         Sim |                                    Não |
| Revisar e confirmar fechamento                    |                         Sim |                                    Não |
| Ver repasses                                      |                       Todos |                     Apenas os próprios |

## Camadas de controle

- O roteamento e os botões reduzem exposição acidental, mas não são a barreira de segurança.
- RLS limita leituras diretas; RPCs `SECURITY DEFINER` revalidam perfil, papel, estado e consistência dentro da transação.
- A Edge Function de convite usa o JWT do administrador para autorizar e mantém `service_role` somente no ambiente do Supabase.
- Valores são convertidos em centavos para divisão. O restante é distribuído pela `ordem_rateio`.
- `placa_normalizada` é somente lida em pesquisas. Inserções/edições enviam `placa`, e o banco calcula a coluna gerada.
