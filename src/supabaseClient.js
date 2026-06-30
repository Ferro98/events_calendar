// src/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Mancano le variabili d'ambiente di Supabase nel file .env.local!")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)