import type { Department, Designation, Circular, Resource, ResourceBooking, LeaveRequest, LeaveBalance, Unavailability, LeaderboardEntry, AttendanceRegistryItem, AppNotification, Officer, UserActivity } from '../types.ts';

/**
 * PRODUCTION API URL RESOLUTION
 * For InfinityFree, we use '/api' to stay on the same domain.
 */
const getBaseUrl = () => {
  return '/api'; 
};

const BASE_URL = getBaseUrl();
const OFFLINE_QUEUE_KEY = 'niyagama_offline_attendance_queue';

export class ApiClient {
  private isSyncing = false;
  private _isOnline = navigator.onLine;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this._isOnline = true;
        this.syncOfflineQueue();
      });
      window.addEventListener('offline', () => {
        this._isOnline = false;
      });
      setInterval(() => this.heartbeat(), 30000);
    }
  }

  get isOnline() { return this._isOnline; }

  private async heartbeat() {
    const token = localStorage.getItem('niyagama_token');
    if (!token) return;
    try {
      const response = await fetch(`${BASE_URL}/me`, { 
        headers: { 
          'Authorization': `Bearer ${token}`, 
          'X-Authorization': `Bearer ${token}`,
          'Accept': 'application/json' 
        }
      });
      if (response.status === 401) {
        localStorage.removeItem('niyagama_token');
        localStorage.removeItem('niyagama_user');
      }
    } catch (e) {
      this._isOnline = false;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('niyagama_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': token ? `Bearer ${token}` : 'Bearer public_access_token',
      'X-Authorization': token ? `Bearer ${token}` : 'Bearer public_access_token',
      ...options.headers,
    };

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${BASE_URL}${cleanEndpoint}`;

    try {
      const response = await fetch(url, { ...options, headers });
      
      // Read body once to avoid "stream already read" errors
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");
      const text = await response.text();

      // SPECIAL DIAGNOSTIC FOR INFINITYFREE 404
      if (response.status === 404) {
        if (text.includes('infinityfree') || text.includes('404')) {
           console.error("DEPLOYMENT ERROR DETECTED");
           throw new Error("404 Error: The server cannot find the API. IMPORTANT: Please DELETE the folder named 'api' in your htdocs directory. It is conflicting with the application's virtual routes.");
        }
      }

      if (response.status === 401) {
        localStorage.removeItem('niyagama_token');
        localStorage.removeItem('niyagama_user');
        if (typeof window !== 'undefined' && !window.location.hash.includes('login')) {
            window.location.href = '#/login';
        }
        throw new Error('Unauthenticated.');
      }

      if (!isJson) {
        console.group("Server Response Error");
        console.error("URL:", url);
        console.error("Status:", response.status, response.statusText);
        console.error("Content-Type:", contentType);
        console.log("Body Snippet:", text.substring(0, 500));
        console.groupEnd();

        if (text.includes('id="root"')) {
           throw new Error("SPA Routing Error: The server is returning index.html for an API call. Check your .htaccess.");
        }
        
        // Handle specific InfinityFree / Hosting errors
        if (text.includes("Protocol Error") || text.includes("Security Check")) {
           throw new Error(`Hosting Protocol Error: The server blocked the request. Body: ${text.substring(0, 100)}`);
        }

        throw new Error(`Server Error (${response.status}): ${response.statusText || 'Unknown Error'}`);
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error("Failed to parse JSON response from server.");
      }

      if (!response.ok) {
        throw new Error(result.message || result.error || `API Error ${response.status}`);
      }
      
      return result.data !== undefined ? result.data : result;
    } catch (error: any) {
      console.error("[API Client Exception]", error);
      throw error;
    }
  }

  private async syncOfflineQueue() {
    if (this.isSyncing || !this._isOnline) return;
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;
    this.isSyncing = true;
    const newQueue = [];
    for (const item of queue) {
      try { await this.request(item.endpoint, item.options); } catch (err) { newQueue.push(item); }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(newQueue));
    this.isSyncing = false;
  }

  // API Implementations
  async login(username: string, pin: string) { return this.request<{ user: any; token: string }>('/login', { method: 'POST', body: JSON.stringify({ username, pin }) }); }
  async getCurrentUser() { return this.request<any>('/me'); }
  async updateProfile(data: any) { return this.request<Officer>('/me', { method: 'PUT', body: JSON.stringify(data) }); }
  async changePassword(currentPassword: string, newPassword: string) { return this.request<any>('/me/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); }
  
  async uploadProfilePic(file: File) { 
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = ((event: ProgressEvent) => {
        if (event.lengthComputable && arguments[1]) {
          const progress = Math.round((event.loaded / event.total) * 100);
          arguments[1](progress);
        }
      });
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const { url } = await this.uploadImage(base64);
          const res = await this.request<any>('/me/profile-pic', { method: 'POST', body: JSON.stringify({ imageUrl: url }) });
          resolve(res);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async getActivityLogs() { return this.request<UserActivity[]>('/me/activities'); }
  async getPendingProfilePics() { return this.request<Officer[]>('/admin/pending-profile-pics'); }
  async approveProfilePic(officerId: string | number, approve: boolean) { return this.request<any>(`/admin/approve-profile-pic/${officerId}`, { method: 'POST', body: JSON.stringify({ approve }) }); }
  async getNotifications() { return this.request<AppNotification[]>('/notifications'); }
  async markAllNotificationsRead() { return this.request<any>('/notifications/read-all', { method: 'POST' }); }
  async getAttendance(date?: string) { return this.request<any>(`/attendance${date ? `?date=${date}` : ''}`); }
  async getDivisionAttendance(date?: string) { return this.request<any>(`/division-attendance${date ? `?date=${date}` : ''}`); }
  async getAttendanceRegistry(date: string) { return this.request<AttendanceRegistryItem[]>(`/attendance/registry?date=${date}`); }
  async getMonthlyAttendanceRegistry(year: number, month: number) { return this.request<any>(`/attendance/monthly-registry?year=${year}&month=${month}`); }
  async getOfficerAttendance(officerId: string | number, year: number, month: number) { return this.request<any>(`/attendance/officer/${officerId}?year=${year}&month=${month}`); }
  async getAttendanceLeaderboard() { return this.request<LeaderboardEntry[]>('/attendance/leaderboard'); }
  async checkIn(time: string, isTemporary: boolean = false) { return this.request<any>('/attendance/check-in', { method: 'POST', body: JSON.stringify({ time, isTemporary }) }); }
  async importBiometricLogs(logs: any[]) { return this.request<any>('/attendance/import', { method: 'POST', body: JSON.stringify({ logs }) }); }
  async syncBiometricsToAvailability() { return this.request<any>('/presence/sync-biometrics', { method: 'POST' }); }
  async deleteBiometricLog(logId: string | number) { return this.request<any>(`/biometrics/logs/${logId}`, { method: 'DELETE' }); }
  async mapBiometricId(officerId: string | number, biometricId: string) { return this.request<any>(`/staff/${officerId}/map-biometric`, { method: 'POST', body: JSON.stringify({ biometricId }) }); }
  async getOfficerBiometricHistory(officerId: string | number) { return this.request<any[]>(`/staff/${officerId}/biometric-history`); }
  async getUnavailability(date?: string) { return this.request<Unavailability[]>(`/presence/unavailability${date ? `?date=${date}` : ''}`); }
  async markUnavailability(data: { date: string, slot: 'FULL' | 'AM' | 'PM', reason?: string, officer_id?: string | number }) { return this.request<Unavailability>('/presence/unavailability', { method: 'POST', body: JSON.stringify(data) }); }
  async deleteUnavailability(id: string | number) { return this.request<any>(`/presence/unavailability/${id}`, { method: 'DELETE' }); }
  async getExecutiveAvailabilitySummary(date?: string) { return this.request<any[]>(`/presence/executive-status${date ? `?date=${date}` : ''}`); }
  async getAllStaff() { return this.request<any[]>('/staff'); }
  async getOfficerDetails(id: string | number) { return this.request<any>(`/staff/${id}/details`); }
  async createStaff(data: any) { return this.request<any>('/staff', { method: 'POST', body: JSON.stringify(data) }); }
  async updateStaff(id: string | number, data: any) { return this.request<any>(`/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteStaff(id: string | number) { return this.request<any>(`/staff/${id}`, { method: 'DELETE' }); }
  async getDepartments() { return this.request<Department[]>('/config/departments'); }
  async createDepartment(name: string) { return this.request<Department>('/config/departments', { method: 'POST', body: JSON.stringify({ name }) }); }
  async deleteDepartment(id: string | number) { return this.request<any>(`/config/departments/${id}`, { method: 'DELETE' }); }
  async getDesignations() { return this.request<Designation[]>('/config/designations'); }
  async createDesignation(name: string) { return this.request<Designation>('/config/designations', { method: 'POST', body: JSON.stringify({ name }) }); }
  async deleteDesignation(id: string | number) { return this.request<any>(`/config/designations/${id}`, { method: 'DELETE' }); }
  async getDivisionalSettings() { return this.request<Record<string, string>>('/settings'); }
  async updateDivisionalSettings(settings: Record<string, string>) { return this.request<any>('/settings', { method: 'PUT', body: JSON.stringify(settings) }); }
  async getHolidays() { return this.request<any[]>('/settings/holidays'); }
  async createHoliday(data: any) { return this.request<any>('/settings/holidays', { method: 'POST', body: JSON.stringify(data) }); }
  async deleteHoliday(id: string | number) { return this.request<any>(`/settings/holidays/${id}`, { method: 'DELETE' }); }
  async getAuditLogs() { return this.request<any>('/audit'); }
  async getDepartmentLayout(section: string) { return this.request<any[]>(`/layout/mapping?section=${encodeURIComponent(section)}`); }
  async saveDepartmentLayout(section: string, layouts: any[]) { return this.request<any>('/layout/mapping', { method: 'POST', body: JSON.stringify({ section, layouts }) }); }
  async getMyLeaves() { return this.request<LeaveRequest[]>('/leaves'); }
  async getLeaveBalances(officerId?: string | number) { return this.request<any>(`/leaves/balances${officerId ? `?officer_id=${officerId}` : ''}`); }
  async applyForLeave(data: any) { return this.request<any>('/leaves', { method: 'POST', body: JSON.stringify(data) }); }
  async getPendingLeaves() { return this.request<LeaveRequest[]>('/admin/leaves/pending'); }
  async updateLeaveStatus(id: string | number, status: string) { return this.request<any>(`/leaves/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); }
  async getResources() { return this.request<Resource[]>('/resources'); }
  async createResource(data: any) { return this.request<Resource>('/resources', { method: 'POST', body: JSON.stringify(data) }); }
  async updateResource(id: string | number, data: any) { return this.request<Resource>(`/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteResource(id: string | number) { return this.request<any>(`/resources/${id}`, { method: 'DELETE' }); }
  async getMyResourceBookings() { return this.request<ResourceBooking[]>(`/resources/my-bookings`); }
  async bookResource(data: any) { return this.request<ResourceBooking>('/resources/bookings', { method: 'POST', body: JSON.stringify(data) }); }
  async getPendingResourceApprovals() { return this.request<ResourceBooking[]>('/admin/resources/pending'); }
  async updateBookingStatus(id: string | number, status: string) { return this.request<any>(`/resources/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); }
  async getJournal(date?: string, mode: string = 'DAILY') { return this.request<any[]>(`/journal?date=${date || ''}&mode=${mode}`); }
  async saveJournalEntry(entry: any) { return this.request<any>('/journal', { method: 'POST', body: JSON.stringify(entry) }); }
  async getCircles() { return this.request<any[]>('/circles'); }
  async createCircle(data: any) { return this.request<any>('/circles', { method: 'POST', body: JSON.stringify(data) }); }
  async getProjects(circleId: string | number) { return this.request<any[]>(`/circles/${circleId}/projects`); }
  async createProject(circleId: string | number, data: any) { return this.request<any>(`/circles/${circleId}/projects`, { method: 'POST', body: JSON.stringify(data) }); }
  async getTasks(projectId: string | number) { return this.request<any[]>(`/projects/${projectId}/tasks`); }
  async createTask(projectId: string | number, data: any) { return this.request<any>(`/projects/${projectId}/tasks`, { method: 'POST', body: JSON.stringify(data) }); }
  async addTaskUpdate(taskId: string | number, content: string) { return this.request<any>(`/tasks/${taskId}/updates`, { method: 'POST', body: JSON.stringify({ content, type: 'MESSAGE' }) }); }
  async getCirculars() { return this.request<Circular[]>('/circulars'); }
  async createCircular(data: any) { return this.request<Circular>('/circulars', { method: 'POST', body: JSON.stringify(data) }); }
  async deleteCircular(id: string | number) { return this.request<any>(`/circulars/${id}`, { method: 'DELETE' }); }
  async signOffCircular(id: string | number) { return this.request<any>(`/circulars/${id}/sign-off`, { method: 'POST' }); }
  async getCommunityPosts() { return this.request<any[]>('/community/posts'); }
  async saveCommunityPost(content: string, images?: string[]) { return this.request<any>('/community/posts', { method: 'POST', body: JSON.stringify({ content, images }) }); }
  async deleteCommunityPost(id: string | number) { return this.request<any>(`/community/posts/${id}`, { method: 'DELETE' }); }
  async togglePostLike(id: string | number) { return this.request<any>(`/community/posts/${id}/like`, { method: 'POST' }); }
  async addPostComment(id: string | number, content: string) { return this.request<any>(`/community/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }); }
  async deletePostComment(id: string | number) { return this.request<any>(`/community/comments/${id}`, { method: 'DELETE' }); }
  async updateManualAttendance(data: any) { return this.request<any>('/attendance/manual', { method: 'POST', body: JSON.stringify(data) }); }
  async getAlbums() { return this.request<any[]>('/gallery/albums'); }
  async getAlbum(id: string | number) { return this.request<any>(`/gallery/albums/${id}`); }
  async createAlbum(data: any) { return this.request<any>('/gallery/albums', { method: 'POST', body: JSON.stringify(data) }); }
  async updateAlbum(id: string | number, data: any) { return this.request<any>(`/gallery/albums/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteAlbum(id: string | number) { return this.request<any>(`/gallery/albums/${id}`, { method: 'DELETE' }); }
  async uploadAlbumPhoto(albumId: string | number, url: string) { return this.request<any>(`/gallery/albums/${albumId}/photos`, { method: 'POST', body: JSON.stringify({ url }) }); }
  async deleteAlbumPhoto(albumId: string | number, photoId: string | number) { return this.request<any>(`/gallery/albums/${albumId}/photos/${photoId}`, { method: 'DELETE' }); }
  async setAlbumThumbnail(id: string | number, url: string) { return this.request<any>(`/gallery/albums/${id}/thumbnail`, { method: 'POST', body: JSON.stringify({ url }) }); }

  async uploadImage(image: string, filename?: string) { return this.request<{ url: string }>('/upload', { method: 'POST', body: JSON.stringify({ image, filename }) }); }
  async uploadVideoFile(video: string, filename?: string) { return this.request<{ url: string }>('/upload', { method: 'POST', body: JSON.stringify({ video, filename }) }); }

  // Dashboard Module
  async getIntelligenceSnapshot(date?: string) { return this.request<any>(`/intelligence/snapshot${date ? `?date=${date}` : ''}`); }
  async getPublicDashboardData() { return this.request<any>('/public-dashboard/data'); }
  async updateOfficerStatus(status: string, eta?: string) { return this.request<any>('/dashboard/status', { method: 'POST', body: JSON.stringify({ status, eta }) }); }
  
  async getDashboardNotices() { return this.request<any[]>('/dashboard/notices'); }
  async createDashboardNotice(data: any) { return this.request<any>('/dashboard/notices', { method: 'POST', body: JSON.stringify(data) }); }
  async updateDashboardNotice(id: string | number, data: any) { return this.request<any>(`/dashboard/notices/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteDashboardNotice(id: string | number) { return this.request<any>(`/dashboard/notices/${id}`, { method: 'DELETE' }); }
  
  async getDashboardEvents() { return this.request<any[]>('/dashboard/events'); }
  async createDashboardEvent(data: any) { return this.request<any>('/dashboard/events', { method: 'POST', body: JSON.stringify(data) }); }
  async updateDashboardEvent(id: string | number, data: any) { return this.request<any>(`/dashboard/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteDashboardEvent(id: string | number) { return this.request<any>(`/dashboard/events/${id}`, { method: 'DELETE' }); }
  
  async getDashboardVideos() { return this.request<any[]>('/dashboard/videos'); }
  async createDashboardVideo(data: any) { return this.request<any>('/dashboard/videos', { method: 'POST', body: JSON.stringify(data) }); }
  async reorderVideos(videoIds: (string | number)[]) { return this.request<any>('/dashboard/videos/reorder', { method: 'POST', body: JSON.stringify({ videoIds }) }); }
  async deleteDashboardVideo(id: string | number) { return this.request<any>(`/dashboard/videos/${id}`, { method: 'DELETE' }); }
  
  async getDashboardSlots() { return this.request<any[]>('/dashboard/slots'); }
  async updateDashboardSlot(id: string, data: any) { return this.request<any>(`/dashboard/slots/${id}`, { method: 'POST', body: JSON.stringify(data) }); }
  
  async getEmergencyAlerts() { return this.request<any[]>('/dashboard/alerts'); }
  async createEmergencyAlert(data: any) { return this.request<any>('/dashboard/alerts', { method: 'POST', body: JSON.stringify(data) }); }
  async updateEmergencyAlert(id: string | number, data: any) { return this.request<any>(`/dashboard/alerts/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  async deleteEmergencyAlert(id: string | number) { return this.request<any>(`/dashboard/alerts/${id}`, { method: 'DELETE' }); }
  
  async getDashboardSettings() { return this.request<any>('/dashboard/settings'); }
  async updateDashboardSettings(settings: any) { return this.request<any>('/dashboard/settings', { method: 'POST', body: JSON.stringify({ settings }) }); }

  async getDashboardOfficers() { return this.request<any[]>('/dashboard/officers'); }
  async updateOfficerDashboardStatus(id: string | number, status: string, eta?: string) { 
    return this.request<any>(`/dashboard/officers/${id}/status`, { method: 'POST', body: JSON.stringify({ status, eta }) }); 
  }

  async setupDatabase() { return this.request<any>('/setup-db', { method: 'POST' }); }
}

export const api = new ApiClient();
