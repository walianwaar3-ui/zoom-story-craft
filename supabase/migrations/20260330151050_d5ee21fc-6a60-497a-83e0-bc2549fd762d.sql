CREATE TABLE public.knowledgebase (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledgebase ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read knowledgebase" ON public.knowledgebase FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert knowledgebase" ON public.knowledgebase FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update knowledgebase" ON public.knowledgebase FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete knowledgebase" ON public.knowledgebase FOR DELETE TO public USING (true);