import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Search, FileSpreadsheet, Trash2, UserCheck, UserX, UserPlus } from 'lucide-react';

export default function AdminUsers({ user }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Bulk import state
  const [csvText, setCsvText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [roleFilter, statusFilter]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.getAdminUsers({ q: search, role: roleFilter, status: statusFilter });
      setUsers(res.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    loadUsers();
  }

  async function handleStatusChange(targetUserId, newStatus) {
    if (!confirm(`Are you sure you want to mark this user as ${newStatus}?`)) return;
    try {
      const res = await api.updateUserStatus(targetUserId, { status: newStatus });
      alert(res.message);
      loadUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRoleChange(targetUserId, newRole) {
    if (!confirm(`Change user role to ${newRole}?`)) return;
    try {
      const res = await api.updateUserStatus(targetUserId, { role: newRole });
      alert(res.message);
      loadUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleBulkImport(e) {
    e.preventDefault();
    if (!csvText.trim()) return;

    const lines = csvText.trim().split('\n');
    const students = [];
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 3) {
        students.push({
          fullName: parts[0],
          sapId: parts[1],
          email: parts[2],
          semester: parts[3] ? parseInt(parts[3], 10) : 1
        });
      }
    }

    try {
      const res = await api.bulkImportUsers(students);
      alert(res.message);
      setShowImportModal(false);
      setCsvText('');
      loadUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>User Management</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Manage user accounts, roles, suspensions, and bulk roster import.
        </p>
      </div>

      {/* Search & Filters & Import CSV Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search by name, SAP ID, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ height: '40px', fontSize: '13px', flex: 1, minWidth: '180px' }}
          />

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: '130px', height: '40px', fontSize: '13px' }}
          >
            <option value="">All Roles</option>
            <option value="student">Student</option>
            <option value="mentor">Mentor</option>
            <option value="faculty">Faculty</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: '130px', height: '40px', fontSize: '13px' }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>

          <button type="submit" className="btn-secondary" style={{ height: '40px' }}>
            Filter
          </button>
        </form>

        <button className="btn-primary" onClick={() => setShowImportModal(true)} style={{ height: '40px', fontSize: '13px' }}>
          <FileSpreadsheet size={15} /> Import CSV
        </button>
      </div>

      {/* Users Table */}
      {users.length === 0 ? (
        <div className="empty-state">
          <h3>No users found</h3>
          <p>No user accounts match your search filters.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px' }}>Name & Email</th>
                  <th style={{ padding: '12px 14px' }}>SAP ID</th>
                  <th style={{ padding: '12px 14px' }}>Role</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px' }}>Last Active</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: '600' }}>{u.full_name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                      {u.sap_id || 'N/A'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.user_id, e.target.value)}
                        style={{ fontSize: '12px', padding: '2px 6px', height: '28px' }}
                      >
                        <option value="student">Student</option>
                        <option value="mentor">Mentor</option>
                        <option value="faculty">Faculty</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge" style={{
                        backgroundColor: u.status === 'active' ? '#F0FDF4' : u.status === 'suspended' ? '#FFF3F1' : '#F3F4F6',
                        color: u.status === 'active' ? '#166534' : u.status === 'suspended' ? '#E4574C' : '#444444',
                        textTransform: 'capitalize'
                      }}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {u.status === 'active' ? (
                          <button
                            className="btn-secondary"
                            style={{ minHeight: '30px', fontSize: '11px', padding: '0 8px' }}
                            onClick={() => handleStatusChange(u.user_id, 'suspended')}
                          >
                            <UserX size={12} /> Suspend
                          </button>
                        ) : (
                          <button
                            className="btn-secondary"
                            style={{ minHeight: '30px', fontSize: '11px', padding: '0 8px' }}
                            onClick={() => handleStatusChange(u.user_id, 'active')}
                          >
                            <UserCheck size={12} /> Activate
                          </button>
                        )}
                        <button
                          className="btn-danger"
                          style={{ minHeight: '30px', fontSize: '11px', padding: '0 8px' }}
                          onClick={() => handleStatusChange(u.user_id, 'deleted')}
                          title="Delete & Anonymize"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
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
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Bulk Import Enrolled Students</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Paste comma-separated rows: <code>fullName, sapId, email, semester</code> (one student per line).
            </p>

            <form onSubmit={handleBulkImport}>
              <textarea
                rows={6}
                placeholder="Rohan Gupta, 70000000002, rohan@nmims.in, 3&#10;Sneha Patel, 70000000003, sneha@nmims.in, 1"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '12px', marginBottom: '16px' }}
                required
              />

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowImportModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Import students
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
