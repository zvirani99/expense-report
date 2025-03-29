/*
      # Setup Admin Role and Related Functions/RLS

      This migration introduces the concept of an Admin user and updates database objects
      to support admin functionality. Admins are identified by `raw_app_meta_data->>'is_admin' = 'true'`
      on the `auth.users` table.

      1. New Helper Functions
         - `is_admin()`: Checks if the currently authenticated user has the admin flag set in their metadata. Uses `SECURITY DEFINER` to access `auth.users`.
         - `get_user_report_summary(user_id_param uuid)`: Calculates the count of reports for a specific user, grouped by status ('submitted', 'approved', 'rejected').
         - `get_admin_reports_with_details()`: Fetches all expense reports, joining with user emails and calculating expense date ranges. Intended for admin use.

      2. RLS Policy Updates
         - **`expenses` Table:**
           - Drops existing policies.
           - Adds policies allowing users to manage their own reports (`auth.uid() = user_id`).
           - Adds policies granting admins full SELECT, UPDATE, DELETE access using the `is_admin()` helper function. INSERT remains restricted to the report owner.
         - **`expense_items` Table:**
           - Drops existing policies.
           - Adds policies allowing users to manage items belonging to their own reports.
           - Adds policies granting admins full SELECT, UPDATE, DELETE access to items using the `is_admin()` helper function. INSERT remains restricted to the owner of the parent report.

      3. Security
         - RLS is updated to explicitly check for admin status using the `is_admin()` function.
         - `is_admin()` uses `SECURITY DEFINER` to securely check the `auth.users` table.
         - Admins are granted broad permissions; ensure only trusted users have the admin flag set.

      4. Notes
         - Assumes the admin flag is stored as `is_admin` (boolean true) within `raw_app_meta_data` on `auth.users`. This needs manual setup in the Supabase dashboard per user.
         - The `get_admin_reports_with_details` function fetches potentially large amounts of data; consider pagination for production environments.
    */

    -- Helper function to check admin status
    CREATE OR REPLACE FUNCTION is_admin()
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    STABLE -- Does not modify the database, returns same result for same input in one transaction
    SET search_path = public -- Ensures it can find tables if needed, though not strictly necessary here
    AS $$
      SELECT coalesce((raw_app_meta_data->>'is_admin')::boolean, false)
      FROM auth.users
      WHERE id = auth.uid();
    $$;

    -- Function for user report summary
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

    -- Function for admin view of all reports
    CREATE OR REPLACE FUNCTION get_admin_reports_with_details()
    RETURNS TABLE (
      id uuid,
      created_at timestamptz,
      total_amount numeric,
      status text,
      min_date date,
      max_date date,
      user_id uuid,
      user_email text -- Changed from user_name to user_email for clarity
    )
    LANGUAGE sql
    STABLE -- Or VOLATILE if underlying data changes frequently and needs fresh reads
    -- Consider SECURITY DEFINER if RLS on auth.users restricts access otherwise
    AS $$
      SELECT
        e.id,
        e.created_at,
        e.total_amount,
        e.status,
        MIN(ei.date)::date AS min_date,
        MAX(ei.date)::date AS max_date,
        e.user_id,
        u.email AS user_email -- Fetch email from auth.users
      FROM
        expenses e
      LEFT JOIN
        expense_items ei ON e.id = ei.expense_id
      LEFT JOIN
        auth.users u ON e.user_id = u.id -- Join with auth.users
      GROUP BY
        e.id, e.created_at, e.total_amount, e.status, e.user_id, u.email
      ORDER BY
        e.created_at DESC;
    $$;


    -- RLS Policies for 'expenses' table
    ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies (if any) - Be cautious in production
    DROP POLICY IF EXISTS "Users can manage their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can view their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can insert their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can update their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Users can delete their own expenses" ON expenses;
    DROP POLICY IF EXISTS "Admins have full access" ON expenses; -- Example name

    -- Policies for regular users
    CREATE POLICY "Users can insert their own expenses" ON expenses
      FOR INSERT WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can view their own expenses" ON expenses
      FOR SELECT USING (auth.uid() = user_id);

    CREATE POLICY "Users can update their own expenses" ON expenses
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can delete their own expenses" ON expenses
      FOR DELETE USING (auth.uid() = user_id);

    -- Policies for Admins
    CREATE POLICY "Admins can view all expenses" ON expenses
      FOR SELECT USING (is_admin());

    CREATE POLICY "Admins can update any expense" ON expenses
      FOR UPDATE USING (is_admin()) WITH CHECK (is_admin()); -- Admins can update any record

    CREATE POLICY "Admins can delete any expense" ON expenses
      FOR DELETE USING (is_admin());


    -- RLS Policies for 'expense_items' table
    ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies (if any) - Be cautious in production
    DROP POLICY IF EXISTS "Users can manage items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Users can view items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Users can insert items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Users can update items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Users can delete items for their own expenses" ON expense_items;
    DROP POLICY IF EXISTS "Admins have full access to items" ON expense_items; -- Example name

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

    -- Policies for Admins
    CREATE POLICY "Admins can view all expense items" ON expense_items
      FOR SELECT USING (is_admin());

    CREATE POLICY "Admins can update any expense item" ON expense_items
      FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

    CREATE POLICY "Admins can delete any expense item" ON expense_items
      FOR DELETE USING (is_admin());
