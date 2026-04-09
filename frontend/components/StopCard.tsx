import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SessionStop } from '@/types/journey';
import { Colors } from '@/constants/theme';

interface StopCardProps {
  stop: SessionStop;
  isActive: boolean;
  isCompleted: boolean;
}

export function StopCard({ stop, isActive, isCompleted }: StopCardProps) {
  const statusIcon = isCompleted ? (
    <Ionicons name="checkmark-circle" size={24} color={Colors.light.tint} />
  ) : isActive ? (
    <Ionicons name="location" size={24} color={Colors.light.tint} />
  ) : (
    <View style={styles.pendingDot} />
  );

  return (
    <View style={[styles.container, isActive && styles.activeContainer]}>
      <View style={styles.leftSection}>
        <View style={[styles.iconWrapper, isActive && styles.activeIconWrapper, isCompleted && styles.completedIconWrapper]}>
          {statusIcon}
        </View>
        {!isCompleted && <View style={styles.connectorLine} />}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, isCompleted && styles.completedTitle]}>
            {stop.title}
          </Text>
          <Text style={styles.timeEstimate}>~{stop.estimated_time} min</Text>
        </View>

        {stop.location?.label ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color="#999" />
            <Text style={styles.locationText}>{stop.location.label}</Text>
          </View>
        ) : null}

        {stop.description ? (
          <Text style={[styles.description, isCompleted && styles.completedDescription]} numberOfLines={2}>
            {stop.description}
          </Text>
        ) : null}

        {isActive && stop.tips && stop.tips.length > 0 && (
          <View style={styles.tipsContainer}>
            <Ionicons name="bulb-outline" size={12} color="#E07A5F" />
            <Text style={styles.tipsText}>
              {stop.tips.length} tip{stop.tips.length !== 1 ? 's' : ''} for this stop
            </Text>
          </View>
        )}

        {isCompleted && stop.checked_in_at && (
          <View style={styles.checkedInRow}>
            <Ionicons name="checkmark" size={10} color={Colors.light.tint} />
            <Text style={styles.checkedInText}>
              Checked in at {new Date(stop.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  activeContainer: {
    backgroundColor: Colors.light.tint + '10',
    borderRadius: 12,
    padding: 12,
    marginLeft: -4,
  },
  leftSection: {
    alignItems: 'center',
    width: 32,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  activeIconWrapper: {
    backgroundColor: Colors.light.tint + '20',
  },
  completedIconWrapper: {
    backgroundColor: 'transparent',
  },
  pendingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ddd',
  },
  connectorLine: {
    position: 'absolute',
    top: 32,
    bottom: -8,
    width: 2,
    backgroundColor: '#e0e0e0',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    flex: 1,
  },
  completedTitle: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  timeEstimate: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#999',
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginTop: 2,
  },
  completedDescription: {
    color: '#bbb',
  },
  tipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  tipsText: {
    fontSize: 12,
    color: '#E07A5F',
  },
  checkedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  checkedInText: {
    fontSize: 11,
    color: Colors.light.tint,
  },
});
