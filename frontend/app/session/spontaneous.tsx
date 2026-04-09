import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '@/stores/sessionStore';
import { CheckInButton } from '@/components/CheckInButton';
import { VoiceRecorderButton } from '@/components/VoiceRecorderButton';
import type { SpontaneousStop } from '@/types/journey';
import { Colors } from '@/constants/theme';

function StopRow({ stop, index, isLast }: { stop: SpontaneousStop; index: number; isLast: boolean }) {
  const isDone = stop.checked_in_at !== null;
  return (
    <View style={styles.stopRow}>
      <View style={styles.stopLeft}>
        <View style={[styles.stopDot, isDone && styles.stopDotDone]} />
        {!isLast && <View style={styles.stopLine} />}
      </View>
      <View style={[styles.stopCard, isDone && styles.stopCardDone]}>
        <Text style={[styles.stopTitle, isDone && styles.stopTitleDone]}>{stop.title}</Text>
        {stop.description ? (
          <Text style={styles.stopDesc} numberOfLines={2}>{stop.description}</Text>
        ) : null}
        {stop.location?.label ? (
          <View style={styles.stopLocation}>
            <Ionicons name="location-outline" size={12} color="#999" />
            <Text style={styles.stopLocationText}>{stop.location.label}</Text>
          </View>
        ) : null}
        {isDone && stop.checked_in_at ? (
          <Text style={styles.checkedInText}>
            ✓ Checked in {new Date(stop.checked_in_at).toLocaleTimeString()}
          </Text>
        ) : (
          <Text style={styles.pendingText}>Pending check-in</Text>
        )}
      </View>
    </View>
  );
}

