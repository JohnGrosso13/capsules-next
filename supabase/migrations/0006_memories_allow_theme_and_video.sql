-- 0006_memories_allow_theme_and_video.sql: restore theme entries after vector upgrade
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'memories'
  ) THEN
    BEGIN
      ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_kind_check;
      ALTER TABLE public.memories
        ADD CONSTRAINT memories_kind_check
        CHECK (kind IN ('upload', 'generated', 'post', 'video', 'theme'));
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;
  END IF;
END;
$$;
