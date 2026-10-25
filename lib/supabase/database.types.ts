// Generated from the live schema (supabase generate_typescript_types). Regenerate after migrations.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Sale = {
  buyer_name: string | null; buyer_room: string | null; created_at: string; duration_minutes: number;
  id: string; idempotency_key: string; plan_id: string; plan_name: string; price_centavos: number;
  sold_by: string; status: string; void_reason: string | null; voided_at: string | null;
  voided_by: string | null; voucher_code: string; voucher_id: number;
  group_id: string | null; seq: number | null;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      // Written only by database triggers (0003); the owner can read it, nobody can write it.
      audit_log: {
        Row: {
          id: number; at: string; actor: string | null; actor_name: string | null; action: string;
          target_type: string | null; target_id: string | null; detail: Json;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      payments: {
        Row: {
          amount_centavos: number; created_at: string; id: string; method: string; provider: string | null;
          provider_payload: Json | null; provider_ref: string | null; sale_id: string; status: string;
          tendered_centavos: number | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      plans: {
        Row: {
          active: boolean; created_at: string; duration_minutes: number; id: string; name: string;
          price_centavos: number; sort_order: number;
        };
        Insert: { active?: boolean; duration_minutes: number; name: string; price_centavos: number; sort_order?: number };
        Update: { active?: boolean; duration_minutes?: number; name?: string; price_centavos?: number; sort_order?: number };
        Relationships: [];
      };
      profiles: {
        Row: { active: boolean; created_at: string; display_name: string | null; role: string; user_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sales: {
        Row: Sale;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      settings: {
        Row: { id: boolean; low_stock_threshold: number };
        Insert: never;
        Update: { low_stock_threshold?: number };
        Relationships: [];
      };
      vouchers: {
        Row: {
          code: string; id: number; import_batch: string; imported_at: string; imported_by: string;
          plan_id: string; status: string; status_changed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      import_vouchers: {
        Args: { p_codes: string[]; p_plan_id: string };
        Returns: { batch_id: string; inserted: number; skipped_duplicate: number; skipped_invalid: number }[];
      };
      plan_stock: {
        Args: never;
        Returns: {
          available: number; duration_minutes: number; low_stock: boolean; plan_id: string;
          plan_name: string; price_centavos: number; threshold: number;
        }[];
      };
      sales_totals: {
        Args: { p_from: string; p_grain?: string; p_plan_id?: string; p_to: string };
        Returns: { period: string; plan_id: string; plan_name: string; sale_count: number; total_centavos: number }[];
      };
      sell_voucher: {
        Args: { p_buyer_name?: string; p_buyer_room?: string; p_idempotency_key: string; p_plan_id: string; p_tendered_centavos: number };
        Returns: Sale;
      };
      sell_cart: {
        Args: { p_buyer_name?: string; p_buyer_room?: string; p_group_key: string; p_items: Json; p_tendered_centavos: number };
        Returns: Sale[];
      };
      void_sale: { Args: { p_reason: string; p_sale_id: string }; Returns: Sale };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
