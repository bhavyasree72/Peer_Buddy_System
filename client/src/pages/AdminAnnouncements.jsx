import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Bell, Save } from 'lucide-react';

export default function AdminAnnouncements({ user }) {
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAnnouncement();
  }, []);

  async function loadAnnouncement() {
    setLoading(true);
    try {
      const res = await api.getAdminAnnouncement();
      setAnnouncement(res.announcement || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      const res = await api.saveAdminAnnouncement({ announcement });
      alert(res.message);
      loadAnnouncement();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Campus Announcements</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Create and manage the top banner announcement displayed across all student and faculty portals.
        </p>
      </div>

      <div style={{ maxWidth: '640px' }} className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Bell size={20} color="#E4574C" />
          <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Active Campus Banner Text</h2>
        </div>

        {/* Live Preview */}
        <div style={{ marginBottom: '20px' }}>
          <label>Banner Live Preview</label>
          <div style={{
            padding: '14px 16px',
            backgroundColor: '#FFF3F1',
            borderLeft: '4px solid #E4574C',
            borderRadius: '4px',
            color: 'var(--text-main)',
            fontSize: '14px'
          }}>
            {announcement || 'No announcement currently broadcasting.'}
          </div>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: '20px' }}>
            <label>Announcement Message</label>
            <textarea
              rows={4}
              placeholder="e.g. Mid-term review pods are now active in the STME Library. Please confirm session attendance."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Leave blank to clear the campus banner.
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn-primary">
              <Save size={16} /> Save & Broadcast Banner
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAnnouncement('')}
            >
              Clear Message
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
