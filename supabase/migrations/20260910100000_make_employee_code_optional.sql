-- Employee codes are optional until a verified real code is available.
ALTER TABLE public.officers
  ALTER COLUMN employee_code DROP NOT NULL;
