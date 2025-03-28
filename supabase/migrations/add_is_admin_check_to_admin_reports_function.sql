/*
  # Add is_admin() Check to get_admin_reports_with_details Function

  This migration adds an explicit `is_admin()` check within the `get_admin_reports_with_details` function.
  This ensures that only admins can access the function, even if RLS policies are misconfigured.

  1. Modified Functions
    - `get_admin_reports_with_details`: Added `is_admin()` check in the WHERE clause.

  2. Security Changes
    - Enforces admin access within the function itself, adding a layer of security.

  3. Notes
    - This change provides a more robust solution to the 403 error by ensuring the function itself enforces admin access.
*/

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
  WHERE
    is_admin() -- Explicitly check if the user is an admin
  GROUP BY
    e.id, e.created_at, e.total_amount, e.status, e.user_id, u.email
  ORDER BY
    e.created_at DESC;
$$;
