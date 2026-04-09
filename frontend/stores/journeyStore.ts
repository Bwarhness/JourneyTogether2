import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { Journey } from '../types/journey';

interface JourneyState {
  journeys: Journey[];
  nearbyJourneys: Journey[];
  exploredJourneys: Journey[];
  currentJourney: Journey | null;
  loading: boolean;
  searchLoading: boolean;
  error: string | null;
  creating: boolean;
  createError: string | null;

  // Actions
  fetchNearbyJourneys: (lat: number, lng: number) => Promise<void>;
  fetchUserJourneys: (userId: string) => Promise<void>;
  fetchJourneyDetail: (journeyId: string) => Promise<void>;
  searchJourneys: (query: string) => Promise<void>;
  fetchPublicJourneys: () => Promise<void>;
  createJourney: (input: {
    title: string;
    description?: string;
    cover_image_url?: string;
    tags?: string[];
    duration_label?: string;
    is_public?: boolean;
    stops?: Array<{
      title: string;
      description?: string;
      location: { lat: number; lng: number; label: string };
      estimated_time?: number;
      tips?: string[];
      photo_requirement?: boolean;
    }>;
  }) => Promise<Journey | null>;
  forkJourney: (journeyId: string) => Promise<Journey | null>;
  updateJourney: (journeyId: string, input: Partial<{
    title: string;
    description: string;
    cover_image_url: string;
    tags: string[];
    duration_label: string;
    is_public: boolean;
  }>) => Promise<void>;
  updateJourneyStops: (journeyId: string, stops: Array<{
    id?: string;
    title: string;
    description?: string;
    location: { lat: number; lng: number; label: string };
    estimated_time?: number;
    tips?: string[];
    photo_requirement?: boolean;
    order?: number;
  }>) => Promise<void>;
  deleteJourney: (journeyId: string) => Promise<void>;
  clearCurrentJourney: () => void;
  clearError: () => void;
  resetCreateState: () => void;
}

export const useJourneyStore = create<JourneyState>((set) => ({
  journeys: [],
  nearbyJourneys: [],
  exploredJourneys: [],
  currentJourney: null,
  loading: false,
  searchLoading: false,
  error: null,
  creating: false,
  createError: null,

  fetchNearbyJourneys: async (lat: number, lng: number) => {
    set({ loading: true, error: null });
    try {
      const data = await apiClient.getJourneys({ lat, lng, radius_km: 5 });
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

  createJourney: async (input) => {
    set({ creating: true, createError: null });
    try {
      const journey: Journey = await apiClient.createJourney(input);
      set((state) => ({
        journeys: [journey, ...state.journeys],
        creating: false,
      }));
      return journey;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to create journey';
      set({ creating: false, createError: message });
      return null;
    }
  },

  forkJourney: async (journeyId: string) => {
    set({ creating: true, createError: null });
    try {
      const journey: Journey = await apiClient.forkJourney(journeyId);
      set((state) => ({
        journeys: [journey, ...state.journeys],
        creating: false,
      }));
      return journey;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to fork journey';
      set({ creating: false, createError: message });
      return null;
    }
  },

  updateJourney: async (journeyId, input) => {
    set({ loading: true, error: null });
    try {
      const updated: Journey = await apiClient.updateJourney(journeyId, input);
      set((state) => ({
        currentJourney: state.currentJourney?.id === journeyId ? updated : state.currentJourney,
        journeys: state.journeys.map((j) => (j.id === journeyId ? updated : j)),
        loading: false,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to update journey';
      set({ loading: false, error: message });
    }
  },

  updateJourneyStops: async (journeyId, stops) => {
    set({ loading: true, error: null });
    try {
      const updated: Journey = await apiClient.updateJourneyStops(journeyId, stops);
      set((state) => ({
        currentJourney: state.currentJourney?.id === journeyId ? updated : state.currentJourney,
        journeys: state.journeys.map((j) => (j.id === journeyId ? updated : j)),
        loading: false,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to update journey stops';
      set({ loading: false, error: message });
    }
  },

  deleteJourney: async (journeyId) => {
    set({ loading: true, error: null });
    try {
      await apiClient.deleteJourney(journeyId);
      set((state) => ({
        journeys: state.journeys.filter((j) => j.id !== journeyId),
        loading: false,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to delete journey';
      set({ loading: false, error: message });
    }
  },

  searchJourneys: async (query: string) => {
    set({ searchLoading: true, error: null });
    try {
      const data = await apiClient.getJourneys({ q: query });
      const journeys: Journey[] = Array.isArray(data) ? data : data?.journeys ?? [];
      set({ exploredJourneys: journeys, searchLoading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to search journeys';
      set({ searchLoading: false, error: message });
    }
  },

  fetchPublicJourneys: async () => {
    set({ searchLoading: true, error: null });
    try {
      const data = await apiClient.getJourneys({ radius_km: 50 });
      const journeys: Journey[] = Array.isArray(data) ? data : data?.journeys ?? [];
      set({ exploredJourneys: journeys, searchLoading: false });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : (error as { response?: { data?: { message?: string } } })?.response?.data?.message
          || 'Failed to fetch public journeys';
      set({ searchLoading: false, error: message });
    }
  },

  clearCurrentJourney: () => set({ currentJourney: null }),
  clearError: () => set({ error: null }),
  resetCreateState: () => set({ creating: false, createError: null }),
}));
