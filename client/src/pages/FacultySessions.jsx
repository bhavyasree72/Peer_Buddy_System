import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Filter, Calendar, MapPin, Video, Clock } from 'lucide-react';

export default function FacultySessions({ user }) {
  const [sessions, setSessions] = useState([]);
  const [master, setMaster] = useState({ schools: [] });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    semester: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    loadSessions();
  }, [filters.semester, filters.startDate, filters.endDate]);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await api.getFacultySessions(filters);
      setSessions(res.sessions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Department Sessions Log</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Detailed record of scheduled and conducted study sessions with verified attendance counts.
        </p>
      </div>

      {/* Filter Row: department, semester and date filters */}
      <div className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: '160px' }}>
            <label>Semester</label>
            <select
              value={filters.semester}
              onChange={(e) => setFilters({ ...filters, semester: e.target.value })}
              style={{ height: '40px' }}
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <label>From Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              style={{ height: '40px' }}
            />
          </div>

          <div style={{ minWidth: '160px' }}>
            <label>To Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              style={{ height: '40px' }}
            />
          </div>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setFilters({ semester: '', startDate: '', endDate: '' })}
            style={{ height: '40px' }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Full Sessions Table with Attendance Counts */}
      {sessions.length === 0 ? (
        <div className="empty-state">
          <h3>No study sessions found</h3>
          <p>No study sessions match your selected department or semester filter.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>Session Title & Subject</th>
                  <th style={{ padding: '12px 16px' }}>Participants</th>
                  <th style={{ padding: '12px 16px' }}>Date & Time</th>
                  <th style={{ padding: '12px 16px' }}>Location / Mode</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Attendance Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.session_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <strong style={{ display: 'block' }}>{s.title}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {s.subject} • Semester {s.semester}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{s.organizer_name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>with {s.partner_name}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                      <div>{new Date(s.start_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                      <span className="badge-neutral badge" style={{ textTransform: 'capitalize' }}>
                        {s.mode.replace('_', ' ')}
                      </span>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {s.location_or_link}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge" style={{
                        backgroundColor: s.status === 'confirmed' ? '#F0FDF4' : s.status === 'completed' ? '#F3F4F6' : '#FFF3F1',
                        color: s.status === 'confirmed' ? '#166534' : s.status === 'completed' ? '#374151' : '#E4574C',
                        textTransform: 'capitalize'
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <strong style={{ color: s.attendees_count === 2 ? '#166534' : s.attendees_count === 1 ? '#D97706' : '#9CA3AF' }}>
                        {s.attendees_count || 0} / 2
                      </strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block' }}>
                        {s.attendees_count === 2 ? '✓ Both Confirmed' : s.attendees_count === 1 ? '1 Participant Pending' : 'Unconfirmed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
