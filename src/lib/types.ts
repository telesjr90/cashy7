export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          created_by: string | null;
          owner_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_by?: string | null;
          owner_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_by?: string | null;
          owner_id?: string | null;
          created_at?: string;
        };
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          email: string | null;
          display_name: string | null;
          role: "owner" | "member";
          status: "active" | "invited";
          is_owner: boolean;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          email?: string | null;
          display_name?: string | null;
          role?: "owner" | "member";
          status?: "active" | "invited";
          is_owner?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          email?: string | null;
          display_name?: string | null;
          role?: "owner" | "member";
          status?: "active" | "invited";
          is_owner?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
      };
      people: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          color: string | null;
          pay_schedule: string;
          pay_schedule_description: string | null;
          paycheck_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          color?: string | null;
          pay_schedule?: string;
          pay_schedule_description?: string | null;
          paycheck_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          color?: string | null;
          pay_schedule?: string;
          pay_schedule_description?: string | null;
          paycheck_amount?: number;
          created_at?: string;
        };
      };
      bills: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          category: string;
          default_amount: number | null;
          due_day: string | null;
          is_variable: boolean;
          period_bucket: "1_14" | "15_eom";
          recurring: boolean;
          active_from: string;
          active_until: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          category?: string;
          default_amount?: number | null;
          due_day?: string | null;
          is_variable?: boolean;
          period_bucket?: "1_14" | "15_eom";
          recurring?: boolean;
          active_from?: string;
          active_until?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          category?: string;
          default_amount?: number | null;
          due_day?: string | null;
          is_variable?: boolean;
          period_bucket?: "1_14" | "15_eom";
          recurring?: boolean;
          active_from?: string;
          active_until?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      bill_instances: {
        Row: {
          id: string;
          bill_id: string | null;
          household_id: string;
          year: number;
          month: number;
          period_bucket: "1_14" | "15_eom";
          name: string;
          amount: number;
          teles_amount: number;
          nicole_amount: number;
          due_date: string | null;
          is_paid: boolean;
          paid_status: "unpaid" | "paid";
          paid_at: string | null;
          paid_by_user_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          bill_id?: string | null;
          household_id: string;
          year: number;
          month: number;
          period_bucket: "1_14" | "15_eom";
          name: string;
          amount: number;
          teles_amount?: number;
          nicole_amount?: number;
          due_date?: string | null;
          is_paid?: boolean;
          paid_status?: "unpaid" | "paid";
          paid_at?: string | null;
          paid_by_user_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          bill_id?: string | null;
          household_id?: string;
          year?: number;
          month?: number;
          period_bucket?: "1_14" | "15_eom";
          name?: string;
          amount?: number;
          teles_amount?: number;
          nicole_amount?: number;
          due_date?: string | null;
          is_paid?: boolean;
          paid_status?: "unpaid" | "paid";
          paid_at?: string | null;
          paid_by_user_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
      };
      debt_accounts: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          original_amount: number;
          current_balance: number;
          target_payoff_date: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          original_amount?: number;
          current_balance?: number;
          target_payoff_date?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          original_amount?: number;
          current_balance?: number;
          target_payoff_date?: string | null;
          notes?: string | null;
          created_at?: string;
        };
      };
      debt_payments: {
        Row: {
          id: string;
          household_id: string;
          debt_account_id: string;
          payment_date: string;
          month: number;
          year: number;
          period_bucket: "1_14";
          total_payment: number;
          teles_amount: number;
          nicole_amount: number;
          remaining_balance_after_payment: number | null;
          paid_status: boolean;
          linked_bill_instance_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          debt_account_id: string;
          payment_date: string;
          month: number;
          year: number;
          period_bucket?: "1_14";
          total_payment?: number;
          teles_amount?: number;
          nicole_amount?: number;
          remaining_balance_after_payment?: number | null;
          paid_status?: boolean;
          linked_bill_instance_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          debt_account_id?: string;
          payment_date?: string;
          month?: number;
          year?: number;
          period_bucket?: "1_14";
          total_payment?: number;
          teles_amount?: number;
          nicole_amount?: number;
          remaining_balance_after_payment?: number | null;
          paid_status?: boolean;
          linked_bill_instance_id?: string | null;
          created_at?: string;
        };
      };
      household_settings: {
        Row: {
          household_id: string;
          cashflow_start_date: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          household_id: string;
          cashflow_start_date: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          household_id?: string;
          cashflow_start_date?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cash_snapshots: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          amount: number;
          snapshot_date: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          amount: number;
          snapshot_date?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          amount?: number;
          snapshot_date?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_household_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Household = Tables<"households">;
export type HouseholdMember = Tables<"household_members">;
export type Person = Tables<"people">;
export type Bill = Tables<"bills">;
export type BillInstance = Tables<"bill_instances">;
export type DebtAccount = Tables<"debt_accounts">;
export type DebtPayment = Tables<"debt_payments">;
export type HouseholdSettings = Tables<"household_settings">;
export type CashSnapshot = Tables<"cash_snapshots">;
