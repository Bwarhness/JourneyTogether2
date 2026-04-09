import { Tabs } from 'expo-router';
import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '../../src/stores/authStore';

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

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuthStore();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        headerStyle: {
          backgroundColor: colorScheme === 'dark' ? Colors.dark.background : Colors.light.background,
        },
        headerTintColor: colorScheme === 'dark' ? Colors.dark.text : Colors.light.text,
        headerRight: () => user ? <LogoutButton /> : null,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />
    </Tabs>
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
