import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { Colors } from '@/constants/theme';

interface VoiceRecorderButtonProps {
  onRecordingComplete: (uri: string) => void;
  testID?: string;
}

export function VoiceRecorderButton({ onRecordingComplete, testID }: VoiceRecorderButtonProps) {
  const {
    recordingState,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    playRecording,
    deleteRecording,
  } = useVoiceRecorder();

  const [playing, setPlaying] = useState(false);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggle = async () => {
    if (recordingState === 'recording') {
      const uri = await stopRecording();
      if (uri) {
        onRecordingComplete(uri);
      }
    } else if (recordingState === 'idle' || recordingState === 'error') {
      await startRecording();
    }
  };

  const handlePlay = async () => {
    if (playing) {
      setPlaying(false);
    } else {
      setPlaying(true);
      await playRecording();
      setPlaying(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Recording?',
      'This will remove the voice note.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteRecording();
            onRecordingComplete('');
          },
        },
      ]
    );
  };

  if (recordingState === 'recording') {
    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.recordingContainer}>
          <View style={styles.recordingIndicator}>
            <View style={styles.pulseDot} />
            <Text style={styles.recordingText}>Recording</Text>
          </View>
          <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
        </View>
        <TouchableOpacity
          style={styles.stopButton}
          onPress={handleToggle}
          testID={`${testID}-stop`}
        >
          <Ionicons name="stop" size={20} color="#fff" />
          <Text style={styles.stopButtonText}>Stop</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (recordingState === 'stopped' && recordingDuration > 0) {
    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.playbackContainer}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={handlePlay}
            testID={`${testID}-play`}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={18} color={Colors.light.tint} />
          </TouchableOpacity>
          <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            testID={`${testID}-delete`}
          >
            <Ionicons name="trash-outline" size={18} color="#E07A5F" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.reRecordButton}
          onPress={handleToggle}
          testID={`${testID}-rerecord`}
        >
          <Ionicons name="mic" size={16} color="#999" />
          <Text style={styles.reRecordText}>Re-record</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.recordButton}
      onPress={handleToggle}
      testID={testID}
    >
      <Ionicons name="mic-outline" size={18} color={Colors.light.tint} />
      <Text style={styles.recordButtonText}>Add Voice Note</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    gap: 8,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E07A5F',
  },
  recordingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E07A5F',
  },
  durationText: {
    fontSize: 13,
    color: '#666',
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E07A5F',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  stopButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  playbackContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.tint + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 4,
  },
  reRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  reRecordText: {
    fontSize: 12,
    color: '#999',
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.light.tint + '40',
    borderRadius: 20,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  recordButtonText: {
    fontSize: 13,
    color: Colors.light.tint,
    fontWeight: '500',
  },
});
