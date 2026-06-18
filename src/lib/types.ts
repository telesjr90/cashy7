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
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          created_at?: string;
        };
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          is_owner: boolean;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          is_owner?: boolean;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
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
          paycheck_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          color?: string | null;
          pay_schedule?: string;
          paycheck_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          color?: string | null;
          pay_schedule?: string;
          paycheck_amount?: number;
          created_at?: string;
        };
      };
      bills: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          default_amount: number | null;
          is_variable: boolean;
          period_bucket: "1_14" | "15_eom";
          category: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          default_amount?: number | null;
          is_variable?: boolean;
          period_bucket: "1_14" | "15_eom";
          category?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          default_amount?: number | null;
          is_variable?: boolean;
          period_bucket?: "1_14" | "15_eom";
          category?: string;
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
          period_bucket: string;
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
          period_bucket?: string;
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
          period_bucket?: string;
          total_payment?: number;
          teles_amount?: number;
          nicole_amount?: number;
          remaining_balance_after_payment?: number | null;
          paid_status?: boolean;
          linked_bill_instance_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