export default function SpontaneousScreen() {
  const router = useRouter();
  const {
    spontaneousSession,
    loading,
    error,
    fetchSpontaneousSession,
    startSpontaneousSession,
    addSpontaneousStop,
    completeSpontaneousStop,
    endSpontaneousSession,
    clearSpontaneousSession,
  } = useSessionStore();

  const [showStartModal, setShowStartModal] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [starting, setStarting] = useState(false);

  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [stopTitle, setStopTitle] = useState('');
  const [stopDesc, setStopDesc] = useState('');
  const [addingStop, setAddingStop] = useState(false);

  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceNoteStopId, setVoiceNoteStopId] = useState<string | null>(null);

  const [checkingIn, setCheckingIn] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    fetchSpontaneousSession();
  }, []);

  const handleStart = async () => {
    if (!sessionTitle.trim()) {
      Alert.alert('Title Required', 'Give your spontaneous adventure a name.');
      return;
    }
    setStarting(true);
    try {
      await startSpontaneousSession(sessionTitle.trim());
      setShowStartModal(false);
      setSessionTitle('');
    } catch {
      // Error handled in store
    } finally {
      setStarting(false);
    }
  };

  const handleAddStop = async () => {
    if (!stopTitle.trim() || !spontaneousSession) return;
    setAddingStop(true);
    try {
      await addSpontaneousStop(spontaneousSession.id, {
        title: stopTitle.trim(),
        description: stopDesc.trim() || undefined,
      });
      setShowAddStopModal(false);
      setStopTitle('');
      setStopDesc('');
    } catch {
      // Error handled in store
    } finally {
      setAddingStop(false);
    }
  };

  const handleCheckIn = async (stop: SpontaneousStop) => {
    if (!spontaneousSession) return;
    setCheckingIn(true);
    try {
      await completeSpontaneousStop(spontaneousSession.id, stop.id);
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
    if (!uri || !voiceNoteStopId || !spontaneousSession) return;
    try {
      // Upload voice note via the same attach mechanism
      await useSessionStore.getState().attachVoiceNote?.(
        (spontaneousSession as unknown as { id: string }).id,
        voiceNoteStopId,
        uri
      );
      setShowVoiceRecorder(false);
      setVoiceNoteStopId(null);
    } catch {
      // Error handled in store
    }
  };

  const handleEnd = () => {
    if (!spontaneousSession) return;
    Alert.alert('End Adventure?', 'Your stops will be saved. Are you sure?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          setEnding(true);
          try {
            await endSpontaneousSession(spontaneousSession.id);
            clearSpontaneousSession();
            router.replace('/(tabs)');
          } catch {
            setEnding(false);
          }
        },
      },
    ]);
  };

  // ── Loading / Error ────────────────────────────────────────────────────
  if (loading && !spontaneousSession) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (error && !spontaneousSession) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={48} color="#E07A5F" />
        <Text style={styles.errorText}>{error}</Text>
        <CheckInButton onPress={() => router.back()} variant="secondary" label="Go Back" />
      </View>
    );
  }

  // ── No active session — show start button ───────────────────────────────
  if (!spontaneousSession) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
            <Ionicons name="arrow-back" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Spontaneous Mode</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="compass" size={80} color={Colors.light.tint + '60'} />
          <Text style={styles.emptyTitle}>Go Off the Beaten Path</Text>
          <Text style={styles.emptyText}>
            Start a freeform adventure — no plan, no stops pre-defined.{'\n'}
            Add stops as you explore and check in on the fly.
          </Text>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => setShowStartModal(true)}
            testID="start-spontaneous-btn"
          >
            <Ionicons name="rocket" size={20} color="#fff" />
            <Text style={styles.startButtonText}>Start Adventure</Text>
          </TouchableOpacity>
        </View>

        {/* Start Modal */}
        <Modal visible={showStartModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Name Your Adventure</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Copenhagen random walk"
                placeholderTextColor="#999"
                value={sessionTitle}
                onChangeText={setSessionTitle}
                testID="spontaneous-title-input"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setShowStartModal(false); setSessionTitle(''); }}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, starting && styles.btnDisabled]}
                  onPress={handleStart}
                  disabled={starting}
                  testID="confirm-start-spontaneous-btn"
                >
                  {starting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Start</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // ── Active session ──────────────────────────────────────────────────────
  const stops: SpontaneousStop[] = spontaneousSession.stops ?? [];
  const uncheckedStops = stops.filter((s) => s.checked_in_at === null);
  const nextStop = uncheckedStops[0];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {spontaneousSession.title}
          </Text>
          <Text style={styles.headerSubtitle}>
            {stops.filter((s) => s.checked_in_at).length}/{stops.length} stops
          </Text>
        </View>
        <TouchableOpacity onPress={handleEnd} disabled={ending}>
          <Ionicons name="close-circle-outline" size={26} color={ending ? '#ccc' : '#E07A5F'} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {stops.length === 0 ? (
          <View style={styles.noStopsContainer}>
            <Ionicons name="location-outline" size={48} color="#ccc" />
            <Text style={styles.noStopsText}>No stops yet — add your first one!</Text>
          </View>
        ) : (
          stops.map((stop, i) => (
            <StopRow key={stop.id} stop={stop} index={i} isLast={i === stops.length - 1} />
          ))
        )}

        {/* Voice Recorder Panel */}
        {showVoiceRecorder && voiceNoteStopId && (
          <View style={styles.voiceRecorderPanel}>
            <View style={styles.voiceRecorderHeader}>
              <Ionicons name="mic" size={16} color={Colors.light.tint} />
              <Text style={styles.voiceRecorderTitle}>Voice Note</Text>
              <TouchableOpacity
                onPress={() => { setShowVoiceRecorder(false); setVoiceNoteStopId(null); }}
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
      <View style={styles.ctaContainer}>
        {nextStop ? (
          <>
            <View style={styles.nextStopBanner}>
              <Ionicons name="flag" size={16} color={Colors.light.tint} />
              <Text style={styles.nextStopText} numberOfLines={1}>
                Next: {nextStop.title}
              </Text>
            </View>
            <CheckInButton
              onPress={() => handleCheckIn(nextStop)}
              loading={checkingIn || loading}
              disabled={checkingIn || loading}
              label={`Check In: ${nextStop.title}`}
            />
          </>
        ) : stops.length > 0 ? (
          <View style={styles.allDoneContainer}>
            <Text style={styles.allDoneText}>🎉 All stops visited!</Text>
            <CheckInButton onPress={handleEnd} variant="secondary" label="Finish Adventure" loading={ending} />
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.addStopBtn}
          onPress={() => setShowAddStopModal(true)}
          testID="add-stop-btn"
        >
          <Ionicons name="add-circle" size={20} color={Colors.light.tint} />
          <Text style={styles.addStopText}>Add Stop</Text>
        </TouchableOpacity>
      </View>

      {/* Add Stop Modal */}
      <Modal visible={showAddStopModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a Stop</Text>
            <TextInput
              style={styles.input}
              placeholder="Stop name (e.g. Nyhavn canal)"
              placeholderTextColor="#999"
              value={stopTitle}
              onChangeText={setStopTitle}
              testID="stop-title-input"
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Notes (optional)"
              placeholderTextColor="#999"
              value={stopDesc}
              onChangeText={setStopDesc}
              multiline
              numberOfLines={3}
              testID="stop-desc-input"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowAddStopModal(false); setStopTitle(''); setStopDesc(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, addingStop && styles.btnDisabled]}
                onPress={handleAddStop}
                disabled={addingStop || !stopTitle.trim()}
                testID="confirm-add-stop-btn"
              >
                {addingStop ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: '#FAFAF8', padding: 24 },
  loadingText: { fontSize: 14, color: '#999', marginTop: 8 },
  errorText: { fontSize: 15, color: '#666', textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 12,
  },
  backArrow: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  headerSubtitle: { fontSize: 12, color: '#999', marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#111', textAlign: 'center' },
  emptyText: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  startButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 220 },
  noStopsContainer: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  noStopsText: { fontSize: 15, color: '#999', textAlign: 'center' },
  stopRow: { flexDirection: 'row', marginBottom: 0 },
  stopLeft: { alignItems: 'center', marginRight: 14 },
  stopDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#ddd', borderWidth: 2, borderColor: '#ccc', marginTop: 14 },
  stopDotDone: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  stopLine: { flex: 1, width: 2, backgroundColor: '#e0e0e0', marginVertical: 4 },
  stopCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#eee' },
  stopCardDone: { backgroundColor: '#f8fff8', borderColor: '#d0f0d0' },
  stopTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  stopTitleDone: { color: '#555' },
  stopDesc: { fontSize: 13, color: '#666', marginTop: 4, lineHeight: 18 },
  stopLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  stopLocationText: { fontSize: 12, color: '#999' },
  checkedInText: { fontSize: 12, color: Colors.light.tint, marginTop: 6, fontWeight: '600' },
  pendingText: { fontSize: 12, color: '#bbb', marginTop: 6 },
  voiceRecorderPanel: {
    marginTop: 8,
    padding: 12,
    backgroundColor: Colors.light.tint + '08',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.tint + '20',
  },
  voiceRecorderHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  voiceRecorderTitle: { fontSize: 14, fontWeight: '600', color: Colors.light.tint, flex: 1 },
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
    gap: 10,
  },
  nextStopBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  nextStopText: { fontSize: 13, color: '#666', flex: 1 },
  allDoneContainer: { alignItems: 'center', gap: 8 },
  allDoneText: { fontSize: 16, fontWeight: '700', color: Colors.light.tint },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.tint,
    borderRadius: 10,
    borderStyle: 'dashed',
  },
  addStopText: { fontSize: 14, fontWeight: '600', color: Colors.light.tint },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  input: { backgroundColor: '#f5f5f3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e0e0e0' },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  cancelBtnText: { fontSize: 14, color: '#666', fontWeight: '600' },
  confirmBtn: { backgroundColor: Colors.light.tint, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  confirmBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
