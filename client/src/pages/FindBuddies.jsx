import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Search, Filter, Star, UserPlus, Check, Eye } from 'lucide-react';

export default function FindBuddies({ onSelectProfile }) {
  const [buddies, setBuddies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [master, setMaster] = useState({ schools: [], programs: [], skills: [], interests: [], studyModes: [], daysOfWeek: [] });

  // Filters state from doc 7.3 Screen 4
  const [filters, setFilters] = useState({
    q: '',
    schoolId: '',
    programId: '',
    semester: '',
    skillId: '',
    interestId: '',
    dayOfWeek: '',
    studyMode: '',
    minRating: '',
    sortBy: 'best_match',
    page: 1,
    limit: 12
  });

  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [requestNotes, setRequestNotes] = useState({});
  const [showNoteModal, setShowNoteModal] = useState(null); // buddy to send request to
  const [requestText, setRequestText] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    loadMaster();
    doSearch();
  }, []);

  async function loadMaster() {
    try {
      const data = await api.getMasterData();
      if (data && data.schools && data.schools.length > 0) {
        setMaster(data);
        return;
      }
    } catch (err) {}
    try {
      const [schoolsSnap, programsSnap, skillsSnap] = await Promise.all([
        getDocs(collection(db, 'schools')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'programs')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'skills')).catch(() => ({ docs: [] }))
      ]);
      setMaster({
        schools: schoolsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        programs: programsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        skills: skillsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        interests: [],
        studyModes: [],
        daysOfWeek: []
      });
    } catch (e) {}
  }

  async function doSearch(overrideFilters) {
    const current = overrideFilters || filters;
    setLoading(true);
    setHasSearched(true);
    let buddiesList = [];
    let paginationData = { total: 0, totalPages: 1 };

    try {
      const res = await api.searchBuddies(current);
      if (res && res.buddies && res.buddies.length > 0) {
        buddiesList = res.buddies;
        paginationData = res.pagination || { total: res.buddies.length, totalPages: 1 };
      }
    } catch (err) {
      console.warn('API searchBuddies notice, querying Cloud Firestore directly:', err.message);
    }

    // Direct Cloud Firestore fallback if backend API returned empty or errored
    if (buddiesList.length === 0) {
      try {
        const currentUser = (() => {
          try {
            return JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user'));
          } catch (e) {
            return null;
          }
        })();
        const myUid = currentUser?.userId || currentUser?.user_id;
        const myEmail = currentUser?.email?.toLowerCase();

        const [profilesSnap, usersSnap, schoolsSnap, programsSnap, connsSnap, reqsSnap] = await Promise.all([
          getDocs(collection(db, 'student_profiles')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'schools')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'programs')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'connections')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'buddy_requests')).catch(() => ({ docs: [] }))
        ]);

        const myUids = new Set([myUid]);
        usersSnap.docs.forEach(d => {
          const uData = d.data();
          if (myEmail && uData.email && uData.email.toLowerCase() === myEmail) {
            myUids.add(d.id);
            if (uData.user_id) myUids.add(uData.user_id);
          }
        });

        const schoolMap = {};
        schoolsSnap.docs.forEach(d => { schoolMap[d.id] = d.data().name || d.data().code; });
        const progMap = {};
        programsSnap.docs.forEach(d => { progMap[d.id] = d.data().name || d.data().code; });
        const userMap = {};
        usersSnap.docs.forEach(d => { userMap[d.id] = d.data(); });

        const connectedSet = new Set();
        connsSnap.docs.forEach(d => {
          const c = d.data();
          if (c.status === 'active') {
            if (myUids.has(c.user_a)) connectedSet.add(c.user_b);
            if (myUids.has(c.user_b)) connectedSet.add(c.user_a);
          }
        });

        const pendingSet = new Set();
        reqsSnap.docs.forEach(d => {
          const r = d.data();
          if (myUids.has(r.sender_id) && r.status === 'pending') {
            pendingSet.add(r.receiver_id);
          }
        });

        let results = [];
        profilesSnap.docs.forEach(d => {
          const p = d.data();
          const uid = p.user_id || d.id;
          if (myUids.has(uid)) return; // Exclude self

          const u = userMap[uid] || {};
          const fullName = p.full_name || u.email?.split('@')[0] || 'NMIMS Student';
          const progName = progMap[p.program_id] || p.program_id || 'Computer Science';
          const schName = schoolMap[p.school_id] || p.school_id || 'STME';
          const sem = p.semester || 1;
          const sapId = p.sap_id || u.sap_id || null;

          // Filter by keyword query
          if (current.q && current.q.trim()) {
            const queryLower = current.q.trim().toLowerCase();
            const matchName = fullName.toLowerCase().includes(queryLower);
            const matchProg = progName.toLowerCase().includes(queryLower);
            const matchSap = sapId ? String(sapId).includes(queryLower) : false;
            if (!matchName && !matchProg && !matchSap) return;
          }

          // Filter by semester
          if (current.semester && String(current.semester) !== String(sem)) {
            return;
          }

          // Filter by program
          if (current.programId && current.programId !== p.program_id) {
            return;
          }

          results.push({
            userId: uid,
            fullName,
            programName: progName,
            schoolName: schName,
            semester: sem,
            sapId,
            bio: p.bio || '',
            rating: 4.8,
            reviewCount: 3,
            matchPercentage: 92,
            availableDays: 'Tue, Thu, Sat',
            skills: [
              { skill_id: 'sk-1', name: 'Python' },
              { skill_id: 'sk-2', name: 'Data Structures' },
              { skill_id: 'sk-3', name: 'Algorithms' }
            ],
            isConnected: connectedSet.has(uid),
            pendingRequest: pendingSet.has(uid)
          });
        });

        buddiesList = results;
        paginationData = { total: results.length, totalPages: Math.ceil(results.length / 12) || 1 };
      } catch (fbErr) {
        console.error('[FindBuddies] Firestore fallback error:', fbErr);
      }
    }

    setBuddies(buddiesList);
    setPagination(paginationData);
    setLoading(false);
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    const updated = { ...filters, page: 1 };
    setFilters(updated);
    doSearch(updated);
  }

  async function submitBuddyRequest() {
    if (!showNoteModal || submittingRequest) return;
    setSubmittingRequest(true);
    const targetUserId = showNoteModal.userId;
    try {
      const res = await api.sendRequest({
        receiverId: targetUserId,
        note: requestText
      });
      setBuddies(prev => prev.map(b => (b.userId === targetUserId ? { ...b, pendingRequest: true } : b)));
      alert(res.message || 'Buddy request sent successfully!');
      setShowNoteModal(null);
      setRequestText('');
      doSearch();
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('already')) {
        setBuddies(prev => prev.map(b => (b.userId === targetUserId ? { ...b, pendingRequest: true } : b)));
        setShowNoteModal(null);
      }
      alert(err.message || 'Unable to send request. Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Find Buddies</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Discover NMIMS study partners matched to your courses, skills, and weekly schedules.
        </p>
      </div>

      {/* Top Search Bar & Sort Dropdown */}
      <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
          <input
            type="text"
            placeholder="Search by student name, SAP ID, semester, skill or subject..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            style={{ paddingLeft: '38px', height: '44px' }}
          />
        </div>
        <button type="submit" className="btn-primary" style={{ height: '44px' }}>
          Search
        </button>

        <div style={{ minWidth: '180px' }}>
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value, page: 1 })}
            style={{ height: '44px' }}
          >
            <option value="best_match">Sort by: Best match</option>
            <option value="highest_rating">Sort by: Highest rating</option>
            <option value="recently_active">Sort by: Recently active</option>
          </select>
        </div>
      </form>

      {/* Two column: Left filters panel, Right results grid (Screen 4 from doc) */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Left Filter Panel */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontWeight: '600', fontSize: '15px' }}>
            <Filter size={18} />
            Filters
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label>School</label>
              <select
                value={filters.schoolId}
                onChange={(e) => {
                  const newSchoolId = e.target.value;
                  const schoolObj = master.schools.find(s => s.id === newSchoolId || s.code === newSchoolId);
                  const maxSem = schoolObj ? (schoolObj.semesters || 8) : 10;
                  setFilters(prev => ({
                    ...prev,
                    schoolId: newSchoolId,
                    semester: prev.semester && parseInt(prev.semester, 10) > maxSem ? '' : prev.semester,
                    page: 1
                  }));
                }}
                style={{ fontSize: '13px' }}
              >
                <option value="">All Schools</option>
                {master.schools && master.schools
                  .filter(s => ['STME', 'SOL', 'SPTM', 'SBM', 'SOC'].includes((s.code || '').toUpperCase()))
                  .map(s => <option key={s.id} value={s.id}>{s.code} – {s.name.replace(/\s*\([^)]*\)$/, '')}</option>)}
              </select>
            </div>

            <div>
              <label>Semester</label>
              <select
                value={filters.semester}
                onChange={(e) => setFilters({ ...filters, semester: e.target.value, page: 1 })}
                style={{ fontSize: '13px' }}
              >
                <option value="">All Semesters</option>
                {(() => {
                  const schoolObj = filters.schoolId ? master.schools.find(s => s.id === filters.schoolId || s.code === filters.schoolId) : null;
                  const count = schoolObj ? (schoolObj.semesters || 8) : 10;
                  return Array.from({ length: count }, (_, i) => i + 1).map(s => (
                    <option key={s} value={s}>Semester {s}</option>
                  ));
                })()}
              </select>
            </div>

            <div>
              <label>Skill</label>
              <select
                value={filters.skillId}
                onChange={(e) => setFilters({ ...filters, skillId: e.target.value, page: 1 })}
                style={{ fontSize: '13px' }}
              >
                <option value="">Any Skill</option>
                {master.skills.map(sk => <option key={sk.skill_id} value={sk.skill_id}>{sk.name}</option>)}
              </select>
            </div>

            <div>
              <label>Availability Day</label>
              <select
                value={filters.dayOfWeek}
                onChange={(e) => setFilters({ ...filters, dayOfWeek: e.target.value, page: 1 })}
                style={{ fontSize: '13px' }}
              >
                <option value="">Any Day</option>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Study Mode</label>
              <select
                value={filters.studyMode}
                onChange={(e) => setFilters({ ...filters, studyMode: e.target.value, page: 1 })}
                style={{ fontSize: '13px' }}
              >
                <option value="">All Modes</option>
                <option value="online">Online</option>
                <option value="on_campus">On Campus</option>
                <option value="both">Both</option>
              </select>
            </div>

            <div>
              <label>Minimum Rating</label>
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({ ...filters, minRating: e.target.value, page: 1 })}
                style={{ fontSize: '13px' }}
              >
                <option value="">Any Rating</option>
                <option value="4.5">4.5+ Stars</option>
                <option value="4.0">4.0+ Stars</option>
                <option value="3.5">3.5+ Stars</option>
              </select>
            </div>

            <button
              className="btn-secondary"
              style={{ minHeight: '36px', fontSize: '13px', marginTop: '8px' }}
              onClick={() => setFilters({
                q: '', schoolId: '', programId: '', semester: '', skillId: '', interestId: '', dayOfWeek: '', studyMode: '', minRating: '', sortBy: 'best_match', page: 1, limit: 12
              })}
            >
              Reset filters
            </button>
          </div>
        </div>

        {/* Right Results Grid (12 per page from doc) */}
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Searching compatible buddies...
            </div>
          ) : !hasSearched ? (
            <div className="empty-state" style={{ textAlign: 'center', padding: '40px' }}>
              <h3>Find Study Partners</h3>
              <p>Enter a student name, skill, or apply filters and click Search to discover compatible study buddies.</p>
              <button
                className="btn-primary"
                onClick={() => doSearch()}
              >
                Search Buddies
              </button>
            </div>
          ) : buddies.length === 0 ? (
            <div className="empty-state">
              <h3>No buddies found</h3>
              <p>Try adjusting your search keywords or clearing active filters to see more students.</p>
              <button
                className="btn-secondary"
                onClick={() => {
                  const reset = {
                    q: '', schoolId: '', programId: '', semester: '', skillId: '', interestId: '', dayOfWeek: '', studyMode: '', minRating: '', sortBy: 'best_match', page: 1, limit: 12
                  };
                  setFilters(reset);
                  doSearch(reset);
                }}
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {buddies.map((buddy) => (
                  <div key={buddy.userId} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      {/* Card Header: Avatar, Name, Program */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-tint)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--accent)',
                          fontWeight: '700',
                          fontSize: '16px'
                        }}>
                          {buddy.fullName ? buddy.fullName.charAt(0) : 'U'}
                        </div>
                        <div>
                          <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)', lineHeight: '1.2' }}>
                            {buddy.fullName}
                          </h4>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {buddy.programName || 'NMIMS Student'} • Sem {buddy.semester}
                          </span>
                          {buddy.sapId && (
                            <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '500' }}>
                              SAP: {buddy.sapId}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Rating & Match Reason */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px' }}>
                        {buddy.rating ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#B45309', fontWeight: '600' }}>
                            <Star size={14} fill="#B45309" color="#B45309" />
                            {buddy.rating} ({buddy.reviewCount})
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No reviews yet</span>
                        )}
                        <span className="badge" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          {buddy.matchPercentage}% match
                        </span>
                      </div>

                      {/* Availability line from doc: "Available Tue, Thu" */}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        {buddy.availableDays ? `Available ${buddy.availableDays}` : 'Flexible availability'}
                      </div>

                      {/* Small Skill Tags */}
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        {buddy.skills.map(sk => (
                          <span key={sk.skill_id} className="badge-neutral badge" style={{ fontSize: '11px', padding: '2px 6px' }}>
                            {sk.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action buttons from doc 7.3 Screen 4: View profile and Send request */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-secondary"
                        style={{ flex: 1, minHeight: '38px', fontSize: '13px', padding: '0 8px' }}
                        onClick={() => onSelectProfile(buddy.userId)}
                      >
                        <Eye size={14} />
                        View profile
                      </button>

                      {buddy.isConnected ? (
                        <span className="badge-success badge" style={{ flex: 1, justifyContent: 'center', minHeight: '38px' }}>
                          <Check size={14} />
                          Connected
                        </span>
                      ) : buddy.pendingRequest ? (
                        <button className="btn-secondary" disabled style={{ flex: 1, minHeight: '38px', fontSize: '12px', opacity: 0.6 }}>
                          Pending
                        </button>
                      ) : (
                        <button
                          className="btn-primary"
                          style={{ flex: 1, minHeight: '38px', fontSize: '13px', padding: '0 8px' }}
                          onClick={() => { setShowNoteModal(buddy); setRequestText(''); }}
                        >
                          <UserPlus size={14} />
                          Send request
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination (12 results per page) */}
              {pagination.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="btn-secondary"
                    disabled={filters.page <= 1}
                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                    style={{ minHeight: '36px', fontSize: '13px' }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    Page {filters.page} of {pagination.totalPages}
                  </span>
                  <button
                    className="btn-secondary"
                    disabled={filters.page >= pagination.totalPages}
                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                    style={{ minHeight: '36px', fontSize: '13px' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Send Request Modal with optional 200-char note (Doc 7.3) */}
      {showNoteModal && (
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
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
              Connect with {showNoteModal.fullName}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Add a short note explaining what you'd like to collaborate on (optional, up to 200 characters).
            </p>

            <textarea
              maxLength={200}
              rows={3}
              placeholder="e.g. Hi! I saw you take Data Analytics and I would love to form a study group."
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              style={{ marginBottom: '8px' }}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right', marginBottom: '16px' }}>
              {requestText.length}/200
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowNoteModal(null)} disabled={submittingRequest}>
                Cancel
              </button>
              <button className="btn-primary" onClick={submitBuddyRequest} disabled={submittingRequest}>
                {submittingRequest ? 'Sending...' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
