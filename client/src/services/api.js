import { auth } from '../firebase';

const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'https://peer-buddy-api.onrender.com/api';
  }
  return '/api';
};

const API_BASE = getApiBase();

export async function apiRequest(endpoint, method = 'GET', data = null, customHeaders = {}, signal = null) {
  let token = typeof window !== 'undefined' 
    ? (sessionStorage.getItem('token') || localStorage.getItem('token'))
    : null;

  if (typeof window !== 'undefined' && auth && auth.currentUser) {
    try {
      const freshToken = await auth.currentUser.getIdToken(false);
      if (freshToken) {
        token = freshToken;
        sessionStorage.setItem('token', freshToken);
        localStorage.setItem('token', freshToken);
      }
    } catch (e) {}
  }

  const headers = {
    ...customHeaders
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
    ...(signal ? { signal } : {})
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
  const contentType = res.headers.get('content-type') || '';
  let json = {};

  if (contentType.includes('application/json')) {
    json = await res.json().catch(() => ({}));
  } else {
    // If the server returned HTML (e.g., static hosting rewrite index.html or 404 page)
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
    }
    // Static hosting rewrite intercepted an API endpoint
    throw new Error('API returned an HTML response instead of JSON. The backend server might be starting up or unreachable.');
  }

  if (!res.ok) {
    throw new Error(json.error || 'A network error occurred.');
  }

  return json;
}

export const api = {
  // Auth
  login: (creds) => apiRequest('/auth/login', 'POST', creds),
  register: (data) => apiRequest('/auth/register', 'POST', data),
  syncProfile: (data, idToken) => apiRequest('/auth/sync-profile', 'POST', data, idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  firebaseLogin: (data) => apiRequest('/auth/firebase-login', 'POST', data),
  completeProfile: (data, idToken) => apiRequest('/auth/complete-profile', 'POST', data, idToken ? { Authorization: `Bearer ${idToken}` } : {}),
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
  sendRequest: async (data) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await apiRequest('/requests/send', 'POST', data, {}, controller.signal);
      clearTimeout(timeoutId);
      if (res && res.message) return res;
    } catch (apiErr) {
      console.warn('[sendRequest] API attempt notice, writing directly to Cloud Firestore:', apiErr.message);
    }

    // Direct Cloud Firestore fallback
    try {
      const { db, auth } = await import('../firebase');
      const { collection, doc, setDoc, getDocs } = await import('firebase/firestore');

      const currentUser = (() => {
        try {
          return JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user'));
        } catch (e) {
          return null;
        }
      })();

      const myUid = auth.currentUser?.uid || currentUser?.userId || currentUser?.user_id;
      if (!myUid) {
        throw new Error('Authentication required. Please sign in again.');
      }

      const receiverId = data.receiverId;
      const note = (data.note || '').trim();

      // Check if already connected or requested
      const [connsSnap, reqsSnap] = await Promise.all([
        getDocs(collection(db, 'connections')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'buddy_requests')).catch(() => ({ docs: [] }))
      ]);

      const isConnected = connsSnap.docs.some(d => {
        const c = d.data();
        return c.status === 'active' && ((c.user_a === myUid && c.user_b === receiverId) || (c.user_b === myUid && c.user_a === receiverId));
      });
      if (isConnected) {
        throw new Error('You are already connected with this student.');
      }

      const isPending = reqsSnap.docs.some(d => {
        const r = d.data();
        return r.status === 'pending' && r.sender_id === myUid && r.receiver_id === receiverId;
      });
      if (isPending) {
        return { success: true, message: 'Buddy request already sent and awaiting response.' };
      }

      const newReqRef = doc(collection(db, 'buddy_requests'));
      await setDoc(newReqRef, {
        id: newReqRef.id,
        sender_id: myUid,
        receiver_id: receiverId,
        note: note,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const senderName = currentUser?.fullName || 'A student';
      const newNotifRef = doc(collection(db, 'notifications'));
      await setDoc(newNotifRef, {
        id: newNotifRef.id,
        notification_id: newNotifRef.id,
        user_id: receiverId,
        type: 'buddy_request',
        message: `${senderName} sent you a buddy request: "${note || 'Study partner invitation'}"`,
        link: '/my-buddies',
        is_read: 0,
        created_at: new Date().toISOString()
      }).catch(() => {});

      return {
        success: true,
        message: 'Buddy request sent successfully!'
      };
    } catch (fbErr) {
      console.error('[sendRequest] Firestore fallback error:', fbErr);
      throw fbErr;
    }
  },
  respondRequest: async (requestId, action) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await apiRequest(`/requests/${requestId}/respond`, 'POST', { action }, {}, controller.signal);
      clearTimeout(timeoutId);
      if (res && res.message) return res;
    } catch (apiErr) {
      console.warn('[respondRequest] API notice, writing directly to Cloud Firestore:', apiErr.message);
    }
    const { db, auth } = await import('../firebase');
    const { doc, updateDoc, setDoc, collection, getDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'buddy_requests', requestId), {
      status: action === 'accept' ? 'accepted' : 'rejected',
      updated_at: new Date().toISOString()
    });
    if (action === 'accept') {
      const reqSnap = await getDoc(doc(db, 'buddy_requests', requestId));
      const rData = reqSnap.exists() ? reqSnap.data() : null;
      const myUid = auth.currentUser?.uid || JSON.parse(sessionStorage.getItem('user') || '{}')?.userId;
      if (rData) {
        const newConnRef = doc(collection(db, 'connections'));
        await setDoc(newConnRef, {
          id: newConnRef.id,
          connection_id: newConnRef.id,
          user_a: rData.sender_id,
          user_b: myUid || rData.receiver_id,
          status: 'active',
          created_at: new Date().toISOString()
        });
      }
    }
    return {
      success: true,
      message: action === 'accept' ? 'Buddy request accepted! Connection established.' : 'Buddy request declined.'
    };
  },
  cancelRequest: async (requestId) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await apiRequest(`/requests/${requestId}/cancel`, 'POST', null, {}, controller.signal);
      clearTimeout(timeoutId);
      if (res && res.message) return res;
    } catch (apiErr) {
      console.warn('[cancelRequest] API notice, writing directly to Cloud Firestore:', apiErr.message);
    }
    const { db } = await import('../firebase');
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'buddy_requests', requestId), {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    });
    return { success: true, message: 'Buddy request cancelled.' };
  },
  getRequests: () => apiRequest('/requests'),
  disconnectBuddy: async (connId) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await apiRequest(`/requests/disconnect/${connId}`, 'POST', null, {}, controller.signal);
      clearTimeout(timeoutId);
      if (res && res.message) return res;
    } catch (apiErr) {
      console.warn('[disconnectBuddy] API notice, writing directly to Cloud Firestore:', apiErr.message);
    }
    const { db } = await import('../firebase');
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'connections', connId), {
      status: 'ended',
      ended_at: new Date().toISOString()
    });
    return { success: true, message: 'Buddy connection ended.' };
  },

  // Chat
  getConversations: () => apiRequest('/chat/conversations'),
  getMessages: (connId) => apiRequest(`/chat/messages/${connId}`),
  sendMessage: (formData) => apiRequest('/chat/send', 'POST', formData),
  startDirectChat: (targetUserId) => apiRequest('/chat/start-direct', 'POST', { targetUserId }),

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
  allocateResource: (resourceId, studentIds) => apiRequest(`/mentor/resources/${resourceId}/allocate`, 'POST', { studentIds }),
  downloadResourceUrl: (resourceId) => `${API_BASE}/mentor/resources/${resourceId}/download`,
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

api.apiRequest = apiRequest;
