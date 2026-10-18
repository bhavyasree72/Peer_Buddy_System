import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Search, Filter, BookOpen } from 'lucide-react';

export default function FacultyStudents({ user }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [semester, setSemester] = useState('');

  useEffect(() => {
    loadStudents();
  }, [semester]);

  async function loadStudents() {
    setLoading(true);
    try {
      const res = await api.getFacultyStudents({ q: search, semester });
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

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Department Students</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Overview of enrolled students and their peer collaboration activity.
        </p>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
          <input
            type="text"
            placeholder="Search students by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '38px', height: '42px' }}
          />
        </div>

        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
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

      {students.length === 0 ? (
        <div className="empty-state">
          <h3>No students found</h3>
          <p>No departmental students match your search.</p>
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
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Sessions Participated</th>
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
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span className="badge-neutral badge">{s.sessions_count || 0} sessions</span>
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
