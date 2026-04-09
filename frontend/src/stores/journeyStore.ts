import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { Journey } from '../types/journey';

interface JourneyState {
  journeys: Journey[];
  nearbyJourneys: Journey[];
  currentJourney: Journey | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchNearbyJourneys: (lat: number, lng: number) => Promise<void>;
  fetchUserJourneys: (userId: string) => Promise<void>;
  fetchJourneyDetail: (journeyId: string) => Promise<void>;
  clearCurrentJourney: () => void;
  clearError: () => void;
}

export const useJourneyStore = create<JourneyState>((set) => ({
  journeys: [],
  nearbyJourneys: [],
  currentJourney: null,
  loading: false,
  error: null,

  fetchNearbyJourneys: async (lat: number, lng: number) => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getJourneys({ lat, lng, radius_km: 5 });
      // API returns { journeys: [...] } or [...] depending on backend
      const journeys: Journey[] = Array.isArray(data) ? data : data?.journeys ?? [];
      set({ nearbyJourneys: journeys, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to fetch nearby journeys';
      set({ loading: false, error: message });
    }
  },

  fetchUserJourneys: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getUserJourneys(userId);
      const journeys: Journey[] = Array.isArray(data) ? data : data?.journeys ?? [];
      set({ journeys, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to fetch user journeys';
      set({ loading: false, error: message });
    }
  },

  fetchJourneyDetail: async (journeyId: string) => {
    set({ loading: true, error: null });
    try {
      const journey: Journey = await apiClient.getJourneyById(journeyId);
      set({ currentJourney: journey, loading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to fetch journey details';
      set({ loading: false, error: message });
    }
  },

  clearCurrentJourney: () => set({ currentJourney: null }),
  clearError: () => set({ error: null }),
}));
