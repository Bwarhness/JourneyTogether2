import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { Session } from '../types/journey';

interface SessionState {
  activeSession: Session | null;
  loading: boolean;
  error: string | null;
  voiceNoteUploading: boolean;

  // Actions
  fetchActiveSession: () => Promise<void>;
  startSession: (journeyId: string) => Promise<Session>;
  completeStop: (sessionId: string, stopId: string) => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  attachVoiceNote: (sessionId: string, stopId: string, uri: string) => Promise<void>;
  clearSession: () => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  loading: false,
  error: null,
  voiceNoteUploading: false,

  fetchActiveSession: async () => {
    set({ loading: true, error: null });
    try {
      const session: Session = await apiClient.getActiveSession();
      set({ activeSession: session, loading: false });
    } catch (error) {
      const session = get().activeSession;
      // If no active session, that's fine - just clear
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        set({ activeSession: null, loading: false });
      } else {
        const message =
          error instanceof Error
            ? error.message
            : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
            || 'Failed to fetch active session';
        set({ loading: false, error: message });
      }
    }
  },

  startSession: async (journeyId: string) => {
    set({ loading: true, error: null });
    try {
      const session: Session = await apiClient.startSoloSession(journeyId);
      set({ activeSession: session, loading: false });
      return session;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to start session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  completeStop: async (sessionId: string, stopId: string) => {
    set({ loading: true, error: null });
    try {
      const updatedSession: Session = await apiClient.completeStop(sessionId, stopId);
      set({ activeSession: updatedSession, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to check in at stop';
      set({ loading: false, error: message });
      throw error;
    }
  },

  endSession: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      await apiClient.endSession(sessionId);
      set({ activeSession: null, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to end session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  attachVoiceNote: async (sessionId: string, stopId: string, uri: string) => {
    set({ voiceNoteUploading: true, error: null });
    try {
      const { voice_note_url } = await apiClient.uploadVoiceNote(sessionId, uri, stopId);
      // Update the stop in active session with the voice note URL
      set((state) => {
        if (!state.activeSession) return state;
        const updatedStops = state.activeSession.stops.map((stop) =>
          stop.id === stopId ? { ...stop, voice_note_url } : stop
        );
        return {
          activeSession: { ...state.activeSession, stops: updatedStops },
          voiceNoteUploading: false,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to upload voice note';
      set({ voiceNoteUploading: false, error: message });
      throw error;
    }
  },

  clearSession: () => set({ activeSession: null }),
  clearError: () => set({ error: null }),
}));
