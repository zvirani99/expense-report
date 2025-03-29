/*
  # Create Expenses Schema

  1. New Tables
    - `expenses`
      - `id` (uuid, primary key)
      - `created_at` (timestamp)
      - `user_id` (uuid, references auth.users)
      - `status` (text)
      - `total_amount` (numeric)
    
    - `expense_items`
      - `id` (uuid, primary key)
      - `expense_id` (uuid, references expenses)
      - `date` (date)
      - `amount` (numeric)
      - `category` (text)
      - `receipt_url` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users
*/

CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users NOT NULL,
  status text DEFAULT 'draft',
  total_amount numeric DEFAULT 0
);

CREATE TABLE expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid REFERENCES expenses ON DELETE CASCADE,
  date date NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  receipt_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own expenses"
  ON expenses
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own expense items"
  ON expense_items
  FOR ALL
  TO authenticated
  USING (
    expense_id IN (
      SELECT id FROM expenses WHERE user_id = auth.uid()
    )
  );
