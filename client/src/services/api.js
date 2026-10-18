const API_BASE = '/api';

export async function apiRequest(endpoint, method = 'GET', data = null, customHeaders = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    ...customHeaders
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers
  };

  if (data) {
    if (data instanceof FormData) {
      // Don't set Content-Type for FormData; browser sets boundary
      options.body = data;
    } else {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(data);
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(json.error || 'A network error occurred.');
  }

  return json;
}

export const api = {
  // Auth
  login: (creds) => apiRequest('/auth/login', 'POST', creds),
  register: (data) => apiRequest('/auth/register', 'POST', data),
  getMe: () => apiRequest('/auth/me'),
  forgotPassword: (email) => apiRequest('/auth/forgot-password', 'POST', { email }),
  resetPassword: (data) => apiRequest('/auth/reset-password', 'POST', data),

  // Master Data
  getMasterData: () => apiRequest('/master/all'),

  // Profile
  getProfile: (userId) => apiRequest(userId ? `/profile/${userId}` : '/profile/me'),
  updateProfile: (data) => apiRequest('/profile', 'PUT', data),
  suggestSkill: (data) => apiRequest('/profile/suggest-skill', 'POST', data),

  // Search & Match
  searchBuddies: (params) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/buddies/search?${query}`);
  },
  getSuggestedBuddies: () => apiRequest('/buddies/suggested'),

  // Requests
  sendRequest: (data) => apiRequest('/requests/send', 'POST', data),
  respondRequest: (requestId, action) => apiRequest(`/requests/${requestId}/respond`, 'POST', { action }),
  cancelRequest: (requestId) => apiRequest(`/requests/${requestId}/cancel`, 'POST'),
  getRequests: () => apiRequest('/requests'),
  disconnectBuddy: (connId) => apiRequest(`/requests/disconnect/${connId}`, 'POST'),

  // Chat
  getConversations: () => apiRequest('/chat/conversations'),
  getMessages: (connId) => apiRequest(`/chat/messages/${connId}`),
  sendMessage: (formData) => apiRequest('/chat/send', 'POST', formData),

  // Sessions
  getSessions: () => apiRequest('/sessions'),
  proposeSession: (data) => apiRequest('/sessions/propose', 'POST', data),
  respondSession: (sessionId, data) => apiRequest(`/sessions/${sessionId}/respond`, 'POST', data),
  markAttendance: (sessionId, attended) => apiRequest(`/sessions/${sessionId}/attendance`, 'POST', { attended }),

  // Reviews & Reports
  submitReview: (data) => apiRequest('/reviews/submit', 'POST', data),
  createReport: (data) => apiRequest('/reports/create', 'POST', data),
  getMyReports: () => apiRequest('/reports/my'),

  // Notifications
  getNotifications: () => apiRequest('/notifications'),
  markNotificationsRead: (notificationId) => apiRequest('/notifications/mark-read', 'POST', { notificationId }),

  // Activity History
  getActivityHistory: () => apiRequest('/activity/history'),

  // Mentor
  getMentorDashboard: () => apiRequest('/mentor/dashboard'),
  getMentorReviewRequests: () => apiRequest('/mentor/review-requests'),
  getMentorStudents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/mentor/my-students?${query}`);
  },
  getMentorMessages: () => apiRequest('/mentor/messages'),
  reviewMentorRequest: (requestId, data) => apiRequest(`/mentor/reviews/${requestId}`, 'POST', data),
  uploadResource: (formData) => apiRequest('/mentor/resources/upload', 'POST', formData),
  getResources: (params) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/mentor/resources?${query}`);
  },
  sendGuidance: (data) => apiRequest('/mentor/guidance', 'POST', data),

  // Faculty
  getFacultyOverview: () => apiRequest('/faculty/overview'),
  getFacultySessions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/faculty/sessions?${query}`);
  },
  getFacultyStudents: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/faculty/students?${query}`);
  },
  getFacultyReports: () => apiRequest('/faculty/reports'),

  // Admin
  getAdminDashboard: () => apiRequest('/admin/dashboard'),
  getAdminUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/users?${query}`);
  },
  updateUserStatus: (userId, data) => apiRequest(`/admin/users/${userId}/status`, 'PUT', data),
  bulkImportUsers: (students) => apiRequest('/admin/users/bulk-import', 'POST', { students }),
  getAdminReports: () => apiRequest('/admin/reports'),
  handleReportAction: (reportId, data) => apiRequest(`/admin/reports/${reportId}/action`, 'POST', data),
  getAuditLog: () => apiRequest('/admin/audit-log'),
  updateSettings: (settings) => apiRequest('/admin/settings', 'POST', { settings }),
  createMasterSkill: (data) => apiRequest('/admin/skills', 'POST', data),
  getAdminMasterData: () => apiRequest('/admin/master-data'),
  addAdminMasterItem: (data) => apiRequest('/admin/master-data', 'POST', data),
  deleteAdminMasterItem: (data) => apiRequest('/admin/master-data', 'DELETE', data),
  getAdminAnnouncement: () => apiRequest('/admin/announcements'),
  saveAdminAnnouncement: (data) => apiRequest('/admin/announcements', 'POST', data)
};
