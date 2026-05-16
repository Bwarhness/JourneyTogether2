import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Storage adapter for React Native
const storage = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('AsyncStorage error:', error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('AsyncStorage error:', error);
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('AsyncStorage error:', error);
    }
  },
};

let supabase: SupabaseClient<Database> | null = null;

/**
 * Get or create Supabase client instance
 * Uses AsyncStorage for session persistence
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabase;
}

/**
 * Initialize Supabase client (call this in app _layout.tsx)
 */
export async function initializeSupabase(): Promise<SupabaseClient<Database>> {
  const client = getSupabaseClient();
  
  // Restore session on app start
  const { data: { session } } = await client.auth.getSession();
  
  if (session) {
    console.log('[Supabase] Session restored for user:', session.user.id);
  } else {
    console.log('[Supabase] No active session');
  }
  
  return client;
}

export { storage };
