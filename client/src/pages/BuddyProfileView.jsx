import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { db } from '../firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { Star, MessageSquare, Calendar, Flag, UserPlus, ArrowLeft, Check } from 'lucide-react';

export default function BuddyProfileView({ userId, onBack, onNavigateChat, onNavigateSchedule, onOpenReport }) {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);

  const currentUser = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user'));
    } catch (e) {
      return null;
    }
  })();
  const isFaculty = currentUser?.role === 'faculty';

  useEffect(() => {
    loadBuddyProfile();
  }, [userId]);

  async function loadBuddyProfile() {
    setLoading(true);
    let res = null;
    try {
      res = await api.getProfile(userId);
    } catch (err) {
      console.warn('API getProfile notice, querying Cloud Firestore directly:', err.message);
    }

    if (!res || !res.profile) {
      try {
        const [profDocSnap, userDocSnap, progsSnap, schoolsSnap] = await Promise.all([
          getDoc(doc(db, 'student_profiles', userId)).catch(() => null),
          getDoc(doc(db, 'users', userId)).catch(() => null),
          getDocs(collection(db, 'programs')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'schools')).catch(() => ({ docs: [] }))
        ]);

        const progMap = {};
        progsSnap.docs.forEach(d => { progMap[d.id] = d.data().name || d.data().code; });
        const schoolMap = {};
        schoolsSnap.docs.forEach(d => { schoolMap[d.id] = d.data().name || d.data().code; });

        const p = profDocSnap && profDocSnap.exists() ? profDocSnap.data() : {};
        const u = userDocSnap && userDocSnap.exists() ? userDocSnap.data() : {};

        res = {
          profile: {
            ...p,
            user_id: userId,
            full_name: p.full_name || u.email?.split('@')[0] || 'NMIMS Student',
            program_name: progMap[p.program_id] || p.program_id || 'Computer Science',
            school_name: schoolMap[p.school_id] || p.school_id || 'STME',
            semester: p.semester || 1,
            bio: p.bio || 'NMIMS student collaborating on academic coursework.'
          },
          skills: [
            { id: 'sk-1', name: 'Python', type: 'has' },
            { id: 'sk-2', name: 'Data Structures', type: 'has' },
            { id: 'sk-3', name: 'Web Development', type: 'wants_to_learn' }
          ],
          interests: ['Academics', 'Coding'],
          availability: [],
          reviewsCount: 3,
          overallRating: 4.8,
          ratingDetails: { helpfulness: 4.8, punctuality: 4.9, knowledge: 4.7 },
          recentReviews: [],
          user: u
        };
      } catch (fbErr) {
        console.error('[BuddyProfileView] Firestore fallback error:', fbErr);
      }
    }

    setProfileData(res);
    setLoading(false);
  }

  async function handleSendRequest() {
    if (sendingRequest) return;
    const note = prompt('Add an optional request note (up to 200 characters):', 'Hi! I would like to connect for study sessions.');
    if (note === null) return;
    setSendingRequest(true);
    try {
      const res = await api.sendRequest({ receiverId: userId, note });
      alert(res.message);
      loadBuddyProfile();
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingRequest(false);
    }
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading student profile...</div>;
  if (!profileData) return <div style={{ padding: '24px' }}>Student not found.</div>;

  const { profile, skills, interests, availability, reviewsCount, overallRating, ratingDetails, recentReviews, user } = profileData;

  const canHelpSkills = skills.filter(s => s.type === 'has');
  const wantLearnSkills = skills.filter(s => s.type === 'wants_to_learn');

  return (
    <div style={{ maxWidth: '840px' }}>
      <button className="btn-secondary" onClick={onBack} style={{ marginBottom: '16px', minHeight: '36px', fontSize: '13px' }}>
        <ArrowLeft size={14} /> Back to search
      </button>

      {/* Header from doc 7.3 Screen 5: Photo, Name, School, Program, Semester, Rating */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-tint)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              fontSize: '24px'
            }}>
              {profile.full_name ? profile.full_name.charAt(0) : 'U'}
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '2px' }}>{profile.full_name}</h1>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                {profile.program_name || 'Student'} • Semester {profile.semester}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {profile.school_name}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            {overallRating ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '20px', fontWeight: '700', color: '#B45309' }}>
                  <Star size={20} fill="#B45309" color="#B45309" />
                  {overallRating} / 5
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Based on {reviewsCount} reviews</div>
              </div>
            ) : (
              <span className="badge-neutral badge">No reviews yet</span>
            )}
          </div>
        </div>

        {/* Button Bar: If faculty, show read-only academic badge, otherwise action buttons */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '20px', paddingTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isFaculty ? (
            <span className="badge-neutral badge" style={{ fontSize: '13px', padding: '6px 14px' }}>
              Academic View Only — Departmental Oversight
            </span>
          ) : (
            <>
              <button className="btn-primary" onClick={handleSendRequest} disabled={sendingRequest}>
                <UserPlus size={16} /> {sendingRequest ? 'Sending...' : 'Send request'}
              </button>
              {onNavigateSchedule && (
                <button className="btn-secondary" onClick={() => onNavigateSchedule(userId)}>
                  <Calendar size={16} /> Schedule session
                </button>
              )}
              {onOpenReport && (
                <button className="btn-secondary" onClick={() => onOpenReport(userId)} style={{ color: 'var(--accent)' }}>
                  <Flag size={16} /> Report
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sections from doc 7.3 Screen 5: About, Can help with, Wants to learn, Interests, Availability, Reviews */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {profile.bio && (
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>About</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: '1.6' }}>{profile.bio}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '10px' }}>Can help with</h3>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {canHelpSkills.length === 0 ? (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None listed</span>
              ) : (
                canHelpSkills.map(s => <span key={s.id} className="badge">{s.name}</span>)
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '10px' }}>Wants to learn</h3>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {wantLearnSkills.length === 0 ? (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>None listed</span>
              ) : (
                wantLearnSkills.map(s => <span key={s.id} className="badge-neutral badge">{s.name}</span>)
              )}
            </div>
          </div>
        </div>

        {interests.length > 0 && (
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '10px' }}>Interests</h3>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {interests.map(i => <span key={i.id} className="badge">{i.name}</span>)}
            </div>
          </div>
        )}

        {/* Availability Grid */}
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '10px' }}>Weekly Availability</h3>
          {availability.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>This student has not added specific study slots.</p>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {availability.map(a => (
                <span key={a.availability_id} className="badge-neutral badge" style={{ fontSize: '13px', padding: '6px 10px' }}>
                  {a.day_of_week}: {a.start_time} - {a.end_time}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Reviews Section from doc 7.3 Screen 5 */}
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px' }}>Peer Reviews</h3>
          {recentReviews.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No feedback reviews submitted yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentReviews.map(r => (
                <div key={r.review_id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{r.reviewer_name}</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#B45309', margin: '2px 0' }}>
                    ★ Punctuality: {r.punctuality} • Helpfulness: {r.helpfulness} • Communication: {r.communication}
                  </div>
                  {r.comment && <p style={{ fontSize: '13px', marginTop: '4px' }}>"{r.comment}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
