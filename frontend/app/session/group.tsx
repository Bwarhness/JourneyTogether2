import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGroupSessionStore } from '@/stores/groupSessionStore';
import { StopCard } from '@/components/StopCard';
import { CheckInButton } from '@/components/CheckInButton';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { SessionStop, Participant, WSEvent } from '@/types/journey';
import { Colors } from '@/constants/theme';

function ProgressBar({ current, total }: { current: number; total: number }) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {current} / {total} stops
      </Text>
    </View>
  );
}

function ParticipantRow({ participant, isYou }: { participant: Participant; isYou: boolean }) {
  const statusIcon =
    participant.status === 'checked_in'
      ? 'checkmark-circle'
      : participant.status === 'joined'
      ? 'person'
      : 'close-circle';
  const statusColor =
    participant.status === 'checked_in'
      ? Colors.light.tint
      : participant.status === 'joined'
      ? '#F4A261'
      : '#999';

  return (
    <View style={styles.participantRow}>
      <View style={styles.participantInfo}>
        <Ionicons name={statusIcon as keyof typeof Ionicons.glyphMap} size={18} color={statusColor} />
        <Text style={styles.participantName}>
          {participant.username} {isYou ? '(you)' : ''}
        </Text>
      </View>
      <Text style={styles.participantStop}>
        Stop {participant.current_stop_index + 1}
      </Text>
    </View>
  );
}

export default function GroupSessionScreen() {
  const router = useRouter();
  const {
    groupSession,
    loading,
    error,
    fetchGroupSession,
    startGroupSession,
    completeGroupStop,
    endGroupSession,
    leaveGroupSession,
    updateParticipants,
    updateParticipant,
    removeParticipant,
    clearGroupSession,
  } = useGroupSessionStore();

  const [checkingIn, setCheckingIn] = useState(false);
  const [ending, setEnding] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get sessionId from route params
  const sessionId = groupSession?.id;

  const handleWSEvent = (event: WSEvent) => {
    switch (event.type) {
      case 'participant_joined': {
        const p = event.payload.participant as Participant;
        const exists = groupSession?.participants.some((x) => x.id === p.id);
        if (!exists) {
          updateParticipants([...(groupSession?.participants ?? []), p]);
        }
        break;
      }
      case 'participant_left': {
        const pid = event.payload.participant_id as string;
        removeParticipant(pid);
        break;
      }
      case 'stop_completed': {
        const p = event.payload.participant as Participant;
        updateParticipant(p);
        break;
      }
      case 'session_started':
      case 'session_ended':
        // Refetch full state
        if (sessionId) fetchGroupSession(sessionId);
        break;
    }
  };

  useWebSocket({
    sessionId: sessionId ?? '',
    onEvent: handleWSEvent,
    onConnect: () => {},
    onDisconnect: () => {},
  });

  useEffect(() => {
    if (!groupSession && sessionId) {
      fetchGroupSession(sessionId);
    }
  }, [sessionId]);

  if (loading && !groupSession) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading group session...</Text>
      </View>
    );
  }

  if (error && !groupSession) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={48} color="#E07A5F" />
        <Text style={styles.errorText}>{error}</Text>
        <CheckInButton onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  if (!groupSession) {
    return (
      <View style={styles.centered}>
        <Ionicons name="people-outline" size={64} color="#ccc" />
        <Text style={styles.noSessionTitle}>No Group Session</Text>
        <CheckInButton onPress={() => router.replace('/(tabs)')} variant="secondary" />
      </View>
    );
  }

  const { participants, journey, stops: sessionStops, status } = groupSession;
  const isWaiting = status === 'waiting';
  const isActive = status === 'active';

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Join my JourneyTogether group session! Use code: ${groupSession.invite_code}`,
      });
    } catch {
      // User cancelled
    }
  };

  const handleCopyCode = () => {
    // Clipboard would need expo-clipboard — use Share as fallback
    handleShareInvite();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartSession = async () => {
    try {
      await startGroupSession(groupSession.id);
    } catch {
      // Error handled in store
    }
  };

  const handleCheckIn = async () => {
    const currentStop = sessionStops[groupSession.current_stop_index];
    if (!currentStop) return;

    setCheckingIn(true);
    try {
      await completeGroupStop(groupSession.id, currentStop.id);
    } catch {
      // Error handled in store
    } finally {
      setCheckingIn(false);
    }
  };

  const handleLeave = () => {
    Alert.alert('Leave Session?', 'You can rejoin with the invite code.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroupSession();
            clearGroupSession();
            router.replace('/(tabs)');
          } catch {
            // Error handled in store
          }
        },
      },
    ]);
  };

  const handleEnd = () => {
    Alert.alert('End Session for Everyone?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End for All',
        style: 'destructive',
        onPress: async () => {
          setEnding(true);
          try {
            await endGroupSession(groupSession.id);
            clearGroupSession();
            router.replace('/(tabs)');
          } catch {
            setEnding(false);
          }
        },
      },
    ]);
  };

  const currentStopIndex = groupSession.current_stop_index;
  const allCheckedIn = sessionStops.every((s) => s.checked_in_at !== null);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.journeyTitle}>{journey?.title || 'Group Session'}</Text>
        <ProgressBar
          current={isActive ? currentStopIndex + 1 : 0}
          total={sessionStops.length}
        />
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {isWaiting ? '⏳ Waiting for host to start' : isActive ? '🏃 Active' : status}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Invite Code */}
        {isWaiting && (
          <View style={styles.inviteSection}>
            <Text style={styles.sectionTitle}>Invite Friends</Text>
            <View style={styles.inviteCodeBox}>
              <Text style={styles.inviteCode}>{groupSession.invite_code}</Text>
            </View>
            <View style={styles.inviteActions}>
              <CheckInButton
                onPress={handleCopyCode}
                variant="secondary"
                label={copied ? 'Copied!' : 'Copy Code'}
              />
              <CheckInButton onPress={handleShareInvite} variant="secondary" label="Share" />
            </View>
          </View>
        )}

        {/* Participants */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Participants ({participants.length})
          </Text>
          {participants.map((p) => (
            <ParticipantRow key={p.id} participant={p} isYou={false} />
          ))}
        </View>

        {/* Stops */}
        {isActive && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stops</Text>
            {sessionStops.map((stop, index) => {
              const isCurrentStop = index === currentStopIndex;
              const isCompleted = stop.checked_in_at !== null;
              return (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  isActive={isCurrentStop && !isCompleted}
                  isCompleted={isCompleted}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.ctaContainer}>
        {isWaiting && (
          <>
            <CheckInButton onPress={handleStartSession} loading={loading} label="Start Journey" />
            <CheckInButton onPress={handleLeave} variant="danger" label="Leave Session" />
          </>
        )}
        {isActive && !allCheckedIn && (
          <>
            <CheckInButton
              onPress={handleCheckIn}
              loading={checkingIn || loading}
              disabled={checkingIn || loading}
              label="Check In Here"
            />
            <CheckInButton onPress={handleLeave} variant="danger" label="Leave" />
          </>
        )}
        {isActive && allCheckedIn && (
          <CheckInButton onPress={handleEnd} variant="secondary" label="Finish" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#FAFAF8',
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  noSessionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  header: {
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 8,
  },
  journeyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
  progressContainer: {
    gap: 6,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.tint,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#999',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F0EE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 200,
    gap: 24,
  },
  inviteSection: {
    gap: 12,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  inviteCodeBox: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.light.tint,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  inviteCode: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    color: Colors.light.tint,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 12,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  participantStop: {
    fontSize: 12,
    color: '#999',
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 12,
  },
});
