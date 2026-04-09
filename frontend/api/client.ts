import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.API_BASE_URL || 'http://192.168.1.200:3000';
export const TOKEN_KEY = 'auth_token';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Request interceptor - attach JWT token
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle 401 (unauthorized)
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async register(email: string, username: string, password: string) {
    const response = await this.client.post('/auth/register', { email, username, password });
    return response.data;
  }

  async getMe() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Journey endpoints
  async getJourneys(params?: { lat?: number; lng?: number; radius_km?: number; tag?: string; q?: string }) {
    const response = await this.client.get('/journeys', { params });
    return response.data;
  }

  async getJourneyById(id: string) {
    const response = await this.client.get(`/journeys/${id}`);
    return response.data;
  }

  async getUserJourneys(userId: string) {
    const response = await this.client.get(`/users/${userId}/journeys`);
    return response.data;
  }

  // Session endpoints
  async startSoloSession(journeyId: string) {
    const response = await this.client.post('/sessions', { journey_id: journeyId });
    return response.data;
  }

  async getActiveSession() {
    const response = await this.client.get('/sessions/active');
    return response.data;
  }

  async completeStop(sessionId: string, stopId: string) {
    const response = await this.client.post(`/sessions/${sessionId}/stops/${stopId}/complete`);
    return response.data;
  }

  async endSession(sessionId: string) {
    const response = await this.client.delete(`/sessions/${sessionId}`);
    return response.data;
  }

  // Group session endpoints (Sprint 4: Multiplayer)
  async createGroupSession(journeyId: string) {
    const response = await this.client.post('/group-sessions', { journey_id: journeyId });
    return response.data;
  }

  async getGroupSession(sessionId: string) {
    const response = await this.client.get(`/group-sessions/${sessionId}`);
    return response.data;
  }

  async getGroupSessionByInviteCode(inviteCode: string) {
    const response = await this.client.get(`/group-sessions/invite/${inviteCode}`);
    return response.data;
  }

  async joinGroupSession(sessionId: string) {
    const response = await this.client.post(`/group-sessions/${sessionId}/join`);
    return response.data;
  }

  async leaveGroupSession(sessionId: string) {
    const response = await this.client.delete(`/group-sessions/${sessionId}/leave`);
    return response.data;
  }

  async kickParticipant(sessionId: string, participantId: string) {
    const response = await this.client.delete(`/group-sessions/${sessionId}/participants/${participantId}`);
    return response.data;
  }

  async startGroupSession(sessionId: string) {
    const response = await this.client.post(`/group-sessions/${sessionId}/start`);
    return response.data;
  }

  async completeGroupStop(sessionId: string, stopId: string) {
    const response = await this.client.post(`/group-sessions/${sessionId}/stops/${stopId}/complete`);
    return response.data;
  }

  async endGroupSession(sessionId: string) {
    const response = await this.client.delete(`/group-sessions/${sessionId}`);
    return response.data;
  }

  async getGroupSessionWSUrl(sessionId: string) {
    const response = await this.client.get(`/group-sessions/${sessionId}/ws`);
    return response.data;
  }

  // Journey CRUD (Sprint 5: Journey Creation)
  async createJourney(input: {
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
  }) {
    const response = await this.client.post('/journeys', input);
    return response.data;
  }

  async updateJourney(journeyId: string, input: {
    title?: string;
    description?: string;
    cover_image_url?: string;
    tags?: string[];
    duration_label?: string;
    is_public?: boolean;
  }) {
    const response = await this.client.put(`/journeys/${journeyId}`, input);
    return response.data;
  }

  async updateJourneyStops(journeyId: string, stops: Array<{
    id?: string; // existing stop id (omit for new stops)
    title: string;
    description?: string;
    location: { lat: number; lng: number; label: string };
    estimated_time?: number;
    tips?: string[];
    photo_requirement?: boolean;
    order?: number;
  }>) {
    const response = await this.client.put(`/journeys/${journeyId}/stops`, { stops });
    return response.data;
  }

  async deleteJourney(journeyId: string) {
    const response = await this.client.delete(`/journeys/${journeyId}`);
    return response.data;
  }

  async forkJourney(journeyId: string) {
    const response = await this.client.post(`/journeys/${journeyId}/fork`);
    return response.data;
  }

  // Image upload methods (Sprint 6: Polish + Image Upload)
  async uploadCoverImage(uri: string): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('cover', {
      uri,
      name: 'cover.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    const response = await this.client.post('/upload/cover', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async uploadAvatar(uri: string): Promise<{ avatar_url: string }> {
    const formData = new FormData();
    formData.append('avatar', {
      uri,
      name: 'avatar.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    const response = await this.client.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async uploadSessionPhoto(sessionId: string, uri: string, stopId: string): Promise<{ photo_url: string }> {
    const formData = new FormData();
    formData.append('photo', {
      uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
    formData.append('stop_id', stopId);
    const response = await this.client.post(`/sessions/${sessionId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  // Journey reactions (Sprint 7)
  async addReaction(journeyId: string, emoji: string): Promise<{ reactions: Array<{ emoji: string; count: number; user_ids: string[] }> }> {
    const response = await this.client.post(`/journeys/${journeyId}/reactions`, { emoji });
    return response.data;
  }

  async removeReaction(journeyId: string, emoji: string): Promise<{ reactions: Array<{ emoji: string; count: number; user_ids: string[] }> }> {
    const response = await this.client.delete(`/journeys/${journeyId}/reactions/${emoji}`);
    return response.data;
  }

  async getReactions(journeyId: string): Promise<{ reactions: Array<{ emoji: string; count: number; user_ids: string[] }> }> {
    const response = await this.client.get(`/journeys/${journeyId}/reactions`);
    return response.data;
  }

  // Voice note upload (Sprint 7)
  async uploadVoiceNote(sessionId: string, uri: string, stopId: string): Promise<{ voice_note_url: string }> {
    const formData = new FormData();
    formData.append('voice_note', {
      uri,
      name: 'voice_note.m4a',
      type: 'audio/mp4',
    } as unknown as Blob);
    formData.append('stop_id', stopId);
    const response = await this.client.post(`/sessions/${sessionId}/voice-notes`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  // Sprint 7: Spontaneous sessions (no predefined journey)
  async startSpontaneousSession(title: string): Promise<import('../types/journey').SpontaneousSession> {
    const response = await this.client.post('/sessions/spontaneous', { title });
    return response.data;
  }

  async getSpontaneousSession(): Promise<import('../types/journey').SpontaneousSession | null> {
    const response = await this.client.get('/sessions/spontaneous/active');
    return response.data;
  }

  async addSpontaneousStop(
    sessionId: string,
    input: { title: string; description?: string; location?: { lat: number; lng: number; label: string } }
  ): Promise<import('../types/journey').SpontaneousStop> {
    const response = await this.client.post(`/sessions/spontaneous/${sessionId}/stops`, input);
    return response.data;
  }

  async completeSpontaneousStop(sessionId: string, stopId: string): Promise<import('../types/journey').SpontaneousSession> {
    const response = await this.client.post(`/sessions/spontaneous/${sessionId}/stops/${stopId}/complete`);
    return response.data;
  }

  async endSpontaneousSession(sessionId: string): Promise<void> {
    await this.client.delete(`/sessions/spontaneous/${sessionId}`);
  }

  // Generic request methods
  async get<T>(url: string, config?: InternalAxiosRequestConfig) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: InternalAxiosRequestConfig) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
