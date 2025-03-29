/*
  # Add email to user_roles table

  This migration adds the email address of the user to the `user_roles` table.

  1. Modified Tables
    - `user_roles`: Added `email` column.

  2. Changes
    - Added `email` column to `user_roles` table to store the user's email address.
    - Updated the `handle_new_user` function to populate the email address when a new user is created.

  3. Security
    - No direct security implications, but the email address is considered personal data and should be handled accordingly.

  4. Notes
    - This migration assumes the `user_roles` table already exists.
*/

-- Add email column to user_roles table
ALTER TABLE IF EXISTS user_roles ADD COLUMN email TEXT;

COMMENT ON COLUMN user_roles.email IS 'User email address';

-- Update handle_new_user function to populate email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, email)
  VALUES (new.id, 0, new.email);
  RETURN new;
END;
$$;

-- Update the trigger to use the new handle_new_user function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
