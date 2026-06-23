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
          person_id: string | null;
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
          person_id?: string | null;
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
          person_id?: string | null;
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
          is_archived: boolean;
          archived_at: string | null;
          archive_reason: string | null;
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
          is_archived?: boolean;
          archived_at?: string | null;
          archive_reason?: string | null;
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
          is_archived?: boolean;
          archived_at?: string | null;
          archive_reason?: string | null;
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
      savings_goals: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          goal_type: "private" | "shared";
          target_amount: number;
          start_date: string;
          end_date: string;
          created_by_user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          goal_type: "private" | "shared";
          target_amount: number;
          start_date: string;
          end_date: string;
          created_by_user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          goal_type?: "private" | "shared";
          target_amount?: number;
          start_date?: string;
          end_date?: string;
          created_by_user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      savings_goal_participants: {
        Row: {
          id: string;
          savings_goal_id: string;
          household_id: string;
          user_id: string;
          person_id: string | null;
          target_contribution_amount: number;
          contribution_period: "1_14" | "15_eom" | "monthly";
          period_start: string | null;
          period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          savings_goal_id: string;
          household_id: string;
          user_id: string;
          person_id?: string | null;
          target_contribution_amount: number;
          contribution_period: "1_14" | "15_eom" | "monthly";
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          savings_goal_id?: string;
          household_id?: string;
          user_id?: string;
          person_id?: string | null;
          target_contribution_amount?: number;
          contribution_period?: "1_14" | "15_eom" | "monthly";
          period_start?: string | null;
          period_end?: string | null;
          created_at?: string;
        };
      };
      savings_contributions: {
        Row: {
          id: string;
          savings_goal_id: string;
          household_id: string;
          user_id: string;
          person_id: string | null;
          amount: number;
          contribution_date: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          savings_goal_id: string;
          household_id: string;
          user_id: string;
          person_id?: string | null;
          amount: number;
          contribution_date?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          savings_goal_id?: string;
          household_id?: string;
          user_id?: string;
          person_id?: string | null;
          amount?: number;
          contribution_date?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      manual_expenses: {
        Row: {
          id: string;
          household_id: string;
          created_by_user_id: string;
          person_id: string | null;
          expense_scope: "private" | "shared";
          description: string;
          category: string | null;
          amount: number;
          expense_date: string;
          period_bucket: "1_14" | "15_eom";
          split_type: "personal" | "equal" | "51_49" | "custom";
          teles_amount: number;
          nicole_amount: number;
          is_paid: boolean;
          paid_at: string | null;
          notes: string | null;
          adjusts_manual_expense_id: string | null;
          adjustment_direction: "increase" | "decrease" | null;
          adjustment_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          created_by_user_id: string;
          person_id?: string | null;
          expense_scope: "private" | "shared";
          description: string;
          category?: string | null;
          amount: number;
          expense_date?: string;
          period_bucket: "1_14" | "15_eom";
          split_type?: "personal" | "equal" | "51_49" | "custom";
          teles_amount?: number;
          nicole_amount?: number;
          is_paid?: boolean;
          paid_at?: string | null;
          notes?: string | null;
          adjusts_manual_expense_id?: string | null;
          adjustment_direction?: "increase" | "decrease" | null;
          adjustment_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          created_by_user_id?: string;
          person_id?: string | null;
          expense_scope?: "private" | "shared";
          description?: string;
          category?: string | null;
          amount?: number;
          expense_date?: string;
          period_bucket?: "1_14" | "15_eom";
          split_type?: "personal" | "equal" | "51_49" | "custom";
          teles_amount?: number;
          nicole_amount?: number;
          is_paid?: boolean;
          paid_at?: string | null;
          notes?: string | null;
          adjusts_manual_expense_id?: string | null;
          adjustment_direction?: "increase" | "decrease" | null;
          adjustment_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cash_payment_transactions: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          person_id: string | null;
          source_type:
            | "bill_instance"
            | "debt_payment"
            | "manual_expense"
            | "savings_contribution";
          source_id: string;
          amount: number;
          previous_cash_snapshot_id: string | null;
          new_cash_snapshot_id: string | null;
          paid_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          person_id?: string | null;
          source_type:
            | "bill_instance"
            | "debt_payment"
            | "manual_expense"
            | "savings_contribution";
          source_id: string;
          amount: number;
          previous_cash_snapshot_id?: string | null;
          new_cash_snapshot_id?: string | null;
          paid_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          person_id?: string | null;
          source_type?:
            | "bill_instance"
            | "debt_payment"
            | "manual_expense"
            | "savings_contribution";
          source_id?: string;
          amount?: number;
          previous_cash_snapshot_id?: string | null;
          new_cash_snapshot_id?: string | null;
          paid_at?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      paycheck_schedules: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          amount: number;
          schedule_type:
            | "disabled"
            | "semi_monthly_15_30"
            | "semi_monthly_15_last_business_day";
          first_pay_day: number | null;
          second_pay_day: number | null;
          use_last_business_day: boolean;
          is_active: boolean;
          effective_from: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          amount?: number;
          schedule_type?:
            | "disabled"
            | "semi_monthly_15_30"
            | "semi_monthly_15_last_business_day";
          first_pay_day?: number | null;
          second_pay_day?: number | null;
          use_last_business_day?: boolean;
          is_active?: boolean;
          effective_from?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          amount?: number;
          schedule_type?:
            | "disabled"
            | "semi_monthly_15_30"
            | "semi_monthly_15_last_business_day";
          first_pay_day?: number | null;
          second_pay_day?: number | null;
          use_last_business_day?: boolean;
          is_active?: boolean;
          effective_from?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cash_adjustment_transactions: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          person_id: string | null;
          source_type: "manual_expense_adjustment";
          source_id: string;
          amount: number;
          previous_cash_snapshot_id: string | null;
          new_cash_snapshot_id: string | null;
          credited_at: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          person_id?: string | null;
          source_type: "manual_expense_adjustment";
          source_id: string;
          amount: number;
          previous_cash_snapshot_id?: string | null;
          new_cash_snapshot_id?: string | null;
          credited_at?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          person_id?: string | null;
          source_type?: "manual_expense_adjustment";
          source_id?: string;
          amount?: number;
          previous_cash_snapshot_id?: string | null;
          new_cash_snapshot_id?: string | null;
          credited_at?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      import_batches: {
        Row: {
          id: string;
          household_id: string;
          created_by: string;
          source_file_name: string;
          source_file_kind: string;
          status:
            | "applied"
            | "partial"
            | "failed"
            | "rolled_back"
            | "rollback_partial"
            | "rollback_failed";
          strategy:
            | "create_new_only"
            | "update_matching"
            | "replace_selected_month"
            | null;
          scope_year: number | null;
          scope_month: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          created_by: string;
          source_file_name: string;
          source_file_kind: string;
          status?:
            | "applied"
            | "partial"
            | "failed"
            | "rolled_back"
            | "rollback_partial"
            | "rollback_failed";
          strategy?:
            | "create_new_only"
            | "update_matching"
            | "replace_selected_month"
            | null;
          scope_year?: number | null;
          scope_month?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          created_by?: string;
          source_file_name?: string;
          source_file_kind?: string;
          status?:
            | "applied"
            | "partial"
            | "failed"
            | "rolled_back"
            | "rollback_partial"
            | "rollback_failed";
          strategy?:
            | "create_new_only"
            | "update_matching"
            | "replace_selected_month"
            | null;
          scope_year?: number | null;
          scope_month?: number | null;
          created_at?: string;
        };
      };
      import_batch_records: {
        Row: {
          id: string;
          household_id: string;
          import_batch_id: string;
          source_sheet_name: string | null;
          source_row_number: number | null;
          row_type: string;
          target_table: string;
          target_id: string;
          action: "created" | "updated" | "skipped" | "replaced" | "deleted";
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          import_batch_id: string;
          source_sheet_name?: string | null;
          source_row_number?: number | null;
          row_type: string;
          target_table: string;
          target_id: string;
          action?: "created" | "updated" | "skipped" | "replaced" | "deleted";
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          import_batch_id?: string;
          source_sheet_name?: string | null;
          source_row_number?: number | null;
          row_type?: string;
          target_table?: string;
          target_id?: string;
          action?: "created" | "updated" | "skipped" | "replaced" | "deleted";
          created_at?: string;
        };
      };
      receipt_uploads: {
        Row: {
          id: string;
          household_id: string;
          uploaded_by: string;
          storage_bucket: string;
          storage_path: string;
          original_file_name: string;
          mime_type: string;
          size_bytes: number;
          status: "uploaded" | "deleted";
          approved_for_shared_expense: boolean;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          uploaded_by: string;
          storage_bucket: string;
          storage_path: string;
          original_file_name: string;
          mime_type: string;
          size_bytes: number;
          status?: "uploaded" | "deleted";
          approved_for_shared_expense?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          uploaded_by?: string;
          storage_bucket?: string;
          storage_path?: string;
          original_file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          status?: "uploaded" | "deleted";
          approved_for_shared_expense?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_household_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      pay_source_from_current_cash: {
        Args: {
          p_source_type: string;
          p_source_id: string;
          p_amount: number;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      credit_manual_expense_adjustment_to_current_cash: {
        Args: {
          p_adjustment_manual_expense_id: string;
          p_amount: number;
          p_notes?: string | null;
        };
        Returns: Json;
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
export type SavingsGoal = Tables<"savings_goals">;
export type SavingsGoalParticipant = Tables<"savings_goal_participants">;
export type SavingsContribution = Tables<"savings_contributions">;
export type SavingsGoalType = SavingsGoal["goal_type"];
export type SavingsContributionPeriod = SavingsGoalParticipant["contribution_period"];
export type ManualExpense = Tables<"manual_expenses">;
export type InsertManualExpense = InsertTables<"manual_expenses">;
export type UpdateManualExpense = UpdateTables<"manual_expenses">;
export type ManualExpenseScope = ManualExpense["expense_scope"];
export type ManualExpenseSplitType = ManualExpense["split_type"];
export type ManualExpenseAdjustmentDirection = NonNullable<
  ManualExpense["adjustment_direction"]
>;
export type PaycheckSchedule = Tables<"paycheck_schedules">;
export type CashPaymentTransaction = Tables<"cash_payment_transactions">;
export type PaymentSourceType = CashPaymentTransaction["source_type"];
export type CashAdjustmentTransaction = Tables<"cash_adjustment_transactions">;
export type CashAdjustmentSourceType = CashAdjustmentTransaction["source_type"];
export type ReceiptUpload = Tables<"receipt_uploads">;
export type InsertReceiptUpload = InsertTables<"receipt_uploads">;
export type ReceiptUploadStatus = ReceiptUpload["status"];
