
CREATE POLICY "Allow public uploads to carolyn-photos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'carolyn-photos');

CREATE POLICY "Allow public updates to carolyn-photos"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'carolyn-photos');
