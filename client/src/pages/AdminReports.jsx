import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ShieldAlert, AlertTriangle, UserX, Ban, Check } from 'lucide-react';

export default function AdminReports({ user }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    try {
      const res = await api.getAdminReports();
      setReports(res.reports || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(reportId, action) {
    const notes = prompt(`Enter moderation action note for ${action}:`, `Admin action ${action}`);
    if (notes === null) return;
    try {
      const res = await api.handleReportAction(reportId, { action, notes });
      alert(res.message);
      setSelectedReport(null);
      loadReports();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Moderation Reports Queue</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Inspect user reports, review chat excerpts, and execute moderation actions.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedReport ? '1fr 1fr' : '1fr', gap: '20px', alignItems: 'start' }}>
        {/* Reports Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px' }}>Reason</th>
                  <th style={{ padding: '12px 14px' }}>Target Student</th>
                  <th style={{ padding: '12px 14px' }}>Reported By</th>
                  <th style={{ padding: '12px 14px' }}>Status</th>
                  <th style={{ padding: '12px 14px' }}>Age</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No moderation reports in queue.
                    </td>
                  </tr>
                ) : (
                  reports.map(r => {
                    const daysAgo = Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr
                        key={r.report_id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          backgroundColor: selectedReport?.report_id === r.report_id ? '#FFF3F1' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: '600' }}>
                          {r.reason.replace('_', ' ')}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div>{r.target_name}</div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.target_email}</span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                          {r.reporter_name}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span className="badge" style={{
                            backgroundColor: r.status === 'Submitted' ? '#FFF3F1' : '#F3F4F6',
                            color: r.status === 'Submitted' ? '#E4574C' : '#444444',
                            fontSize: '11px'
                          }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {daysAgo === 0 ? 'Today' : `${daysAgo}d ago`}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <button
                            className="btn-secondary"
                            style={{ minHeight: '30px', fontSize: '12px', padding: '0 10px' }}
                            onClick={() => setSelectedReport(r)}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel & Action Buttons (warn, suspend, ban, dismiss) */}
        {selectedReport && (
          <div className="card">
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '14px' }}>
              Report Investigation Detail
            </h2>

            <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <div><strong>Violation Type:</strong> {selectedReport.reason}</div>
              <div><strong>Target Student:</strong> {selectedReport.target_name} ({selectedReport.target_email})</div>
              <div><strong>Filed By:</strong> {selectedReport.reporter_name}</div>
              <div><strong>Description:</strong> {selectedReport.description || 'No additional note provided.'}</div>
              <div><strong>Submitted At:</strong> {new Date(selectedReport.created_at).toLocaleString()}</div>
            </div>

            {selectedReport.chat_excerpt && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Chat Excerpt Context:</label>
                <div style={{
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  maxHeight: '180px',
                  overflowY: 'auto'
                }}>
                  {(() => {
                    try {
                      const msgs = JSON.parse(selectedReport.chat_excerpt);
                      return msgs.map((m, idx) => (
                        <div key={idx} style={{ marginBottom: '4px' }}>
                          <strong>{m.full_name}:</strong> {m.body}
                        </div>
                      ));
                    } catch (e) {
                      return <div>{selectedReport.chat_excerpt}</div>;
                    }
                  })()}
                </div>
              </div>
            )}

            {/* Action Buttons: warn, suspend, ban, dismiss */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn-secondary"
                style={{ minHeight: '34px', fontSize: '12px' }}
                onClick={() => handleAction(selectedReport.report_id, 'dismiss')}
              >
                Dismiss
              </button>
              <button
                className="btn-secondary"
                style={{ minHeight: '34px', fontSize: '12px' }}
                onClick={() => handleAction(selectedReport.report_id, 'warn')}
              >
                <AlertTriangle size={14} /> Send Warning
              </button>
              <button
                className="btn-danger"
                style={{ minHeight: '34px', fontSize: '12px' }}
                onClick={() => handleAction(selectedReport.report_id, 'suspend')}
              >
                <UserX size={14} /> Suspend
              </button>
              <button
                className="btn-danger"
                style={{ minHeight: '34px', fontSize: '12px' }}
                onClick={() => handleAction(selectedReport.report_id, 'ban')}
              >
                <Ban size={14} /> Ban User
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
