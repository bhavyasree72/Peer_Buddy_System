import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
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

  useEffect(() => {
    loadMaster();
    doSearch();
  }, [filters.sortBy, filters.page, filters.schoolId, filters.programId, filters.semester, filters.skillId, filters.interestId, filters.dayOfWeek, filters.studyMode, filters.minRating]);

  async function loadMaster() {
    try {
      const data = await api.getMasterData();
      setMaster(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function doSearch() {
    setLoading(true);
    try {
      const res = await api.searchBuddies(filters);
      setBuddies(res.buddies || []);
      setPagination(res.pagination || { total: 0, totalPages: 1 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setFilters(prev => ({ ...prev, page: 1 }));
    doSearch();
  }

  async function submitBuddyRequest() {
    if (!showNoteModal) return;
    try {
      const res = await api.sendRequest({
        receiverId: showNoteModal.userId,
        note: requestText
      });
      alert(res.message);
      setShowNoteModal(null);
      setRequestText('');
      doSearch();
    } catch (err) {
      alert(err.message);
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
            placeholder="Search by student name, subject, skill or interest..."
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
                {master.schools.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
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
          ) : buddies.length === 0 ? (
            <div className="empty-state">
              <h3>No buddies found</h3>
              <p>Try adjusting your search keywords or clearing active filters to see more students.</p>
              <button
                className="btn-secondary"
                onClick={() => setFilters({
                  q: '', schoolId: '', programId: '', semester: '', skillId: '', interestId: '', dayOfWeek: '', studyMode: '', minRating: '', sortBy: 'best_match', page: 1, limit: 12
                })}
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
              <button className="btn-secondary" onClick={() => setShowNoteModal(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={submitBuddyRequest}>
                Send request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
