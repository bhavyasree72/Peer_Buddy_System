import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Users, ShieldAlert, Calendar, CheckCircle2, TrendingUp, UserCheck, MessageSquare } from 'lucide-react';

export default function AdminOverview({ user }) {
  const [stats, setStats] = useState({
    metrics: { totalUsers: 0, activeThisWeek: 0, openReports: 0, sessionsThisMonth: 0, totalRequests: 0, acceptedRequests: 0 },
    trendData: [],
    roleStats: [],
    settings: {}
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const res = await api.getAdminDashboard();
      setStats(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const { metrics, trendData, roleStats } = stats;
  const maxSess = Math.max(1, ...(trendData || []).map(t => t.sessions || 0));

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Administrator Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          NMIMS campus-wide usage metrics, real-time activity charts, and moderation health.
        </p>
      </div>

      {/* Top Statistic Tiles from FIX 6: registrations, active users, requests sent and accepted, sessions, open reports */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div className="card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Registered Users</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>{metrics.totalUsers}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Active This Week</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>{metrics.activeThisWeek}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Requests Sent & Accepted</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: 'var(--text-main)' }}>
            {metrics.totalRequests} <span style={{ fontSize: '14px', fontWeight: '400', color: 'var(--text-muted)' }}>/ {metrics.acceptedRequests} accepted</span>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Sessions This Month</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>{metrics.sessionsThisMonth}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Open Reports</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: metrics.openReports > 0 ? '#E4574C' : '#166534' }}>
            {metrics.openReports}
          </div>
        </div>
      </div>

      {/* Charts Section: Real Activity Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <TrendingUp size={18} color="#E4574C" />
            <h2 style={{ fontSize: '16px', fontWeight: '600' }}>Study Sessions Trend (Past 7 Days)</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '180px', padding: '0 10px 10px 10px', borderBottom: '1px solid var(--border)', gap: '10px' }}>
            {trendData && trendData.map(item => {
              const heightPct = Math.max(8, Math.round((item.sessions / maxSess) * 140));
              return (
                <div key={item.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600' }}>{item.sessions}</span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '32px',
                      height: `${heightPct}px`,
                      backgroundColor: item.sessions > 0 ? '#E4574C' : 'var(--bg-subtle)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px 4px 0 0'
                    }}
                    title={`${item.date}: ${item.sessions} sessions`}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Users size={18} color="#E4574C" />
            <h2 style={{ fontSize: '16px', fontWeight: '600' }}>User Distribution by Role</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {roleStats && roleStats.map(r => (
              <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '4px' }}>
                <span style={{ textTransform: 'capitalize', fontWeight: '500' }}>{r.role}s</span>
                <span className="badge" style={{ backgroundColor: '#FFF3F1', color: '#E4574C' }}>{r.c} account(s)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
