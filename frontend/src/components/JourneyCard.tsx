import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Journey } from '../types/journey';
import { Colors } from '@/constants/theme';

interface JourneyCardProps {
  journey: Journey;
  distanceMeters?: number | null;
  onPress: (journeyId: string) => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export function JourneyCard({ journey, distanceMeters, onPress }: JourneyCardProps) {
  const stopCount = journey.stops?.length ?? 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(journey.id)}
      activeOpacity={0.8}
    >
      {/* Cover Image */}
      <View style={styles.imageContainer}>
        {journey.cover_image_url ? (
          <Image source={{ uri: journey.cover_image_url }} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="map" size={32} color="#ccc" />
          </View>
        )}

        {/* Distance Badge */}
        {distanceMeters != null && (
          <View style={styles.distanceBadge}>
            <Ionicons name="location" size={12} color="#fff" />
            <Text style={styles.distanceText}>{formatDistance(distanceMeters)} away</Text>
          </View>
        )}

        {/* Public Badge */}
        {!journey.is_public && (
          <View style={styles.privateBadge}>
            <Ionicons name="lock-closed" size={10} color="#fff" />
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {journey.title}
        </Text>

        {journey.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {journey.description}
          </Text>
        ) : null}

        {/* Meta Row */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color="#999" />
            <Text style={styles.metaText}>
              {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
            </Text>
          </View>

          {journey.duration_label ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color="#999" />
              <Text style={styles.metaText}>{journey.duration_label}</Text>
            </View>
          ) : null}

          {journey.tags && journey.tags.length > 0 ? (
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>{journey.tags[0]}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  imageContainer: {
    height: 140,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  distanceBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distanceText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  privateBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  content: {
    padding: 12,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#999',
  },
  tagPill: {
    backgroundColor: Colors.light.tint + '18',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagText: {
    fontSize: 11,
    color: Colors.light.tint,
    fontWeight: '500',
  },
});
