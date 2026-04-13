import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { apiClient } from '../../src/api/client';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const { user, logout, updateProfile, isLoading } = useAuthStore();
  const { journeys, fetchUserJourneys } = useJourneyStore();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);

  useEffect(() => {
    if (user?.id) {
      fetchUserJourneys(user.id);
      apiClient.getUserProfile(user.id).then((profile) => {
        setCompletionCount(profile.completion_count ?? 0);
      }).catch(() => {
        // Silently fail — stat is non-critical
      });
    }
  }, [user?.id]);

  const handleSave = useCallback(async () => {
    if (!displayName.trim() && !username.trim()) {
      Alert.alert('Error', 'Please enter a display name or username.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim() || undefined,
        username: username.trim() || undefined,
      });
      setEditing(false);
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  }, [displayName, username, updateProfile]);

  const handleLogout = useCallback(async () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/auth/login');
        },
      },
    ]);
  }, [logout, router]);

  const journeyCount = journeys.length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#111' : '#FAFAF8' }]}
      contentContainerStyle={styles.content}
    >
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
          <Text style={styles.avatarText}>
            {getInitials(displayName || username || user?.email || 'U')}
          </Text>
        </View>
        {!editing && (
          <TouchableOpacity
            style={[styles.editButton, { borderColor: colors.tint }]}
            onPress={() => setEditing(true)}
            data-testid="edit-profile-button"
          >
            <Ionicons name="pencil" size={16} color={colors.tint} />
            <Text style={[styles.editButtonText, { color: colors.tint }]}>Edit Profile</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* User Info */}
      {editing ? (
        <View style={styles.editForm}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colorScheme === 'dark' ? '#fff' : '#333' }]}>
              Display Name
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colorScheme === 'dark' ? '#222' : '#fff',
                  color: colorScheme === 'dark' ? '#fff' : '#333',
                  borderColor: colorScheme === 'dark' ? '#444' : '#ddd',
                },
              ]}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display Name"
              placeholderTextColor="#999"
              data-testid="display-name-input"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colorScheme === 'dark' ? '#fff' : '#333' }]}>
              Username
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colorScheme === 'dark' ? '#222' : '#fff',
                  color: colorScheme === 'dark' ? '#fff' : '#333',
                  borderColor: colorScheme === 'dark' ? '#444' : '#ddd',
                },
              ]}
              value={username}
              onChangeText={setUsername}
              placeholder="Username"
              placeholderTextColor="#999"
              data-testid="username-input"
            />
          </View>
          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: '#999' }]}
              onPress={() => {
                setEditing(false);
                setDisplayName(user?.display_name ?? '');
                setUsername(user?.username ?? '');
              }}
              data-testid="cancel-edit-button"
            >
              <Text style={[styles.cancelButtonText, { color: '#666' }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.tint }]}
              onPress={handleSave}
              disabled={saving}
              data-testid="save-profile-button"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.userInfo}>
          <Text style={[styles.displayName, { color: colorScheme === 'dark' ? '#fff' : '#222' }]}>
            {user?.display_name || user?.username || 'No name set'}
          </Text>
          <Text style={[styles.email, { color: colorScheme === 'dark' ? '#aaa' : '#777' }]}>
            {user?.email}
          </Text>
          <View style={[styles.usernameBadge, { backgroundColor: colorScheme === 'dark' ? '#222' : '#f0f0f0' }]}>
            <Text style={[styles.usernameText, { color: colorScheme === 'dark' ? '#ccc' : '#555' }]}>
              @{user?.username || 'no-username'}
            </Text>
          </View>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsSection}>
        <Text style={[styles.sectionTitle, { color: colorScheme === 'dark' ? '#fff' : '#222' }]}>
          Stats
        </Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff' }]}>
            <Ionicons name="map" size={24} color={colors.tint} />
            <Text style={[styles.statValue, { color: colorScheme === 'dark' ? '#fff' : '#222' }]}>
              {journeyCount}
            </Text>
            <Text style={[styles.statLabel, { color: colorScheme === 'dark' ? '#aaa' : '#777' }]}>
              Journeys Created
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff' }]}>
            <Ionicons name="navigate" size={24} color={colors.tint} />
            <Text style={[styles.statValue, { color: colorScheme === 'dark' ? '#fff' : '#222' }]}>
              {completionCount}
            </Text>
            <Text style={[styles.statLabel, { color: colorScheme === 'dark' ? '#aaa' : '#777' }]}>
              Sessions Completed
            </Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: '#E07A5F' }]}
          onPress={handleLogout}
          data-testid="logout-button"
        >
          <Ionicons name="log-out-outline" size={20} color="#E07A5F" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 40,
    gap: 28,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  userInfo: {
    alignItems: 'center',
    gap: 6,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
  },
  email: {
    fontSize: 14,
  },
  usernameBadge: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  usernameText: {
    fontSize: 13,
    fontWeight: '500',
  },
  editForm: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  statsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  actionsSection: {
    gap: 12,
    marginTop: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  logoutButtonText: {
    color: '#E07A5F',
    fontSize: 15,
    fontWeight: '600',
  },
});
