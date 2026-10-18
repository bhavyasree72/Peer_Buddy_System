import React, { useState } from 'react';
import { api } from '../services/api';
import { Star } from 'lucide-react';

export default function RateBuddyModal({ sessionData, onClose, onSubmitted }) {
  const [punctuality, setPunctuality] = useState(5);
  const [helpfulness, setHelpfulness] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.submitReview({
        sessionId: sessionData.sessionId,
        punctuality,
        helpfulness,
        communication,
        comment: comment.trim()
      });
      // Thank-you message follows as per doc 7.3 Screen 10
      alert(res.message);
      onSubmitted();
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  function renderStarSelector(val, setVal) {
    return (
      <div style={{ display: 'flex', gap: '6px' }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => setVal(star)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              minHeight: 'auto',
              color: star <= val ? '#B45309' : '#D1D5DB'
            }}
          >
            <Star size={24} fill={star <= val ? '#B45309' : 'none'} color={star <= val ? '#B45309' : '#9CA3AF'} />
          </button>
        ))}
      </div>
    );
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
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>Rate Your Study Buddy</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Session: "{sessionData.title}"
        </p>

        {/* 3 star rows from doc 7.3 Screen 10: Punctuality, Helpfulness, Communication */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
              <label style={{ margin: 0 }}>Punctuality</label>
              <strong>{punctuality} / 5</strong>
            </div>
            {renderStarSelector(punctuality, setPunctuality)}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
              <label style={{ margin: 0 }}>Helpfulness & Preparation</label>
              <strong>{helpfulness} / 5</strong>
            </div>
            {renderStarSelector(helpfulness, setHelpfulness)}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
              <label style={{ margin: 0 }}>Communication</label>
              <strong>{communication} / 5</strong>
            </div>
            {renderStarSelector(communication, setCommunication)}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label>Optional Comment (up to 300 characters)</label>
            <textarea
              rows={3}
              maxLength={300}
              placeholder="How did the session go? Would you study together again?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
              {comment.length}/300
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
