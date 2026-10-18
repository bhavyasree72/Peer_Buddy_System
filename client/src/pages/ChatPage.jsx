import React, { useEffect, useState, useRef } from 'react';
import { api } from '../services/api';
import { io } from 'socket.io-client';
import { Send, Paperclip, MoreVertical, Calendar, Flag, UserMinus, Eye, FileText } from 'lucide-react';

export default function ChatPage({ initialConnectionId, onNavigateSchedule, onSelectProfile, onOpenReport }) {
  const [conversations, setConversations] = useState([]);
  const [activeConnId, setActiveConnId] = useState(initialConnectionId || null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [buddyOnline, setBuddyOnline] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeConv = conversations.find(c => c.connection_id === activeConnId);

  useEffect(() => {
    loadConversations();

    // Socket.io initialization
    const token = localStorage.getItem('token');
    const socket = io({
      auth: { token }
    });
    socketRef.current = socket;

    socket.on('new_message', (msg) => {
      if (msg.connection_id === activeConnId) {
        setMessages(prev => [...prev, msg]);
        scrollToBottom();
      }
      loadConversations();
    });

    socket.on('typing_start', ({ connectionId }) => {
      if (connectionId === activeConnId) setIsTyping(true);
    });

    socket.on('typing_stop', ({ connectionId }) => {
      if (connectionId === activeConnId) setIsTyping(false);
    });

    socket.on('user_presence', ({ userId, status }) => {
      if (activeConv && activeConv.buddy_id === userId) {
        setBuddyOnline(status === 'online');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeConnId]);

  useEffect(() => {
    if (activeConnId) {
      loadMessages(activeConnId);
      if (socketRef.current) {
        socketRef.current.emit('join_room', { connectionId: activeConnId });
      }
    }
  }, [activeConnId]);

  async function loadConversations() {
    try {
      const res = await api.getConversations();
      setConversations(res.conversations || []);
      if (!activeConnId && res.conversations && res.conversations.length > 0) {
        setActiveConnId(res.conversations[0].connection_id);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadMessages(connId) {
    try {
      const res = await api.getMessages(connId);
      setMessages(res.messages || []);
      scrollToBottom();
    } catch (err) {
      console.error(err);
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
      }
    }, 50);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() && !selectedFile) return;

    try {
      const formData = new FormData();
      formData.append('connectionId', activeConnId);
      if (text.trim()) formData.append('body', text.trim());
      if (selectedFile) formData.append('attachment', selectedFile);

      const res = await api.sendMessage(formData);

      if (socketRef.current) {
        socketRef.current.emit('send_message', {
          connectionId: activeConnId,
          body: text.trim(),
          attachmentUrl: res.chatMessage.attachment_url,
          attachmentName: res.chatMessage.attachment_name,
          attachmentType: res.chatMessage.attachment_type
        });
      }

      setText('');
      setSelectedFile(null);
      loadMessages(activeConnId);
      loadConversations();
    } catch (err) {
      alert(err.message);
    }
  }

  function handleTypingChange(e) {
    setText(e.target.value);
    if (socketRef.current && activeConnId) {
      socketRef.current.emit('typing_start', { connectionId: activeConnId });
      setTimeout(() => {
        socketRef.current.emit('typing_stop', { connectionId: activeConnId });
      }, 2000);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>Peer Chat</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Real-time one-to-one discussions with your verified study partners.
        </p>
      </div>

      {/* Two-pane layout from doc 7.3 Screen 8: Left buddy list, Right active conversation */}
      <div className="card" style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        padding: 0,
        height: 'calc(100vh - 200px)',
        minHeight: '520px',
        overflow: 'hidden'
      }}>
        {/* Left Pane: Conversations */}
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', fontWeight: '600' }}>
            Conversations ({conversations.length})
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No active conversations. Accept a buddy request to start chatting.
              </div>
            ) : (
              conversations.map(c => {
                const isActive = c.connection_id === activeConnId;
                return (
                  <div
                    key={c.connection_id}
                    onClick={() => setActiveConnId(c.connection_id)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                      backgroundColor: isActive ? 'var(--accent-tint)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? '#FFFFFF' : 'var(--text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '15px'
                    }}>
                      {c.buddy_name ? c.buddy_name.charAt(0) : 'U'}
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.buddy_name}
                        </h4>
                        {c.unread_count > 0 && (
                          <span style={{
                            width: '8px',
                            height: '8px',
                            backgroundColor: 'var(--accent)',
                            borderRadius: '50%'
                          }} />
                        )}
                      </div>
                      <p style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {c.last_message || 'Say hello to start the conversation.'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat */}
        {activeConv ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header: Buddy Name, Online Status, 3-dot menu */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-tint)',
                  color: 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  fontSize: '15px'
                }}>
                  {activeConv.buddy_name.charAt(0)}
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '600' }}>{activeConv.buddy_name}</h3>
                  <div style={{ fontSize: '12px', color: buddyOnline ? '#166534' : 'var(--text-muted)' }}>
                    {buddyOnline ? '● Online' : 'Offline'}
                  </div>
                </div>
              </div>

              {/* Three-dot menu: View profile, Schedule session, Report, End connection */}
              <div style={{ position: 'relative' }}>
                <button
                  className="btn-secondary"
                  style={{ minHeight: '36px', width: '36px', padding: 0 }}
                  onClick={() => setShowMenu(!showMenu)}
                >
                  <MoreVertical size={16} />
                </button>

                {showMenu && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: '42px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    width: '180px',
                    zIndex: 200
                  }}>
                    <button
                      onClick={() => { setShowMenu(false); onSelectProfile(activeConv.buddy_id); }}
                      style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 14px', fontSize: '13px' }}
                    >
                      <Eye size={14} /> View profile
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); onNavigateSchedule(activeConv.buddy_id, activeConv.connection_id); }}
                      style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 14px', fontSize: '13px' }}
                    >
                      <Calendar size={14} /> Schedule session
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); onOpenReport(activeConv.buddy_id, activeConv.connection_id); }}
                      style={{ width: '100%', justifyContent: 'flex-start', border: 'none', background: 'transparent', padding: '10px 14px', fontSize: '13px', color: 'var(--accent)' }}
                    >
                      <Flag size={14} /> Report
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Conversation Messages View */}
            <div
              ref={messagesEndRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {/* Message wording sample from doc: "Say hello to start the conversation." */}
              {messages.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                  Say hello to start the conversation.
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.sender_id !== activeConv.buddy_id;
                  return (
                    <div
                      key={m.message_id}
                      style={{
                        alignSelf: isMine ? 'flex-end' : 'flex-start',
                        maxWidth: '70%'
                      }}
                    >
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: '12px',
                        backgroundColor: isMine ? 'var(--accent)' : 'var(--bg-subtle)',
                        color: isMine ? '#FFFFFF' : 'var(--text-main)',
                        border: isMine ? 'none' : '1px solid var(--border)',
                        fontSize: '14px',
                        wordBreak: 'break-word'
                      }}>
                        {m.body}

                        {m.attachment_url && (
                          <div style={{ marginTop: '8px' }}>
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: isMine ? '#FFFFFF' : 'var(--accent)',
                                textDecoration: 'underline',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '13px'
                              }}
                            >
                              <FileText size={14} />
                              {m.attachment_name || 'Download file'}
                            </a>
                          </div>
                        )}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '2px',
                        textAlign: isMine ? 'right' : 'left'
                      }}>
                        {new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {isMine && ` • ${m.status}`}
                      </div>
                    </div>
                  );
                })
              )}
              {isTyping && (
                <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  {activeConv.buddy_name} is typing...
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSend} style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '40px', minHeight: '40px', padding: 0 }}
                onClick={() => fileInputRef.current?.click()}
                title="Attach file (PDF, DOCX, PNG, JPG ≤ 5MB)"
              >
                <Paperclip size={18} />
              </button>

              {selectedFile && (
                <span className="badge" style={{ fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedFile.name}
                </span>
              )}

              <input
                type="text"
                placeholder="Type your message (up to 1000 characters)..."
                maxLength={1000}
                value={text}
                onChange={handleTypingChange}
                style={{ flex: 1, minHeight: '40px' }}
              />

              <button type="submit" className="btn-primary" style={{ width: '40px', minHeight: '40px', padding: 0 }}>
                <Send size={16} />
              </button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a buddy to open conversation.
          </div>
        )}
      </div>
    </div>
  );
}
