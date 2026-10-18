import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Send, MessageSquare, Clock } from 'lucide-react';

export default function MentorMessages({ user }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    targetType: 'all',
    targetId: '',
    subject: '',
    message: ''
  });

  useEffect(() => {
    loadMessages();
  }, []);

  async function loadMessages() {
    setLoading(true);
    try {
      const res = await api.getMentorMessages();
      setMessages(res.messages || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!formData.message.trim()) return;
    try {
      const res = await api.sendGuidance(formData);
      alert(res.message);
      setFormData({ targetType: 'all', targetId: '', subject: '', message: '' });
      loadMessages();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Guidance Messages</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Broadcast academic advisories and study tips to students.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Send message card */}
        <div className="card">
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            New Guidance Announcement
          </h2>
          <form onSubmit={handleSend}>
            <div style={{ marginBottom: '14px' }}>
              <label>Audience</label>
              <select
                value={formData.targetType}
                onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
              >
                <option value="all">All Department Students</option>
                <option value="subject">Subject Specific</option>
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label>Subject / Topic</label>
              <input
                type="text"
                placeholder="e.g. Mid-Term Study Tips & Pod Allocations"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label>Message Content</label>
              <textarea
                rows={5}
                placeholder="Write your guidance notes, recommended reference books, or study pod guidelines..."
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
              <Send size={16} /> Broadcast Message
            </button>
          </form>
        </div>

        {/* History of messages */}
        <div className="card">
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
            Broadcast History
          </h2>

          {messages.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <p>No guidance messages sent yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {messages.map(m => (
                <div
                  key={m.guidance_id}
                  style={{
                    padding: '14px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-subtle)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '14px', color: 'var(--text-main)' }}>{m.subject}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'pre-line' }}>
                    {m.message}
                  </p>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Target: {m.target_type === 'all' ? 'All Students' : m.target_type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
