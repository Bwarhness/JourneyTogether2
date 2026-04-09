import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export interface StopInput {
  id: string;
  title: string;
  description: string;
  location_label: string;
  location_lat: string;
  location_lng: string;
  estimated_time: string;
  tips: string;
  photo_requirement: boolean;
}

interface StopEditorProps {
  stops: StopInput[];
  onStopsChange: (stops: StopInput[]) => void;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function emptyStop(): StopInput {
  return {
    id: generateId(),
    title: '',
    description: '',
    location_label: '',
    location_lat: '',
    location_lng: '',
    estimated_time: '30',
    tips: '',
    photo_requirement: false,
  };
}

function StopRow({
  stop,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  stop: StopInput;
  index: number;
  total: number;
  onChange: (stop: StopInput) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <View style={styles.stopRow}>
      {/* Stop Number + Reorder */}
      <View style={styles.stopHeader}>
        <View style={styles.stopNumber}>
          <Text style={styles.stopNumberText}>{index + 1}</Text>
        </View>
        <Text style={styles.stopTitleInputLabel}>Stop {index + 1}</Text>
        <View style={styles.reorderButtons}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={index === 0}
            style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-up" size={16} color={index === 0 ? '#ccc' : Colors.light.tint} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={index === total - 1}
            style={[styles.reorderBtn, index === total - 1 && styles.reorderBtnDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-down" size={16} color={index === total - 1 ? '#ccc' : Colors.light.tint} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Fields */}
      <TextInput
        style={styles.textInput}
        placeholder="Stop title *"
        placeholderTextColor="#aaa"
        value={stop.title}
        onChangeText={(text) => onChange({ ...stop, title: text })}
        data-testid={`stop-title-${index}`}
      />
      <TextInput
        style={[styles.textInput, styles.multilineInput]}
        placeholder="Description (optional)"
        placeholderTextColor="#aaa"
        value={stop.description}
        onChangeText={(text) => onChange({ ...stop, description: text })}
        multiline
        numberOfLines={3}
        data-testid={`stop-description-${index}`}
      />
      <TextInput
        style={styles.textInput}
        placeholder="Location label (e.g. Central Park, NYC)"
        placeholderTextColor="#aaa"
        value={stop.location_label}
        onChangeText={(text) => onChange({ ...stop, location_label: text })}
        data-testid={`stop-location-label-${index}`}
      />
      <View style={styles.row2}>
        <TextInput
          style={[styles.textInput, styles.halfInput]}
          placeholder="Latitude"
          placeholderTextColor="#aaa"
          value={stop.location_lat}
          onChangeText={(text) => onChange({ ...stop, location_lat: text })}
          keyboardType="numbers-and-punctuation"
          data-testid={`stop-lat-${index}`}
        />
        <TextInput
          style={[styles.textInput, styles.halfInput]}
          placeholder="Longitude"
          placeholderTextColor="#aaa"
          value={stop.location_lng}
          onChangeText={(text) => onChange({ ...stop, location_lng: text })}
          keyboardType="numbers-and-punctuation"
          data-testid={`stop-lng-${index}`}
        />
      </View>
      <TextInput
        style={styles.textInput}
        placeholder="Estimated time (minutes)"
        placeholderTextColor="#aaa"
        value={stop.estimated_time}
        onChangeText={(text) => onChange({ ...stop, estimated_time: text })}
        keyboardType="number-pad"
        data-testid={`stop-time-${index}`}
      />
      <TextInput
        style={styles.textInput}
        placeholder="Tips (comma-separated)"
        placeholderTextColor="#aaa"
        value={stop.tips}
        onChangeText={(text) => onChange({ ...stop, tips: text })}
        data-testid={`stop-tips-${index}`}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Photo required at this stop</Text>
        <Switch
          value={stop.photo_requirement}
          onValueChange={(val) => onChange({ ...stop, photo_requirement: val })}
          trackColor={{ false: '#ddd', true: Colors.light.tint + '80' }}
          thumbColor={stop.photo_requirement ? Colors.light.tint : '#f4f3f4'}
        />
      </View>

      <TouchableOpacity style={styles.removeBtn} onPress={onRemove} data-testid={`remove-stop-${index}`}>
        <Ionicons name="trash-outline" size={14} color="#E07A5F" />
        <Text style={styles.removeBtnText}>Remove stop</Text>
      </TouchableOpacity>
    </View>
  );
}

export function StopEditor({ stops, onStopsChange }: StopEditorProps) {
  const addStop = () => {
    onStopsChange([...stops, emptyStop()]);
  };

  const updateStop = (index: number, updated: StopInput) => {
    const next = [...stops];
    next[index] = updated;
    onStopsChange(next);
  };

  const removeStop = (index: number) => {
    Alert.alert('Remove Stop', `Remove stop ${index + 1}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const next = stops.filter((_, i) => i !== index);
          onStopsChange(next);
        },
      },
    ]);
  };

  const moveStop = (index: number, direction: -1 | 1) => {
    const next = [...stops];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onStopsChange(next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Stops</Text>
        <TouchableOpacity style={styles.addBtn} onPress={addStop} data-testid="add-stop">
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add Stop</Text>
        </TouchableOpacity>
      </View>

      {stops.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="map-outline" size={40} color="#ccc" />
          <Text style={styles.emptyText}>No stops yet. Add your first stop above.</Text>
        </View>
      )}

      {stops.map((stop, index) => (
        <StopRow
          key={stop.id}
          stop={stop}
          index={index}
          total={stops.length}
          onChange={(s) => updateStop(index, s)}
          onRemove={() => removeStop(index)}
          onMoveUp={() => moveStop(index, -1)}
          onMoveDown={() => moveStop(index, 1)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  stopRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopNumberText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  stopTitleInputLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  reorderButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  reorderBtn: {
    padding: 2,
  },
  reorderBtnDisabled: {
    opacity: 0.4,
  },
  textInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  row2: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 14,
    color: '#555',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  removeBtnText: {
    fontSize: 13,
    color: '#E07A5F',
  },
});
