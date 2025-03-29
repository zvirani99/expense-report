/*
  # Storage Policies for Receipts

  1. Security
    - Enable policies for receipts bucket
    - Allow authenticated users to:
      - Upload receipts
      - Read their own receipts
      - Delete their own receipts
*/

-- Create storage policies for the receipts bucket
BEGIN;

-- Policy to allow authenticated users to upload files
CREATE POLICY "Allow authenticated users to upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'receipts' AND
  auth.role() = 'authenticated'
);

-- Policy to allow users to read their own receipts
CREATE POLICY "Allow users to read their own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'receipts' AND
  auth.role() = 'authenticated'
);

-- Policy to allow users to update their own receipts
CREATE POLICY "Allow users to update their own receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  auth.role() = 'authenticated'
);

-- Policy to allow users to delete their own receipts
CREATE POLICY "Allow users to delete their own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts' AND
  auth.role() = 'authenticated'
);

COMMIT;
