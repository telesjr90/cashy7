CREATE TABLE public.debt_accounts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  original_amount numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  target_payoff_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.debt_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_debt_accounts" ON public.debt_accounts FOR SELECT
  TO authenticated USING (household_id = public.get_my_household_id());
CREATE POLICY "insert_debt_accounts" ON public.debt_accounts FOR INSERT
  TO authenticated WITH CHECK (household_id = public.get_my_household_id());
CREATE POLICY "update_debt_accounts" ON public.debt_accounts FOR UPDATE
  TO authenticated USING (household_id = public.get_my_household_id())
  WITH CHECK (household_id = public.get_my_household_id());
CREATE POLICY "delete_debt_accounts" ON public.debt_accounts FOR DELETE
  TO authenticated USING (household_id = public.get_my_household_id());

CREATE TABLE public.debt_payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  debt_account_id uuid NOT NULL REFERENCES public.debt_accounts(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  period_bucket text NOT NULL DEFAULT '1_14',
  total_payment numeric NOT NULL DEFAULT 0,
  teles_amount numeric NOT NULL DEFAULT 0,
  nicole_amount numeric NOT NULL DEFAULT 0,
  remaining_balance_after_payment numeric,
  paid_status boolean NOT NULL DEFAULT false,
  linked_bill_instance_id uuid REFERENCES public.bill_instances(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_debt_payments" ON public.debt_payments FOR SELECT
  TO authenticated USING (household_id = public.get_my_household_id());
CREATE POLICY "insert_debt_payments" ON public.debt_payments FOR INSERT
  TO authenticated WITH CHECK (household_id = public.get_my_household_id());
CREATE POLICY "update_debt_payments" ON public.debt_payments FOR UPDATE
  TO authenticated USING (household_id = public.get_my_household_id())
  WITH CHECK (household_id = public.get_my_household_id());
CREATE POLICY "delete_debt_payments" ON public.debt_payments FOR DELETE
  TO authenticated USING (household_id = public.get_my_household_id());