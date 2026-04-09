import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '@/stores/sessionStore';
import { useJourneyStore } from '@/stores/journeyStore';
import { StopCard } from '@/components/StopCard';
import { CheckInButton } from '@/components/CheckInButton';
import { VoiceRecorderButton } from '@/components/VoiceRecorderButton';
import type { SessionStop } from '@/types/journey';
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

export default function ActiveJourneyScreen() {
  const router = useRouter();
  const { activeSession, loading, error, fetchActiveSession, completeStop, endSession, clearSession } =
    useSessionStore();
  const { currentJourney } = useJourneyStore();

  const [checkingIn, setCheckingIn] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceNoteStopId, setVoiceNoteStopId] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveSession();
  }, []);

  // Use journey from store if available, otherwise from session
  const journey = currentJourney || activeSession?.journey;

  if (loading && !activeSession) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading your journey...</Text>
      </View>
    );
  }

  if (error && !activeSession) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={48} color="#E07A5F" />
        <Text style={styles.errorText}>{error}</Text>
        <CheckInButton onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  if (!activeSession) {
    return (
      <View style={styles.centered}>
        <Ionicons name="compass-outline" size={64} color="#ccc" />
        <Text style={styles.noSessionTitle}>No Active Journey</Text>
        <Text style={styles.noSessionText}>
          Start a journey from the Home screen to begin your adventure.
        </Text>
        <CheckInButton onPress={() => router.replace('/(tabs)')} variant="secondary" />
      </View>
    );
  }

  const stops: SessionStop[] = activeSession.stops ?? [];
  const currentIndex = activeSession.current_stop_index ?? 0;
  const allCheckedIn = stops.every((s) => s.checked_in_at !== null);

  const handleCheckIn = async () => {
    const currentStop = stops[currentIndex];
    if (!currentStop) return;

    setCheckingIn(true);
    try {
      await completeStop(activeSession.id, currentStop.id);
      // If this was the last stop, show completion
      if (currentIndex >= stops.length - 1) {
        Alert.alert(
          '🎉 Journey Complete!',
          `You've checked in at all ${stops.length} stops! Great job exploring.`,
          [
            {
              text: 'Finish',
              onPress: () => router.replace('/(tabs)'),
            },
          ]
        );
      }
    } catch {
      // Error handled in store
    } finally {
      setCheckingIn(false);
    }
  };

  const handleVoiceNotePress = (stopId: string) => {
    setVoiceNoteStopId(stopId);
    setShowVoiceRecorder(true);
  };

  const handleVoiceNoteComplete = async (uri: string) => {
    if (!uri || !voiceNoteStopId || !activeSession) return;
    try {
      await useSessionStore.getState().attachVoiceNote(activeSession.id, voiceNoteStopId, uri);
      setShowVoiceRecorder(false);
      setVoiceNoteStopId(null);
    } catch {
      // Error handled in store
    }
  };

  const handleEndEarly = () => {
    Alert.alert(
      'End Journey Early?',
      'You will lose your progress on unchecked stops. Are you sure?',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'End Journey',
          style: 'destructive',
          onPress: async () => {
            setEnding(true);
            try {
              await endSession(activeSession.id);
              clearSession();
              router.replace('/(tabs)');
            } catch {
              setEnding(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.journeyTitle}>{journey?.title || 'Active Journey'}</Text>
        <ProgressBar current={currentIndex + (stops[currentIndex]?.checked_in_at ? 1 : 0)} total={stops.length} />
      </View>

      {/* Stops List */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {stops.map((stop, index) => {
          const isActive = index === currentIndex && !stop.checked_in_at;
          const isCompleted = stop.checked_in_at !== null;
          return (
            <StopCard
              key={stop.id}
              stop={stop}
              isActive={isActive}
              isCompleted={isCompleted}
              onVoiceNotePress={() => handleVoiceNotePress(stop.id)}
              hasVoiceNote={!!stop.voice_note_url}
            />
          );
        })}

        {/* Voice Recorder Panel */}
        {showVoiceRecorder && voiceNoteStopId && (
          <View style={styles.voiceRecorderPanel}>
            <View style={styles.voiceRecorderHeader}>
              <Ionicons name="mic" size={16} color={Colors.light.tint} />
              <Text style={styles.voiceRecorderTitle}>Voice Note</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowVoiceRecorder(false);
                  setVoiceNoteStopId(null);
                }}
                testID="voice-recorder-close"
              >
                <Ionicons name="close" size={18} color="#999" />
              </TouchableOpacity>
            </View>
            <VoiceRecorderButton
              onRecordingComplete={handleVoiceNoteComplete}
              testID="voice-recorder-btn"
            />
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      {activeSession.status === 'active' && (
        <View style={styles.ctaContainer}>
          {!allCheckedIn ? (
            <CheckInButton
              onPress={handleCheckIn}
              loading={checkingIn || loading}
              disabled={checkingIn || loading}
            />
          ) : (
            <CheckInButton
              onPress={() => router.replace('/(tabs)')}
              variant="secondary"
              disabled={ending}
            />
          )}
          <CheckInButton
            onPress={handleEndEarly}
            variant="danger"
            disabled={ending || loading}
            loading={ending}
          />
        </View>
      )}
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
  noSessionText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    maxWidth: 260,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 180,
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
  voiceRecorderPanel: {
    marginTop: 8,
    padding: 12,
    backgroundColor: Colors.light.tint + '08',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.tint + '20',
  },
  voiceRecorderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  voiceRecorderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.tint,
    flex: 1,
  },
});
