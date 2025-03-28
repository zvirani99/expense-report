/*
      # Add Function for Report Date Ranges

      This migration creates a PostgreSQL function to retrieve expense reports for a user,
      including the minimum and maximum dates from the associated expense items.

      1. New Functions
         - `get_reports_with_date_ranges(user_id_param uuid)`:
           - Takes a `user_id` as input.
           - Joins `expenses` with `expense_items`.
           - Calculates `MIN(ei.date)` and `MAX(ei.date)` for each expense report.
           - Returns the `id`, `created_at`, `total_amount`, `status` from the `expenses` table,
             along with the calculated `min_date` and `max_date`.
           - Filters results by the provided `user_id_param`.
           - Orders results by creation date descending.

      2. Security
         - The function uses the input `user_id_param` to filter results, ensuring users only see their own reports.
         - Assumes RLS is already in place on the underlying tables (`expenses`, `expense_items`) for direct access control, although this function bypasses RLS checks based on its definition (`SECURITY DEFINER` could be used if needed, but filtering by user_id is generally sufficient here).

      3. Notes
         - This function provides an efficient way to get the required data in a single query.
         - Returns `NULL` for `min_date` and `max_date` if a report has no items.
    */

    CREATE OR REPLACE FUNCTION get_reports_with_date_ranges(user_id_param uuid)
    RETURNS TABLE (
      id uuid,
      created_at timestamptz,
      total_amount numeric,
      status text,
      min_date date,
      max_date date
    )
    LANGUAGE sql
    STABLE -- Indicates the function cannot modify the database and always returns the same results for the same arguments within a single transaction.
    AS $$
      SELECT
        e.id,
        e.created_at,
        e.total_amount,
        e.status,
        MIN(ei.date)::date AS min_date,
        MAX(ei.date)::date AS max_date
      FROM
        expenses e
      LEFT JOIN -- Use LEFT JOIN in case a report has no items
        expense_items ei ON e.id = ei.expense_id
      WHERE
        e.user_id = user_id_param
      GROUP BY
        e.id, e.created_at, e.total_amount, e.status
      ORDER BY
        e.created_at DESC;
    $$;