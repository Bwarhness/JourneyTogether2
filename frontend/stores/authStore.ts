import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signIn, signUp, signOut, getUser, getProfile } from '../api/supabaseClient';

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const { user, session } = await signIn(email, password);
          
          if (!user || !session) {
            throw new Error('Login failed');
          }

          // Get profile
          const profile = await getProfile(user.id);
          
          set({ 
            user: {
              id: profile.id,
              email: profile.email,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
              role: profile.role,
            },
            isLoading: false 
          });
        } catch (error: unknown) {
          const errorMessage = 
            error instanceof Error 
              ? error.message 
              : 'Login failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const { user, session } = await signUp(email, password, username);
          
          if (!user) {
            throw new Error('Registration failed');
          }

          set({ 
            user: {
              id: user.id,
              email: user.email || email,
              display_name: username,
            },
            isLoading: false 
          });
        } catch (error: unknown) {
          const errorMessage = 
            error instanceof Error 
              ? error.message 
              : 'Registration failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      logout: async () => {
        try {
          await signOut();
        } catch {
          // Ignore errors
        }
        set({ user: null, error: null });
      },

      loadUser: async () => {
        if (get().isInitialized) return;
        
        set({ isLoading: true });
        try {
          const user = await getUser();
          if (user) {
            const profile = await getProfile(user.id);
            set({ 
              user: {
                id: profile.id,
                email: profile.email,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
                role: profile.role,
              },
              isLoading: false,
              isInitialized: true 
            });
          } else {
            set({ isLoading: false, isInitialized: true });
          }
        } catch {
          // Not logged in
          set({ user: null, isLoading: false, isInitialized: true });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        user: state.user,
      }),
    }
  )
);

// Selector hooks for convenience
export const useUser = () => useAuthStore((state) => state.user);
export const useIsLoggedIn = () => useAuthStore((state) => !!state.user);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
