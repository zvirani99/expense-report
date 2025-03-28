/*
  # Add description field to expense items

  1. Changes
    - Add a `description` column to the `expense_items` table to allow users to provide details, especially for the 'Other' category.
      - `description` (text, nullable)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_items' AND column_name = 'description'
  ) THEN
    ALTER TABLE expense_items ADD COLUMN description text;
  END IF;
END $$;