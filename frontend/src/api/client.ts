import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.API_BASE_URL || 'http://192.168.1.200:4000';
const TOKEN_KEY = 'auth_token';

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
          // Token expired or invalid - clear storage
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
        return Promise.reject(error);
      }
    );
  }

  // ─── Auth ────────────────────────────────────────────────────────────────────

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

  async updateMe(data: { display_name?: string; avatar_url?: string }) {
    const response = await this.client.put('/auth/me', data);
    return response.data;
  }

  // ─── Journeys ───────────────────────────────────────────────────────────────

  async getJourneys(params?: {
    q?: string;
    lat?: number;
    lng?: number;
    radius_km?: number;
    tag?: string;
  }) {
    const response = await this.client.get('/journeys', { params });
    return response.data;
  }

  async getUserJourneys(userId: string) {
    const response = await this.client.get(`/users/${userId}/journeys`);
    return response.data;
  }

  async getJourneyById(id: string) {
    const response = await this.client.get(`/journeys/${id}`);
    return response.data;
  }

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
      location: { lat: number; lng: number; label?: string };
      estimated_time?: number;
      tips?: string[];
      photo_requirement?: boolean;
    }>;
  }) {
    const response = await this.client.post('/journeys', input);
    return response.data;
  }

  async updateJourney(id: string, input: Partial<{
    title: string;
    description: string;
    cover_image_url: string;
    tags: string[];
    duration_label: string;
    is_public: boolean;
  }>) {
    const response = await this.client.patch(`/journeys/${id}`, input);
    return response.data;
  }

  async updateJourneyStops(id: string, stops: Array<{
    id?: string;
    title: string;
    description?: string;
    location: { lat: number; lng: number; label?: string };
    estimated_time?: number;
    tips?: string[];
    photo_requirement?: boolean;
    order?: number;
  }>) {
    const response = await this.client.put(`/journeys/${id}/stops`, stops);
    return response.data;
  }

  async deleteJourney(id: string) {
    const response = await this.client.delete(`/journeys/${id}`);
    return response.data;
  }

  async forkJourney(id: string) {
    const response = await this.client.post(`/journeys/${id}/fork`);
    return response.data;
  }

  // ─── Reactions ───────────────────────────────────────────────────────────────

  async addReaction(journeyId: string, emoji: string) {
    const response = await this.client.post(`/journeys/${journeyId}/reactions`, { emoji });
    return response.data;
  }

  async removeReaction(journeyId: string, emoji: string) {
    const response = await this.client.delete(`/journeys/${journeyId}/reactions/${emoji}`);
    return response.data;
  }

  async getReactions(journeyId: string) {
    const response = await this.client.get(`/journeys/${journeyId}/reactions`);
    return response.data;
  }

  // ─── Solo Sessions ───────────────────────────────────────────────────────────

  async startSoloSession(journeyId: string) {
    const response = await this.client.post('/sessions/solo/start', { journey_id: journeyId });
    return response.data;
  }

  async completeStop(sessionId: string, stopId: string) {
    const response = await this.client.post(`/sessions/solo/${sessionId}/stops/${stopId}/complete`);
    return response.data;
  }

  async endSession(sessionId: string) {
    const response = await this.client.post(`/sessions/solo/${sessionId}/end`);
    return response.data;
  }

  async getActiveSession() {
    const response = await this.client.get('/sessions/active');
    return response.data;
  }

  // ─── Group Sessions ──────────────────────────────────────────────────────────

  async createGroupSession(journeyId: string) {
    const response = await this.client.post('/sessions/group/create', { journey_id: journeyId });
    return response.data;
  }

  async joinGroupSession(inviteCode: string) {
    const response = await this.client.post('/sessions/group/join', { invite_code: inviteCode });
    return response.data;
  }

  async leaveGroupSession(sessionId: string) {
    const response = await this.client.post(`/sessions/group/${sessionId}/leave`);
    return response.data;
  }

  async kickFromGroup(sessionId: string, oduserId: string) {
    const response = await this.client.post(`/sessions/group/${sessionId}/kick`, { oduser_id: oduserId });
    return response.data;
  }

  async startGroupSession(sessionId: string) {
    const response = await this.client.post(`/sessions/group/${sessionId}/start`);
    return response.data;
  }

  async completeGroupStop(sessionId: string, stopId: string) {
    const response = await this.client.post(`/sessions/group/${sessionId}/stops/${stopId}/complete`);
    return response.data;
  }

  async endGroupSession(sessionId: string) {
    const response = await this.client.post(`/sessions/group/${sessionId}/end`);
    return response.data;
  }

  async getGroupSession(sessionId: string) {
    const response = await this.client.get(`/sessions/group/${sessionId}`);
    return response.data;
  }

  async getGroupSessionByInviteCode(inviteCode: string) {
    // Lookup session by invite code (doesn't join) — used before joinGroupSession
    const response = await this.client.get(`/sessions/group/code/${inviteCode.toUpperCase()}`);
    return response.data;
  }

  async getGroupSessionWsUrl(sessionId: string) {
    // WebSocket URL — token is attached by the interceptor via AsyncStorage
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const wsUrl = `ws://192.168.1.200:4000/ws/sessions/${sessionId}?token=${token}`;
    return { ws_url: wsUrl };
  }

  // ─── Spontaneous Sessions ─────────────────────────────────────────────────────

  async startSpontaneousSession(title: string) {
    const response = await this.client.post('/spontaneous/start', { title });
    return response.data;
  }

  async addSpontaneousStop(sessionId: string, input: {
    title: string;
    description?: string;
    location?: { lat: number; lng: number; label?: string };
  }) {
    const response = await this.client.post(`/spontaneous/${sessionId}/stops`, input);
    return response.data;
  }

  async completeSpontaneousStop(sessionId: string, stopId: string) {
    const response = await this.client.post(`/spontaneous/${sessionId}/stops/${stopId}/complete`);
    return response.data;
  }

  async endSpontaneousSession(sessionId: string) {
    const response = await this.client.delete(`/spontaneous/${sessionId}`);
    return response.data;
  }

  async getSpontaneousSession(sessionId: string) {
    const response = await this.client.get(`/spontaneous/${sessionId}`);
    return response.data;
  }

  async getActiveSpontaneousSession() {
    const response = await this.client.get('/spontaneous/active');
    return response.data;
  }

  // ─── Uploads ────────────────────────────────────────────────────────────────

  async uploadCoverImage(uri: string) {
    const fileName = uri.split('/').pop() || 'cover.jpg';
    const formData = new FormData();
    formData.append('file', { uri, name: fileName, type: 'image/jpeg' } as unknown as Blob);
    const response = await this.client.post('/upload/cover', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async uploadAvatar(uri: string) {
    const fileName = uri.split('/').pop() || 'avatar.jpg';
    const formData = new FormData();
    formData.append('file', { uri, name: fileName, type: 'image/jpeg' } as unknown as Blob);
    const response = await this.client.post('/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async uploadSessionPhoto(sessionId: string, uri: string) {
    const fileName = uri.split('/').pop() || 'photo.jpg';
    const formData = new FormData();
    formData.append('file', { uri, name: fileName, type: 'image/jpeg' } as unknown as Blob);
    const response = await this.client.post(`/sessions/${sessionId}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async uploadVoiceNote(sessionId: string, uri: string) {
    const fileName = uri.split('/').pop() || 'voice.m4a';
    const formData = new FormData();
    formData.append('file', { uri, name: fileName, type: 'audio/m4a' } as unknown as Blob);
    const response = await this.client.post(`/sessions/${sessionId}/voice-notes`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  // ─── Users ──────────────────────────────────────────────────────────────────

  async getUserProfile(userId: string) {
    const response = await this.client.get(`/users/${userId}`);
    return response.data;
  }

  // ─── Generic request methods ─────────────────────────────────────────────────

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
export { TOKEN_KEY };
