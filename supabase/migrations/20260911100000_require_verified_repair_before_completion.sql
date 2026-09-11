ALTER TABLE public.complaints
  ADD COLUMN repair_verification_status text
  CHECK (repair_verification_status IN ('verified', 'needs_reinspection'));

CREATE OR REPLACE FUNCTION public.require_verified_repair_before_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF NEW.repair_verification_status <> 'verified'
      OR NOT EXISTS (
        SELECT 1
        FROM public.complaint_images
        WHERE complaint_id = NEW.id
          AND kind = 'after'
      ) THEN
      RAISE EXCEPTION 'A completed complaint requires verified repair status and after-repair evidence';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER complaints_require_verified_repair
  BEFORE UPDATE OF status, repair_verification_status ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.require_verified_repair_before_completion();