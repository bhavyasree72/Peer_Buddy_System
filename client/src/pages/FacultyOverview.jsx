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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} color="#166534" />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Verified Attendance Rate</span>
            </div>
            <span
              title="Attendance % = (Verified sessions attended / Total scheduled sessions) × 100. Sessions count as verified only when confirmed by both participants (2/2)."
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-subtle)',
                color: 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: '700'
              }}
            >
              ℹ
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: data.metrics.attendancePercentage !== null ? '#166534' : 'var(--text-muted)' }}>
            {data.metrics.attendancePercentage !== null ? `${data.metrics.attendancePercentage}%` : 'N/A'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Basis: {data.metrics.verifiedSessions || 0} / {data.metrics.totalScheduledSessions || 0} verified sessions
          </div>
        </div>
      </div>

      {/* Weekly sessions chart built from real database data (Issue 12) */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={20} color="#E4574C" />
            <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Last 7 Days Session Activity (IST)</h2>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Timezone: Indian Standard Time (IST)
          </span>
        </div>

        {(!data.chartData || data.chartData.length === 0 || data.totalSevenDaySessions === 0) ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
            <Calendar size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
            <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '4px' }}>No Sessions in the Last 7 Days</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Activity volume will automatically chart here as students schedule and conduct study sessions.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '200px', padding: '0 20px 20px 20px', borderBottom: '1px solid var(--border)', gap: '12px' }}>
            {data.chartData.map(item => {
              const heightPct = Math.max(12, Math.round((item.sessions / maxBar) * 160));
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
                    title={`${item.date} (${item.day}): ${item.sessions} session(s)`}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {item.day}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Past 7 Days Session Activity • Total: {data.totalSevenDaySessions || 0} sessions
        </div>
      </div>
    </div>
  );
}
