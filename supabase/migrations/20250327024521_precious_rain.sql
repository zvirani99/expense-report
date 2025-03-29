/*
  # Fix Storage Policies for Receipts Bucket

  1. Changes
    - Update storage policies to enforce user-specific paths
    - Ensure users can only access their own receipts
    - Add proper path-based security checks

  2. Security
    - Enable proper RLS on storage bucket
    - Add policies for CRUD operations with user-specific paths
    - Ensure users can only access their own files
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own receipts" ON storage.objects;

-- Create new policies with proper path checks
CREATE POLICY "Allow users to upload receipts to their directory"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Allow users to read their own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Allow users to update their own receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Allow users to delete their own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
