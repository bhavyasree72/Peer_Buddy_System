import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { User, Check, Plus, Lock } from 'lucide-react';

export default function MyProfile({ user }) {
  const [activeTab, setActiveTab] = useState('basic'); // 'basic', 'skills', 'availability', 'privacy'
  const [profile, setProfile] = useState(null);
  const [master, setMaster] = useState({ skills: [], interests: [], schools: [], programs: [] });
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');

  // Form states
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [studyMode, setStudyMode] = useState('both');
  const [openToRequests, setOpenToRequests] = useState(true);
  const [showEmail, setShowEmail] = useState(false);
  const [showAvailability, setShowAvailability] = useState(true);
  const [schoolId, setSchoolId] = useState('');
  const [programId, setProgramId] = useState('');
  const [semester, setSemester] = useState(1);

  // Selected skills: [{ skillId, type: 'has' | 'wants_to_learn' }]
  const [mySkills, setMySkills] = useState([]);
  const [myInterests, setMyInterests] = useState([]);
  const [availabilitySlots, setAvailabilitySlots] = useState([]);

  // Add custom skill modal
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('Technology');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const timeSlots = ['09:00 - 11:00', '11:00 - 13:00', '14:00 - 16:00', '17:00 - 19:00'];

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const [profRes, masterRes] = await Promise.all([
        api.getProfile(),
        api.getMasterData()
      ]);

      const prof = profRes.profile || {};
      setProfile(profRes);
      setMaster(masterRes);

      setFullName(prof.full_name || '');
      setBio(prof.bio || '');
      setSchoolId(prof.school_id || (masterRes.schools && masterRes.schools[0] ? masterRes.schools[0].id : ''));
      setProgramId(prof.program_id || '');
      setSemester(prof.semester || 1);
      setStudyMode(prof.study_mode || 'both');
      setOpenToRequests(prof.open_to_requests === 1);
      setShowEmail(prof.show_email === 1);
      setShowAvailability(prof.show_availability === 1);

      setMySkills(profRes.skills || []);
      setMyInterests(profRes.interests ? profRes.interests.map(i => i.interest_id) : []);
      setAvailabilitySlots(profRes.availability || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSkill(skillId, type) {
    const existing = mySkills.find(s => s.skill_id === skillId && s.type === type);
    if (existing) {
      setMySkills(mySkills.filter(s => !(s.skill_id === skillId && s.type === type)));
    } else {
      setMySkills([...mySkills, { skillId, skill_id: skillId, type, level: 'intermediate' }]);
    }
  }

  function toggleInterest(interestId) {
    if (myInterests.includes(interestId)) {
      setMyInterests(myInterests.filter(id => id !== interestId));
    } else {
      setMyInterests([...myInterests, interestId]);
    }
  }

  function toggleSlot(day, slotStr) {
    const [start, end] = slotStr.split(' - ');
    const exists = availabilitySlots.find(a => a.day_of_week === day && a.start_time === start);

    if (exists) {
      setAvailabilitySlots(availabilitySlots.filter(a => !(a.day_of_week === day && a.start_time === start)));
    } else {
      setAvailabilitySlots([...availabilitySlots, { dayOfWeek: day, day_of_week: day, startTime: start, start_time: start, endTime: end, end_time: end }]);
    }
  }

  async function handleSave() {
    setSaveMessage('');
    try {
      const formattedSkills = mySkills.map(s => ({
        skillId: s.skill_id || s.skillId,
        type: s.type,
        level: s.level || 'intermediate'
      }));

      const formattedAvail = availabilitySlots.map(a => ({
        dayOfWeek: a.day_of_week || a.dayOfWeek,
        startTime: a.start_time || a.startTime,
        endTime: a.end_time || a.endTime
      }));

      const res = await api.updateProfile({
        fullName,
        bio,
        schoolId,
        programId,
        semester,
        studyMode,
        openToRequests,
        showEmail,
        showAvailability,
        skills: formattedSkills,
        interests: myInterests,
        availability: formattedAvail
      });

      // Fixed confirmation message from doc 7.3 Screen 6: "Profile updated"
      setSaveMessage('Profile updated');
      setTimeout(() => setSaveMessage(''), 3000);
      loadProfile();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSuggestSkill(e) {
    e.preventDefault();
    if (!newSkillName.trim()) return;
    try {
      const res = await api.suggestSkill({ name: newSkillName.trim(), category: newSkillCategory });
      alert(res.message);
      setNewSkillName('');
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div style={{ padding: '24px' }}>Loading profile details...</div>;

  return (
    <div style={{ paddingBottom: '90px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>My Profile</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Update your academic interests, subjects you can help with, and weekly study schedule.
        </p>
      </div>

      {/* Tabs from doc 7.3 Screen 6: Basic info, Skills and interests, Availability, Privacy */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('basic')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'basic' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'basic' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'basic' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Basic Info
        </button>

        <button
          onClick={() => setActiveTab('skills')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'skills' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'skills' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'skills' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Skills & Interests
        </button>

        <button
          onClick={() => setActiveTab('availability')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'availability' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'availability' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'availability' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Weekly Availability
        </button>

        <button
          onClick={() => setActiveTab('privacy')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'privacy' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'privacy' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'privacy' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Privacy & Preferences
        </button>
      </div>

      {/* TAB 1: Basic Info */}
      {activeTab === 'basic' && (
        <div className="card" style={{ maxWidth: '640px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label>Full Name</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label>Short Bio (up to 250 characters)</label>
            <textarea
              maxLength={250}
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell other students about your academic goals and subjects..."
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
              {bio.length}/250
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label>School</label>
            <select
              value={schoolId}
              onChange={(e) => {
                const newSchoolId = e.target.value;
                const schoolObj = master.schools.find(s => s.id === newSchoolId || s.code === newSchoolId);
                const maxSem = schoolObj ? (schoolObj.semesters || 8) : 8;
                setSchoolId(newSchoolId);
                if (semester > maxSem) setSemester(1);
              }}
            >
              {master.schools && master.schools
                .filter(s => ['STME', 'SOL', 'SPTM', 'SBM', 'SOC'].includes((s.code || '').toUpperCase()))
                .map(s => (
                  <option key={s.id} value={s.id}>{s.code} – {s.name.replace(/\s*\([^)]*\)$/, '')}</option>
                ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label>Program</label>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
              >
                <option value="">Select Program</option>
                {master.programs && master.programs
                  .filter(p => !schoolId || p.school_id === schoolId)
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
              </select>
            </div>
            <div>
              <label>Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(parseInt(e.target.value, 10))}
              >
                {(() => {
                  const schoolObj = master.schools ? master.schools.find(s => s.id === schoolId || s.code === schoolId) : null;
                  const count = schoolObj ? (schoolObj.semesters || 8) : 8;
                  return Array.from({ length: count }, (_, i) => i + 1).map(s => (
                    <option key={s} value={s}>Semester {s}</option>
                  ));
                })()}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label>Preferred Study Mode</label>
            <select value={studyMode} onChange={(e) => setStudyMode(e.target.value)}>
              <option value="both">Both (Online and On Campus)</option>
              <option value="on_campus">On Campus Only</option>
              <option value="online">Online Only</option>
            </select>
          </div>
        </div>
      )}

      {/* TAB 2: Skills and Interests */}
      {activeTab === 'skills' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
              Subjects & Skills You Can Help With
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Click to select skills you are confident explaining to peers.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {master.skills.map(sk => {
                const isSelected = mySkills.some(s => s.skill_id === sk.skill_id && s.type === 'has');
                return (
                  <button
                    key={`has-${sk.skill_id}`}
                    type="button"
                    onClick={() => toggleSkill(sk.skill_id, 'has')}
                    style={{
                      backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-subtle)',
                      color: isSelected ? '#FFFFFF' : 'var(--text-main)',
                      border: '1px solid var(--border)',
                      minHeight: '34px',
                      padding: '0 12px',
                      fontSize: '13px'
                    }}
                  >
                    {isSelected && <Check size={14} />}
                    {sk.name}
                  </button>
                );
              })}
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
              Subjects You Want To Learn / Need Help With
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Select skills where you are looking for assistance or a study partner.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {master.skills.map(sk => {
                const isSelected = mySkills.some(s => s.skill_id === sk.skill_id && s.type === 'wants_to_learn');
                return (
                  <button
                    key={`want-${sk.skill_id}`}
                    type="button"
                    onClick={() => toggleSkill(sk.skill_id, 'wants_to_learn')}
                    style={{
                      backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-subtle)',
                      color: isSelected ? '#FFFFFF' : 'var(--text-main)',
                      border: '1px solid var(--border)',
                      minHeight: '34px',
                      padding: '0 12px',
                      fontSize: '13px'
                    }}
                  >
                    {isSelected && <Check size={14} />}
                    {sk.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
              Interests & Extra-curriculars
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Find peers who share your extracurricular and project passions.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
              {master.interests.map(it => {
                const isSelected = myInterests.includes(it.interest_id);
                return (
                  <button
                    key={it.interest_id}
                    type="button"
                    onClick={() => toggleInterest(it.interest_id)}
                    style={{
                      backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-subtle)',
                      color: isSelected ? '#FFFFFF' : 'var(--text-main)',
                      border: '1px solid var(--border)',
                      minHeight: '34px',
                      padding: '0 12px',
                      fontSize: '13px'
                    }}
                  >
                    {isSelected && <Check size={14} />}
                    {it.name}
                  </button>
                );
              })}
            </div>

            {/* "Add your own" workflow from doc 3.2: goes for admin approval */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                Suggest a new skill (goes for admin approval)
              </h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. Flutter Mobile Dev"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  style={{ height: '38px', fontSize: '13px' }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSuggestSkill}
                  style={{ minHeight: '38px', fontSize: '13px' }}
                >
                  <Plus size={14} /> Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Weekly Availability Matrix */}
      {activeTab === 'availability' && (
        <div className="card">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Weekly Availability Grid</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Click on slots when you are usually free for study discussions.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-subtle)' }}>Time Slot</th>
                  {days.map(d => (
                    <th key={d} style={{ padding: '10px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-subtle)' }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map(slot => (
                  <tr key={slot}>
                    <td style={{ padding: '10px', border: '1px solid var(--border)', fontWeight: '500', backgroundColor: 'var(--bg-subtle)' }}>
                      {slot}
                    </td>
                    {days.map(d => {
                      const [st] = slot.split(' - ');
                      const isSelected = availabilitySlots.some(a => (a.day_of_week === d || a.dayOfWeek === d) && (a.start_time === st || a.startTime === st));
                      return (
                        <td
                          key={`${d}-${slot}`}
                          onClick={() => toggleSlot(d, slot)}
                          style={{
                            padding: '10px',
                            border: '1px solid var(--border)',
                            backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                            color: isSelected ? '#FFFFFF' : 'inherit',
                            cursor: 'pointer',
                            fontWeight: isSelected ? '600' : 'normal',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          {isSelected ? 'Available' : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Privacy Toggles from doc 3.2 */}
      {activeTab === 'privacy' && (
        <div className="card" style={{ maxWidth: '640px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Privacy & Discovery Settings</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 0, cursor: 'pointer' }}>
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Open to new buddy requests</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Show my profile in buddy search results.</span>
              </div>
              <input
                type="checkbox"
                checked={openToRequests}
                onChange={(e) => setOpenToRequests(e.target.checked)}
                style={{ width: '20px', height: '20px' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 0, cursor: 'pointer' }}>
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Show college email to connected buddies</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Keep email private by default.</span>
              </div>
              <input
                type="checkbox"
                checked={showEmail}
                onChange={(e) => setShowEmail(e.target.checked)}
                style={{ width: '20px', height: '20px' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 0, cursor: 'pointer' }}>
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Display weekly availability on public profile</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Allows compatible buddies to see when you are free.</span>
              </div>
              <input
                type="checkbox"
                checked={showAvailability}
                onChange={(e) => setShowAvailability(e.target.checked)}
                style={{ width: '20px', height: '20px' }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Fixed bottom bar from doc 7.3 Screen 6: Single Save changes button stays fixed with "Profile updated" */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '250px',
        right: 0,
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid var(--border)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 50
      }}>
        <div style={{ color: '#166534', fontWeight: '600', fontSize: '14px' }}>
          {saveMessage}
        </div>
        <button className="btn-primary" onClick={handleSave}>
          Save changes
        </button>
      </div>
    </div>
  );
}
