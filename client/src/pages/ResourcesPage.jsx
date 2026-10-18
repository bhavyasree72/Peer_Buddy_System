import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { BookOpen, Search, Download, ExternalLink, Plus } from 'lucide-react';

export default function ResourcesPage({ user }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ subject: '', semester: '', q: '' });
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Upload form for mentor/faculty
  const [uploadData, setUploadData] = useState({
    title: '',
    subject: '',
    semester: 1,
    description: '',
    link: ''
  });
  const [file, setFile] = useState(null);

  const isStaff = user.role === 'mentor' || user.role === 'faculty' || user.role === 'admin';

  useEffect(() => {
    loadResources();
  }, [filters.semester]);

  async function loadResources() {
    setLoading(true);
    try {
      const res = await api.getResources(filters);
      setResources(res.resources || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    loadResources();
  }

  async function handleUpload(e) {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('title', uploadData.title);
      formData.append('subject', uploadData.subject);
      formData.append('semester', uploadData.semester);
      if (uploadData.description) formData.append('description', uploadData.description);
      if (uploadData.link) formData.append('link', uploadData.link);
      if (file) formData.append('file', file);

      const res = await api.uploadResource(formData);
      alert(res.message);
      setShowUploadModal(false);
      loadResources();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Learning Resources</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Academic notes, past question papers, and guides shared by verified NMIMS mentors.
          </p>
        </div>

        {isStaff && (
          <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
            <Plus size={16} /> Upload resource
          </button>
        )}
      </div>

      {/* Filter and Search Bar from doc 7.3 Screen 11 */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
          <input
            type="text"
            placeholder="Search by title, subject, or keywords..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            style={{ paddingLeft: '38px', height: '44px' }}
          />
        </div>

        <select
          value={filters.semester}
          onChange={(e) => setFilters({ ...filters, semester: e.target.value })}
          style={{ width: '180px', height: '44px' }}
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
        </select>

        <button type="submit" className="btn-primary" style={{ height: '44px' }}>
          Filter
        </button>
      </form>

      {/* Resources Table from doc 7.3 Screen 11: Title, Subject tag, Uploaded by, Date, Download or Open link */}
      {resources.length === 0 ? (
        <div className="empty-state">
          <h3>No resources uploaded yet</h3>
          <p>Verified study materials and question sets uploaded by mentors will appear here.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Title & Description</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Subject</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Semester</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Shared By</th>
                <th style={{ padding: '12px 16px', fontWeight: '600' }}>Date</th>
                <th style={{ padding: '12px 16px', fontWeight: '600', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {resources.map(r => (
                <tr key={r.resource_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{r.title}</div>
                    {r.description && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {r.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge" style={{ fontSize: '12px' }}>{r.subject}</span>
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                    Sem {r.semester}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {r.uploader_name}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {new Date(r.uploaded_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <a
                      href={r.file_url_or_link}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                      style={{ minHeight: '34px', fontSize: '13px', padding: '0 10px', display: 'inline-flex' }}
                    >
                      {r.file_url_or_link.startsWith('http') ? <ExternalLink size={14} /> : <Download size={14} />}
                      {r.file_url_or_link.startsWith('http') ? 'Open link' : 'Download'}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Resource Modal for Mentors */}
      {showUploadModal && (
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
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Upload Learning Resource</h2>
            <form onSubmit={handleUpload}>
              <div style={{ marginBottom: '12px' }}>
                <label>Resource Title</label>
                <input
                  type="text"
                  placeholder="e.g. End-Term Data Science Cheat Sheet"
                  value={uploadData.title}
                  onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Machine Learning"
                  value={uploadData.subject}
                  onChange={(e) => setUploadData({ ...uploadData, subject: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>Semester</label>
                <select
                  value={uploadData.semester}
                  onChange={(e) => setUploadData({ ...uploadData, semester: parseInt(e.target.value, 10) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Short note on what this file covers..."
                  value={uploadData.description}
                  onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>File Upload (PDF, DOCX, PPT ≤ 5MB)</label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label>Or External Resource Link</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={uploadData.link}
                  onChange={(e) => setUploadData({ ...uploadData, link: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Upload resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
