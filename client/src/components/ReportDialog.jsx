import React, { useState } from 'react';
import { api } from '../services/api';
import { AlertTriangle } from 'lucide-react';

export default function ReportDialog({ reportedUserId, connectionId, onClose }) {
  const [reason, setReason] = useState('harassment');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  // Mandatory reasons from doc 3.8: harassment, spam, fake profile, inappropriate content, other
  const reasons = [
    { id: 'harassment', label: 'Harassment or disrespectful behavior' },
    { id: 'spam', label: 'Spam or unsolicited promotions' },
    { id: 'fake_profile', label: 'Fake or misleading profile information' },
    { id: 'inappropriate_content', label: 'Inappropriate or offensive content' },
    { id: 'other', label: 'Other platform policy violation' }
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.createReport({
        reportedUserId,
        connectionId,
        reason,
        description: description.trim()
      });
      // Exact confirmation wording from doc 7.3 Screen 14:
      // "Thanks, your report has been sent. You can track it under Settings, My reports."
      alert(res.message);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
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
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', marginBottom: '8px' }}>
          <AlertTriangle size={20} />
          <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Report User or Message</h2>
        </div>

        {/* Explanation line from doc 7.3 Screen 14: explains administrator will review it */}
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
          Reports are handled confidentially by the NMIMS Student Affairs IT team. The reported student will not see who filed this report.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label>Reason for Report (Required)</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} required>
              {reasons.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label>Description & Details</label>
            <textarea
              rows={4}
              placeholder="Please describe what happened..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Send report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
