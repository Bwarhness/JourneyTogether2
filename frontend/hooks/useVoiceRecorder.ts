// Platform-specific exports - useVoiceRecorder.native.ts for iOS/Android
// useVoiceRecorder.web.ts for web (stub - expo-av not supported)
export { useVoiceRecorder } from './useVoiceRecorder.native';
export type { RecordingState } from './useVoiceRecorder.native';
