import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Download, Calendar, Users, MessageSquare, Star, Clock } from 'lucide-react';

export default function ActivityHistory({ user }) {
  const [activeTab, setActiveTab] = useState('buddies'); // 'buddies', 'sessions', 'chats', 'feedback'
  const [data, setData] = useState({
    summary: {
      completedThisMonth: 0,
      totalStudyHours: '0.0',
      buddiesConnected: 0,
      averageRating: null,
      reviewCount: 0
    },
    buddies: [],
    sessions: [],
    chats: [],
    feedback: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await api.getActivityHistory();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleExportPDF() {
    window.print();
  }

  const { summary } = data;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Activity History</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Comprehensive log of your peer connections, study hours, and academic feedback.
          </p>
        </div>

        {/* Export PDF button from doc 7.3 Screen 13 */}
        <button className="btn-secondary" onClick={handleExportPDF} style={{ minHeight: '38px', fontSize: '13px' }}>
          <Download size={15} /> Export PDF summary
        </button>
      </div>

      {/* Summary Tiles from doc 7.3 Screen 13: Completed this month, Total study hours, Buddies connected, Average rating */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Calendar size={18} color="var(--accent)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sessions This Month</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' }}>
            {summary.completedThisMonth}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Clock size={18} color="var(--accent)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Total Study Hours</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' }}>
            {summary.totalStudyHours} hrs
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Users size={18} color="var(--accent)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Buddies Connected</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' }}>
            {summary.buddiesConnected}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Star size={18} color="#B45309" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Average Rating</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)' }}>
            {summary.averageRating ? `${summary.averageRating} / 5` : 'N/A (< 3 reviews)'}
          </div>
        </div>
      </div>

      {/* 4 Tabs from doc 7.3 Screen 13: Buddies, Sessions, Chats, Feedback */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('buddies')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'buddies' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'buddies' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'buddies' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Buddies History
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'sessions' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'sessions' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'sessions' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Study Sessions
        </button>

        <button
          onClick={() => setActiveTab('feedback')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'feedback' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'feedback' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'feedback' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Feedback Received
        </button>
      </div>

      {/* Clean Table per tab from doc 7.3 Screen 13 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {activeTab === 'buddies' && (
          data.buddies.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No buddy history recorded yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>Buddy Name</th>
                  <th style={{ padding: '12px 16px' }}>Program & Semester</th>
                  <th style={{ padding: '12px 16px' }}>Connected Since</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.buddies.map(b => (
                  <tr key={b.connection_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: '500' }}>{b.buddy_name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{b.program_name} • Sem {b.semester}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge" style={{ textTransform: 'capitalize' }}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {activeTab === 'sessions' && (
          data.sessions.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No study sessions recorded yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>Title & Subject</th>
                  <th style={{ padding: '12px 16px' }}>Partner</th>
                  <th style={{ padding: '12px 16px' }}>Date & Time</th>
                  <th style={{ padding: '12px 16px' }}>Mode</th>
                  <th style={{ padding: '12px 16px' }}>Attendance</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map(s => (
                  <tr key={s.session_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <strong>{s.title}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.subject}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{s.partner_name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                      {new Date(s.start_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{s.mode.replace('_', ' ')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.my_attendance ? (
                        <span className="badge" style={{ textTransform: 'capitalize' }}>{s.my_attendance}</span>
                      ) : '-'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge-neutral badge" style={{ textTransform: 'capitalize' }}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}



        {activeTab === 'feedback' && (
          data.feedback.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No feedback reviews received yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>From Peer</th>
                  <th style={{ padding: '12px 16px' }}>Session / Subject</th>
                  <th style={{ padding: '12px 16px' }}>Ratings</th>
                  <th style={{ padding: '12px 16px' }}>Comment</th>
                  <th style={{ padding: '12px 16px' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.feedback.map(f => {
                  const avg = ((f.punctuality + f.helpfulness + f.communication) / 3).toFixed(1);
                  return (
                    <tr key={f.review_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: '500' }}>{f.reviewer_name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div>{f.session_title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{f.subject}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', color: '#B45309' }}>
                          <Star size={14} fill="#B45309" color="#B45309" />
                          {avg} / 5
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Punct: {f.punctuality} • Help: {f.helpfulness} • Comm: {f.communication}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', maxWidth: '300px' }}>
                        {f.comment || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No comment</span>}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {new Date(f.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
