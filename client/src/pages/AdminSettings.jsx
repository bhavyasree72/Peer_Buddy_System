import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Sliders, Save } from 'lucide-react';

export default function AdminSettings({ user }) {
  const [weights, setWeights] = useState({
    weight_skills: '40',
    weight_complementary: '25',
    weight_availability: '20',
    weight_school_sem: '10',
    weight_rating: '5',
    max_pending_requests: '10',
    review_all_requests: '0'
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await api.getAdminDashboard();
      if (res.settings) {
        setWeights(prev => ({ ...prev, ...res.settings }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      const res = await api.updateSettings(weights);
      alert(res.message);
      loadSettings();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Platform Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Configure matching algorithm weights, request thresholds, and mentor review requirements.
        </p>
      </div>

      <form onSubmit={handleSave} className="card" style={{ maxWidth: '640px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Sliders size={20} color="#E4574C" />
          <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Algorithm Weights & Request Controls</h2>
        </div>

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

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', margin: 0, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
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
        </div>

        <button type="submit" className="btn-primary">
          <Save size={16} /> Save Configuration
        </button>
      </form>
    </div>
  );
}
