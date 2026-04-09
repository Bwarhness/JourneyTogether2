import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJourneyStore } from '@/stores/journeyStore';
import { StopEditor, type StopInput } from '@/components/StopEditor';
import { Colors } from '@/constants/theme';

export default function CreateJourneyScreen() {
  const router = useRouter();
  const { createJourney, creating, createError, resetCreateState } = useJourneyStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [durationLabel, setDurationLabel] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [stops, setStops] = useState<StopInput[]>([]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title for your journey.');
      return;
    }

    const parsedStops = stops
      .filter((s) => s.title.trim())
      .map((s) => ({
        title: s.title.trim(),
        description: s.description.trim() || undefined,
        location: {
          lat: parseFloat(s.location_lat) || 0,
          lng: parseFloat(s.location_lng) || 0,
          label: s.location_label.trim() || 'Unnamed location',
        },
        estimated_time: parseInt(s.estimated_time, 10) || 30,
        tips: s.tips
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        photo_requirement: s.photo_requirement,
      }));

    const result = await createJourney({
      title: title.trim(),
      description: description.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      duration_label: durationLabel.trim() || undefined,
      is_public: isPublic,
      stops: parsedStops,
    });

    if (result) {
      Alert.alert('Journey Created!', `"${result.title}" is ready.`, [
        {
          text: 'View Journey',
          onPress: () => {
            resetCreateState();
            router.replace(`/journey/${result.id}`);
          },
        },
        {
          text: 'Back to Home',
          onPress: () => {
            resetCreateState();
            router.replace('/(tabs)');
          },
        },
      ]);
    } else {
      Alert.alert('Error', createError || 'Failed to create journey. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header hint */}
        <View style={styles.hintBanner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.light.tint} />
          <Text style={styles.hintText}>
            Plan your journey step by step. You can always edit it later.
          </Text>
        </View>

        {/* Title */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Copenhagen Art Walk"
            placeholderTextColor="#aaa"
            value={title}
            onChangeText={setTitle}
            data-testid="journey-title-input"
          />
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            placeholder="Describe what makes this journey special..."
            placeholderTextColor="#aaa"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            data-testid="journey-description-input"
          />
        </View>

        {/* Tags */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Tags</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. art, culture, food (comma-separated)"
            placeholderTextColor="#aaa"
            value={tags}
            onChangeText={setTags}
            data-testid="journey-tags-input"
          />
        </View>

        {/* Duration Label */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Duration</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Half day, 2-3 hours"
            placeholderTextColor="#aaa"
            value={durationLabel}
            onChangeText={setDurationLabel}
            data-testid="journey-duration-input"
          />
        </View>

        {/* Public Toggle */}
        <View style={styles.switchRow}>
          <View style={styles.switchLeft}>
            <Ionicons
              name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
              size={20}
              color={isPublic ? Colors.light.tint : '#999'}
            />
            <View>
              <Text style={styles.switchTitle}>{isPublic ? 'Public Journey' : 'Private Journey'}</Text>
              <Text style={styles.switchSubtitle}>
                {isPublic
                  ? 'Anyone can discover and fork this journey'
                  : 'Only you can see and use this journey'}
              </Text>
            </View>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: '#ddd', true: Colors.light.tint + '80' }}
            thumbColor={isPublic ? Colors.light.tint : '#f4f3f4'}
          />
        </View>

        {/* Stop Editor */}
        <View style={styles.fieldGroup}>
          <StopEditor stops={stops} onStopsChange={setStops} />
        </View>

        {/* Error */}
        {createError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#E07A5F" />
            <Text style={styles.errorText}>{createError}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Submit */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={creating}
          data-testid="create-journey-submit"
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="map-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Create Journey</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 20,
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint + '12',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.tint,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  required: {
    color: '#E07A5F',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 12,
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  switchSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E07A5F15',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#E07A5F',
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  submitBtn: {
    backgroundColor: Colors.light.tint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
