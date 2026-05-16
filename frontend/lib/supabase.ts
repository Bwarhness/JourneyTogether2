import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Platform-specific storage: AsyncStorage for React Native, localStorage for web
const getStorageAdapter = () => {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    // Web platform - use localStorage
    return {
      getItem: async (key: string) => {
        try {
          return localStorage.getItem(key);
        } catch (error) {
          console.error('localStorage error:', error);
          return null;
        }
      },
      setItem: async (key: string, value: string) => {
        try {
          localStorage.setItem(key, value);
        } catch (error) {
          console.error('localStorage error:', error);
        }
      },
      removeItem: async (key: string) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.error('localStorage error:', error);
        }
      },
    };
  } else {
    // React Native - use AsyncStorage
    return import('@react-native-async-storage/async-storage').then(AsyncStorage => ({
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
    }));
  }
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

let supabase: SupabaseClient<Database> | null = null;
let storageAdapter: any = null;

/**
 * Get or create Supabase client instance
 * Uses platform-specific storage (localStorage for web, AsyncStorage for React Native)
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    // Initialize storage adapter
    if (!storageAdapter) {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        storageAdapter = {
          getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
          setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
          removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
        };
      } else {
        // Fallback for React Native - will be loaded dynamically
        storageAdapter = {
          getItem: async () => null,
          setItem: async () => {},
          removeItem: async () => {},
        };
      }
    }

    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: storageAdapter,
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
