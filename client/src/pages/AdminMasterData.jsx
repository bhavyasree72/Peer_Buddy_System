import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Plus, Trash2, BookOpen, Layers } from 'lucide-react';

export default function AdminMasterData({ user }) {
  const [activeTab, setActiveTab] = useState('schools'); // 'schools', 'programs', 'skills', 'interests'
  const [data, setData] = useState({
    schools: [],
    programs: [],
    skills: [],
    interests: []
  });
  const [loading, setLoading] = useState(false);

  // New item form
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadMasterData();
  }, []);

  async function loadMasterData() {
    setLoading(true);
    try {
      const res = await api.getAdminMasterData();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    try {
      const type = activeTab.slice(0, -1); // school, program, skill, interest
      const res = await api.addAdminMasterItem({ type, data: formData });
      alert(res.message);
      setFormData({});
      loadMasterData();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(type, id) {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) return;
    try {
      const res = await api.deleteAdminMasterItem({ type, id });
      alert(res.message);
      loadMasterData();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Master Data Management</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Configure institutional master data: schools, academic programs, semesters, skills, and interests.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        {['schools', 'programs', 'skills', 'interests'].map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setFormData({}); }}
            style={{
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #E4574C' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab ? '#E4574C' : 'var(--text-main)',
              fontWeight: activeTab === tab ? '600' : '500',
              borderRadius: 0,
              padding: '10px 16px',
              cursor: 'pointer',
              textTransform: 'capitalize'
            }}
          >
            {tab} ({data[tab]?.length || 0})
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Add New Item Card */}
        <div className="card">
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Add New {activeTab.slice(0, -1).toUpperCase()}
          </h2>

          <form onSubmit={handleAdd}>
            {activeTab === 'schools' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label>School Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Mukesh Patel School of Technology"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label>Code</label>
                  <input
                    type="text"
                    placeholder="e.g. MPSTME"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label>Total Semesters</label>
                  <input
                    type="number"
                    value={formData.semesters || 8}
                    onChange={(e) => setFormData({ ...formData, semesters: parseInt(e.target.value, 10) })}
                    required
                  />
                </div>
              </>
            )}

            {activeTab === 'programs' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label>School</label>
                  <select
                    value={formData.school_id || ''}
                    onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                    required
                  >
                    <option value="">Select School</option>
                    {data.schools.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label>Program Name</label>
                  <input
                    type="text"
                    placeholder="e.g. B.Tech Computer Science"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label>Program Code</label>
                  <input
                    type="text"
                    placeholder="e.g. BT-CS"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    required
                  />
                </div>
              </>
            )}

            {(activeTab === 'skills' || activeTab === 'interests') && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder={`e.g. ${activeTab === 'skills' ? 'Python Programming' : 'Robotics Club'}`}
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label>Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Technology, Core Engineering, Management"
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    required
                  />
                </div>
              </>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
              <Plus size={16} /> Add to Master List
            </button>
          </form>
        </div>

        {/* List Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px' }}>Name / Details</th>
                  <th style={{ padding: '12px 14px' }}>Metadata</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {activeTab === 'schools' && data.schools.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <strong>{s.name}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Code: {s.code}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge">{s.semesters || 8} semesters</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        className="btn-danger"
                        style={{ padding: '4px 8px', fontSize: '11px', minHeight: '28px' }}
                        onClick={() => handleDelete('school', s.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}

                {activeTab === 'programs' && data.programs.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <strong>{p.name}</strong>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Code: {p.code}</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge-neutral badge">{p.school_id}</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        className="btn-danger"
                        style={{ padding: '4px 8px', fontSize: '11px', minHeight: '28px' }}
                        onClick={() => handleDelete('program', p.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}

                {activeTab === 'skills' && data.skills.map(sk => (
                  <tr key={sk.skill_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <strong>{sk.name}</strong>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge">{sk.category}</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        className="btn-danger"
                        style={{ padding: '4px 8px', fontSize: '11px', minHeight: '28px' }}
                        onClick={() => handleDelete('skill', sk.skill_id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}

                {activeTab === 'interests' && data.interests.map(it => (
                  <tr key={it.interest_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <strong>{it.name}</strong>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge">{it.category}</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        className="btn-danger"
                        style={{ padding: '4px 8px', fontSize: '11px', minHeight: '28px' }}
                        onClick={() => handleDelete('interest', it.interest_id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
