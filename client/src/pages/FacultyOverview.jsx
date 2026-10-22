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

      {/* Department Summary Tiles: active students & sessions held this week */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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
      </div>
    </div>
  );
}
