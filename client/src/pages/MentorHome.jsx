import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ShieldAlert, Users, BookOpen, Clock, ArrowRight } from 'lucide-react';

export default function MentorHome({ user, onNavigate }) {
  const [data, setData] = useState({
    summary: { requestsToReview: 0, studentsCount: 0, resourcesShared: 0 },
    recentActivity: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadHome();
  }, []);

  async function loadHome() {
    setLoading(true);
    try {
      const res = await api.getMentorDashboard();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Mentor Overview</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Welcome back. Track pending buddy requests, active students, and recent guidance actions.
        </p>
      </div>

      {/* Summary Tiles: students assigned, resources shared */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="card" style={{ cursor: 'pointer' }} onClick={() => onNavigate && onNavigate('students')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Users size={20} color="#E4574C" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Students Allocated</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>
            {data.summary.studentsCount}
          </div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => onNavigate && onNavigate('resources')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <BookOpen size={20} color="#E4574C" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Resources Shared</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>
            {data.summary.resourcesShared}
          </div>
        </div>
      </div>

      {/* Short Recent Activity List */}
      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          Recent Activity
        </h2>

        {data.recentActivity && data.recentActivity.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.recentActivity.map(act => (
              <div
                key={act.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: '#FFFFFF'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Clock size={16} color="var(--text-muted)" />
                  <span style={{ fontSize: '14px', color: 'var(--text-main)' }}>{act.text}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {new Date(act.time).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '32px' }}>
            <p>No recent mentor activity recorded.</p>
          </div>
        )}
      </div>
    </div>
  );
}
