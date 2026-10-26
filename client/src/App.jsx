import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Sidebar from './components/Sidebar';
import AuthPage from './pages/AuthPage';
import StudentHome from './pages/StudentHome';
import FindBuddies from './pages/FindBuddies';
import MyBuddies from './pages/MyBuddies';
import ChatPage from './pages/ChatPage';
import SessionsPage from './pages/SessionsPage';
import ResourcesPage from './pages/ResourcesPage';
import NotificationsPage from './pages/NotificationsPage';
import ActivityHistory from './pages/ActivityHistory';
import MyProfile from './pages/MyProfile';
import MentorHome from './pages/MentorHome';
import MentorReviewRequests from './pages/MentorReviewRequests';
import MentorStudents from './pages/MentorStudents';
import MentorMessages from './pages/MentorMessages';
import FacultyOverview from './pages/FacultyOverview';
import FacultySessions from './pages/FacultySessions';
import FacultyStudents from './pages/FacultyStudents';
import FacultyReports from './pages/FacultyReports';
import AdminOverview from './pages/AdminOverview';
import AdminUsers from './pages/AdminUsers';
import AdminReports from './pages/AdminReports';
import AdminMasterData from './pages/AdminMasterData';
import AdminAnnouncements from './pages/AdminAnnouncements';
import AdminSettings from './pages/AdminSettings';
import AdminAuditLog from './pages/AdminAuditLog';
import BuddyProfileView from './pages/BuddyProfileView';
import RateBuddyModal from './components/RateBuddyModal';
import ReportDialog from './components/ReportDialog';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('user') || localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [activePage, setActivePage] = useState('home');
  const [unreadCount, setUnreadCount] = useState(0);

  // Cross-page navigation parameters
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [chatConnectionId, setChatConnectionId] = useState(null);
  const [scheduleData, setScheduleData] = useState({ partnerId: null, connectionId: null });

  // Modals
  const [rateModalData, setRateModalData] = useState(null);
  const [reportModalData, setReportModalData] = useState(null);

  useEffect(() => {
    if (currentUser) {
      loadUnreadCount();
      const interval = setInterval(loadUnreadCount, 30000);

      // Recheck Firebase verification status on return to application (tab-scoped)
      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser && currentUser && currentUser.role !== 'admin') {
          const currentId = currentUser.userId || currentUser.user_id;
          // Ensure this auth state event belongs to THIS tab's user before acting
          if (fbUser.uid === currentId || fbUser.email === currentUser.email) {
            try {
              await fbUser.reload();
              if (!fbUser.emailVerified) {
                console.warn('[App] Verification required. Redirecting to login.');
                handleLogout();
              }
            } catch (e) {}
          }
        }
      });

      return () => {
        clearInterval(interval);
        unsubscribe();
      };
    }
  }, [currentUser]);

  async function loadUnreadCount() {
    if (!currentUser) return;
    try {
      const res = await api.getNotifications();
      setUnreadCount(res.unreadCount || 0);
    } catch (err) {
      console.error(err);
    }
  }

  function handleLoginSuccess(user) {
    setCurrentUser(user);
    setActivePage('home');
  }

  function handleLogout() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentUser(null);
    setActivePage('home');
  }

  // Cross-navigation handlers
  function handleSelectProfile(userId) {
    setSelectedProfileId(userId);
    setActivePage('view-profile');
  }

  function handleNavigateChat(connId) {
    setChatConnectionId(connId);
    setActivePage('chat');
  }

  function handleNavigateSchedule(partnerId, connId) {
    setScheduleData({ partnerId, connectionId: connId });
    setActivePage('sessions');
  }

  function handleOpenReport(reportedUserId, connId) {
    setReportModalData({ reportedUserId, connectionId: connId });
  }

  if (!currentUser) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        user={currentUser}
        activePage={activePage}
        setActivePage={(p) => {
          setSelectedProfileId(null);
          setActivePage(p);
        }}
        unreadCount={unreadCount}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="main-content">
        {/* Student View Screens */}
        {currentUser.role === 'student' && (
          <>
            {activePage === 'home' && (
              <StudentHome user={currentUser} onNavigate={setActivePage} />
            )}

            {activePage === 'find-buddies' && (
              <FindBuddies onSelectProfile={handleSelectProfile} />
            )}

            {activePage === 'my-buddies' && (
              <MyBuddies
                onSelectProfile={handleSelectProfile}
                onNavigateChat={handleNavigateChat}
                onNavigateSchedule={handleNavigateSchedule}
              />
            )}

            {activePage === 'chat' && (
              <ChatPage
                initialConnectionId={chatConnectionId}
                onNavigateSchedule={handleNavigateSchedule}
                onSelectProfile={handleSelectProfile}
                onOpenReport={handleOpenReport}
              />
            )}

            {activePage === 'sessions' && (
              <SessionsPage
                initialPartnerId={scheduleData.partnerId}
                initialConnId={scheduleData.connectionId}
                onOpenRateModal={(sessionId, title) => setRateModalData({ sessionId, title })}
              />
            )}

            {activePage === 'resources' && (
              <ResourcesPage user={currentUser} />
            )}

            {activePage === 'history' && (
              <ActivityHistory user={currentUser} />
            )}

            {activePage === 'profile' && (
              <MyProfile user={currentUser} />
            )}

            {activePage === 'view-profile' && (
              <BuddyProfileView
                userId={selectedProfileId}
                onBack={() => setActivePage('find-buddies')}
                onNavigateChat={handleNavigateChat}
                onNavigateSchedule={handleNavigateSchedule}
                onOpenReport={handleOpenReport}
              />
            )}
          </>
        )}

        {/* Mentor View Screens */}
        {currentUser.role === 'mentor' && (
          <>
            {activePage === 'home' && <MentorHome user={currentUser} onNavigate={setActivePage} />}
            {activePage === 'students' && <MentorStudents user={currentUser} onSelectProfile={handleSelectProfile} onNavigateChat={handleNavigateChat} />}
            {activePage === 'sessions' && (
              <SessionsPage
                initialPartnerId={scheduleData.partnerId}
                initialConnId={scheduleData.connectionId}
                onOpenRateModal={(sessionId, title) => setRateModalData({ sessionId, title })}
              />
            )}
            {activePage === 'chat' && (
              <ChatPage
                initialConnectionId={chatConnectionId}
                onNavigateSchedule={handleNavigateSchedule}
                onSelectProfile={handleSelectProfile}
                onOpenReport={handleOpenReport}
              />
            )}
            {activePage === 'resources' && <ResourcesPage user={currentUser} />}
            {activePage === 'messages' && <MentorMessages user={currentUser} />}
            {activePage === 'profile' && <MyProfile user={currentUser} />}
            {activePage === 'view-profile' && (
              <BuddyProfileView
                userId={selectedProfileId}
                onBack={() => setActivePage('students')}
                onNavigateChat={handleNavigateChat}
                onNavigateSchedule={handleNavigateSchedule}
                onOpenReport={handleOpenReport}
              />
            )}
          </>
        )}

        {/* Faculty View Screens */}
        {currentUser.role === 'faculty' && (
          <>
            {activePage === 'home' && <FacultyOverview user={currentUser} />}
            {activePage === 'students' && <FacultyStudents user={currentUser} />}
            {activePage === 'profile' && <MyProfile user={currentUser} />}
            {activePage === 'view-profile' && (
              <BuddyProfileView
                userId={selectedProfileId}
                onBack={() => setActivePage('students')}
                onNavigateSchedule={handleNavigateSchedule}
                onOpenReport={handleOpenReport}
              />
            )}
          </>
        )}

        {/* Administrator View Screens */}
        {currentUser.role === 'admin' && (
          <>
            {activePage === 'home' && <AdminOverview user={currentUser} />}
            {activePage === 'admin-users' && <AdminUsers user={currentUser} />}
            {activePage === 'admin-reports' && <AdminReports user={currentUser} />}
            {activePage === 'admin-master' && <AdminMasterData user={currentUser} />}
            {activePage === 'admin-announcements' && <AdminAnnouncements user={currentUser} />}
            {activePage === 'admin-settings' && <AdminSettings user={currentUser} />}
            {activePage === 'admin-audit' && <AdminAuditLog user={currentUser} />}
          </>
        )}
      </main>

      {/* Global Modals */}
      {rateModalData && (
        <RateBuddyModal
          sessionData={rateModalData}
          onClose={() => setRateModalData(null)}
          onSubmitted={() => {}}
        />
      )}

      {reportModalData && (
        <ReportDialog
          reportedUserId={reportModalData.reportedUserId}
          connectionId={reportModalData.connectionId}
          onClose={() => setReportModalData(null)}
        />
      )}
    </div>
  );
}
