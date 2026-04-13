
-- Drop all existing permissive policies on zoom_transcripts
DROP POLICY IF EXISTS "Anyone can read transcripts" ON public.zoom_transcripts;
DROP POLICY IF EXISTS "Allow insert for service role" ON public.zoom_transcripts;
DROP POLICY IF EXISTS "Allow update for anyone" ON public.zoom_transcripts;
DROP POLICY IF EXISTS "Anyone can delete transcripts" ON public.zoom_transcripts;

-- Recreate with auth-scoped policies
CREATE POLICY "Authenticated users can read transcripts" ON public.zoom_transcripts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can insert transcripts" ON public.zoom_transcripts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update transcripts" ON public.zoom_transcripts
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete transcripts" ON public.zoom_transcripts
  FOR DELETE TO authenticated USING (true);

-- Drop all existing permissive policies on generated_content
DROP POLICY IF EXISTS "Anyone can read generated content" ON public.generated_content;
DROP POLICY IF EXISTS "Anyone can insert generated content" ON public.generated_content;
DROP POLICY IF EXISTS "Anyone can update generated content" ON public.generated_content;
DROP POLICY IF EXISTS "Anyone can delete generated content" ON public.generated_content;

-- Recreate with auth-scoped policies
CREATE POLICY "Authenticated users can read generated content" ON public.generated_content
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert generated content" ON public.generated_content
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update generated content" ON public.generated_content
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete generated content" ON public.generated_content
  FOR DELETE TO authenticated USING (true);

-- Drop all existing permissive policies on knowledgebase
DROP POLICY IF EXISTS "Anyone can read knowledgebase" ON public.knowledgebase;
DROP POLICY IF EXISTS "Anyone can insert knowledgebase" ON public.knowledgebase;
DROP POLICY IF EXISTS "Anyone can update knowledgebase" ON public.knowledgebase;
DROP POLICY IF EXISTS "Anyone can delete knowledgebase" ON public.knowledgebase;

-- Recreate: public read, authenticated write
CREATE POLICY "Anyone can read knowledgebase" ON public.knowledgebase
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert knowledgebase" ON public.knowledgebase
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update knowledgebase" ON public.knowledgebase
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete knowledgebase" ON public.knowledgebase
  FOR DELETE TO authenticated USING (true);

-- Storage policies for carolyn-photos bucket
CREATE POLICY "Authenticated upload only" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'carolyn-photos');
CREATE POLICY "Authenticated delete only" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'carolyn-photos');
