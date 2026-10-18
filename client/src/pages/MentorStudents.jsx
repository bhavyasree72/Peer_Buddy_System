import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Search, Filter, Eye, Users } from 'lucide-react';

export default function MentorStudents({ user, onSelectProfile }) {
  const [students, setStudents] = useState([]);
  const [master, setMaster] = useState({ schools: [] });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    q: '',
    schoolId: '',
    semester: ''
  });
  const [viewingProfile, setViewingProfile] = useState(null);

  useEffect(() => {
    api.getMasterData().then(m => setMaster(m)).catch(console.error);
    loadStudents();
  }, [filters.schoolId, filters.semester]);

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await api.getMentorStudents(filters);
      setStudents(res.students || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    loadStudents();
  }

  async function handleViewProfile(userId) {
    try {
      const res = await api.getProfile(userId);
      setViewingProfile(res);
    } catch (err) {
      alert(err.message);
    }
  }

  const selectedSchoolObj = master.schools ? master.schools.find(s => s.id === filters.schoolId) : null;
  const maxSemesters = selectedSchoolObj ? (selectedSchoolObj.semesters || 8) : 10;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>My Students</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Directory of students under academic mentorship. Filter by school and semester to track progress.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
          <input
            type="text"
            placeholder="Search students by name, email or program..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            style={{ paddingLeft: '38px', height: '42px' }}
          />
        </div>

        <select
          value={filters.schoolId}
          onChange={(e) => setFilters({ ...filters, schoolId: e.target.value, semester: '' })}
          style={{ height: '42px', minWidth: '160px' }}
        >
          <option value="">All Schools</option>
          {master.schools && master.schools.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
          ))}
        </select>

        <select
          value={filters.semester}
          onChange={(e) => setFilters({ ...filters, semester: e.target.value })}
          style={{ height: '42px', minWidth: '140px' }}
        >
          <option value="">All Semesters</option>
          {Array.from({ length: maxSemesters }, (_, i) => i + 1).map(s => (
            <option key={s} value={s}>Semester {s}</option>
          ))}
        </select>

        <button type="submit" className="btn-primary" style={{ height: '42px' }}>
          Filter
        </button>
      </form>

      {/* Students Table */}
      {students.length === 0 ? (
        <div className="empty-state">
          <h3>No students found</h3>
          <p>No students match your selected search or filter criteria.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>Student Name</th>
                  <th style={{ padding: '12px 16px' }}>School & Program</th>
                  <th style={{ padding: '12px 16px' }}>Semester</th>
                  <th style={{ padding: '12px 16px' }}>Active Buddies</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <strong style={{ display: 'block' }}>{s.full_name}</strong>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.email}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{s.program_name || 'General'}</div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.school_name || s.school_code}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      Semester {s.semester || 1} (Year {s.year || 1})
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge-neutral badge">{s.active_buddies_count || 0} connections</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px', minHeight: '32px' }}
                        onClick={() => handleViewProfile(s.user_id)}
                      >
                        <Eye size={14} /> View Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student Profile Modal */}
      {viewingProfile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
              {viewingProfile.profile?.full_name || 'Student Profile'}
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {viewingProfile.profile?.program_name} • Semester {viewingProfile.profile?.semester}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label>Bio</label>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', fontStyle: 'italic' }}>
                "{viewingProfile.profile?.bio || 'No bio provided.'}"
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label>Skills Offered</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {viewingProfile.skills && viewingProfile.skills.filter(sk => sk.type === 'has').length > 0 ? (
                  viewingProfile.skills.filter(sk => sk.type === 'has').map(sk => (
                    <span key={sk.id} className="badge">{sk.name}</span>
                  ))
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None listed</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setViewingProfile(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
