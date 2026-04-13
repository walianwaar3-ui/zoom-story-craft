
-- Drop authenticated-only policies and recreate as public (anon + authenticated)

-- zoom_transcripts
DROP POLICY IF EXISTS "Authenticated users can read transcripts" ON public.zoom_transcripts;
DROP POLICY IF EXISTS "Authenticated users can update transcripts" ON public.zoom_transcripts;
DROP POLICY IF EXISTS "Authenticated users can delete transcripts" ON public.zoom_transcripts;
DROP POLICY IF EXISTS "Service role can insert transcripts" ON public.zoom_transcripts;

CREATE POLICY "Allow all select on transcripts" ON public.zoom_transcripts FOR SELECT USING (true);
CREATE POLICY "Allow all insert on transcripts" ON public.zoom_transcripts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on transcripts" ON public.zoom_transcripts FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on transcripts" ON public.zoom_transcripts FOR DELETE USING (true);

-- generated_content
DROP POLICY IF EXISTS "Authenticated users can read generated content" ON public.generated_content;
DROP POLICY IF EXISTS "Authenticated users can insert generated content" ON public.generated_content;
DROP POLICY IF EXISTS "Authenticated users can update generated content" ON public.generated_content;
DROP POLICY IF EXISTS "Authenticated users can delete generated content" ON public.generated_content;

CREATE POLICY "Allow all select on generated_content" ON public.generated_content FOR SELECT USING (true);
CREATE POLICY "Allow all insert on generated_content" ON public.generated_content FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on generated_content" ON public.generated_content FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on generated_content" ON public.generated_content FOR DELETE USING (true);

-- knowledgebase
DROP POLICY IF EXISTS "Anyone can read knowledgebase" ON public.knowledgebase;
DROP POLICY IF EXISTS "Authenticated users can insert knowledgebase" ON public.knowledgebase;
DROP POLICY IF EXISTS "Authenticated users can update knowledgebase" ON public.knowledgebase;
DROP POLICY IF EXISTS "Authenticated users can delete knowledgebase" ON public.knowledgebase;

CREATE POLICY "Allow all select on knowledgebase" ON public.knowledgebase FOR SELECT USING (true);
CREATE POLICY "Allow all insert on knowledgebase" ON public.knowledgebase FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on knowledgebase" ON public.knowledgebase FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on knowledgebase" ON public.knowledgebase FOR DELETE USING (true);

-- Storage: drop authenticated-only policies, allow public access
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;

CREATE POLICY "Allow all uploads to carolyn-photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'carolyn-photos');
CREATE POLICY "Allow all deletes from carolyn-photos" ON storage.objects FOR DELETE USING (bucket_id = 'carolyn-photos');
