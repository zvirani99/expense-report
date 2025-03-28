/*
  # Fix is_admin() Function, Add Trigger, and Update Policies

  This migration aims to fix the "failed to fetch reports" error by addressing potential issues with the `is_admin()` function, its usage in RLS policies, and the setup of the `user_roles` table.

  1. Function Updates
    - `is_admin()`:
      - Uses `SECURITY DEFINER` to ensure it runs with the privileges of the function owner, allowing it to access the `user_roles` table even if the calling user doesn't have direct permissions.
      - Explicitly sets `search_path = public` to avoid schema issues when accessing the `user_roles` table.
      - Uses `EXISTS` for a more efficient check.

  2. New Trigger
    - `on_auth_user_created`: Automatically adds a default role (0 for regular user) to the `user_roles` table when a new user is created in the `auth.users` table. This ensures every user has a role assigned.

  3. RLS Policy Updates
    - Policies for `expenses` and `expense_items` are re-applied to ensure they use the corrected `is_admin()` function.  Policies are dropped and recreated to avoid potential conflicts.

  4. Security Considerations
    - `SECURITY DEFINER` is used carefully in `is_admin()` to allow access to `user_roles` without granting excessive permissions.
    - The trigger ensures all users have a role assigned, preventing access control issues.

  5. Notes
    - This migration addresses potential issues with the previous setup of `is_admin()`, the trigger, and the policies.
    - After applying this migration, manually insert roles for existing users in the `user_roles` table, especially to designate admin users (role = 1).
*/

-- 1. Update is_admin() function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER -- Crucial for accessing user_roles securely
STABLE
SET search_path = public -- Important to find user_roles
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid() AND role = 1
  );
$$;

-- 2. Create trigger function to add default role for new users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_roles (user_id, role)
  VALUES (new.id, 0); -- Default role is 0 (user)
  RETURN new;
END;
$$;

-- 3. Create trigger to execute the function after user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Drop if it exists to recreate
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4. Re-apply policies for expenses (dropping existing ones first)

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


-- 5. Re-apply policies for expense_items (dropping existing ones first)
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
