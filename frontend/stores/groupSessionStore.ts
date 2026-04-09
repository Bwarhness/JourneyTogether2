import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { GroupSession, Participant } from '../types/journey';

interface GroupSessionState {
  groupSession: GroupSession | null;
  loading: boolean;
  error: string | null;

  // Actions
  createGroupSession: (journeyId: string) => Promise<GroupSession>;
  joinGroupSession: (inviteCode: string) => Promise<GroupSession>;
  fetchGroupSession: (sessionId: string) => Promise<void>;
  leaveGroupSession: () => Promise<void>;
  startGroupSession: (sessionId: string) => Promise<void>;
  completeGroupStop: (sessionId: string, stopId: string) => Promise<void>;
  endGroupSession: (sessionId: string) => Promise<void>;
  updateParticipants: (participants: Participant[]) => void;
  updateParticipant: (participant: Participant) => void;
  removeParticipant: (participantId: string) => void;
  clearGroupSession: () => void;
  clearError: () => void;
}

export const useGroupSessionStore = create<GroupSessionState>((set, get) => ({
  groupSession: null,
  loading: false,
  error: null,

  createGroupSession: async (journeyId: string) => {
    set({ loading: true, error: null });
    try {
      const groupSession: GroupSession = await apiClient.createGroupSession(journeyId);
      set({ groupSession, loading: false });
      return groupSession;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to create group session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  joinGroupSession: async (inviteCode: string) => {
    set({ loading: true, error: null });
    try {
      const groupSession: GroupSession = await apiClient.getGroupSessionByInviteCode(inviteCode);
      const joined: GroupSession = await apiClient.joinGroupSession(groupSession.id);
      set({ groupSession: joined, loading: false });
      return joined;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to join group session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  fetchGroupSession: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      const groupSession: GroupSession = await apiClient.getGroupSession(sessionId);
      set({ groupSession, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to fetch group session';
      set({ loading: false, error: message });
    }
  },

  leaveGroupSession: async () => {
    const { groupSession } = get();
    if (!groupSession) return;
    set({ loading: true, error: null });
    try {
      await apiClient.leaveGroupSession(groupSession.id);
      set({ groupSession: null, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to leave group session';
      set({ loading: false, error: message });
    }
  },

  startGroupSession: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      const groupSession: GroupSession = await apiClient.startGroupSession(sessionId);
      set({ groupSession, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to start group session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  completeGroupStop: async (sessionId: string, stopId: string) => {
    set({ loading: true, error: null });
    try {
      const groupSession: GroupSession = await apiClient.completeGroupStop(sessionId, stopId);
      set({ groupSession, loading: false });
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

  endGroupSession: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      await apiClient.endGroupSession(sessionId);
      set({ groupSession: null, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to end group session';
      set({ loading: false, error: message });
      throw error;
    }
  },

  updateParticipants: (participants: Participant[]) => {
    const { groupSession } = get();
    if (!groupSession) return;
    set({ groupSession: { ...groupSession, participants } });
  },

  updateParticipant: (participant: Participant) => {
    const { groupSession } = get();
    if (!groupSession) return;
    const participants = groupSession.participants.map((p) =>
      p.id === participant.id ? participant : p
    );
    set({ groupSession: { ...groupSession, participants } });
  },

  removeParticipant: (participantId: string) => {
    const { groupSession } = get();
    if (!groupSession) return;
    const participants = groupSession.participants.filter((p) => p.id !== participantId);
    set({ groupSession: { ...groupSession, participants } });
  },

  clearGroupSession: () => set({ groupSession: null }),
  clearError: () => set({ error: null }),
}));
