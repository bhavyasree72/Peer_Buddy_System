import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Clock, Filter } from 'lucide-react';

export default function AdminAuditLog({ user }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    loadAudit();
  }, []);

  async function loadAudit() {
    setLoading(true);
    try {
      const res = await api.getAuditLog();
      setLogs(res.auditLog || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredLogs = dateFilter
    ? logs.filter(l => l.created_at && l.created_at.startsWith(dateFilter))
    : logs;

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>System Audit Log</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Immutable audit record of administrative decisions, user status changes, and system modifications.
        </p>
      </div>

      {/* Date Filter */}
      <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ margin: 0, fontSize: '13px', fontWeight: '600' }}>Filter by Date:</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ width: '180px', height: '36px' }}
          />
          {dateFilter && (
            <button
              className="btn-secondary"
              style={{ height: '36px', fontSize: '12px' }}
              onClick={() => setDateFilter('')}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="empty-state">
          <h3>No audit records found</h3>
          <p>No actions logged for the selected date criteria.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
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
                {filteredLogs.map(a => (
                  <tr key={a.log_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 14px' }}>{a.actor_email || 'System Administrator'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge" style={{ backgroundColor: '#FFF3F1', color: '#E4574C' }}>
                        {a.action}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{a.target || 'N/A'}</td>
                    <td style={{ padding: '12px 14px' }}>{a.details}</td>
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
