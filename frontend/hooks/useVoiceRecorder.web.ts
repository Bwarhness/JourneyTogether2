import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

// Web stub — expo-av is not supported on web
// This file is loaded automatically on web by Metro's platform resolution

export type RecordingState = 'idle' | 'recording' | 'stopped' | 'error';

interface UseVoiceRecorderReturn {
  recordingState: RecordingState;
  recordingDuration: number;
  recordingUri: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  playRecording: () => Promise<void>;
  stopPlayback: () => Promise<void>;
  deleteRecording: () => void;
  requestPermission: () => Promise<boolean>;
  isSupported: boolean;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [recordingState] = useState<RecordingState>('idle');
  const [recordingDuration] = useState(0);
  const [recordingUri] = useState<string | null>(null);
  const [error] = useState<string | null>(`Voice notes not supported on ${Platform.OS}`);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    return false;
  }, []);

  return {
    recordingState,
    recordingDuration,
    recordingUri,
    error,
    startRecording: async () => {},
    stopRecording: async () => null,
    playRecording: async () => {},
    stopPlayback: async () => {},
    deleteRecording: () => {},
    requestPermission,
    isSupported: false,
  };
}
