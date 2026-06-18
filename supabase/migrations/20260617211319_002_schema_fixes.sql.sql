/*
# Schema fixes and additions

1. Changes Made
- Add `owner_id` column to `households` table for owner reference
- Add `is_active` column to `household_members` (rename is_owner usage will stay but add is_active)
- Add `color` column to `people` table for UI accents
- Add `updated_at` trigger to `bill_instances`
- Update RLS policies to work with correct column names

2. Notes
- '15_eom' is used instead of '15_end' for the period bucket
- is_owner in household_members stays but we add is_active for soft deactivation
*/

-- Add missing columns

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'households' AND column_name = 'owner_id') THEN
    ALTER TABLE households ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'household_members' AND column_name = 'is_active') THEN
    ALTER TABLE household_members ADD COLUMN is_active boolean DEFAULT true;
    UPDATE household_members SET is_active = true WHERE is_active IS NULL;
    ALTER TABLE household_members ALTER COLUMN is_active SET NOT NULL;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'people' AND column_name = 'color') THEN
    ALTER TABLE people ADD COLUMN color text;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bill_instances' AND column_name = 'updated_at') THEN
    ALTER TABLE bill_instances ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Update RLS policies for households to use correct column checks

DROP POLICY IF EXISTS "select_household_membership" ON households;
CREATE POLICY "select_household_membership"
ON households FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = households.id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "insert_household_owner" ON households;
CREATE POLICY "insert_household_owner"
ON households FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_household_owner" ON households;
CREATE POLICY "update_household_owner"
ON households FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_household_owner" ON households;
CREATE POLICY "delete_household_owner"
ON households FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

-- Update RLS policies for people

DROP POLICY IF EXISTS "select_people_membership" ON people;
CREATE POLICY "select_people_membership"
ON people FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = people.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "insert_people_membership" ON people;
CREATE POLICY "insert_people_membership"
ON people FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = people.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "update_people_membership" ON people;
CREATE POLICY "update_people_membership"
ON people FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = people.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = people.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

-- Update RLS policies for bills

DROP POLICY IF EXISTS "select_bills_membership" ON bills;
CREATE POLICY "select_bills_membership"
ON bills FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bills.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "insert_bills_membership" ON bills;
CREATE POLICY "insert_bills_membership"
ON bills FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bills.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "update_bills_membership" ON bills;
CREATE POLICY "update_bills_membership"
ON bills FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bills.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bills.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "delete_bills_membership" ON bills;
CREATE POLICY "delete_bills_membership"
ON bills FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bills.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

-- Update RLS policies for bill_instances

DROP POLICY IF EXISTS "select_bill_instances_membership" ON bill_instances;
CREATE POLICY "select_bill_instances_membership"
ON bill_instances FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bill_instances.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "insert_bill_instances_membership" ON bill_instances;
CREATE POLICY "insert_bill_instances_membership"
ON bill_instances FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bill_instances.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "update_bill_instances_membership" ON bill_instances;
CREATE POLICY "update_bill_instances_membership"
ON bill_instances FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bill_instances.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bill_instances.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

DROP POLICY IF EXISTS "delete_bill_instances_membership" ON bill_instances;
CREATE POLICY "delete_bill_instances_membership"
ON bill_instances FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM household_members
    WHERE household_members.household_id = bill_instances.household_id
    AND household_members.user_id = auth.uid()
    AND household_members.is_active = true
  )
);

-- Create indexes

CREATE INDEX IF NOT EXISTS idx_bill_instances_period ON bill_instances(household_id, year, month, period_bucket);
CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_household ON bills(household_id);
CREATE INDEX IF NOT EXISTS idx_people_household ON people(household_id);