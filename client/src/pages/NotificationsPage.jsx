import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Bell, CheckCheck } from 'lucide-react';

export default function NotificationsPage({ onNavigate }) {
  const [data, setData] = useState({ grouped: { today: [], earlier: [] }, unreadCount: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    setLoading(true);
    try {
      const res = await api.getNotifications();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAll() {
    try {
      await api.markNotificationsRead();
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  }

  const { today, earlier } = data.grouped || { today: [], earlier: [] };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Notifications</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Updates on buddy requests, sessions, and academic messages.
          </p>
        </div>

        {/* Mark all as read button from doc 7.3 Screen 12 */}
        {data.unreadCount > 0 && (
          <button className="btn-secondary" style={{ fontSize: '13px', minHeight: '36px' }} onClick={handleMarkAll}>
            <CheckCheck size={16} /> Mark all as read
          </button>
        )}
      </div>

      {today.length === 0 && earlier.length === 0 ? (
        <div className="empty-state">
          <h3>No notifications</h3>
          <p>You have caught up with all your buddy invites and session reminders.</p>
        </div>
      ) : (
        <div style={{ maxWidth: '720px' }}>
          {/* Today Group */}
          {today.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>
                Today
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {today.map(n => (
                  <div
                    key={n.notification_id}
                    className="card"
                    style={{
                      padding: '14px 18px',
                      backgroundColor: n.is_read ? '#FFFFFF' : 'var(--accent-tint)',
                      fontWeight: n.is_read ? 'normal' : '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: n.link ? 'pointer' : 'default'
                    }}
                    onClick={() => {
                      if (n.link) onNavigate(n.link.replace('/', ''));
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-main)', fontSize: '14px' }}>{n.message}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {!n.is_read && (
                      <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent)', borderRadius: '50%' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Earlier Group */}
          {earlier.length > 0 && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>
                Earlier
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {earlier.map(n => (
                  <div
                    key={n.notification_id}
                    className="card"
                    style={{
                      padding: '14px 18px',
                      backgroundColor: n.is_read ? '#FFFFFF' : 'var(--accent-tint)',
                      fontWeight: n.is_read ? 'normal' : '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: n.link ? 'pointer' : 'default'
                    }}
                    onClick={() => {
                      if (n.link) onNavigate(n.link.replace('/', ''));
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-main)', fontSize: '14px' }}>{n.message}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    {!n.is_read && (
                      <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent)', borderRadius: '50%' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
