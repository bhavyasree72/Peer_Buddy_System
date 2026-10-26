import React from 'react';
import { 
  Home, 
  Search, 
  Users, 
  MessageSquare, 
  Calendar, 
  BookOpen, 
  Bell, 
  User, 
  ShieldAlert, 
  GraduationCap, 
  BarChart3, 
  LogOut,
  Clock
} from 'lucide-react';

export default function Sidebar({ user, activePage, setActivePage, unreadCount, onLogout }) {
  if (!user) return null;

  // Student Navigation from doc 7.2:
  // Home, Find Buddies, My Buddies, Chat, Sessions, Resources, Notifications, Profile
  const studentNav = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'find-buddies', label: 'Find Buddies', icon: Search },
    { id: 'my-buddies', label: 'My Buddies', icon: Users },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'sessions', label: 'Sessions', icon: Calendar },
    { id: 'resources', label: 'Resources', icon: BookOpen },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  // Mentor Navigation: Home, My Students, Sessions, Chat, Resources, Messages, Profile
  const mentorNav = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'students', label: 'My Students', icon: Users },
    { id: 'sessions', label: 'Sessions', icon: Calendar },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'resources', label: 'Resources', icon: BookOpen },
    { id: 'messages', label: 'Announcements', icon: ShieldAlert },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  // Faculty Navigation: Overview, Students, Profile (Chat, Sessions, and Reports strictly removed as requested)
  const facultyNav = [
    { id: 'home', label: 'Overview', icon: BarChart3 },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  // Administrator Navigation from doc 7.2:
  // Dashboard, Users, Reports, Master Data, Announcements, Settings, Audit Log
  const adminNav = [
    { id: 'home', label: 'Dashboard', icon: BarChart3 },
    { id: 'admin-users', label: 'Users', icon: Users },
    { id: 'admin-reports', label: 'Reports', icon: ShieldAlert },
    { id: 'admin-master', label: 'Master Data', icon: BookOpen },
    { id: 'admin-announcements', label: 'Announcements', icon: Bell },
    { id: 'admin-settings', label: 'Settings', icon: GraduationCap },
    { id: 'admin-audit', label: 'Audit Log', icon: Clock }
  ];

  let items = studentNav;
  if (user.role === 'mentor') items = mentorNav;
  if (user.role === 'faculty') items = facultyNav;
  if (user.role === 'admin') items = adminNav;

  return (
    <aside className="sidebar">
      {/* College Identity Header */}
      <div className="sidebar-header" style={{ padding: '24px 20px 16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: 'var(--accent)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontWeight: '700',
            fontSize: '16px'
          }}>
            N
          </div>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', lineHeight: '1.2' }}>
              Peer Buddy
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>NMIMS Platform</p>
          </div>
        </div>
      </div>

      {/* Role tag */}
      <div className="sidebar-role" style={{ padding: '12px 20px 8px 20px' }}>
        <span className="badge" style={{ textTransform: 'capitalize', width: 'fit-content' }}>
          {user.role} Portal
        </span>
      </div>

      {/* Navigation Links */}
      <nav style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setActivePage(item.id)}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    padding: '10px 12px',
                    backgroundColor: isActive ? 'var(--accent-tint)' : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-main)',
                    fontWeight: isActive ? '600' : '400',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <Icon size={18} color={isActive ? 'var(--accent)' : 'var(--text-muted)'} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                  {item.badge > 0 && (
                    <span style={{
                      backgroundColor: 'var(--accent)',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '999px',
                      fontWeight: '600'
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User info & Logout */}
      <div className="sidebar-footer" style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.fullName || user.email}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.email}
          </div>
        </div>
        <button
          onClick={onLogout}
          className="btn-secondary"
          style={{ width: '100%', fontSize: '13px', padding: '8px 12px', minHeight: '38px' }}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
