import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createHandler } from "./handler.js";

Deno.serve(createHandler(() => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)));
