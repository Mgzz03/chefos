import { createClient } from '@supabase/supabase-js'

// In the local desktop build there is no cloud login — the license key is the
// gate — so we never create a Supabase client and never require its env vars.
const LOCAL = import.meta.env.VITE_LOCAL_MODE === 'true'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!LOCAL && (!SUPABASE_URL || !SUPABASE_ANON_KEY)) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = LOCAL
    ? null
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    })
