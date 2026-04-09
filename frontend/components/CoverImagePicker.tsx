import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiClient } from '@/api/client';
import { Colors } from '@/constants/theme';

interface CoverImagePickerProps {
  value?: string; // current cover image URL
  onChange: (uri: string) => void;
  onUpload?: (url: string) => void; // called after successful upload with returned URL
  uploading?: boolean;
}

export function CoverImagePicker({ value, onChange, onUpload, uploading }: CoverImagePickerProps) {
  const [localUri, setLocalUri] = useState<string | undefined>(value);
  const [isUploading, setIsUploading] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS === 'web') return true;
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
      Alert.alert(
        'Permissions required',
        'Camera and photo library access are needed to select a cover image.'
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setLocalUri(uri);
      onChange(uri);
    }
  };

  const handleUpload = async () => {
    if (!localUri) return;
    setIsUploading(true);
    try {
      const result = await apiClient.uploadCoverImage(localUri);
      onUpload?.(result.url);
    } catch (err) {
      Alert.alert('Upload failed', 'Could not upload cover image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const displayUri = localUri || value;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Cover Image</Text>

      {displayUri ? (
        <View style={styles.previewContainer}>
          <View style={styles.imageWrapper}>
            {/* Using require for local placeholder */}
            <View style={[styles.imagePlaceholder, styles.uploadedImage]}>
              <Text style={styles.imageUrlText}>
                {displayUri.substring(0, 40)}...
              </Text>
            </View>
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.changeBtn} onPress={pickImage}>
              <Ionicons name="image-outline" size={16} color={Colors.light.tint} />
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
            {onUpload && (
              <TouchableOpacity
                style={[styles.uploadBtn, (uploading || isUploading) && styles.uploadBtnDisabled]}
                onPress={handleUpload}
                disabled={uploading || isUploading}
              >
                {uploading || isUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                    <Text style={styles.uploadBtnText}>Upload</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.placeholder} onPress={pickImage} activeOpacity={0.7}>
          <Ionicons name="camera-outline" size={32} color="#aaa" />
          <Text style={styles.placeholderText}>Add cover image</Text>
          <Text style={styles.placeholderSubtext}>Tap to select from gallery</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    height: 160,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '500',
  },
  placeholderSubtext: {
    fontSize: 12,
    color: '#bbb',
  },
  previewContainer: {
    gap: 10,
  },
  imageWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagePlaceholder: {
    height: 160,
    backgroundColor: '#e8f4e8',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  uploadedImage: {
    backgroundColor: '#e8f4e8',
  },
  imageUrlText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    backgroundColor: '#fff',
  },
  changeBtnText: {
    fontSize: 13,
    color: Colors.light.tint,
    fontWeight: '600',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.tint,
  },
  uploadBtnDisabled: {
    opacity: 0.7,
  },
  uploadBtnText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
});
