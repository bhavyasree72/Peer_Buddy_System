import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ShieldAlert, Check, X, FileText, Send, Users, BookOpen } from 'lucide-react';

export default function MentorDashboard({ user }) {
  const [data, setData] = useState({
    summary: { requestsToReview: 0, studentsCount: 0, resourcesShared: 0 },
    pendingReviews: [],
    resources: [],
    students: []
  });
  const [loading, setLoading] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState({});
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSubject, setBroadcastSubject] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const res = await api.getMentorDashboard();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(requestId, decision) {
    const remarks = reviewRemarks[requestId] || '';
    try {
      const res = await api.reviewMentorRequest(requestId, { decision, remarks });
      alert(res.message);
      loadDashboard();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleBroadcast(e) {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    try {
      const res = await api.sendGuidance({
        targetType: 'all',
        subject: broadcastSubject || 'Academic Guidance',
        message: broadcastMessage.trim()
      });
      alert(res.message);
      setBroadcastMessage('');
      setBroadcastSubject('');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Mentor Portal</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Review flagged buddy requests, upload learning resources, and guide students.
        </p>
      </div>

      {/* Tiles from doc 7.3 Screen 15: Requests to review, Students assigned/active, Resources shared */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <ShieldAlert size={20} color="var(--accent)" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Flagged Requests</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700' }}>
            {data.summary.requestsToReview}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Users size={20} color="var(--accent)" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Active Students</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700' }}>
            {data.summary.studentsCount}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <BookOpen size={20} color="var(--accent)" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Resources Shared</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700' }}>
            {data.summary.resourcesShared}
          </div>
        </div>
      </div>

      {/* Review Queue Table from doc 7.3 Screen 15: Both students' details, note, flag reason, remarks box, Approve/Reject */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
          Flagged Request Moderation Queue
        </h2>

        {data.pendingReviews.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px' }}>
            <p>No buddy requests currently require mentor intervention.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 14px' }}>Sender</th>
                  <th style={{ padding: '12px 14px' }}>Receiver</th>
                  <th style={{ padding: '12px 14px' }}>Request Note</th>
                  <th style={{ padding: '12px 14px' }}>Flag Reason</th>
                  <th style={{ padding: '12px 14px' }}>Remarks</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingReviews.map(r => (
                  <tr key={r.request_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <strong>{r.sender_name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.sender_program} (Sem {r.sender_semester})</div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <strong>{r.receiver_name}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.receiver_program} (Sem {r.receiver_semester})</div>
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: '200px' }}>
                      "{r.note || 'No note provided'}"
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span className="badge" style={{ fontSize: '12px' }}>
                        Policy Check (Cross-Cohort / Prior Reports)
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <input
                        type="text"
                        placeholder="Optional remarks..."
                        value={reviewRemarks[r.request_id] || ''}
                        onChange={(e) => setReviewRemarks({ ...reviewRemarks, [r.request_id]: e.target.value })}
                        style={{ height: '34px', fontSize: '12px' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn-secondary"
                          style={{ minHeight: '34px', fontSize: '12px', padding: '0 8px' }}
                          onClick={() => handleReview(r.request_id, 'rejected')}
                        >
                          <X size={14} /> Reject
                        </button>
                        <button
                          className="btn-primary"
                          style={{ minHeight: '34px', fontSize: '12px', padding: '0 8px' }}
                          onClick={() => handleReview(r.request_id, 'approved')}
                        >
                          <Check size={14} /> Approve
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Broadcast Guidance Form from doc 3.9 */}
      <div className="card" style={{ maxWidth: '680px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
          Broadcast Academic Guidance Message
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Send an announcement or study tip to all students or students of a particular course.
        </p>

        <form onSubmit={handleBroadcast}>
          <div style={{ marginBottom: '12px' }}>
            <label>Subject Topic</label>
            <input
              type="text"
              placeholder="e.g. End-Term Project Submission Guidance"
              value={broadcastSubject}
              onChange={(e) => setBroadcastSubject(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label>Guidance Message</label>
            <textarea
              rows={3}
              placeholder="Write guidance or announcements for NMIMS students..."
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary">
            <Send size={15} /> Send guidance
          </button>
        </form>
      </div>
    </div>
  );
}
