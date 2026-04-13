import { createClient } from '@supabase/supabase-js'

const url = 'https://fpgojijkzkkhlfqfardn.supabase.co'
const key = 'sb_publishable_Mpf4slzcVyGWkQqNOeugFQ_a79k2iq5'

export const supabase = createClient(url, key)
