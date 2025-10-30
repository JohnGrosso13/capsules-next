create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Fix pg_cron scheduling block with corrected dollar-quoting
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'capsule_history_refresh_6h') THEN
    PERFORM cron.schedule(
      'capsule_history_refresh_6h',
      '0 */6 * * *',
      $cronjob$ select public.run_capsule_history_refresh(24, 360); $cronjob$
    );
  END IF;
END
$$;

