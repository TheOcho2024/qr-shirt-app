// Server-side Supabase client. Uses the service-role key — NEVER import this
// into browser code.
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
);

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'prints';
