import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Typed Supabase client - provides autocomplete and compile-time checks
export const supabase = createClient<Database>(supabaseUrl, supabaseKey)

// ===========================================
// TYPE HELPERS
// ===========================================

// Extract table types for easier use
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Common table types
export type HeartbeatProfile = Tables<'heartbeat_profiles'>
export type HeartbeatUser = Tables<'heartbeat_users'>
export type Heartbeat = Tables<'heartbeats'>
export type Photo = Tables<'photos'>
export type GemLibrary = Tables<'gem_library'>
export type GemDelivery = Tables<'gem_deliveries'>
export type HeartchimeBank = Tables<'heartchime_bank'>
export type NotificationQueue = Tables<'notification_queue'>
export type NotificationHistory = Tables<'notification_history'>
export type DeviceToken = Tables<'device_tokens'>

// Insert types
export type HeartbeatInsert = InsertTables<'heartbeats'>
export type PhotoInsert = InsertTables<'photos'>
export type NotificationQueueInsert = InsertTables<'notification_queue'>
export type NotificationHistoryInsert = InsertTables<'notification_history'>

// Fetch profile by ID
export async function getProfile(profileId: string): Promise<HeartbeatProfile | null> {
  const { data, error } = await supabase
    .from('heartbeat_profiles')
    .select('*')
    .eq('id', profileId)
    .single()

  if (error) {
    console.error('Error fetching profile:', error)
    return null
  }

  return data
}

// Update processing status
export async function updateProcessingStatus(
  profileId: string, 
  status: 'onboarding' | 'processing' | 'active' | 'paused',
  photoCount?: number
) {
  const updates: any = {
    status: status,
    updated_at: new Date().toISOString()
  }

  if (photoCount !== undefined) {
    updates.photo_count = photoCount
  }

  const { error } = await supabase
    .from('heartbeat_profiles')
    .update(updates)
    .eq('id', profileId)

  if (error) {
    console.error('Error updating profile:', error)
    throw error
  }
}
