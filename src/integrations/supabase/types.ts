export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ajustes_repasse_pendentes: {
        Row: {
          atendimento_id: string
          criado_em: string
          criado_por_perfil_id: string
          fechamento_destino_id: string | null
          id: string
          item_origem_id: string | null
          motivo: string
          perfil_destinatario_id: string | null
          processado_em: string | null
          tipo_destinatario: Database["public"]["Enums"]["tipo_destinatario"]
          valor: number
        }
        Insert: {
          atendimento_id: string
          criado_em?: string
          criado_por_perfil_id: string
          fechamento_destino_id?: string | null
          id?: string
          item_origem_id?: string | null
          motivo: string
          perfil_destinatario_id?: string | null
          processado_em?: string | null
          tipo_destinatario: Database["public"]["Enums"]["tipo_destinatario"]
          valor: number
        }
        Update: {
          atendimento_id?: string
          criado_em?: string
          criado_por_perfil_id?: string
          fechamento_destino_id?: string | null
          id?: string
          item_origem_id?: string | null
          motivo?: string
          perfil_destinatario_id?: string | null
          processado_em?: string | null
          tipo_destinatario?: Database["public"]["Enums"]["tipo_destinatario"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_repasse_pendentes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_repasse_pendentes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_painel_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_repasse_pendentes_criado_por_perfil_id_fkey"
            columns: ["criado_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_repasse_pendentes_fechamento_destino_id_fkey"
            columns: ["fechamento_destino_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_diarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_repasse_pendentes_item_origem_id_fkey"
            columns: ["item_origem_id"]
            isOneToOne: false
            referencedRelation: "itens_fechamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_repasse_pendentes_perfil_destinatario_id_fkey"
            columns: ["perfil_destinatario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_lavadores: {
        Row: {
          atendimento_id: string
          atribuido_em: string
          id: string
          lavador_perfil_id: string
          ordem_rateio: number
        }
        Insert: {
          atendimento_id: string
          atribuido_em?: string
          id?: string
          lavador_perfil_id: string
          ordem_rateio: number
        }
        Update: {
          atendimento_id?: string
          atribuido_em?: string
          id?: string
          lavador_perfil_id?: string
          ordem_rateio?: number
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_lavadores_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_lavadores_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_painel_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_lavadores_lavador_perfil_id_fkey"
            columns: ["lavador_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos: {
        Row: {
          agendado_para: string | null
          atualizado_em: string
          cancelado_em: string | null
          categoria_veiculo_snapshot: string
          chegou_em: string
          cliente_id: string
          criado_em: string
          criado_por_perfil_id: string
          entregue_em: string | null
          id: string
          lavagem_iniciada_em: string | null
          motivo_cancelamento: string | null
          nome_cliente_snapshot: string
          observacoes: string | null
          pronto_em: string | null
          servico_id: string
          servico_snapshot: string
          status: Database["public"]["Enums"]["status_atendimento"]
          valor_empresa_snapshot: number
          valor_final: number | null
          veiculo_id: string
          veiculo_snapshot: string
        }
        Insert: {
          agendado_para?: string | null
          atualizado_em?: string
          cancelado_em?: string | null
          categoria_veiculo_snapshot: string
          chegou_em?: string
          cliente_id: string
          criado_em?: string
          criado_por_perfil_id: string
          entregue_em?: string | null
          id?: string
          lavagem_iniciada_em?: string | null
          motivo_cancelamento?: string | null
          nome_cliente_snapshot: string
          observacoes?: string | null
          pronto_em?: string | null
          servico_id: string
          servico_snapshot: string
          status?: Database["public"]["Enums"]["status_atendimento"]
          valor_empresa_snapshot: number
          valor_final?: number | null
          veiculo_id: string
          veiculo_snapshot: string
        }
        Update: {
          agendado_para?: string | null
          atualizado_em?: string
          cancelado_em?: string | null
          categoria_veiculo_snapshot?: string
          chegou_em?: string
          cliente_id?: string
          criado_em?: string
          criado_por_perfil_id?: string
          entregue_em?: string | null
          id?: string
          lavagem_iniciada_em?: string | null
          motivo_cancelamento?: string | null
          nome_cliente_snapshot?: string
          observacoes?: string | null
          pronto_em?: string | null
          servico_id?: string
          servico_snapshot?: string
          status?: Database["public"]["Enums"]["status_atendimento"]
          valor_empresa_snapshot?: number
          valor_final?: number | null
          veiculo_id?: string
          veiculo_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_criado_por_perfil_id_fkey"
            columns: ["criado_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos_lavagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_atendimentos_veiculo_cliente"
            columns: ["veiculo_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
      categorias_veiculo: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: string
          nome: string
          valor_empresa: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome: string
          valor_empresa: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string
          valor_empresa?: number
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: string
          nome_completo: string
          observacoes: string | null
          telefone: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome_completo: string
          observacoes?: string | null
          telefone: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome_completo?: string
          observacoes?: string | null
          telefone?: string
        }
        Relationships: []
      }
      fechamentos_diarios: {
        Row: {
          confirmado_em: string | null
          confirmado_por_perfil_id: string | null
          criado_em: string
          criado_por_perfil_id: string
          data_operacao: string
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["status_fechamento"]
        }
        Insert: {
          confirmado_em?: string | null
          confirmado_por_perfil_id?: string | null
          criado_em?: string
          criado_por_perfil_id: string
          data_operacao: string
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_fechamento"]
        }
        Update: {
          confirmado_em?: string | null
          confirmado_por_perfil_id?: string | null
          criado_em?: string
          criado_por_perfil_id?: string
          data_operacao?: string
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["status_fechamento"]
        }
        Relationships: [
          {
            foreignKeyName: "fechamentos_diarios_confirmado_por_perfil_id_fkey"
            columns: ["confirmado_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fechamentos_diarios_criado_por_perfil_id_fkey"
            columns: ["criado_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_alteracoes: {
        Row: {
          alterado_em: string
          alterado_por_perfil_id: string | null
          atendimento_id: string
          campo_alterado: string
          id: string
          motivo: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          alterado_em?: string
          alterado_por_perfil_id?: string | null
          atendimento_id: string
          campo_alterado: string
          id?: string
          motivo?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          alterado_em?: string
          alterado_por_perfil_id?: string | null
          atendimento_id?: string
          campo_alterado?: string
          id?: string
          motivo?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_alteracoes_alterado_por_perfil_id_fkey"
            columns: ["alterado_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_alteracoes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_alteracoes_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_painel_atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_fechamentos: {
        Row: {
          acao: string
          alterado_em: string
          alterado_por_perfil_id: string
          fechamento_diario_id: string
          id: string
          motivo: string
        }
        Insert: {
          acao: string
          alterado_em?: string
          alterado_por_perfil_id: string
          fechamento_diario_id: string
          id?: string
          motivo: string
        }
        Update: {
          acao?: string
          alterado_em?: string
          alterado_por_perfil_id?: string
          fechamento_diario_id?: string
          id?: string
          motivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_fechamentos_alterado_por_perfil_id_fkey"
            columns: ["alterado_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_fechamentos_fechamento_diario_id_fkey"
            columns: ["fechamento_diario_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_diarios"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_status: {
        Row: {
          alterado_em: string
          alterado_por_perfil_id: string | null
          atendimento_id: string
          id: string
          motivo: string | null
          status_anterior:
            | Database["public"]["Enums"]["status_atendimento"]
            | null
          status_novo: Database["public"]["Enums"]["status_atendimento"]
        }
        Insert: {
          alterado_em?: string
          alterado_por_perfil_id?: string | null
          atendimento_id: string
          id?: string
          motivo?: string | null
          status_anterior?:
            | Database["public"]["Enums"]["status_atendimento"]
            | null
          status_novo: Database["public"]["Enums"]["status_atendimento"]
        }
        Update: {
          alterado_em?: string
          alterado_por_perfil_id?: string | null
          atendimento_id?: string
          id?: string
          motivo?: string | null
          status_anterior?:
            | Database["public"]["Enums"]["status_atendimento"]
            | null
          status_novo?: Database["public"]["Enums"]["status_atendimento"]
        }
        Relationships: [
          {
            foreignKeyName: "historico_status_alterado_por_perfil_id_fkey"
            columns: ["alterado_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_status_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_status_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_painel_atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_fechamento: {
        Row: {
          atendimento_id: string
          criado_em: string
          fechamento_diario_id: string
          id: string
          item_origem_id: string | null
          perfil_destinatario_id: string | null
          tipo_destinatario: Database["public"]["Enums"]["tipo_destinatario"]
          tipo_lancamento: Database["public"]["Enums"]["tipo_lancamento"]
          valor: number
        }
        Insert: {
          atendimento_id: string
          criado_em?: string
          fechamento_diario_id: string
          id?: string
          item_origem_id?: string | null
          perfil_destinatario_id?: string | null
          tipo_destinatario: Database["public"]["Enums"]["tipo_destinatario"]
          tipo_lancamento?: Database["public"]["Enums"]["tipo_lancamento"]
          valor: number
        }
        Update: {
          atendimento_id?: string
          criado_em?: string
          fechamento_diario_id?: string
          id?: string
          item_origem_id?: string | null
          perfil_destinatario_id?: string | null
          tipo_destinatario?: Database["public"]["Enums"]["tipo_destinatario"]
          tipo_lancamento?: Database["public"]["Enums"]["tipo_lancamento"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "itens_fechamento_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fechamento_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_painel_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fechamento_fechamento_diario_id_fkey"
            columns: ["fechamento_diario_id"]
            isOneToOne: false
            referencedRelation: "fechamentos_diarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fechamento_item_origem_id_fkey"
            columns: ["item_origem_id"]
            isOneToOne: false
            referencedRelation: "itens_fechamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_fechamento_perfil_destinatario_id_fkey"
            columns: ["perfil_destinatario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          atendimento_id: string
          criado_em: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id: string
          pago_em: string
          recebido_por_perfil_id: string
          valor: number
        }
        Insert: {
          atendimento_id: string
          criado_em?: string
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          pago_em?: string
          recebido_por_perfil_id: string
          valor: number
        }
        Update: {
          atendimento_id?: string
          criado_em?: string
          forma_pagamento?: Database["public"]["Enums"]["forma_pagamento"]
          id?: string
          pago_em?: string
          recebido_por_perfil_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "vw_painel_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_recebido_por_perfil_id_fkey"
            columns: ["recebido_por_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      papeis_perfil: {
        Row: {
          atribuido_em: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          perfil_id: string
        }
        Insert: {
          atribuido_em?: string
          papel: Database["public"]["Enums"]["papel_usuario"]
          perfil_id: string
        }
        Update: {
          atribuido_em?: string
          papel?: Database["public"]["Enums"]["papel_usuario"]
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "papeis_perfil_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: string
          nome_completo: string
          telefone: string | null
          usuario_auth_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome_completo: string
          telefone?: string | null
          usuario_auth_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome_completo?: string
          telefone?: string | null
          usuario_auth_id?: string
        }
        Relationships: []
      }
      servicos_lavagem: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      veiculos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria_veiculo_id: string
          cliente_id: string
          cor: string | null
          criado_em: string
          id: string
          marca: string
          modelo: string
          observacoes: string | null
          placa: string | null
          placa_normalizada: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria_veiculo_id: string
          cliente_id: string
          cor?: string | null
          criado_em?: string
          id?: string
          marca: string
          modelo: string
          observacoes?: string | null
          placa?: string | null
          placa_normalizada?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria_veiculo_id?: string
          cliente_id?: string
          cor?: string | null
          criado_em?: string
          id?: string
          marca?: string
          modelo?: string
          observacoes?: string | null
          placa?: string | null
          placa_normalizada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_categoria_veiculo_id_fkey"
            columns: ["categoria_veiculo_id"]
            isOneToOne: false
            referencedRelation: "categorias_veiculo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_painel_atendimentos: {
        Row: {
          agendado_para: string | null
          cancelado_em: string | null
          categoria_veiculo_snapshot: string | null
          chegou_em: string | null
          cliente_id: string | null
          entregue_em: string | null
          id: string | null
          lavadores: Json | null
          lavagem_iniciada_em: string | null
          motivo_cancelamento: string | null
          nome_cliente_snapshot: string | null
          observacoes: string | null
          pagamentos: Json | null
          pronto_em: string | null
          servico_id: string | null
          servico_snapshot: string | null
          status: Database["public"]["Enums"]["status_atendimento"] | null
          total_pago: number | null
          valor_empresa_snapshot: number | null
          valor_final: number | null
          veiculo_id: string | null
          veiculo_snapshot: string | null
        }
        Insert: {
          agendado_para?: string | null
          cancelado_em?: string | null
          categoria_veiculo_snapshot?: string | null
          chegou_em?: string | null
          cliente_id?: string | null
          entregue_em?: string | null
          id?: string | null
          lavadores?: never
          lavagem_iniciada_em?: string | null
          motivo_cancelamento?: string | null
          nome_cliente_snapshot?: string | null
          observacoes?: string | null
          pagamentos?: never
          pronto_em?: string | null
          servico_id?: string | null
          servico_snapshot?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"] | null
          total_pago?: never
          valor_empresa_snapshot?: number | null
          valor_final?: number | null
          veiculo_id?: string | null
          veiculo_snapshot?: string | null
        }
        Update: {
          agendado_para?: string | null
          cancelado_em?: string | null
          categoria_veiculo_snapshot?: string | null
          chegou_em?: string | null
          cliente_id?: string | null
          entregue_em?: string | null
          id?: string | null
          lavadores?: never
          lavagem_iniciada_em?: string | null
          motivo_cancelamento?: string | null
          nome_cliente_snapshot?: string | null
          observacoes?: string | null
          pagamentos?: never
          pronto_em?: string | null
          servico_id?: string | null
          servico_snapshot?: string | null
          status?: Database["public"]["Enums"]["status_atendimento"] | null
          total_pago?: never
          valor_empresa_snapshot?: number | null
          valor_final?: number | null
          veiculo_id?: string | null
          veiculo_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos_lavagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_atendimentos_veiculo_cliente"
            columns: ["veiculo_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id", "cliente_id"]
          },
        ]
      }
    }
    Functions: {
      atendimento_esta_aberto: {
        Args: { p_atendimento_id: string }
        Returns: boolean
      }
      fn_calcular_repasse: {
        Args: { p_atendimento_id: string }
        Returns: {
          ordem_rateio: number
          perfil_destinatario_id: string
          tipo_destinatario: Database["public"]["Enums"]["tipo_destinatario"]
          valor_centavos: number
        }[]
      }
      lc_avancar_atendimento_base: {
        Args: {
          p_atendimento_id: string
          p_motivo?: string
          p_novo_status: Database["public"]["Enums"]["status_atendimento"]
          p_pagamentos?: Json
          p_valor_final?: number
        }
        Returns: undefined
      }
      lc_criar_atendimento_base: {
        Args: {
          p_cliente?: Json
          p_cliente_id?: string
          p_lavadores: string[]
          p_observacoes?: string
          p_servico_id: string
          p_valor_final?: number
          p_veiculo?: Json
          p_veiculo_id?: string
        }
        Returns: string
      }
      lc_perfil_atual_id: { Args: never; Returns: string }
      lc_pode_ver_atendimento: {
        Args: { p_atendimento_id: string }
        Returns: boolean
      }
      lc_usuario_eh_admin: { Args: never; Returns: boolean }
      perfil_atual_id: { Args: never; Returns: string }
      perfil_tem_papel: {
        Args: {
          p_papel: Database["public"]["Enums"]["papel_usuario"]
          p_perfil_id: string
        }
        Returns: boolean
      }
      rpc_adicionar_veiculo_cliente: {
        Args: {
          p_categoria_veiculo_id: string
          p_cliente_id: string
          p_cor?: string
          p_marca: string
          p_modelo: string
          p_placa?: string
        }
        Returns: string
      }
      rpc_atualizar_perfil_usuario: {
        Args: {
          p_ativo: boolean
          p_papel: Database["public"]["Enums"]["papel_usuario"]
          p_perfil_id: string
        }
        Returns: undefined
      }
      rpc_avancar_atendimento: {
        Args: {
          p_atendimento_id: string
          p_momento_operacao?: string
          p_motivo?: string
          p_novo_status: Database["public"]["Enums"]["status_atendimento"]
          p_pagamentos?: Json
          p_valor_final?: number
        }
        Returns: undefined
      }
      rpc_reabrir_fechamento_dia: {
        Args: {
          p_data_operacao: string
          p_motivo: string
        }
        Returns: string
      }
      rpc_listar_ajustes_fechamento: {
        Args: { p_data_operacao: string }
        Returns: {
          id: string
          valor: number
        }[]
      }
      rpc_corrigir_atendimento_entregue: {
        Args: {
          p_atendimento_id: string
          p_motivo: string
          p_pagamentos: Json
          p_valor_final: number
        }
        Returns: undefined
      }
      rpc_criar_atendimento: {
        Args: {
          p_cliente?: Json
          p_cliente_id?: string
          p_lavadores: string[]
          p_momento_operacao?: string
          p_observacoes?: string
          p_servico_id: string
          p_valor_final?: number
          p_veiculo?: Json
          p_veiculo_id?: string
        }
        Returns: string
      }
      rpc_definir_participantes: {
        Args: { p_atendimento_id: string; p_lavadores: string[] }
        Returns: undefined
      }
      rpc_editar_atendimento: {
        Args: {
          p_atendimento_id: string
          p_chegou_em: string
          p_cliente_id: string
          p_lavadores: string[]
          p_motivo: string
          p_observacoes: string
          p_pagamentos: Json
          p_servico_id: string
          p_valor_final: number
          p_veiculo_id: string
        }
        Returns: undefined
      }
      rpc_fechar_repasses_dia: {
        Args: {
          p_atendimentos_pendentes?: string[]
          p_data_operacao: string
          p_observacoes?: string
        }
        Returns: string
      }
      rpc_listar_atendimentos_fechamento: {
        Args: { p_data_operacao: string }
        Returns: {
          agendado_para: string | null
          cancelado_em: string | null
          categoria_veiculo_snapshot: string | null
          chegou_em: string | null
          cliente_id: string | null
          entregue_em: string | null
          id: string | null
          lavadores: Json | null
          lavagem_iniciada_em: string | null
          motivo_cancelamento: string | null
          nome_cliente_snapshot: string | null
          observacoes: string | null
          pagamentos: Json | null
          pronto_em: string | null
          servico_id: string | null
          servico_snapshot: string | null
          status: Database["public"]["Enums"]["status_atendimento"] | null
          total_pago: number | null
          valor_empresa_snapshot: number | null
          valor_final: number | null
          veiculo_id: string | null
          veiculo_snapshot: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "vw_painel_atendimentos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      usuario_tem_papel: {
        Args: { p_papel: Database["public"]["Enums"]["papel_usuario"] }
        Returns: boolean
      }
    }
    Enums: {
      forma_pagamento: "dinheiro" | "pix" | "debito" | "credito" | "outro"
      papel_usuario: "administrador" | "lavador"
      status_atendimento:
        | "aguardando"
        | "em_lavagem"
        | "pronto_para_retirada"
        | "entregue"
        | "cancelado"
      status_fechamento: "rascunho" | "confirmado"
      tipo_destinatario: "empresa" | "lavador"
      tipo_lancamento: "repasse" | "ajuste"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      forma_pagamento: ["dinheiro", "pix", "debito", "credito", "outro"],
      papel_usuario: ["administrador", "lavador"],
      status_atendimento: [
        "aguardando",
        "em_lavagem",
        "pronto_para_retirada",
        "entregue",
        "cancelado",
      ],
      status_fechamento: ["rascunho", "confirmado"],
      tipo_destinatario: ["empresa", "lavador"],
      tipo_lancamento: ["repasse", "ajuste"],
    },
  },
} as const
