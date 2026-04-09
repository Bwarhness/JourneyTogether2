import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, TOKEN_KEY } from '../api/client';

export interface User {
  id: string;
  email: string;
  username: string;
  display_name?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
  updateProfile: (data: { display_name?: string; username?: string }) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isInitialized: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiClient.login(email, password);
          const { token, user } = data;
          
          // Store token
          await AsyncStorage.setItem(TOKEN_KEY, token);
          
          set({ 
            user: user || { id: data.user_id || data.id, email, username: data.username }, 
            token, 
            isLoading: false 
          });
        } catch (error: unknown) {
          const errorMessage = 
            error instanceof Error 
              ? error.message 
              : (error as { response?: { data?: { message?: string } } })?.response?.data?.message 
              || 'Login failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const data = await apiClient.register(email, username, password);
          const { token, user } = data;
          
          // Store token
          await AsyncStorage.setItem(TOKEN_KEY, token);
          
          set({ 
            user: user || { id: data.user_id || data.id, email, username }, 
            token, 
            isLoading: false 
          });
        } catch (error: unknown) {
          const errorMessage = 
            error instanceof Error 
              ? error.message 
              : (error as { response?: { data?: { message?: string } } })?.response?.data?.message 
              || 'Registration failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      logout: async () => {
        try {
          await AsyncStorage.removeItem(TOKEN_KEY);
        } catch {
          // Ignore storage errors
        }
        set({ user: null, token: null, error: null });
      },

      loadToken: async () => {
        if (get().isInitialized) return;
        
        set({ isLoading: true });
        try {
          const token = await AsyncStorage.getItem(TOKEN_KEY);
          if (token) {
            // Verify token is still valid by fetching user data
            const user = await apiClient.getMe();
            set({ token, user, isLoading: false, isInitialized: true });
          } else {
            set({ isLoading: false, isInitialized: true });
          }
        } catch {
          // Token invalid or expired
          await AsyncStorage.removeItem(TOKEN_KEY);
          set({ token: null, user: null, isLoading: false, isInitialized: true });
        }
      },

      updateProfile: async (data: { display_name?: string; username?: string }) => {
        set({ isLoading: true, error: null });
        try {
          const updatedUser = await apiClient.put<User>('/auth/me', data);
          set((state) => ({
            user: state.user ? { ...state.user, ...updatedUser } : updatedUser,
            isLoading: false,
          }));
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
              || 'Profile update failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        token: state.token,
        user: state.user,
      }),
    }
  )
);

// Selector hooks for convenience
export const useUser = () => useAuthStore((state) => state.user);
export const useIsLoggedIn = () => useAuthStore((state) => !!state.token);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
