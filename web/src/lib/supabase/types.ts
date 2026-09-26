export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent: string | null;
          completed_at: string | null;
          goal: string;
          id: string;
          options: NonNullable<Json>;
          started_at: string;
          status: string;
        };
        Insert: {
          agent?: string | null;
          completed_at?: string | null;
          goal: string;
          id?: string;
          options?: NonNullable<Json>;
          started_at?: string;
          status?: string;
        };
        Update: {
          agent?: string | null;
          completed_at?: string | null;
          goal?: string;
          id?: string;
          options?: NonNullable<Json>;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      agent_steps: {
        Row: {
          action: string;
          agent: string | null;
          created_at: string;
          id: string;
          input: Json | null;
          latency_ms: number | null;
          model: string | null;
          output: Json | null;
          rationale: string | null;
          run_id: string;
          status: string;
          step_number: number;
          tokens_in: number | null;
          tokens_out: number | null;
        };
        Insert: {
          action: string;
          agent?: string | null;
          created_at?: string;
          id?: string;
          input?: Json | null;
          latency_ms?: number | null;
          model?: string | null;
          output?: Json | null;
          rationale?: string | null;
          run_id: string;
          status?: string;
          step_number: number;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Update: {
          action?: string;
          agent?: string | null;
          created_at?: string;
          id?: string;
          input?: Json | null;
          latency_ms?: number | null;
          model?: string | null;
          output?: Json | null;
          rationale?: string | null;
          run_id?: string;
          status?: string;
          step_number?: number;
          tokens_in?: number | null;
          tokens_out?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "agent_steps_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      approvals: {
        Row: {
          amount: number | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          note: string | null;
          reason: string | null;
          requested_by_agent: string;
          required_role: string;
          run_id: string | null;
          status: string;
          subject_id: string;
          subject_type: string;
        };
        Insert: {
          amount?: number | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          reason?: string | null;
          requested_by_agent: string;
          required_role: string;
          run_id?: string | null;
          status?: string;
          subject_id: string;
          subject_type: string;
        };
        Update: {
          amount?: number | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          note?: string | null;
          reason?: string | null;
          requested_by_agent?: string;
          required_role?: string;
          run_id?: string | null;
          status?: string;
          subject_id?: string;
          subject_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approvals_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          company_id: string;
          created_at: string;
          email: string | null;
          id: string;
          name: string;
          role: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name: string;
          role?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string;
          role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_line_items: {
        Row: {
          deal_id: string;
          id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
        };
        Insert: {
          deal_id: string;
          id?: string;
          product_id: string;
          quantity: number;
          unit_price: number;
        };
        Update: {
          deal_id?: string;
          id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deal_line_items_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_line_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          closed_at: string | null;
          company_id: string;
          created_at: string;
          currency: string;
          id: string;
          stage: string;
          title: string;
          value: number;
        };
        Insert: {
          closed_at?: string | null;
          company_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          stage?: string;
          title: string;
          value?: number;
        };
        Update: {
          closed_at?: string | null;
          company_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          stage?: string;
          title?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      goods_receipts: {
        Row: {
          id: string;
          purchase_order_id: string;
          quantity: number;
          received_at: string;
          status: string;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          quantity: number;
          received_at?: string;
          status?: string;
        };
        Update: {
          id?: string;
          purchase_order_id?: string;
          quantity?: number;
          received_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      handoffs: {
        Row: {
          created_at: string;
          deal_id: string | null;
          from_agent: string;
          id: string;
          idempotency_key: string;
          invoice_id: string | null;
          payload: NonNullable<Json>;
          processed_at: string | null;
          purchase_order_id: string | null;
          purchase_request_id: string | null;
          run_id: string | null;
          status: string;
          to_agent: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          deal_id?: string | null;
          from_agent: string;
          id?: string;
          idempotency_key: string;
          invoice_id?: string | null;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          purchase_order_id?: string | null;
          purchase_request_id?: string | null;
          run_id?: string | null;
          status?: string;
          to_agent: string;
          type: string;
        };
        Update: {
          created_at?: string;
          deal_id?: string | null;
          from_agent?: string;
          id?: string;
          idempotency_key?: string;
          invoice_id?: string | null;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          purchase_order_id?: string | null;
          purchase_request_id?: string | null;
          run_id?: string | null;
          status?: string;
          to_agent?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "handoffs_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoffs_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoffs_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoffs_purchase_request_id_fkey";
            columns: ["purchase_request_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handoffs_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "agent_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          amount: number;
          created_at: string;
          deal_id: string | null;
          direction: string;
          due_date: string;
          extracted: Json | null;
          extraction_confidence: number | null;
          file_path: string | null;
          id: string;
          invoice_number: string;
          purchase_order_id: string | null;
          quantity: number | null;
          status: string;
          unit_price: number | null;
          vendor_id: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          deal_id?: string | null;
          direction: string;
          due_date: string;
          extracted?: Json | null;
          extraction_confidence?: number | null;
          file_path?: string | null;
          id?: string;
          invoice_number: string;
          purchase_order_id?: string | null;
          quantity?: number | null;
          status?: string;
          unit_price?: number | null;
          vendor_id?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          deal_id?: string | null;
          direction?: string;
          due_date?: string;
          extracted?: Json | null;
          extraction_confidence?: number | null;
          file_path?: string | null;
          id?: string;
          invoice_number?: string;
          purchase_order_id?: string | null;
          quantity?: number | null;
          status?: string;
          unit_price?: number | null;
          vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          id: string;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          run_after: string;
          status: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          id?: string;
          kind: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          run_after?: string;
          status?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          id?: string;
          kind?: string;
          last_error?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          max_attempts?: number;
          payload?: NonNullable<Json>;
          run_after?: string;
          status?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount: number;
          id: string;
          invoice_id: string;
          paid_at: string | null;
          status: string;
        };
        Insert: {
          amount: number;
          id?: string;
          invoice_id: string;
          paid_at?: string | null;
          status?: string;
        };
        Update: {
          amount?: number;
          id?: string;
          invoice_id?: string;
          paid_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      policies: {
        Row: {
          description: string | null;
          key: string;
          value: NonNullable<Json>;
        };
        Insert: {
          description?: string | null;
          key: string;
          value: NonNullable<Json>;
        };
        Update: {
          description?: string | null;
          key?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      products: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string | null;
          id: string;
          role: string;
        };
        Insert: {
          created_at?: string;
          full_name?: string | null;
          id: string;
          role: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          amount: number;
          created_at: string;
          id: string;
          po_number: string;
          purchase_request_id: string;
          status: string;
          vendor_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          id?: string;
          po_number: string;
          purchase_request_id: string;
          status?: string;
          vendor_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          id?: string;
          po_number?: string;
          purchase_request_id?: string;
          status?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_orders_purchase_request_id_fkey";
            columns: ["purchase_request_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_requests: {
        Row: {
          created_at: string;
          deal_id: string | null;
          description: string;
          id: string;
          needed_by: string | null;
          quantity: number;
          status: string;
        };
        Insert: {
          created_at?: string;
          deal_id?: string | null;
          description: string;
          id?: string;
          needed_by?: string | null;
          quantity?: number;
          status?: string;
        };
        Update: {
          created_at?: string;
          deal_id?: string | null;
          description?: string;
          id?: string;
          needed_by?: string | null;
          quantity?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchase_requests_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_personas: {
        Row: {
          created_at: string;
          id: string;
          persona_prompt: string;
          price_bands: NonNullable<Json>;
          reliability: number;
          tone: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          persona_prompt: string;
          price_bands?: NonNullable<Json>;
          reliability?: number;
          tone?: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          persona_prompt?: string;
          price_bands?: NonNullable<Json>;
          reliability?: number;
          tone?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_personas_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: true;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_quotes: {
        Row: {
          id: string;
          lead_time_days: number;
          purchase_request_id: string;
          status: string;
          submitted_at: string;
          total_price: number;
          unit_price: number;
          vendor_id: string;
        };
        Insert: {
          id?: string;
          lead_time_days: number;
          purchase_request_id: string;
          status?: string;
          submitted_at?: string;
          total_price: number;
          unit_price: number;
          vendor_id: string;
        };
        Update: {
          id?: string;
          lead_time_days?: number;
          purchase_request_id?: string;
          status?: string;
          submitted_at?: string;
          total_price?: number;
          unit_price?: number;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_quotes_purchase_request_id_fkey";
            columns: ["purchase_request_id"];
            isOneToOne: false;
            referencedRelation: "purchase_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendor_quotes_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      claim_job: {
        Args: { worker_id: string };
        Returns: {
          attempts: number;
          created_at: string;
          id: string;
          kind: string;
          last_error: string | null;
          locked_at: string | null;
          locked_by: string | null;
          max_attempts: number;
          payload: NonNullable<Json>;
          run_after: string;
          status: string;
        };
        SetofOptions: {
          from: "*";
          to: "jobs";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_role_name: { Args: Record<PropertyKey, never>; Returns: string };
      reset_demo: { Args: Record<PropertyKey, never>; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
