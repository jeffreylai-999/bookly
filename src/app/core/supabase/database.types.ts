export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      copies: {
        Row: {
          barcode: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["copy_status"]
          title_id: string
        }
        Insert: {
          barcode: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["copy_status"]
          title_id: string
        }
        Update: {
          barcode?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["copy_status"]
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copies_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_types: {
        Row: {
          borrow_cap: number
          created_at: string
          fine_rate_per_day: number
          hold_expiry_days: number
          id: string
          loan_period_days: number
          name: string
          renewal_limit: number
        }
        Insert: {
          borrow_cap: number
          created_at?: string
          fine_rate_per_day: number
          hold_expiry_days: number
          id?: string
          loan_period_days: number
          name: string
          renewal_limit: number
        }
        Update: {
          borrow_cap?: number
          created_at?: string
          fine_rate_per_day?: number
          hold_expiry_days?: number
          id?: string
          loan_period_days?: number
          name?: string
          renewal_limit?: number
        }
        Relationships: []
      }
      members: {
        Row: {
          avatar_url: string | null
          card_barcode: string
          created_at: string
          email: string | null
          id: string
          joined_at: string
          member_type_id: string
          name: string
          phone: string | null
          status: Database["public"]["Enums"]["member_status"]
        }
        Insert: {
          avatar_url?: string | null
          card_barcode: string
          created_at?: string
          email?: string | null
          id?: string
          joined_at?: string
          member_type_id: string
          name: string
          phone?: string | null
          status?: Database["public"]["Enums"]["member_status"]
        }
        Update: {
          avatar_url?: string | null
          card_barcode?: string
          created_at?: string
          email?: string | null
          id?: string
          joined_at?: string
          member_type_id?: string
          name?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["member_status"]
        }
        Relationships: [
          {
            foreignKeyName: "members_member_type_id_fkey"
            columns: ["member_type_id"]
            isOneToOne: false
            referencedRelation: "member_types"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          locale: string | null
          role: Database["public"]["Enums"]["profile_role"]
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          locale?: string | null
          role: Database["public"]["Enums"]["profile_role"]
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          locale?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
        }
        Relationships: []
      }
      titles: {
        Row: {
          author: string
          created_at: string
          description: string | null
          genre: string
          id: string
          isbn: string | null
          replacement_cost: number | null
          title: string
        }
        Insert: {
          author: string
          created_at?: string
          description?: string | null
          genre: string
          id?: string
          isbn?: string | null
          replacement_cost?: number | null
          title: string
        }
        Update: {
          author?: string
          created_at?: string
          description?: string | null
          genre?: string
          id?: string
          isbn?: string | null
          replacement_cost?: number | null
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_title_with_copies: {
        Args: {
          p_author: string
          p_barcodes: string[]
          p_description: string
          p_genre: string
          p_isbn: string
          p_replacement_cost: number
          p_title: string
        }
        Returns: Json
      }
      log_audit: {
        Args: {
          p_action: string
          p_detail?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: string
      }
      set_copy_status: {
        Args: {
          p_copy_id: string
          p_status: Database["public"]["Enums"]["copy_status"]
        }
        Returns: {
          barcode: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["copy_status"]
          title_id: string
        }
        SetofOptions: {
          from: "*"
          to: "copies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_member_status: {
        Args: {
          p_member_id: string
          p_status: Database["public"]["Enums"]["member_status"]
        }
        Returns: {
          avatar_url: string | null
          card_barcode: string
          created_at: string
          email: string | null
          id: string
          joined_at: string
          member_type_id: string
          name: string
          phone: string | null
          status: Database["public"]["Enums"]["member_status"]
        }
        SetofOptions: {
          from: "*"
          to: "members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      copy_status:
        | "available"
        | "on_loan"
        | "on_hold_shelf"
        | "lost"
        | "damaged"
        | "retired"
      member_status: "active" | "suspended" | "blocked"
      profile_role: "staff" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      copy_status: [
        "available",
        "on_loan",
        "on_hold_shelf",
        "lost",
        "damaged",
        "retired",
      ],
      member_status: ["active", "suspended", "blocked"],
      profile_role: ["staff", "admin"],
    },
  },
} as const

