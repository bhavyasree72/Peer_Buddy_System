import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Users, Inbox, Send, Check, X, Eye, UserMinus, Calendar, MessageSquare } from 'lucide-react';

export default function MyBuddies({ onSelectProfile, onNavigateChat, onNavigateSchedule }) {
  const [activeTab, setActiveTab] = useState('buddies'); // 'buddies', 'received', 'sent'
  const [data, setData] = useState({ received: [], sent: [], buddies: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    let resultData = null;
    try {
      const res = await api.getRequests();
      if (res && (res.buddies || res.received || res.sent)) {
        resultData = res;
      }
    } catch (err) {
      console.warn('API getRequests notice, loading directly from Cloud Firestore:', err.message);
    }

    if (!resultData || (!resultData.buddies?.length && !resultData.received?.length && !resultData.sent?.length)) {
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

        const [connsSnap, reqsSnap, profilesSnap, staffProfilesSnap, usersSnap, progsSnap] = await Promise.all([
          getDocs(collection(db, 'connections')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'buddy_requests')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'student_profiles')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'staff_profiles')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'programs')).catch(() => ({ docs: [] }))
        ]);

        const progMap = {};
        progsSnap.docs.forEach(d => { progMap[d.id] = d.data().name || d.data().code; });
        const userMap = {};
        usersSnap.docs.forEach(d => { userMap[d.id] = d.data(); });

        const myUids = new Set([myUid]);
        usersSnap.docs.forEach(d => {
          const uData = d.data();
          if (myEmail && uData.email && uData.email.toLowerCase() === myEmail) {
            myUids.add(d.id);
            if (uData.user_id) myUids.add(uData.user_id);
          }
        });

        const profMap = {};
        profilesSnap.docs.forEach(d => { profMap[d.id] = d.data(); });
        staffProfilesSnap.docs.forEach(d => {
          profMap[d.id] = {
            ...d.data(),
            program_id: d.data().department || d.data().designation,
            semester: 'Staff'
          };
        });

        const buddies = [];
        connsSnap.docs.forEach(d => {
          const c = d.data();
          const isA = myUids.has(c.user_a);
          const isB = myUids.has(c.user_b);
          if (c.status === 'active' && (isA || isB)) {
            const buddyId = isA ? c.user_b : c.user_a;
            if (myUids.has(buddyId)) return; // Exclude self
            const p = profMap[buddyId] || {};
            const u = userMap[buddyId] || {};
            buddies.push({
              connection_id: d.id,
              buddy_id: buddyId,
              full_name: p.full_name || u.fullName || u.email?.split('@')[0] || 'Peer Buddy',
              program_name: progMap[p.program_id] || p.program_id || 'Computer Science & Engineering',
              semester: p.semester || 1,
              created_at: c.created_at || new Date().toISOString(),
              rating: 4.9
            });
          }
        });

        const received = [];
        const sent = [];
        reqsSnap.docs.forEach(d => {
          const r = d.data();
          if (r.status === 'pending') {
            if (myUids.has(r.receiver_id)) {
              const p = profMap[r.sender_id] || {};
              const u = userMap[r.sender_id] || {};
              received.push({
                request_id: d.id,
                sender_id: r.sender_id,
                sender_name: p.full_name || u.fullName || u.email?.split('@')[0] || 'Student',
                sender_program: progMap[p.program_id] || p.program_id || 'Computer Science & Engineering',
                sender_semester: p.semester || 1,
                program_name: progMap[p.program_id] || p.program_id || 'Computer Science & Engineering',
                semester: p.semester || 1,
                note: r.note || '',
                created_at: r.created_at || new Date().toISOString()
              });
            } else if (myUids.has(r.sender_id)) {
              const p = profMap[r.receiver_id] || {};
              const u = userMap[r.receiver_id] || {};
              sent.push({
                request_id: d.id,
                receiver_id: r.receiver_id,
                receiver_name: p.full_name || u.fullName || u.email?.split('@')[0] || 'Student',
                receiver_program: progMap[p.program_id] || p.program_id || 'Computer Science & Engineering',
                receiver_semester: p.semester || 1,
                program_name: progMap[p.program_id] || p.program_id || 'Computer Science & Engineering',
                semester: p.semester || 1,
                note: r.note || '',
                created_at: r.created_at || new Date().toISOString()
              });
            }
          }
        });

        resultData = {
          buddies,
          received,
          sent
        };
      } catch (fbErr) {
        console.error('[MyBuddies] Firestore fallback error:', fbErr);
      }
    }

    setData(resultData || { received: [], sent: [], buddies: [] });
    setLoading(false);
  }

  async function handleRespond(requestId, action) {
    try {
      const res = await api.respondRequest(requestId, action);
      alert(res.message);
      loadRequests();
    } catch (err) {
      // Direct Firestore fallback
      try {
        await updateDoc(doc(db, 'buddy_requests', requestId), {
          status: action === 'accept' ? 'accepted' : 'rejected',
          updated_at: new Date().toISOString()
        });
        if (action === 'accept') {
          const reqItem = data.received.find(r => r.request_id === requestId);
          const currentUser = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
          const myUid = currentUser.userId || currentUser.user_id;
          if (reqItem) {
            const newConnRef = doc(collection(db, 'connections'));
            await setDoc(newConnRef, {
              id: newConnRef.id,
              connection_id: newConnRef.id,
              user_a: reqItem.sender_id,
              user_b: myUid,
              status: 'active',
              created_at: new Date().toISOString()
            });
          }
        }
        alert(action === 'accept' ? 'Buddy request accepted! Connection established.' : 'Buddy request declined.');
        loadRequests();
      } catch (fbErr) {
        alert(err.message || fbErr.message);
      }
    }
  }

  async function handleCancel(requestId) {
    if (!confirm('Are you sure you want to cancel this pending buddy request?')) return;
    try {
      const res = await api.cancelRequest(requestId);
      alert(res.message);
      loadRequests();
    } catch (err) {
      try {
        await updateDoc(doc(db, 'buddy_requests', requestId), {
          status: 'cancelled',
          updated_at: new Date().toISOString()
        });
        alert('Request cancelled successfully.');
        loadRequests();
      } catch (fbErr) {
        alert(err.message || fbErr.message);
      }
    }
  }

  async function handleDisconnect(connectionId, buddyName) {
    if (!confirm(`Are you sure you want to end your buddy connection with ${buddyName}?`)) return;
    try {
      const res = await api.disconnectBuddy(connectionId);
      alert(res.message);
      loadRequests();
    } catch (err) {
      try {
        await updateDoc(doc(db, 'connections', connectionId), {
          status: 'ended',
          ended_at: new Date().toISOString()
        });
        alert('Buddy connection ended.');
        loadRequests();
      } catch (fbErr) {
        alert(err.message || fbErr.message);
      }
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>My Buddies & Requests</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Manage your connected study buddies and pending invitations.
        </p>
      </div>

      {/* Tabs from doc 7.3 Screen 7: Buddies, Received, Sent */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('buddies')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'buddies' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'buddies' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'buddies' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Connected Buddies ({data.buddies.length})
        </button>

        <button
          onClick={() => setActiveTab('received')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'received' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'received' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'received' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Received Requests ({data.received.length})
        </button>

        <button
          onClick={() => setActiveTab('sent')}
          style={{
            border: 'none',
            borderBottom: activeTab === 'sent' ? '2px solid var(--accent)' : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'sent' ? 'var(--accent)' : 'var(--text-main)',
            fontWeight: activeTab === 'sent' ? '600' : '500',
            borderRadius: 0,
            padding: '10px 16px'
          }}
        >
          Sent Requests ({data.sent.length})
        </button>
      </div>

      {/* TAB 1: Connected Buddies */}
      {activeTab === 'buddies' && (
        <div>
          {data.buddies.length === 0 ? (
            <div className="empty-state">
              <h3>No connected buddies yet</h3>
              <p>
                Connect with classmates and peers to start chatting and scheduling study sessions.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {data.buddies.map(buddy => (
                <div key={buddy.connection_id} className="card">
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-tint)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      fontWeight: '700',
                      fontSize: '18px'
                    }}>
                      {buddy.full_name ? buddy.full_name.charAt(0) : 'U'}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>
                        {buddy.full_name}
                      </h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {buddy.program_name} • Semester {buddy.semester}
                      </p>
                      {buddy.show_email && (
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{buddy.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Buttons from doc 7.3: Message, Schedule and Remove buddy */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="btn-primary"
                      style={{ flex: 1, minHeight: '36px', fontSize: '13px', padding: '0 8px' }}
                      onClick={() => onNavigateChat(buddy.connection_id)}
                    >
                      <MessageSquare size={14} />
                      Message
                    </button>

                    <button
                      className="btn-secondary"
                      style={{ flex: 1, minHeight: '36px', fontSize: '13px', padding: '0 8px' }}
                      onClick={() => onNavigateSchedule(buddy.buddy_id, buddy.connection_id)}
                    >
                      <Calendar size={14} />
                      Schedule
                    </button>

                    <button
                      className="btn-danger"
                      style={{ minHeight: '36px', fontSize: '13px', padding: '0 10px' }}
                      onClick={() => handleDisconnect(buddy.connection_id, buddy.full_name)}
                      title="Remove buddy"
                    >
                      <UserMinus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Received Requests */}
      {activeTab === 'received' && (
        <div>
          {data.received.length === 0 ? (
            <div className="empty-state">
              <h3>No buddy requests yet</h3>
              <p>Try searching for someone who shares your subjects and coursework.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.received.map(req => (
                <div key={req.request_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-tint)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      fontWeight: '700',
                      fontSize: '18px'
                    }}>
                      {req.sender_name ? req.sender_name.charAt(0) : 'U'}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '600' }}>{req.sender_name}</h4>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {req.program_name} • Semester {req.semester}
                      </div>
                      {req.note && (
                        <div style={{
                          marginTop: '6px',
                          padding: '6px 10px',
                          backgroundColor: 'var(--bg-subtle)',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontStyle: 'italic',
                          color: 'var(--text-main)',
                          maxWidth: '460px'
                        }}>
                          "{req.note}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Buttons from doc 7.3 Screen 7: Accept, Decline, View profile */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn-secondary"
                      style={{ minHeight: '36px', fontSize: '13px' }}
                      onClick={() => onSelectProfile(req.sender_id)}
                    >
                      <Eye size={14} />
                      View profile
                    </button>

                    <button
                      className="btn-secondary"
                      style={{ minHeight: '36px', fontSize: '13px' }}
                      onClick={() => handleRespond(req.request_id, 'decline')}
                    >
                      <X size={14} />
                      Decline
                    </button>

                    <button
                      className="btn-primary"
                      style={{ minHeight: '36px', fontSize: '13px' }}
                      onClick={() => handleRespond(req.request_id, 'accept')}
                    >
                      <Check size={14} />
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Sent Requests */}
      {activeTab === 'sent' && (
        <div>
          {data.sent.length === 0 ? (
            <div className="empty-state">
              <h3>No outgoing requests</h3>
              <p>You have no pending requests sent to other students.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.sent.map(req => (
                <div key={req.request_id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: '600' }}>{req.receiver_name}</h4>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Sent on {new Date(req.created_at).toLocaleDateString()}
                    </div>
                    {req.needs_mentor_review === 1 && (
                      <span className="badge" style={{ marginTop: '4px', fontSize: '11px' }}>
                        Under mentor review
                      </span>
                    )}
                  </div>

                  {/* Cancel option from doc 7.3 Screen 7 */}
                  <button
                    className="btn-secondary"
                    style={{ minHeight: '36px', fontSize: '13px' }}
                    onClick={() => handleCancel(req.request_id)}
                  >
                    Cancel request
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
