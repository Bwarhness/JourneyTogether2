import { Stack } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useEffect } from 'react';

export default function AuthLayout() {
  const { loadToken, isInitialized } = useAuthStore();

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="login"
        options={{
          title: 'Log In',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          title: 'Sign Up',
          headerShown: false,
        }}
      />
    </Stack>
  );
}
