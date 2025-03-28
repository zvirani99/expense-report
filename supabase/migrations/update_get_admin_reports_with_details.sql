/*
  # Update get_admin_reports_with_details Function to Use user_roles.email

  This migration modifies the `get_admin_reports_with_details` function to retrieve the user's email from the `user_roles` table instead of the `auth.users` table.

  1. Modified Functions
    - `get_admin_reports_with_details`: Updated to join with `user_roles` and retrieve email from there.

  2. Changes
    - The function now joins with the `user_roles` table to get the email.
    - The `LEFT JOIN` with `auth.users` is removed.

  3. Notes
    - This migration assumes the `user_roles` table already exists and contains the email addresses.
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
    ur.email AS user_email
  FROM
    expenses e
  LEFT JOIN
    expense_items ei ON e.id = ei.expense_id
  LEFT JOIN
    user_roles ur ON e.user_id = ur.user_id
  WHERE
    is_admin() -- Explicitly check if the user is an admin
  GROUP BY
    e.id, e.created_at, e.total_amount, e.status, e.user_id, ur.email
  ORDER BY
    e.created_at DESC;
$$;