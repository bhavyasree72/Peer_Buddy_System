import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { ShieldAlert, Check, X, Clock, User, ArrowRight } from 'lucide-react';

export default function MentorReviewRequests({ user }) {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'reviewed'
  const [pending, setPending] = useState([]);
  const [reviewed, setReviewed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState({});

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    try {
      const res = await api.getMentorReviewRequests();
      setPending(res.pending || []);
      setReviewed(res.reviewed || []);
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
      loadRequests();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Review Requests</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Evaluate flagged buddy requests requiring academic mentor moderation.
        </p>
      </div>

      {/* Tabs for Pending and Reviewed history */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'pending' ? '2px solid #E4574C' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'pending' ? '#E4574C' : 'var(--text-main)',
            fontWeight: activeTab === 'pending' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px',
            cursor: 'pointer'
          }}
        >
          Pending Review ({pending.length})
        </button>

        <button
          onClick={() => setActiveTab('reviewed')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'reviewed' ? '2px solid #E4574C' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'reviewed' ? '#E4574C' : 'var(--text-main)',
            fontWeight: activeTab === 'reviewed' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px',
            cursor: 'pointer'
          }}
        >
          Reviewed History ({reviewed.length})
        </button>
      </div>

      {activeTab === 'pending' ? (
        pending.length === 0 ? (
          <div className="empty-state">
            <h3>No requests awaiting review</h3>
            <p>All buddy requests have been moderated or processed automatically.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {pending.map(req => (
              <div key={req.request_id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <span className="badge" style={{ backgroundColor: '#FFF3F1', color: '#E4574C', marginBottom: '8px', display: 'inline-block' }}>
                      Flag Reason: {req.flag_reason || 'Cross-year / academic gap'}
                    </span>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Requested: {new Date(req.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Both students' details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', backgroundColor: 'var(--bg-subtle)', padding: '16px', borderRadius: 'var(--radius-sm)', marginBottom: '16px' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Sender</strong>
                    <div style={{ fontSize: '15px', fontWeight: '600' }}>{req.sender_name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{req.sender_program || 'Student'} • Semester {req.sender_semester || 1}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{req.sender_school}</div>
                  </div>

                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Receiver</strong>
                    <div style={{ fontSize: '15px', fontWeight: '600' }}>{req.receiver_name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{req.receiver_program || 'Student'} • Semester {req.receiver_semester || 1}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{req.receiver_school}</div>
                  </div>
                </div>

                {/* Note */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px' }}>Request Note</label>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-main)', fontStyle: 'italic', backgroundColor: '#FFFFFF', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '4px' }}>
                    "{req.note || 'No custom note attached.'}"
                  </p>
                </div>

                {/* Remarks box & Approve / Reject buttons */}
                <div>
                  <label style={{ fontSize: '13px' }}>Mentor Remarks (Optional)</label>
                  <input
                    type="text"
                    placeholder="Add moderation notes or recommendations for students..."
                    value={reviewRemarks[req.request_id] || ''}
                    onChange={(e) => setReviewRemarks({ ...reviewRemarks, [req.request_id]: e.target.value })}
                    style={{ marginBottom: '12px' }}
                  />

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => handleReview(req.request_id, 'rejected')}
                      style={{ color: '#E4574C' }}
                    >
                      <X size={14} /> Reject Request
                    </button>
                    <button
                      className="btn-primary"
                      onClick={() => handleReview(req.request_id, 'approved')}
                    >
                      <Check size={14} /> Approve Request
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        reviewed.length === 0 ? (
          <div className="empty-state">
            <h3>No reviewed history</h3>
            <p>Past moderated buddy requests will appear here.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px' }}>Students</th>
                    <th style={{ padding: '12px 16px' }}>Decision</th>
                    <th style={{ padding: '12px 16px' }}>Mentor Remarks</th>
                    <th style={{ padding: '12px 16px' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewed.map(r => (
                    <tr key={r.review_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div><strong>{r.sender_name}</strong> & {r.receiver_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.sender_program}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className="badge" style={{
                          backgroundColor: r.decision === 'approved' ? '#F0FDF4' : '#FFF3F1',
                          color: r.decision === 'approved' ? '#166534' : '#E4574C',
                          textTransform: 'capitalize'
                        }}>
                          {r.decision}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                        {r.remarks || 'No remarks added'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {new Date(r.reviewed_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
