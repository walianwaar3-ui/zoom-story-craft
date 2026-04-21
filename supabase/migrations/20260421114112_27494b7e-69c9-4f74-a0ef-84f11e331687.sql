ALTER TABLE public.generated_content
ADD COLUMN IF NOT EXISTS regenerated_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_diagnostic text;