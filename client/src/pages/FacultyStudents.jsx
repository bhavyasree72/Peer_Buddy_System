import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Search, Eye, BookOpen, MessageSquare, Award, Clock, X } from 'lucide-react';

export default function FacultyStudents({ user, onNavigateChat }) {
  const [students, setStudents] = useState([]);
  const [master, setMaster] = useState({ programs: [], schools: [] });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [viewingProfile, setViewingProfile] = useState(null);

  useEffect(() => {
    loadStudents();
  }, [selectedSemester]);

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await api.getFacultyStudents({
        semester: selectedSemester,
        q: search
      });
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

  async function handleOpenProfile(userId) {
    try {
      const prof = await api.getProfile(userId);
      setViewingProfile(prof);
    } catch (err) {
      alert(err.message || 'Could not load student profile');
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Department Students</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Browse students by semester and search queries to inspect profiles and academic collaboration activity.
        </p>
      </div>

      {/* Semester and Search Filter Bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
          <input
            type="text"
            placeholder="Search students by name, SAP ID, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '38px', height: '42px' }}
          />
        </div>

        {/* Semester Dropdown */}
        <select
          value={selectedSemester}
          onChange={(e) => setSelectedSemester(e.target.value)}
          style={{ height: '42px', minWidth: '160px' }}
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
            <option key={s} value={s}>Semester {s}</option>
          ))}
        </select>

        <button type="submit" className="btn-primary" style={{ height: '42px' }}>
          Search
        </button>
      </form>

      {/* Results Header Count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
          Showing <strong>{students.length}</strong> matching student{students.length === 1 ? '' : 's'}
        </span>
      </div>

      {students.length === 0 ? (
        <div className="empty-state">
          <h3>No students found</h3>
          <p>No departmental students match your selected program and semester criteria.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px' }}>Student</th>
                  <th style={{ padding: '12px 16px' }}>Program</th>
                  <th style={{ padding: '12px 16px' }}>Semester</th>
                  <th style={{ padding: '12px 16px' }}>Sessions</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <strong>{s.full_name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{s.program_name || 'General'}</td>
                    <td style={{ padding: '12px 16px' }}>Semester {s.semester || 1}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className="badge-neutral badge">{s.sessions_count || 0} sessions</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        className="btn-secondary"
                        style={{ minHeight: '34px', fontSize: '12px', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => handleOpenProfile(s.user_id)}
                      >
                        <Eye size={14} /> Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student Profile Inspection Modal for Faculty */}
      {viewingProfile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '700' }}>{viewingProfile.profile?.full_name}</h2>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {viewingProfile.profile?.email}
                </div>
              </div>
              <button
                onClick={() => setViewingProfile(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', backgroundColor: 'var(--bg-subtle)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Program</span>
                <strong style={{ fontSize: '13px' }}>{viewingProfile.profile?.program_name || 'General'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>School</span>
                <strong style={{ fontSize: '13px' }}>{viewingProfile.profile?.school_name || 'NMIMS'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Semester</span>
                <strong style={{ fontSize: '13px' }}>Semester {viewingProfile.profile?.semester || 1}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Year</span>
                <strong style={{ fontSize: '13px' }}>Year {viewingProfile.profile?.year || 1}</strong>
              </div>
            </div>

            {viewingProfile.profile?.bio && (
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Academic Bio</span>
                <p style={{ fontSize: '13px', color: 'var(--text-main)', margin: 0 }}>{viewingProfile.profile?.bio}</p>
              </div>
            )}

            {/* Academic Skills */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Registered Skills</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {viewingProfile.skills && viewingProfile.skills.length > 0 ? (
                  viewingProfile.skills.map((sk, idx) => (
                    <span key={idx} className="badge" style={{ fontSize: '12px' }}>
                      {sk.name || sk.skill_name} ({sk.type === 'has' ? 'Proficient' : 'Learning'})
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No skills listed</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
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

