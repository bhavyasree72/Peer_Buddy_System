import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Users, Calendar, MessageSquare, ArrowRight, Star, Clock } from 'lucide-react';

export default function StudentHome({ user, onNavigate }) {
  const [data, setData] = useState({
    pendingRequestsCount: 0,
    nextSession: null,
    unreadMessagesCount: 0,
    suggestedBuddies: [],
    profileCompleteness: 0,
    upcomingSessions: []
  });
  const [loading, setLoading] = useState(true);

  // Time-based greeting as described in doc: "Good evening, Bhavya"
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return 'Good morning';
    if (hours < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user.fullName ? user.fullName.split(' ')[0] : 'Student';

  useEffect(() => {
    loadHomeData();
  }, []);

  async function loadHomeData() {
    setLoading(true);
    try {
      const [reqs, sess, sugg, prof, convs] = await Promise.all([
        api.getRequests(),
        api.getSessions(),
        api.getSuggestedBuddies(),
        api.getProfile(),
        api.getConversations().catch(() => ({ conversations: [] }))
      ]);

      const pendingReceived = reqs.received ? reqs.received.length : 0;
      
      // Next upcoming confirmed session
      const now = new Date();
      const futureSessions = (sess.sessions || [])
        .filter(s => s.status === 'confirmed' && new Date(s.start_at) > now)
        .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

      const unreadMsgs = (convs.conversations || []).reduce((acc, c) => acc + (c.unread_count || 0), 0);

      setData({
        pendingRequestsCount: pendingReceived,
        nextSession: futureSessions[0] || null,
        unreadMessagesCount: unreadMsgs,
        suggestedBuddies: sugg.suggestions || [],
        profileCompleteness: prof.profile?.profile_completeness || 0,
        upcomingSessions: futureSessions.slice(0, 3)
      });
    } catch (err) {
      console.error('Error loading home data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendRequest(buddyId, buddyName) {
    try {
      const res = await api.sendRequest({ receiverId: buddyId, note: 'Hi! Let us connect to collaborate on coursework.' });
      alert(res.message);
      loadHomeData();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      {/* Top Greeting */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>
          {getGreeting()}, {firstName}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
          Welcome back to the NMIMS Peer Buddy System.
        </p>
      </div>

      {/* Row of 3 Tiles from doc 7.3: Pending requests, Next session, Unread messages */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        {/* Tile 1: Pending requests */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }} onClick={() => onNavigate('my-buddies')}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-tint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={24} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', lineHeight: '1.2' }}>
              {data.pendingRequestsCount}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Pending requests</div>
          </div>
        </div>

        {/* Tile 2: Next session */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }} onClick={() => onNavigate('sessions')}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-tint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Calendar size={24} color="var(--accent)" />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {data.nextSession ? data.nextSession.title : 'None scheduled'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {data.nextSession ? new Date(data.nextSession.start_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Next study session'}
            </div>
          </div>
        </div>

        {/* Tile 3: Unread messages */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }} onClick={() => onNavigate('chat')}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-tint)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <MessageSquare size={24} color="var(--accent)" />
          </div>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', lineHeight: '1.2' }}>
              {data.unreadMessagesCount}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Unread alerts & messages</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left column (Suggested buddies), Right column (Upcoming sessions & Completeness) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '24px'
      }}>
        {/* Left Column: Suggested Buddies */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-main)' }}>
              Suggested buddies for you
            </h2>
            <button className="btn-outline" style={{ minHeight: '36px', fontSize: '13px', padding: '0 12px' }} onClick={() => onNavigate('find-buddies')}>
              View all
              <ArrowRight size={14} />
            </button>
          </div>

          {data.suggestedBuddies.length === 0 ? (
            <div className="empty-state">
              <h3>No suggestions yet</h3>
              <p>
                Complete your profile skills and courses to get matched with compatible NMIMS study partners.
              </p>
              <button className="btn-primary" onClick={() => onNavigate('profile')}>
                Complete profile
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.suggestedBuddies.map((buddy) => (
                <div key={buddy.userId} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-tint)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      fontWeight: '700',
                      fontSize: '18px'
                    }}>
                      {buddy.fullName ? buddy.fullName.charAt(0) : 'U'}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '2px' }}>
                        {buddy.fullName}
                      </h4>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        {buddy.programName} • Semester {buddy.semester}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {buddy.sharedSkills && buddy.sharedSkills.map(sk => (
                          <span key={sk} className="badge" style={{ fontSize: '11px', padding: '2px 6px' }}>{sk}</span>
                        ))}
                        <span className="badge-neutral badge" style={{ fontSize: '11px', padding: '2px 6px' }}>
                          {buddy.matchPercentage}% match
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    className="btn-primary"
                    style={{ minHeight: '38px', fontSize: '13px', padding: '0 12px' }}
                    onClick={() => handleSendRequest(buddy.userId, buddy.fullName)}
                  >
                    Send request
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Profile completeness & Upcoming sessions */}
        <div>
          {/* Profile Completeness Bar from doc 7.3 */}
          {data.profileCompleteness < 100 && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600' }}>Profile Completeness</span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--accent)' }}>
                  {data.profileCompleteness}%
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: '#E5E5E5', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
                <div style={{ width: `${data.profileCompleteness}%`, height: '100%', backgroundColor: 'var(--accent)', transition: 'width 0.3s ease' }} />
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Adding your weekly availability and skills helps find the right buddy in minutes.
              </p>
              <button className="btn-secondary" style={{ width: '100%', minHeight: '36px', fontSize: '13px' }} onClick={() => onNavigate('profile')}>
                Update profile
              </button>
            </div>
          )}

          {/* Upcoming Sessions List */}
          <div className="card">
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>
              Upcoming sessions
            </h3>
            {data.upcomingSessions.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                No study sessions coming up. Connect with a buddy to schedule one.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data.upcomingSessions.map(sess => (
                  <div key={sess.session_id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600' }}>{sess.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(sess.start_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
