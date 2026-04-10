import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

interface VoiceRecorderButtonProps {
  onRecordingComplete: (uri: string) => void;
  testID?: string;
}

// Web stub — voice recording not supported
export function VoiceRecorderButton({ testID }: VoiceRecorderButtonProps) {
  return (
    <TouchableOpacity style={styles.disabledButton} testID={testID} disabled>
      <Ionicons name="mic-off-outline" size={18} color="#ccc" />
      <Text style={styles.disabledText}>Voice notes</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabledButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  disabledText: {
    fontSize: 13,
    color: '#ccc',
    fontWeight: '500',
  },
});
