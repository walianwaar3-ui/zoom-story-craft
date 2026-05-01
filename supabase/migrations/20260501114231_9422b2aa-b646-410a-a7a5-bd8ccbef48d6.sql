
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature TEXT NOT NULL,
  label TEXT,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_id UUID,
  transcript_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_created_at ON public.activity_log (created_at DESC);
CREATE INDEX idx_activity_log_feature ON public.activity_log (feature);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on activity_log" ON public.activity_log FOR SELECT USING (true);
CREATE POLICY "Allow all insert on activity_log" ON public.activity_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all update on activity_log" ON public.activity_log FOR UPDATE USING (true);
CREATE POLICY "Allow all delete on activity_log" ON public.activity_log FOR DELETE USING (true);
