import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '../src/stores/authStore';
import { Colors } from '../constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Protected route names that require authentication
const PROTECTED_ROUTES = ['(tabs)', 'home'];

function LogoutButton() {
  const { logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace('/auth/login');
  };

  return (
    <TouchableOpacity
      onPress={handleLogout}
      data-testid="logout-button"
      style={styles.logoutButton}
    >
      <Text style={styles.logoutText}>Logout</Text>
    </TouchableOpacity>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { user, isInitialized, loadToken } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized) {
      loadToken();
    }
  }, [isInitialized, loadToken]);

  // Handle navigation based on auth state
  useEffect(() => {
    if (!isInitialized) return;

    const currentPath = segments.join('/');
    const isAuthRoute = segments[0] === 'auth';
    const isProtectedRoute = PROTECTED_ROUTES.some((route) => 
      currentPath.includes(route) || segments[0] === route.replace(/[()]/g, '')
    );

    // If user is not logged in and trying to access protected route
    if (!user && isProtectedRoute && !isAuthRoute) {
      router.replace('/auth/login');
      return;
    }

    // If user is logged in and trying to access auth routes
    if (user && isAuthRoute) {
      router.replace('/(tabs)');
      return;
    }

    // If user is not logged in and on root, go to login
    if (!user && (currentPath === '' || currentPath === '/')) {
      router.replace('/auth/login');
    }
  }, [user, isInitialized, segments, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colorScheme === 'dark' ? Colors.dark.background : Colors.light.background,
          },
          headerTintColor: colorScheme === 'dark' ? Colors.dark.text : Colors.light.text,
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="auth/register"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            title: 'Modal',
          }}
        />
        <Stack.Screen
          name="home"
          options={{
            title: 'Home',
            headerRight: () => user ? <LogoutButton /> : null,
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  logoutText: {
    color: Colors.dark.tint,
    fontSize: 14,
    fontWeight: '600',
  },
});
