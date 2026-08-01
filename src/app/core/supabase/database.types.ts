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
      app_settings: {
        Row: {
          currency: string
          damaged_fee_default: number
          default_locale: string
          default_report_range_days: number
          fine_block_threshold: number
          id: boolean
          lost_fee_default: number
          notify_on_hold_ready: boolean
          notify_on_overdue: boolean
          notify_on_payment: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          currency?: string
          damaged_fee_default?: number
          default_locale?: string
          default_report_range_days?: number
          fine_block_threshold?: number
          id?: boolean
          lost_fee_default?: number
          notify_on_hold_ready?: boolean
          notify_on_overdue?: boolean
          notify_on_payment?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          currency?: string
          damaged_fee_default?: number
          default_locale?: string
          default_report_range_days?: number
          fine_block_threshold?: number
          id?: boolean
          lost_fee_default?: number
          notify_on_hold_ready?: boolean
          notify_on_overdue?: boolean
          notify_on_payment?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
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
            referencedRelation: "overdue_loans"
            referencedColumns: ["title_id"]
          },
          {
            foreignKeyName: "copies_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      fines: {
        Row: {
          accrual_rule_snapshot: Json
          amount: number
          amount_paid: number
          created_at: string
          id: string
          loan_id: string | null
          member_id: string
          reason: Database["public"]["Enums"]["fine_reason"]
          status: Database["public"]["Enums"]["fine_status"]
        }
        Insert: {
          accrual_rule_snapshot?: Json
          amount: number
          amount_paid?: number
          created_at?: string
          id?: string
          loan_id?: string | null
          member_id: string
          reason: Database["public"]["Enums"]["fine_reason"]
          status?: Database["public"]["Enums"]["fine_status"]
        }
        Update: {
          accrual_rule_snapshot?: Json
          amount?: number
          amount_paid?: number
          created_at?: string
          id?: string
          loan_id?: string | null
          member_id?: string
          reason?: Database["public"]["Enums"]["fine_reason"]
          status?: Database["public"]["Enums"]["fine_status"]
        }
        Relationships: [
          {
            foreignKeyName: "fines_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fines_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "overdue_loans"
            referencedColumns: ["loan_id"]
          },
          {
            foreignKeyName: "fines_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      holds: {
        Row: {
          copy_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          member_id: string
          queue_position: number
          ready_at: string | null
          status: Database["public"]["Enums"]["hold_status"]
          title_id: string
        }
        Insert: {
          copy_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          member_id: string
          queue_position: number
          ready_at?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          title_id: string
        }
        Update: {
          copy_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          member_id?: string
          queue_position?: number
          ready_at?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          title_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holds_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holds_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holds_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "overdue_loans"
            referencedColumns: ["title_id"]
          },
          {
            foreignKeyName: "holds_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          checked_out_at: string
          checked_out_by: string | null
          copy_id: string
          created_at: string
          due_at: string
          id: string
          member_id: string
          renew_count: number
          returned_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
        }
        Insert: {
          checked_out_at?: string
          checked_out_by?: string | null
          copy_id: string
          created_at?: string
          due_at: string
          id?: string
          member_id: string
          renew_count?: number
          returned_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
        }
        Update: {
          checked_out_at?: string
          checked_out_by?: string | null
          copy_id?: string
          created_at?: string
          due_at?: string
          id?: string
          member_id?: string
          renew_count?: number
          returned_at?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
        }
        Relationships: [
          {
            foreignKeyName: "loans_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
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
      notifications: {
        Row: {
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string
          id: string
          read_at: string | null
          type: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          read_at?: string | null
          type: string
        }
        Update: {
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          read_at?: string | null
          type?: string
        }
        Relationships: []
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
      overdue_loans: {
        Row: {
          author: string | null
          checked_out_at: string | null
          copy_barcode: string | null
          copy_id: string | null
          days_late: number | null
          due_at: string | null
          fine_rate_per_day: number | null
          loan_id: string | null
          member_card_barcode: string | null
          member_id: string | null
          member_name: string | null
          projected_fine: number | null
          title: string | null
          title_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cancel_hold: {
        Args: { p_hold_id: string }
        Returns: {
          copy_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          member_id: string
          queue_position: number
          ready_at: string | null
          status: Database["public"]["Enums"]["hold_status"]
          title_id: string
        }
        SetofOptions: {
          from: "*"
          to: "holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      checkin: {
        Args: {
          p_condition: string
          p_copy_barcode: string
          p_damaged_amount?: number
        }
        Returns: Json
      }
      checkout: {
        Args: { p_copy_barcodes: string[]; p_member_id: string }
        Returns: {
          checked_out_at: string
          checked_out_by: string | null
          copy_id: string
          created_at: string
          due_at: string
          id: string
          member_id: string
          renew_count: number
          returned_at: string | null
          status: Database["public"]["Enums"]["loan_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "loans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: never; Returns: boolean }
      log_audit: {
        Args: {
          p_action: string
          p_detail?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: string
      }
      mark_ready: {
        Args: { p_copy_barcode: string; p_title_id: string }
        Returns: {
          copy_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          member_id: string
          queue_position: number
          ready_at: string | null
          status: Database["public"]["Enums"]["hold_status"]
          title_id: string
        }
        SetofOptions: {
          from: "*"
          to: "holds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_hold: {
        Args: { p_member_id: string; p_title_id: string }
        Returns: {
          copy_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          member_id: string
          queue_position: number
          ready_at: string | null
          status: Database["public"]["Enums"]["hold_status"]
          title_id: string
        }
        SetofOptions: {
          from: "*"
          to: "holds"
          isOneToOne: true
          isSetofReturn: false
        }
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
      fine_reason: "overdue" | "damaged" | "lost"
      fine_status: "outstanding" | "paid" | "partial" | "waived"
      hold_status: "waiting" | "ready" | "fulfilled" | "cancelled" | "expired"
      loan_status: "active" | "returned"
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
      fine_reason: ["overdue", "damaged", "lost"],
      fine_status: ["outstanding", "paid", "partial", "waived"],
      hold_status: ["waiting", "ready", "fulfilled", "cancelled", "expired"],
      loan_status: ["active", "returned"],
      member_status: ["active", "suspended", "blocked"],
      profile_role: ["staff", "admin"],
    },
  },
} as const

