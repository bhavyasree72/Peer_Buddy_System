import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Users, ShieldAlert, BarChart3, Settings, Database, Sliders, Search, Trash2, UserCheck, UserX, FileSpreadsheet } from 'lucide-react';

export default function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('metrics'); // 'metrics', 'users', 'reports', 'settings', 'master', 'audit'
  const [stats, setStats] = useState({
    metrics: { totalUsers: 0, activeThisWeek: 0, openReports: 0, sessionsThisMonth: 0, totalRequests: 0, acceptedRequests: 0 },
    settings: {}
  });

  // Users tab state
  const [userList, setUserList] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');

  // Moderation tab state
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);

  // Settings tab state
  const [weights, setWeights] = useState({
    weight_skills: '40',
    weight_complementary: '25',
    weight_availability: '20',
    weight_school_sem: '10',
    weight_rating: '5',
    max_pending_requests: '10',
    review_all_requests: '0',
    announcement_banner: ''
  });

  // Audit log
  const [auditLogs, setAuditLogs] = useState([]);

  // Bulk import state
  const [csvText, setCsvText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    loadStats();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'reports') loadReports();
    if (activeTab === 'audit') loadAudit();
  }, [activeTab]);

  async function loadStats() {
    try {
      const res = await api.getAdminDashboard();
      setStats(res);
      if (res.settings) {
        setWeights(prev => ({ ...prev, ...res.settings }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadUsers() {
    try {
      const res = await api.getAdminUsers({ q: userSearch, role: userRoleFilter, status: userStatusFilter });
      setUserList(res.users || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadReports() {
    try {
      const res = await api.getAdminReports();
      setReports(res.reports || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadAudit() {
    try {
      const res = await api.getAuditLog();
      setAuditLogs(res.auditLog || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUserStatusChange(targetUserId, newStatus) {
    if (!confirm(`Are you sure you want to mark this user as ${newStatus}?`)) return;
    try {
      const res = await api.updateUserStatus(targetUserId, { status: newStatus });
      alert(res.message);
      loadUsers();
      loadStats();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleReportModeration(reportId, action) {
    const notes = prompt(`Enter moderation action details for ${action}:`, `Admin action ${action}`);
    if (notes === null) return;
    try {
      const res = await api.handleReportAction(reportId, { action, notes });
      alert(res.message);
      setSelectedReport(null);
      loadReports();
      loadStats();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    try {
      const res = await api.updateSettings(weights);
      alert(res.message);
      loadStats();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleBulkImportSubmit(e) {
    e.preventDefault();
    if (!csvText.trim()) return;

    // Parse CSV: fullName, sapId, email, semester
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
      loadStats();
    } catch (err) {
      alert(err.message);
    }
  }

  const { metrics } = stats;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Administrator Portal</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Platform supervision, user lifecycle, moderation queue, settings, and audit trails.
        </p>
      </div>

      {/* Top Statistic Tiles from doc 7.3 Screen 17: Total users, Active this week, Open reports, Sessions this month */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Open Moderation Reports</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: metrics.openReports > 0 ? 'var(--accent)' : 'var(--text-main)' }}>
            {metrics.openReports}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Sessions Held This Month</div>
          <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)' }}>{metrics.sessionsThisMonth}</div>
        </div>
      </div>

      {/* Nav Tabs from doc 7.3 Screen 17 */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('metrics')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'metrics' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'metrics' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'metrics' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Overview & Charts
        </button>

        <button
          onClick={() => setActiveTab('users')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'users' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'users' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'users' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          User Management ({userList.length || metrics.totalUsers})
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'reports' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'reports' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'reports' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Moderation Queue ({reports.length})
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'settings' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'settings' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'settings' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Match Weights & Settings
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'audit' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'audit' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'audit' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Audit Log
        </button>
      </div>

      {/* TAB 1: Metrics & Quick Links */}
      {activeTab === 'metrics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Connection & Interaction Ratios
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Buddy Requests Sent</span>
                <strong>{metrics.totalRequests}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Accepted Peer Connections</span>
                <strong>{metrics.acceptedRequests}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Acceptance Rate</span>
                <strong>
                  {metrics.totalRequests > 0 ? Math.round((metrics.acceptedRequests / metrics.totalRequests) * 100) : 100}%
                </strong>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>
              Active Announcement Banner
            </h3>
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--accent-tint)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '14px',
              color: 'var(--text-main)',
              marginBottom: '16px',
              borderLeft: '4px solid var(--accent)'
            }}>
              {weights.announcement_banner || 'Welcome to Peer Buddy System – NMIMS.'}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Broadcast messages appear on all student and faculty landing screens.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: User Management from doc 7.3 Screen 17 */}
      {activeTab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px' }}>
              <input
                type="text"
                placeholder="Search by name, SAP ID, or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{ height: '40px', fontSize: '13px' }}
              />
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                style={{ width: '140px', height: '40px', fontSize: '13px' }}
              >
                <option value="">All Roles</option>
                <option value="student">Student</option>
                <option value="mentor">Mentor</option>
                <option value="faculty">Faculty</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn-secondary" onClick={loadUsers} style={{ height: '40px' }}>
                Search
              </button>
            </div>

            <button className="btn-primary" onClick={() => setShowImportModal(true)} style={{ height: '40px', fontSize: '13px' }}>
              <FileSpreadsheet size={15} /> Import CSV
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px' }}>Name & Email</th>
                  <th style={{ padding: '12px 14px' }}>SAP ID</th>
                  <th style={{ padding: '12px 14px' }}>Role</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px' }}>Last Active</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Row Actions</th>
                </tr>
              </thead>
              <tbody>
                {userList.map(u => (
                  <tr key={u.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: '600' }}>{u.full_name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                      {u.sap_id || 'N/A'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge" style={{ textTransform: 'capitalize', fontSize: '11px' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge-neutral badge" style={{
                        textTransform: 'capitalize',
                        fontSize: '11px',
                        backgroundColor: u.status === 'active' ? '#F0FDF4' : u.status === 'suspended' ? '#FFF3F1' : '#F3F4F6',
                        color: u.status === 'active' ? '#166534' : u.status === 'suspended' ? 'var(--accent)' : '#444444'
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
                            onClick={() => handleUserStatusChange(u.user_id, 'suspended')}
                          >
                            <UserX size={12} /> Suspend
                          </button>
                        ) : (
                          <button
                            className="btn-secondary"
                            style={{ minHeight: '30px', fontSize: '11px', padding: '0 8px' }}
                            onClick={() => handleUserStatusChange(u.user_id, 'active')}
                          >
                            <UserCheck size={12} /> Activate
                          </button>
                        )}
                        <button
                          className="btn-danger"
                          style={{ minHeight: '30px', fontSize: '11px', padding: '0 8px' }}
                          onClick={() => handleUserStatusChange(u.user_id, 'deleted')}
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

      {/* TAB 3: Moderation Reports Queue from doc 7.3 Screen 17 */}
      {activeTab === 'reports' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedReport ? '1fr 1fr' : '1fr', gap: '20px' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px' }}>Reason</th>
                  <th style={{ padding: '12px 14px' }}>Reporter</th>
                  <th style={{ padding: '12px 14px' }}>Target Student</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No open moderation reports.
                    </td>
                  </tr>
                ) : (
                  reports.map(r => (
                    <tr
                      key={r.report_id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: selectedReport?.report_id === r.report_id ? 'var(--accent-tint)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: '600' }}>
                        {r.reason.replace('_', ' ')}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{r.reporter_name}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{r.target_name}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span className="badge" style={{ fontSize: '11px' }}>{r.status}</span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          className="btn-secondary"
                          style={{ minHeight: '30px', fontSize: '12px', padding: '0 8px' }}
                          onClick={() => setSelectedReport(r)}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Report Detail Panel with Chat Excerpt and Actions (doc 7.3 Screen 17) */}
          {selectedReport && (
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
                Report Investigation
              </h3>
              <div style={{ fontSize: '13px', marginBottom: '12px' }}>
                <div><strong>Reason:</strong> {selectedReport.reason}</div>
                <div><strong>Target:</strong> {selectedReport.target_name} ({selectedReport.target_email})</div>
                <div><strong>Description:</strong> {selectedReport.description || 'None provided'}</div>
              </div>

              {selectedReport.chat_excerpt && (
                <div style={{ marginBottom: '16px' }}>
                  <label>Last 20 Messages Context Excerpt:</label>
                  <div style={{
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                    padding: '10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    maxHeight: '180px',
                    overflowY: 'auto'
                  }}>
                    {JSON.parse(selectedReport.chat_excerpt).map((m, idx) => (
                      <div key={idx} style={{ marginBottom: '4px' }}>
                        <strong>{m.full_name}:</strong> {m.body}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Actions: warn, suspend, ban, dismiss */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn-secondary"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                  onClick={() => handleReportModeration(selectedReport.report_id, 'dismiss')}
                >
                  Dismiss
                </button>
                <button
                  className="btn-secondary"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                  onClick={() => handleReportModeration(selectedReport.report_id, 'warn')}
                >
                  Send warning
                </button>
                <button
                  className="btn-danger"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                  onClick={() => handleReportModeration(selectedReport.report_id, 'suspend')}
                >
                  Suspend student
                </button>
                <button
                  className="btn-danger"
                  style={{ minHeight: '34px', fontSize: '12px' }}
                  onClick={() => handleReportModeration(selectedReport.report_id, 'ban')}
                >
                  Permanent ban
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Match Weights & System Settings from doc 3.3 and 3.13 */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="card" style={{ maxWidth: '640px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Matching Weights & Request Limits
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Tune algorithm parameters and platform-wide moderation switches.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
            <div>
              <label>Shared Skills Weight (default: 40)</label>
              <input
                type="number"
                value={weights.weight_skills}
                onChange={(e) => setWeights({ ...weights, weight_skills: e.target.value })}
              />
            </div>

            <div>
              <label>Complementary Strengths Weight (default: 25)</label>
              <input
                type="number"
                value={weights.weight_complementary}
                onChange={(e) => setWeights({ ...weights, weight_complementary: e.target.value })}
              />
            </div>

            <div>
              <label>Overlapping Availability Weight (default: 20)</label>
              <input
                type="number"
                value={weights.weight_availability}
                onChange={(e) => setWeights({ ...weights, weight_availability: e.target.value })}
              />
            </div>

            <div>
              <label>Same School or Semester Weight (default: 10)</label>
              <input
                type="number"
                value={weights.weight_school_sem}
                onChange={(e) => setWeights({ ...weights, weight_school_sem: e.target.value })}
              />
            </div>

            <div>
              <label>Rating Weight (default: 5)</label>
              <input
                type="number"
                value={weights.weight_rating}
                onChange={(e) => setWeights({ ...weights, weight_rating: e.target.value })}
              />
            </div>

            <div>
              <label>Maximum Outgoing Pending Requests per Student (default: 10)</label>
              <input
                type="number"
                value={weights.max_pending_requests}
                onChange={(e) => setWeights({ ...weights, max_pending_requests: e.target.value })}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0 }}>
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Review all requests switch</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Route every buddy request to mentors for review before delivery.</span>
              </div>
              <input
                type="checkbox"
                checked={weights.review_all_requests === '1'}
                onChange={(e) => setWeights({ ...weights, review_all_requests: e.target.checked ? '1' : '0' })}
                style={{ width: '20px', height: '20px' }}
              />
            </label>

            <div>
              <label>Campus Announcement Banner Text</label>
              <textarea
                rows={2}
                value={weights.announcement_banner}
                onChange={(e) => setWeights({ ...weights, announcement_banner: e.target.value })}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary">
            Save settings & weights
          </button>
        </form>
      )}

      {/* TAB 5: Audit Log from doc 7.3 Screen 17 */}
      {activeTab === 'audit' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 14px' }}>Timestamp</th>
                <th style={{ padding: '12px 14px' }}>Actor</th>
                <th style={{ padding: '12px 14px' }}>Action</th>
                <th style={{ padding: '12px 14px' }}>Target</th>
                <th style={{ padding: '12px 14px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(a => (
                <tr key={a.log_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 14px' }}>{a.actor_email || 'System'}</td>
                  <td style={{ padding: '12px 14px', fontWeight: '600' }}>{a.action}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{a.target || 'N/A'}</td>
                  <td style={{ padding: '12px 14px' }}>{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk CSV Import Modal from doc 3.13 */}
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

            <form onSubmit={handleBulkImportSubmit}>
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
