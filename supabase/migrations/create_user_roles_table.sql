/*
      # Create user_roles Table and Update Admin Logic

      This migration introduces the `user_roles` table to manage user permissions (User=0, Admin=1),
      updates the `is_admin()` function to use this table, and sets up a trigger to assign
      default roles to new users. It also re-applies RLS policies for `expenses` and `expense_items`
      to ensure they use the updated `is_admin()` function.

      1. New Tables
         - `user_roles`
           - `user_id` (uuid, primary key, references auth.users.id)
           - `role` (integer, default 0, check constraint: 0 or 1)

      2. New Functions & Triggers
         - `handle_new_user()`: Trigger function to insert a default role (0) into `user_roles` for a new user.
         - `on_auth_user_created`: Trigger that executes `handle_new_user()` after a user is created in `auth.users`.

      3. Function Updates
         - `is_admin()`: Modified to query the `user_roles` table to check if the current user has `role = 1`. Uses `SECURITY DEFINER`.

      4. RLS Policy Updates (Re-application)
         - **`user_roles` Table:**
           - Enable RLS.
           - Policy: Users can view their own role.
           - Policy: Admins can view all roles.
           - Policy: Admins can insert/update/delete roles. (Regular users cannot modify roles).
         - **`expenses` Table:**
           - Re-apply policies for users (insert, select, update, delete own).
           - Re-apply policies for admins (select, update, delete all) using the updated `is_admin()`.
         - **`expense_items` Table:**
           - Re-apply policies for users (insert, select, update, delete own items).
           - Re-apply policies for admins (select, update, delete all items) using the updated `is_admin()`.

      5. Security
         - RLS enabled on `user_roles`.
         - Default role is 'user' (0). Admin role (1) must be granted manually via direct database update by an existing admin or through a secure backend process.
         - `is_admin()` uses `SECURITY DEFINER` to securely query `user_roles`.

      6. Notes
         - This replaces the previous admin logic based on `auth.users.raw_app_meta_data`.
         - Existing users will NOT have a role assigned automatically by this migration. You will need to manually insert rows into `user_roles` for existing users, including designating admins.
         - Example to make an existing user an admin (run this manually in SQL editor):
           `INSERT INTO user_roles (user_id, role) VALUES ('EXISTING_USER_UUID', 1) ON CONFLICT (user_id) DO UPDATE SET role = 1;`
         - Example to give an existing user the default user role:
           `INSERT INTO user_roles (user_id, role) VALUES ('EXISTING_USER_UUID', 0) ON CONFLICT (user_id) DO UPDATE SET role = 0;`
    */

    -- 1. Create user_roles table
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      role smallint NOT NULL DEFAULT 0 CHECK (role IN (0, 1)) -- 0: user, 1: admin
    );

    COMMENT ON TABLE user_roles IS 'Stores user roles (0: user, 1: admin)';
    COMMENT ON COLUMN user_roles.user_id IS 'References the user in auth.users';
    COMMENT ON COLUMN user_roles.role IS 'Role identifier: 0 for user, 1 for admin';

    -- 2. Enable RLS for user_roles
    ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

    -- 3. RLS Policies for user_roles
    DROP POLICY IF EXISTS "Users can view their own role" ON user_roles;
    DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
    DROP POLICY IF EXISTS "Admins can manage roles" ON user_roles;

    CREATE POLICY "Users can view their own role" ON user_roles
      FOR SELECT
      USING (auth.uid() = user_id);

    CREATE POLICY "Admins can view all roles" ON user_roles
      FOR SELECT
      USING (is_admin()); -- Depends on the updated is_admin function below

    CREATE POLICY "Admins can manage roles" ON user_roles
      FOR ALL -- Covers INSERT, UPDATE, DELETE
      USING (is_admin())
      WITH CHECK (is_admin());

    -- 4. Update is_admin function to use the new table
    -- Note: SECURITY DEFINER is crucial here to allow the function to check roles
    -- for the calling user, even if they don't have direct SELECT permission on user_roles initially.
    CREATE OR REPLACE FUNCTION is_admin()
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public -- Ensure it finds user_roles
    AS $$
      SELECT EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_id = auth.uid() AND role = 1
      );
    $$;

    -- 5. Trigger function to add default role for new users
    CREATE OR REPLACE FUNCTION handle_new_user()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER -- Needed to insert into public.user_roles
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (new.id, 0); -- Default role is 0 (user)
      RETURN new;
    END;
    $$;

    -- 6. Trigger to execute the function after user creation
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

    -- 7. Re-apply RLS Policies for 'expenses' table using the updated is_admin()
    -- Drop existing policies first to ensure clean application
    DROP POLICY IF EXISTS "Users can insert their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can view their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can update their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can delete their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Admins can view all expenses" ON expenses;
    DROP POLICY IF EXISTS "Admins can update any expense" ON expenses;
    DROP POLICY IF EXISTS "Admins can delete any expense" ON expenses;

    -- Policies for regular users
    CREATE POLICY "Users can insert their own expenses" ON expenses
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can view their own expenses" ON expenses
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users can update their own expenses" ON expenses
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can delete their own expenses" ON expenses
      FOR DELETE USING (auth.uid() = user_id);

    -- Policies for Admins (using the updated is_admin function)
    CREATE POLICY "Admins can view all expenses" ON expenses
      FOR SELECT USING (is_admin());
    CREATE POLICY "Admins can update any expense" ON expenses
      FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY "Admins can delete any expense" ON expenses
      FOR DELETE USING (is_admin());

    -- 8. Re-apply RLS Policies for 'expense_items' table using the updated is_admin()
    -- Drop existing policies first
    DROP POLICY IF EXISTS "Users can insert items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Users can view items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Users can update items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Users can delete items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Admins can view all expense items" ON expense_items;
    DROP POLICY IF EXISTS "Admins can update any expense item" ON expense_items;
    DROP POLICY IF EXISTS "Admins can delete any expense item" ON expense_items;

    -- Policies for regular users
    CREATE POLICY "Users can insert items for their own expenses" ON expense_items
      FOR INSERT WITH CHECK (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));
    CREATE POLICY "Users can view items for their own expenses" ON expense_items
      FOR SELECT USING (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));
    CREATE POLICY "Users can update items for their own expenses" ON expense_items
      FOR UPDATE USING (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id))
                 WITH CHECK (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));
    CREATE POLICY "Users can delete items for their own expenses" ON expense_items
      FOR DELETE USING (auth.uid() = (SELECT user_id FROM expenses WHERE id = expense_id));

    -- Policies for Admins (using the updated is_admin function)
    CREATE POLICY "Admins can view all expense items" ON expense_items
      FOR SELECT USING (is_admin());
    CREATE POLICY "Admins can update any expense item" ON expense_items
      FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY "Admins can delete any expense item" ON expense_items
      FOR DELETE USING (is_admin());

    -- Note: The get_user_report_summary and get_admin_reports_with_details functions
    -- defined in the previous migration do not strictly depend on the is_admin() check
    -- within their own logic, but rely on RLS to control access *to* them or the data
    -- they query. They should continue to work correctly as long as RLS is properly configured.
    -- We keep them as defined previously.

    -- Function for user report summary (No change needed)
    CREATE OR REPLACE FUNCTION get_user_report_summary(user_id_param uuid)
    RETURNS TABLE (
      status text,
      count bigint
    )
    LANGUAGE sql
    STABLE
    AS $$
      SELECT
        e.status,
        COUNT(*) AS count
      FROM
        expenses e
      WHERE
        e.user_id = user_id_param
      GROUP BY
        e.status;
    $$;

    -- Function for admin view of all reports (No change needed in function logic itself)
    -- Access control is handled by RLS on the underlying tables (expenses, expense_items, auth.users)
    CREATE OR REPLACE FUNCTION get_admin_reports_with_details()
    RETURNS TABLE (
      id uuid,
      created_at timestamptz,
      total_amount numeric,
      status text,
      min_date date,
      max_date date,
      user_id uuid,
      user_email text
    )
    LANGUAGE sql
    STABLE
    AS $$
      SELECT
        e.id,
        e.created_at,
        e.total_amount,
        e.status,
        MIN(ei.date)::date AS min_date,
        MAX(ei.date)::date AS max_date,
        e.user_id,
        u.email AS user_email
      FROM
        expenses e
      LEFT JOIN
        expense_items ei ON e.id = ei.expense_id
      LEFT JOIN
        auth.users u ON e.user_id = u.id
      GROUP BY
        e.id, e.created_at, e.total_amount, e.status, e.user_id, u.email
      ORDER BY
        e.created_at DESC;
    $$;

    -- Remove the old setup_admin_role.sql migration file as it's superseded
    -- This action cannot be done via SQL, but should be noted.
    -- The file `/supabase/migrations/setup_admin_role.sql` should be deleted or ignored.