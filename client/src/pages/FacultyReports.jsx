import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { BarChart3, Star, CheckCircle2 } from 'lucide-react';

export default function FacultyReports({ user }) {
  const [data, setData] = useState({
    summary: { totalSessions: 0, completedSessions: 0, avgRating: '5.0' },
    subjectBreakdown: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await api.getFacultyReports();
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
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Academic Reports</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Aggregate analysis of peer study subjects, session completion, and quality ratings.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <BarChart3 size={18} color="#E4574C" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Total Scheduled</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700' }}>
            {data.summary.totalSessions}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <CheckCircle2 size={18} color="#166534" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Completed Sessions</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#166534' }}>
            {data.summary.completedSessions}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Star size={18} color="#B45309" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Average Feedback Rating</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#B45309' }}>
            ★ {data.summary.avgRating} / 5.0
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          Top Study Subjects
        </h2>

        {data.subjectBreakdown.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px' }}>
            <p>No subject session data recorded yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.subjectBreakdown.map((sb, idx) => (
              <div
                key={sb.subject}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-subtle)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: '700', color: '#E4574C', minWidth: '24px' }}>#{idx + 1}</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)' }}>{sb.subject}</span>
                </div>
                <span className="badge" style={{ backgroundColor: '#FFF3F1', color: '#E4574C' }}>
                  {sb.count} session(s)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
