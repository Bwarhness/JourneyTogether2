import { useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJourneyStore } from '@/stores/journeyStore';
import { StopEditor, type StopInput } from '@/components/StopEditor';
import { CoverImagePicker } from '@/components/CoverImagePicker';
import { apiClient } from '@/api/client';
import { Colors } from '@/constants/theme';
import type { Stop } from '@/types/journey';

function stopToStopInput(stop: Stop): StopInput {
  return {
    id: stop.id,
    title: stop.title,
    description: stop.description || '',
    location_label: stop.location?.label || '',
    location_lat: stop.location?.lat?.toString() || '',
    location_lng: stop.location?.lng?.toString() || '',
    estimated_time: stop.estimated_time?.toString() || '30',
    tips: stop.tips?.join(', ') || '',
    photo_requirement: stop.photo_requirement || false,
  };
}

export default function EditJourneyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentJourney, loading, error, fetchJourneyDetail, clearCurrentJourney, updateJourney, updateJourneyStops } =
    useJourneyStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [durationLabel, setDurationLabel] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [stops, setStops] = useState<StopInput[]>([]);
  const [coverImageUri, setCoverImageUri] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string>('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load journey data
  useEffect(() => {
    if (id) {
      fetchJourneyDetail(id);
    }
    return () => clearCurrentJourney();
  }, [id]);

  // Populate form when journey loads
  useEffect(() => {
    if (currentJourney && currentJourney.id === id) {
      setTitle(currentJourney.title || '');
      setDescription(currentJourney.description || '');
      setTags(currentJourney.tags?.join(', ') || '');
      setDurationLabel(currentJourney.duration_label || '');
      setIsPublic(currentJourney.is_public !== false);
      setCoverImageUrl(currentJourney.cover_image_url || '');
      setStops(
        currentJourney.stops && currentJourney.stops.length > 0
          ? currentJourney.stops.map(stopToStopInput)
          : []
      );
    }
  }, [currentJourney, id]);

  const handleSubmit = async () => {
    if (!id) return;
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title for your journey.');
      return;
    }

    // Upload cover image if changed
    let finalCoverUrl = coverImageUrl;
    if (coverImageUri && !coverImageUrl) {
      setUploadingCover(true);
      try {
        const result = await apiClient.uploadCoverImage(coverImageUri);
        finalCoverUrl = result.url;
      } catch {
        Alert.alert('Cover upload failed', 'Journey will be saved without a new cover image.');
      } finally {
        setUploadingCover(false);
      }
    }

    setSaving(true);
    try {
      // Update journey metadata
      await updateJourney(id, {
        title: title.trim(),
        description: description.trim() || undefined,
        cover_image_url: finalCoverUrl || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        duration_label: durationLabel.trim() || undefined,
        is_public: isPublic,
      });

      // Update stops
      const parsedStops = stops
        .filter((s) => s.title.trim())
        .map((s, index) => ({
          id: s.id.startsWith('new-') ? undefined : s.id,
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
          order: index,
        }));

      await updateJourneyStops(id, parsedStops);

      Alert.alert('Journey Updated!', `"${title.trim()}" has been saved.`, [
        {
          text: 'View Journey',
          onPress: () => router.replace(`/journey/${id}`),
        },
        {
          text: 'Back to Home',
          onPress: () => router.replace('/(tabs)'),
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update journey. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleStopChange = (newStops: StopInput[]) => {
    // Assign temporary IDs to new stops that don't have them yet
    setStops(
      newStops.map((s) => ({
        ...s,
        id: s.id || `new-${Math.random().toString(36).substring(2, 9)}`,
      }))
    );
  };

  if (loading && !currentJourney) {
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
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Journey</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Cover Image */}
        <CoverImagePicker
          value={coverImageUrl}
          onChange={(uri) => {
            setCoverImageUri(uri);
            setCoverImageUrl(''); // clear uploaded URL until submitted
          }}
          onUpload={(url) => setCoverImageUrl(url)}
          uploading={uploadingCover}
        />

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
          <StopEditor stops={stops} onStopsChange={handleStopChange} />
        </View>

        {/* Error */}
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#E07A5F" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Submit */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving || uploadingCover}
          data-testid="edit-journey-submit"
        >
          {saving || uploadingCover ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
              <Text style={styles.submitBtnText}>Save Changes</Text>
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
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
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
  errorBannerText: {
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
