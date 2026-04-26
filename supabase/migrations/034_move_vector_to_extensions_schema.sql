-- Move vector extension out of public schema into extensions.
-- Safe on Supabase: extensions schema is in the default search_path,
-- so existing vector columns and IVFFlat indexes resolve without changes.
ALTER EXTENSION vector SET SCHEMA extensions;
