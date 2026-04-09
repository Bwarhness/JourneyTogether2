import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJourneyStore } from '@/stores/journeyStore';
import { useAuthStore } from '@/stores/authStore';
import { apiClient } from '@/api/client';
import type { Stop, Reaction, ReactionEmoji } from '@/types/journey';
import { Colors } from '@/constants/theme';
import { ReactionBar } from '@/components/ReactionBar';

function StopItem({ stop, index }: { stop: Stop; index: number }) {
  return (
    <View style={styles.stopItem}>
      <View style={styles.stopNumber}>
        <Text style={styles.stopNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.stopContent}>
        <Text style={styles.stopTitle}>{stop.title}</Text>
        {stop.location?.label ? (
          <View style={styles.stopLocation}>
            <Ionicons name="location-outline" size={12} color="#999" />
            <Text style={styles.stopLocationText}>{stop.location.label}</Text>
          </View>
        ) : null}
        {stop.estimated_time > 0 && (
          <View style={styles.stopTime}>
            <Ionicons name="time-outline" size={12} color="#999" />
            <Text style={styles.stopTimeText}>~{stop.estimated_time} min</Text>
          </View>
        )}
        {stop.description ? (
          <Text style={styles.stopDescription} numberOfLines={2}>
            {stop.description}
          </Text>
        ) : null}
        {stop.tips && stop.tips.length > 0 && (
          <View style={styles.tipsRow}>
            <Ionicons name="bulb-outline" size={12} color="#E07A5F" />
            <Text style={styles.tipsText}>{stop.tips.length} tip{stop.tips.length !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function JourneyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentJourney, loading, error, fetchJourneyDetail, clearCurrentJourney, forkJourney, deleteJourney } =
    useJourneyStore();
  const { user } = useAuthStore();
  const [starting, setStarting] = useState(false);
  const [forking, setForking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionsLoading, setReactionsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchJourneyDetail(id);
    }
    return () => clearCurrentJourney();
  }, [id]);

  // Fetch reactions when journey loads
  useEffect(() => {
    if (!id) return;
    setReactionsLoading(true);
    apiClient.getReactions(id)
      .then((data) => setReactions(data.reactions as Reaction[]))
      .catch(() => { /* reactions are optional, ignore errors */ })
      .finally(() => setReactionsLoading(false));
  }, [id]);

  const handleReact = async (emoji: ReactionEmoji) => {
    if (!id) return;
    try {
      const data = await apiClient.addReaction(id, emoji);
      setReactions(data.reactions as Reaction[]);
    } catch (err) {
      // If removing an un-reacted emoji fails (e.g. 404), try to remove instead
      try {
        const data = await apiClient.removeReaction(id, emoji);
        setReactions(data.reactions as Reaction[]);
      } catch {
        // silent fail — reactions are non-critical
      }
    }
  };

  const handleStartSoloJourney = async () => {
    if (!currentJourney) return;

    setStarting(true);
    try {
      const session = await apiClient.startSoloSession(currentJourney.id);
      Alert.alert('Journey Started!', `Session ${session.id} created.`, [
        {
          text: 'OK',
          // Navigation to ActiveJourneyScreen would happen here in Sprint 3
        },
      ]);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to start journey. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setStarting(false);
    }
  };

  const handleFork = async () => {
    if (!currentJourney) return;

    setForking(true);
    try {
      const forked = await forkJourney(currentJourney.id);
      if (forked) {
        Alert.alert(
          'Journey Forked!',
          `"${forked.title}" is now in your journeys.`,
          [
            { text: 'View', onPress: () => router.push(`/journey/${forked.id}`) },
            { text: 'Stay Here', style: 'cancel' },
          ]
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fork journey. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setForking(false);
    }
  };

  const handleDelete = async () => {
    if (!currentJourney) return;

    Alert.alert(
      'Delete Journey',
      `Are you sure you want to delete "${currentJourney.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteJourney(currentJourney.id);
              router.replace('/(tabs)');
            } catch (err) {
              const message =
                err instanceof Error ? err.message : 'Failed to delete journey. Please try again.';
              Alert.alert('Error', message);
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const isOwner = user && currentJourney && currentJourney.created_by === user.id;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Loading journey...</Text>
      </View>
    );
  }

  if (error || !currentJourney) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={48} color="#E07A5F" />
        <Text style={styles.errorText}>{error || 'Journey not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stops = currentJourney.stops ?? [];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          {currentJourney.cover_image_url ? (
            <Image
              source={{ uri: currentJourney.cover_image_url }}
              style={styles.heroImage}
            />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="map" size={64} color="#ccc" />
            </View>
          )}
          <View style={styles.heroOverlay} />
          <View style={styles.heroTopBar}>
            {/* Back button */}
            <TouchableOpacity style={styles.heroBackBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            {/* Delete button — owner only */}
            {isOwner && (
              <TouchableOpacity
                style={styles.heroDeleteBtn}
                onPress={handleDelete}
                disabled={deleting}
                data-testid="delete-journey-button"
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="trash" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>{currentJourney.title}</Text>
            {/* Badges */}
            <View style={styles.badgeRow}>
              {!currentJourney.is_public && (
                <View style={styles.badge}>
                  <Ionicons name="lock-closed" size={10} color="#fff" />
                  <Text style={styles.badgeText}>Private</Text>
                </View>
              )}
              {currentJourney.duration_label && (
                <View style={styles.badge}>
                  <Ionicons name="time" size={10} color="#fff" />
                  <Text style={styles.badgeText}>{currentJourney.duration_label}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Forked Notice */}
        {currentJourney.forked_from_id && (
          <View style={styles.forkedBanner}>
            <Ionicons name="git-branch" size={14} color="#666" />
            <Text style={styles.forkedText}>
              Forked from {currentJourney.forked_from_title || 'original journey'}
            </Text>
          </View>
        )}

        {/* Body */}
        <View style={styles.body}>
          {/* Tags */}
          {currentJourney.tags && currentJourney.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {currentJourney.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Description */}
          {currentJourney.description ? (
            <Text style={styles.description}>{currentJourney.description}</Text>
          ) : null}

          {/* Owner actions */}
          {isOwner && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={deleting}
              data-testid="delete-journey-button"
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#DC3232" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#DC3232" />
                  <Text style={styles.deleteButtonText}>Delete Journey</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Reactions */}
          <View style={styles.reactionsSection}>
            <ReactionBar reactions={reactions} onReact={handleReact} />
          </View>

          {/* Stops */}
          <View style={styles.stopsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Stops</Text>
              <Text style={styles.stopCountText}>
                {stops.length} {stops.length === 1 ? 'stop' : 'stops'}
              </Text>
            </View>

            {stops.length === 0 ? (
              <Text style={styles.noStopsText}>No stops defined for this journey.</Text>
            ) : (
              stops.map((stop, index) => (
                <StopItem key={stop.id} stop={stop} index={index} />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={[styles.startButton, starting && styles.startButtonDisabled]}
          onPress={handleStartSoloJourney}
          disabled={starting}
          data-testid="start-journey-button"
        >
          {starting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.startButtonText}>Start Solo Journey</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.forkButton, forking && styles.forkButtonDisabled]}
          onPress={handleFork}
          disabled={forking}
          data-testid="fork-journey-button"
        >
          {forking ? (
            <ActivityIndicator size="small" color={Colors.light.tint} />
          ) : (
            <>
              <Ionicons name="git-branch-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.forkButtonText}>Fork Journey</Text>
            </>
          )}
        </TouchableOpacity>
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
  backButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  heroContainer: {
    height: 260,
    position: 'relative',
  },
  heroTopBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  heroBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(220,50,50,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e0e0e0',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    gap: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  forkedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  forkedText: {
    fontSize: 13,
    color: '#666',
  },
  body: {
    padding: 16,
    paddingBottom: 100,
    gap: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: Colors.light.tint + '18',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    color: Colors.light.tint,
    fontWeight: '500',
  },
  description: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  reactionsSection: {
    marginTop: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DC3232',
    backgroundColor: '#fff',
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC3232',
  },
  stopsSection: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  stopCountText: {
    fontSize: 13,
    color: '#999',
  },
  noStopsText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  stopItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  stopNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  stopContent: {
    flex: 1,
    gap: 4,
  },
  stopTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
  stopLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopLocationText: {
    fontSize: 12,
    color: '#999',
  },
  stopTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopTimeText: {
    fontSize: 12,
    color: '#999',
  },
  stopDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginTop: 2,
  },
  tipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  tipsText: {
    fontSize: 12,
    color: '#E07A5F',
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  startButton: {
    backgroundColor: Colors.light.tint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  startButtonDisabled: {
    opacity: 0.7,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  forkButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.tint,
    marginTop: 8,
  },
  forkButtonDisabled: {
    opacity: 0.6,
  },
  forkButtonText: {
    color: Colors.light.tint,
    fontSize: 15,
    fontWeight: '700',
  },
});
