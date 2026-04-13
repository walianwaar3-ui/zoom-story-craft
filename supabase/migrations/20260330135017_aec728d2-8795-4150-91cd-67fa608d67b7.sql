-- Create zoom_transcripts table
CREATE TABLE public.zoom_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  meeting_topic TEXT NOT NULL,
  meeting_date TIMESTAMPTZ,
  summary TEXT,
  transcript TEXT,
  client_name TEXT,
  issues_discussed TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.zoom_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read transcripts"
  ON public.zoom_transcripts FOR SELECT
  USING (true);

CREATE POLICY "Allow insert for service role"
  ON public.zoom_transcripts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update for anyone"
  ON public.zoom_transcripts FOR UPDATE
  USING (true);

-- Create generated_content table for storing generated posts
CREATE TABLE public.generated_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transcript_id UUID REFERENCES public.zoom_transcripts(id) ON DELETE CASCADE,
  caption TEXT,
  image_url TEXT,
  image_prompt TEXT,
  aspect_ratio TEXT DEFAULT '1:1',
  status TEXT NOT NULL DEFAULT 'generating',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read generated content"
  ON public.generated_content FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert generated content"
  ON public.generated_content FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update generated content"
  ON public.generated_content FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete generated content"
  ON public.generated_content FOR DELETE
  USING (true);