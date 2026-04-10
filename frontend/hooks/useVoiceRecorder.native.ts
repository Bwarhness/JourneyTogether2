import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

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

// Only available on native platforms (iOS/Android), not web
const isNativePlatform = Platform.OS !== 'web';

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync();
      }
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isNativePlatform) {
      setError('Voice recording is not supported on web');
      return false;
    }
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Microphone permission denied');
        return false;
      }
      // Configure audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      return true;
    } catch (e) {
      setError('Failed to request microphone permission');
      return false;
    }
  }, []);

  const startRecording = useCallback(async (): Promise<void> => {
    if (!isNativePlatform) {
      setError('Voice recording is not supported on web');
      setRecordingState('error');
      return;
    }
    try {
      setError(null);
      const hasPermission = await requestPermission();
      if (!hasPermission) return;

      // Stop any existing playback
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      // Stop any existing recording
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setRecordingState('recording');
      setRecordingUri(null);
      setRecordingDuration(0);

      // Haptic feedback
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Start duration timer
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start recording';
      setError(message);
      setRecordingState('error');
    }
  }, [requestPermission]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isNativePlatform) return null;
    try {
      if (!recordingRef.current) return null;

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri) {
        setRecordingUri(uri);
        setRecordingState('stopped');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return uri;
      } else {
        setError('Recording failed - no URI');
        setRecordingState('error');
        return null;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to stop recording';
      setError(message);
      setRecordingState('error');
      return null;
    }
  }, []);

  const playRecording = useCallback(async (): Promise<void> => {
    if (!isNativePlatform) return;
    try {
      if (!recordingUri) return;

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: recordingUri },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      // Unload when playback finishes
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to play recording';
      setError(message);
    }
  }, [recordingUri]);

  const stopPlayback = useCallback(async (): Promise<void> => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {
      // Ignore errors when stopping playback
    }
  }, []);

  const deleteRecording = useCallback((): void => {
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync();
      recordingRef.current = null;
    }
    if (soundRef.current) {
      soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setRecordingUri(null);
    setRecordingState('idle');
    setRecordingDuration(0);
    setError(null);
  }, []);

  return {
    recordingState,
    recordingDuration,
    recordingUri,
    error,
    startRecording,
    stopRecording,
    playRecording,
    stopPlayback,
    deleteRecording,
    requestPermission,
    isSupported: isNativePlatform,
  };
}
