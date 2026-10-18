import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Users, Calendar, CheckCircle2, ShieldCheck, Filter } from 'lucide-react';

export default function FacultyDashboard({ user }) {
  const [overview, setOverview] = useState({
    department: 'Computer Science & Engineering',
    metrics: { activeStudents: 0, sessionsThisWeek: 0, attendancePercentage: 100 },
    sessions: [],
    students: []
  });
  const [loading, setLoading] = useState(false);
  const [selectedSemester, setSelectedSemester] = useState('');

  useEffect(() => {
    loadFacultyData();
  }, []);

  async function loadFacultyData() {
    setLoading(true);
    try {
      const res = await api.getFacultyOverview();
      setOverview(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredSessions = selectedSemester
    ? overview.sessions.filter(s => s.semester === parseInt(selectedSemester, 10))
    : overview.sessions;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Faculty Department Overview</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Monitoring academic study sessions and participation rates for {overview.department}.
        </p>
      </div>

      {/* Strict Privacy Notice from doc 3.12: "Faculty can view sessions, filter by date, see attendance counts (not chat content)." */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        backgroundColor: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 'var(--radius-sm)',
        marginBottom: '24px',
        fontSize: '13px',
        color: 'var(--text-muted)'
      }}>
        <ShieldCheck size={18} color="#0284C7" />
        <span>
          <strong>Data Privacy Safeguard:</strong> Faculty members have high-level visibility over departmental study session counts and attendance metrics. Private peer chats are strictly protected.
        </span>
      </div>

      {/* Department Overview Tiles from doc 7.3 Screen 16: Active students, Sessions this week, Attendance percentage */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Users size={18} color="var(--accent)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Active Students in Department</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>
            {overview.metrics.activeStudents}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Calendar size={18} color="var(--accent)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sessions Held This Week</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>
            {overview.metrics.sessionsThisWeek}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <CheckCircle2 size={18} color="#166534" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Overall Attendance Rate</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: '#166534' }}>
            {overview.metrics.attendancePercentage}%
          </div>
        </div>
      </div>

      {/* Sessions Table with Department, Semester and Date filters from doc 7.3 Screen 16 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '32px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600' }}>Department Study Sessions Log</h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              style={{ fontSize: '13px', height: '34px', width: '160px' }}
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
            </select>
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No study sessions recorded for the selected filter.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px' }}>Session / Course</th>
                <th style={{ padding: '12px 16px' }}>Students Involved</th>
                <th style={{ padding: '12px 16px' }}>Date & Schedule</th>
                <th style={{ padding: '12px 16px' }}>Mode & Venue</th>
                <th style={{ padding: '12px 16px' }}>Verified Attendance</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map(s => (
                <tr key={s.session_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: '600' }}>{s.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.subject} • Sem {s.semester}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {s.organizer_name} & {s.partner_name}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {new Date(s.start_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ textTransform: 'capitalize' }}>{s.mode.replace('_', ' ')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.location_or_link}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge" style={{ fontSize: '12px' }}>
                      {s.attendees_count} student(s) marked attended
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge-neutral badge" style={{ textTransform: 'capitalize' }}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
