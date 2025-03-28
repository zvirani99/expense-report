/*
  # Update Policies for Admin using user_roles Table

  This migration updates the Row Level Security (RLS) policies for the `expenses` and `expense_items` tables
  to use the new `user_roles` table and `is_admin()` function for determining admin privileges.

  1. Modified Tables
    - `expenses`: RLS policies updated.
    - `expense_items`: RLS policies updated.

  2. Security Changes
    - Policies now rely on the `user_roles` table and `is_admin()` function.
    - Admins (users with `role = 1` in `user_roles`) have full access to all expenses and expense items.
    - Regular users can only access their own expenses and expense items.

  3. Notes
    - This migration assumes the `user_roles` table and `is_admin()` function are already in place.
    - Existing data access will be affected by these changes. Ensure user roles are correctly set up in the `user_roles` table before applying this migration.
*/

-- Update policies for expenses table
-- Drop existing policies first to ensure clean application
DROP POLICY IF EXISTS "Users can insert their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can view their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON expenses;
DROP POLICY IF EXISTS "Admins can view all expenses" ON expenses;
DROP POLICY IF EXISTS "Admins can update any expense" ON expenses;
DROP POLICY IF EXISTS "Admins can delete any expense" ON expenses;


CREATE POLICY "Users can insert their own expenses" ON expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own expenses" ON expenses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own expenses" ON expenses
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own expenses" ON expenses
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all expenses" ON expenses
  FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update any expense" ON expenses
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete any expense" ON expenses
  FOR DELETE USING (is_admin());


-- Update policies for expense_items table
DROP POLICY IF EXISTS "Users can insert items for their own expenses" ON expense_items;
DROP POLICY IF EXISTS "Users can view items for their own expenses" ON expense_items;
DROP POLICY IF EXISTS "Users can update items for their own expenses" ON expense_items;
DROP POLICY IF EXISTS "Users can delete items for their own expenses" ON expense_items;
DROP POLICY IF EXISTS "Admins can view all expense items" ON expense_items;
DROP POLICY IF EXISTS "Admins can update any expense item" ON expense_items;
DROP POLICY IF EXISTS "Admins can delete any expense item" ON expense_items;

CREATE POLICY "Users can insert items for their own expenses" ON expense_items
  FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));
CREATE POLICY "Users can view items for their own expenses" ON expense_items
  FOR SELECT USING (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));
CREATE POLICY "Users can update items for their own expenses" ON expense_items
  FOR UPDATE USING (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id))
             WITH CHECK (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));
CREATE POLICY "Users can delete items for their own expenses" ON expense_items
  FOR DELETE USING (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));

CREATE POLICY "Admins can view all expense items" ON expense_items
  FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update any expense item" ON expense_items
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete any expense item" ON expense_items
  FOR DELETE USING (is_admin());