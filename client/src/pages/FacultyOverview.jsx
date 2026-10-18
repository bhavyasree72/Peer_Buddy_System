import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Users, Calendar, CheckCircle2, TrendingUp } from 'lucide-react';

export default function FacultyOverview({ user }) {
  const [data, setData] = useState({
    department: 'Computer Science & Engineering',
    metrics: { activeStudents: 0, sessionsThisWeek: 0, attendancePercentage: 100 },
    chartData: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    try {
      const res = await api.getFacultyOverview();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate max sessions for bar height normalization
  const maxBar = Math.max(1, ...(data.chartData || []).map(c => c.sessions));

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Faculty Department Overview</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Real-time academic participation and study session volume for {data.department}.
        </p>
      </div>

      {/* Department Summary Tiles from FIX 5: active students, sessions this week, attendance percentage */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Users size={18} color="#E4574C" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Active Students in Department</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>
            {data.metrics.activeStudents}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Calendar size={18} color="#E4574C" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sessions Held This Week</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>
            {data.metrics.sessionsThisWeek}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <CheckCircle2 size={18} color="#166534" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Attendance Rate</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#166534' }}>
            {data.metrics.attendancePercentage}%
          </div>
        </div>
      </div>

      {/* Weekly sessions chart built from real database data */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <TrendingUp size={20} color="#E4574C" />
          <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Weekly Study Session Volume</h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '200px', padding: '0 20px 20px 20px', borderBottom: '1px solid var(--border)', gap: '12px' }}>
          {data.chartData && data.chartData.map(item => {
            const heightPct = Math.max(10, Math.round((item.sessions / maxBar) * 160));
            return (
              <div key={item.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-main)' }}>
                  {item.sessions}
                </span>
                <div
                  style={{
                    width: '100%',
                    maxWidth: '36px',
                    height: `${heightPct}px`,
                    backgroundColor: item.sessions > 0 ? '#E4574C' : 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s'
                  }}
                  title={`${item.date}: ${item.sessions} session(s)`}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {item.day}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Past 7 Days Session Activity
        </div>
      </div>
    </div>
  );
}
