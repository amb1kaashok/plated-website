// These are browser-safe Supabase connection values. Never put a secret or
// service-role key in this file.
const SUPABASE_URL = 'https://uqmbsstsehawfsfsgzdd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-kZE5e2wsJbylTp7hiMYIw_kBZ-6FjF';

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
