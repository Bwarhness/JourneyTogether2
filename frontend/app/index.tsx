import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Link, router } from 'expo-router';

import { useAuthStore } from '../src/stores/authStore';
import { Colors } from '../constants/theme';

export default function HomeScreen() {
  const { user, isInitialized, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isInitialized || isLoading) return;

    if (user) {
      // User is logged in, redirect to tabs
      router.replace('/(tabs)');
    }
  }, [user, isInitialized, isLoading, router]);

  if (!isInitialized || isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Show landing page for unauthenticated users
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>JourneyTogether</Text>
        <Text style={styles.subtitle}>Your adventures await</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Link href="/auth/login" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Log In</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/auth/register" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Sign Up</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    padding: 24,
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.dark.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: Colors.dark.icon,
  },
  buttonContainer: {
    gap: 16,
  },
  primaryButton: {
    backgroundColor: Colors.dark.tint,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.tint,
  },
  secondaryButtonText: {
    color: Colors.dark.tint,
    fontSize: 18,
    fontWeight: '600',
  },
});
