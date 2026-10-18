import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Calendar as CalendarIcon, List, Plus, Check, X, Clock, MapPin, Video, Star } from 'lucide-react';

export default function SessionsPage({ initialPartnerId, initialConnId, onOpenRateModal }) {
  const [sessions, setSessions] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [calDate, setCalDate] = useState(new Date());
  const [selectedSession, setSelectedSession] = useState(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [buddies, setBuddies] = useState([]);

  // Propose session form
  const [formData, setFormData] = useState({
    partnerId: initialPartnerId || '',
    connectionId: initialConnId || '',
    title: '',
    subject: '',
    startAt: '',
    endAt: '',
    mode: 'on_campus', // 'online' or 'on_campus'
    locationOrLink: 'STME 6th Floor Library Study Pod',
    semester: 3
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSessions();
    loadBuddies();
  }, []);

  async function loadSessions() {
    setLoading(true);
    try {
      const res = await api.getSessions();
      setSessions(res.sessions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadBuddies() {
    try {
      const res = await api.getRequests();
      setBuddies(res.buddies || []);
      if (!formData.partnerId && res.buddies && res.buddies.length > 0) {
        setFormData(prev => ({
          ...prev,
          partnerId: res.buddies[0].buddy_id,
          connectionId: res.buddies[0].connection_id
        }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handlePropose(e) {
    e.preventDefault();
    try {
      const res = await api.proposeSession(formData);
      alert(res.message);
      setShowProposeModal(false);
      loadSessions();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRespond(sessionId, action) {
    try {
      const res = await api.respondSession(sessionId, { action });
      alert(res.message);
      loadSessions();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleMarkAttendance(sessionId, attended) {
    try {
      const res = await api.markAttendance(sessionId, attended);
      alert(res.message);
      loadSessions();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Study Sessions</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Plan collaborative revision, lab work, and exam prep with your connected peers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {/* Toggle between Calendar and List from doc 7.3 Screen 9 */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button
              onClick={() => setViewMode('list')}
              style={{
                border: 'none',
                borderRadius: 0,
                backgroundColor: viewMode === 'list' ? '#E4574C' : '#FFFFFF',
                color: viewMode === 'list' ? '#FFFFFF' : 'var(--text-main)',
                fontWeight: viewMode === 'list' ? '600' : '400',
                minHeight: '40px',
                padding: '0 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <List size={16} color={viewMode === 'list' ? '#FFFFFF' : 'currentColor'} />
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              style={{
                border: 'none',
                borderRadius: 0,
                backgroundColor: viewMode === 'calendar' ? '#E4574C' : '#FFFFFF',
                color: viewMode === 'calendar' ? '#FFFFFF' : 'var(--text-main)',
                fontWeight: viewMode === 'calendar' ? '600' : '400',
                minHeight: '40px',
                padding: '0 14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CalendarIcon size={16} color={viewMode === 'calendar' ? '#FFFFFF' : 'currentColor'} />
              Calendar
            </button>
          </div>

          <button className="btn-primary" onClick={() => setShowProposeModal(true)}>
            <Plus size={16} />
            New session
          </button>
        </div>
      </div>

      {/* Sessions Content */}
      {sessions.length === 0 ? (
        <div className="empty-state">
          <h3>No study sessions scheduled</h3>
          <p>Schedule a focused session with any of your connected study buddies.</p>
          <button className="btn-primary" onClick={() => setShowProposeModal(true)}>
            Schedule first session
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {[...sessions].sort((a, b) => new Date(a.start_at) - new Date(b.start_at)).map(s => {
            const isCompleted = s.status === 'completed';
            const hasEnded = new Date(s.end_at) < new Date();
            const isConfirmed = s.status === 'confirmed';

            return (
              <div key={s.session_id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{s.title}</h3>
                    <span className="badge" style={{
                      backgroundColor: s.status === 'confirmed' ? '#F0FDF4' : s.status === 'completed' ? '#F3F4F6' : '#FFF3F1',
                      color: s.status === 'confirmed' ? '#166534' : s.status === 'completed' ? '#374151' : '#E4574C',
                      textTransform: 'capitalize'
                    }}>
                      {s.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Subject: <strong>{s.subject}</strong>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-main)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} color="var(--text-muted)" />
                      {new Date(s.start_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - {new Date(s.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {s.mode === 'online' ? <Video size={14} color="var(--text-muted)" /> : <MapPin size={14} color="var(--text-muted)" />}
                      {s.location_or_link}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Participants: {s.organizer_name} & {s.partner_name}
                    </div>
                  </div>
                </div>

                {/* Relevant Action Buttons from doc 7.3 Screen 9 */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {s.status === 'proposed' && s.my_attendance === null && (
                    <>
                      <button className="btn-secondary" style={{ flex: 1, minHeight: '36px', fontSize: '13px' }} onClick={() => handleRespond(s.session_id, 'decline')}>
                        <X size={14} /> Decline
                      </button>
                      <button className="btn-primary" style={{ flex: 1, minHeight: '36px', fontSize: '13px' }} onClick={() => handleRespond(s.session_id, 'accept')}>
                        <Check size={14} /> Accept
                      </button>
                    </>
                  )}

                  {isConfirmed && hasEnded && !s.my_attendance && (
                    <>
                      <button className="btn-secondary" style={{ flex: 1, minHeight: '36px', fontSize: '13px' }} onClick={() => handleMarkAttendance(s.session_id, 'no')}>
                        Missed
                      </button>
                      <button className="btn-primary" style={{ flex: 1, minHeight: '36px', fontSize: '13px' }} onClick={() => handleMarkAttendance(s.session_id, 'yes')}>
                        Mark attended
                      </button>
                    </>
                  )}

                  {(isCompleted || (hasEnded && s.my_attendance === 'yes')) && (
                    <button
                      className="btn-primary"
                      style={{ width: '100%', minHeight: '36px', fontSize: '13px' }}
                      onClick={() => onOpenRateModal(s.session_id, s.title)}
                    >
                      <Star size={14} />
                      {s.my_review_id ? 'Edit Feedback' : 'Rate buddy'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* CALENDAR VIEW */
        <div className="card" style={{ padding: '20px' }}>
          {/* Calendar Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
                {calDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
              <button
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', minHeight: '30px' }}
                onClick={() => setCalDate(new Date())}
              >
                Today
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn-secondary"
                style={{ padding: '6px 12px', minHeight: '34px' }}
                onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1))}
              >
                Prev
              </button>
              <button
                className="btn-secondary"
                style={{ padding: '6px 12px', minHeight: '34px' }}
                onClick={() => setCalDate(new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1))}
              >
                Next
              </button>
            </div>
          </div>

          {/* Month Grid */}
          {(() => {
            const year = calDate.getFullYear();
            const month = calDate.getMonth();
            const firstDayIndex = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const today = new Date();

            const cells = [];
            for (let i = 0; i < firstDayIndex; i++) {
              cells.push(<div key={`empty-${i}`} style={{ minHeight: '90px', border: '1px solid var(--border)', backgroundColor: '#FAFAFA' }}></div>);
            }

            for (let d = 1; d <= daysInMonth; d++) {
              const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

              // Find sessions matching this date
              const daySessions = sessions.filter(s => {
                const sDate = new Date(s.start_at);
                const sYear = sDate.getFullYear();
                const sMonth = sDate.getMonth();
                const sDay = sDate.getDate();
                return sYear === year && sMonth === month && sDay === d;
              });

              cells.push(
                <div
                  key={`day-${d}`}
                  style={{
                    minHeight: '90px',
                    border: '1px solid var(--border)',
                    padding: '6px',
                    backgroundColor: isToday ? '#FFF3F1' : '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{
                    fontSize: '12px',
                    fontWeight: isToday ? '700' : '500',
                    color: isToday ? '#E4574C' : 'var(--text-main)',
                    textAlign: 'right'
                  }}>
                    {d}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
                    {daySessions.map(s => (
                      <div
                        key={s.session_id}
                        onClick={() => setSelectedSession(s)}
                        style={{
                          backgroundColor: '#E4574C',
                          color: '#FFFFFF',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={`${s.title} (${new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                      >
                        {new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {s.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '4px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>
                  {daysOfWeek.map(day => <div key={day} style={{ padding: '8px 0' }}>{day}</div>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: 'var(--border)' }}>
                  {cells}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Session Details Modal */}
      {selectedSession && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600' }}>{selectedSession.title}</h2>
              <span className="badge" style={{
                backgroundColor: selectedSession.status === 'confirmed' ? '#F0FDF4' : '#FFF3F1',
                color: selectedSession.status === 'confirmed' ? '#166534' : '#E4574C',
                textTransform: 'capitalize'
              }}>
                {selectedSession.status}
              </span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Subject: <strong style={{ color: 'var(--text-main)' }}>{selectedSession.subject}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="var(--text-muted)" />
                <span>
                  {new Date(selectedSession.start_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - {new Date(selectedSession.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {selectedSession.mode === 'online' ? <Video size={16} color="var(--text-muted)" /> : <MapPin size={16} color="var(--text-muted)" />}
                <span>{selectedSession.location_or_link}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Participants: {selectedSession.organizer_name} & {selectedSession.partner_name}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn-secondary" onClick={() => setSelectedSession(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Propose Session Dialog */}
      {showProposeModal && (
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
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Propose Study Session</h2>
            <form onSubmit={handlePropose}>
              <div style={{ marginBottom: '12px' }}>
                <label>Select Connected Buddy</label>
                <select
                  value={formData.partnerId}
                  onChange={(e) => {
                    const sel = buddies.find(b => b.buddy_id === e.target.value);
                    setFormData({
                      ...formData,
                      partnerId: e.target.value,
                      connectionId: sel ? sel.connection_id : ''
                    });
                  }}
                  required
                >
                  {buddies.length === 0 ? (
                    <option value="">No buddies connected yet</option>
                  ) : (
                    buddies.map(b => (
                      <option key={b.buddy_id} value={b.buddy_id}>{b.full_name}</option>
                    ))
                  )}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>Session Title</label>
                <input
                  type="text"
                  placeholder="e.g. End-Term DSA Revision"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>Subject</label>
                <input
                  type="text"
                  placeholder="e.g. Data Structures and Algorithms"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label>Start Time</label>
                  <input
                    type="datetime-local"
                    value={formData.startAt}
                    onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label>End Time</label>
                  <input
                    type="datetime-local"
                    value={formData.endAt}
                    onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>Mode</label>
                <select
                  value={formData.mode}
                  onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
                >
                  <option value="on_campus">On Campus</option>
                  <option value="online">Online</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label>{formData.mode === 'online' ? 'Meeting Link' : 'Campus Location'}</label>
                <input
                  type="text"
                  placeholder={formData.mode === 'online' ? 'https://meet.google.com/xyz' : 'STME Room 402 or Library'}
                  value={formData.locationOrLink}
                  onChange={(e) => setFormData({ ...formData, locationOrLink: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowProposeModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={buddies.length === 0}>
                  Schedule session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
