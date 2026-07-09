import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import GlassCard from '../components/GlassCard';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, addDoc, limit 
} from 'firebase/firestore';
import { FaSearch, FaPaperPlane, FaTimes, FaEnvelopeOpen, FaConciergeBell } from 'react-icons/fa';

export const Concierge: React.FC = () => {
  const { users } = useAdminData();
  
  // Chats list state
  const [chats, setChats] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected active chat
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');

  // Refs
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messagesUnsubRef = useRef<any>(null);

  // Fetch all chats
  useEffect(() => {
    const q = query(collection(db, 'support_chats'), orderBy('lastMessageTime', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChats(chatList);
      setLoadingChats(false);
    }, (err) => {
      console.error("Support chats query failed:", err);
      setLoadingChats(false);
    });

    return () => {
      unsubscribe();
      if (messagesUnsubRef.current) messagesUnsubRef.current();
    };
  }, []);

  // Open Chat Room
  const openChat = (chat: any) => {
    if (messagesUnsubRef.current) {
      messagesUnsubRef.current();
    }
    
    setActiveChat(chat);
    setLoadingMessages(true);
    setMessages([]);

    const q = query(
      collection(db, 'support_chats', chat.id, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(200)
    );

    messagesUnsubRef.current = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMessages(msgs);
      setLoadingMessages(false);
      
      // Clear unread admin count
      updateDoc(doc(db, 'support_chats', chat.id), {
        unreadAdminCount: 0
      }).catch(console.error);

      // Scroll to bottom
      setTimeout(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
  };

  // Close Chat Room
  const closeChat = () => {
    if (messagesUnsubRef.current) {
      messagesUnsubRef.current();
    }
    setActiveChat(null);
    setMessages([]);
  };

  // Send Message
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    const text = inputText.trim();
    setInputText('');

    const timestamp = new Date().toISOString();

    try {
      // 1. Add admin message in subcollection
      await addDoc(collection(db, 'support_chats', activeChat.id, 'messages'), {
        text,
        sender: 'admin',
        timestamp
      });

      // 2. Fetch current user unread count & update chat status
      const chatRef = doc(db, 'support_chats', activeChat.id);
      const chatSnap = await getDoc(chatRef);
      let currentUserUnread = 0;
      if (chatSnap.exists()) {
        currentUserUnread = chatSnap.data().unreadUserCount || 0;
      }

      await updateDoc(chatRef, {
        lastMessage: text,
        lastMessageTime: timestamp,
        unreadUserCount: currentUserUnread + 1
      });

    } catch (err: any) {
      console.error("Failed to send support message:", err);
    }
  };

  // Filter Conversations
  const filteredChats = useMemo(() => {
    return chats.filter(c => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (c.userName || '').toLowerCase().includes(q) || (c.userId || '').includes(q);
    });
  }, [chats, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 5rem)' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '1.5rem', flexShrink: 0 }}>
        <span className="label-spaced">LIVE CONCIERGE</span>
        <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Concierge Support</h1>
        <p className="text-muted">Chat with members in real time to coordinate booking shifts or answers questions.</p>
      </div>

      {/* Main Console Workspace */}
      <div style={styles.workspaceGrid} className="glass-card">
        {/* Left conversations List (width 320px) */}
        <div style={styles.sidebarSection}>
          <div style={styles.searchBox}>
            <FaSearch style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search conversations..."
              style={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={styles.threadsList}>
            {loadingChats ? (
              <div style={{ textAlign: 'center', padding: '2.0rem 0' }}>
                <p className="text-muted" style={{ fontSize: '13px' }}>Loading conversations...</p>
              </div>
            ) : filteredChats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1.0rem' }}>
                <p className="text-muted" style={{ fontSize: '13px' }}>No messages found.</p>
              </div>
            ) : (
              filteredChats.map((chat) => {
                const isSelected = activeChat && activeChat.id === chat.id;
                const hasUnread = chat.unreadAdminCount > 0;
                const date = new Date(chat.lastMessageTime);
                const displayTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={chat.id}
                    onClick={() => openChat(chat)}
                    style={{
                      ...styles.threadCard,
                      ...(isSelected ? styles.threadSelected : {}),
                      ...(hasUnread ? styles.threadUnread : {})
                    }}
                  >
                    <div style={styles.avatar}>
                      {(chat.userName || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.threadMetaRow}>
                        <span style={styles.threadName}>{chat.userName || 'Member'}</span>
                        <span style={styles.threadTime}>{displayTime}</span>
                      </div>
                      <div style={styles.threadLastRow}>
                        <span style={styles.lastMsgText}>{chat.lastMessage || 'Sent a message'}</span>
                        {hasUnread && (
                          <span style={styles.unreadCounter}>{chat.unreadAdminCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Active Chat Workspace */}
        <div style={styles.chatSection}>
          {activeChat ? (
            <div style={styles.activeChatBox}>
              {/* Chat Header */}
              <div style={styles.chatHeader}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {activeChat.userName || 'Member'}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Client Phone: {activeChat.userId || activeChat.id}
                  </span>
                </div>
                <button className="btn-icon" onClick={closeChat}>
                  <FaTimes />
                </button>
              </div>

              {/* Message Feed area */}
              <div style={styles.chatFeed}>
                {loadingMessages ? (
                  <div style={styles.centerBox}>
                    <p className="text-muted">Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={styles.centerBox}>
                    <p className="text-muted">No messages found. Start typing below.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isAdmin = msg.sender === 'admin';
                    const isBot = msg.sender === 'bot';
                    const bubbleStyle = isAdmin 
                      ? styles.adminBubble 
                      : (isBot ? styles.botBubble : styles.userBubble);
                    
                    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          justifyContent: isAdmin ? 'flex-end' : 'flex-start',
                          marginBottom: '1.0rem'
                        }}
                      >
                        <div style={{ ...styles.messageBubble, ...bubbleStyle }}>
                          {isBot && <div style={styles.botLabel}>AUTO-REPLY</div>}
                          {isAdmin && <div style={styles.adminLabel}>YOU · ADMIN</div>}
                          <div style={{ wordBreak: 'break-word', fontSize: '14px', lineHeight: '1.4' }}>
                            {msg.text}
                          </div>
                          <div style={styles.timeText}>{time}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messageEndRef} />
              </div>

              {/* Message Composer Footer */}
              <form onSubmit={handleSend} style={styles.chatInputRow}>
                <input
                  type="text"
                  placeholder="Type your reply to this client..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  style={styles.chatComposer}
                />
                <button type="submit" className="btn-hero" style={styles.sendBtn} disabled={!inputText.trim()}>
                  <FaPaperPlane /> Send
                </button>
              </form>
            </div>
          ) : (
            <div style={styles.chatPlaceholder}>
              <div style={styles.bellCircle}>
                <FaConciergeBell />
              </div>
              <h2 className="title-card" style={{ fontStyle: 'italic', marginBottom: '0.5rem' }}>Concierge Active</h2>
              <p className="text-muted" style={{ maxWidth: '300px', fontSize: '13px' }}>
                Select an active athlete ticket from the left sidebar to coordinate concierge services.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  workspaceGrid: {
    display: 'flex',
    flex: 1,
    padding: 0,
    overflow: 'hidden',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
  },
  sidebarSection: {
    width: '320px',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1.0rem',
    borderBottom: '1px solid var(--color-border)',
  },
  searchIcon: {
    color: 'var(--color-text-tertiary)',
    marginRight: '0.75rem',
  },
  searchInput: {
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--color-text-primary)',
    fontFamily: 'Inter, sans-serif',
    fontSize: '13px',
    width: '100%',
  },
  threadsList: {
    flex: 1,
    overflowY: 'auto' as const,
  },
  threadCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1.0rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  threadSelected: {
    backgroundColor: 'rgba(201, 122, 70, 0.08)',
    borderLeft: '3px solid var(--color-accent)',
    paddingLeft: '0.81rem', // Adjust for border shift
  },
  threadUnread: {
    backgroundColor: 'rgba(201, 122, 70, 0.03)',
  },
  avatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1.5px solid var(--color-accent-border)',
    color: 'var(--color-accent)',
    fontSize: '13px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  threadMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '2px',
  },
  threadName: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
  threadTime: {
    fontSize: '10px',
    color: 'var(--color-text-tertiary)',
  },
  threadLastRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  lastMsgText: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    flex: 1,
  },
  unreadCounter: {
    backgroundColor: 'var(--color-accent)',
    color: '#FFFFFF',
    fontSize: '9px',
    fontWeight: 700,
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  chatPlaceholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center' as const,
    padding: '2.0rem',
  },
  bellCircle: {
    width: '54px',
    height: '54px',
    border: '1px dashed var(--color-accent-border)',
    color: 'var(--color-accent)',
    fontSize: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.25rem',
  },
  activeChatBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden',
  },
  chatHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.85rem 1.5rem',
    borderBottom: '1px solid var(--color-border)',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  chatFeed: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  centerBox: {
    margin: 'auto',
    textAlign: 'center' as const,
  },
  messageBubble: {
    maxWidth: '70%',
    padding: '0.65rem 0.95rem',
    borderRadius: '4px',
    position: 'relative' as const,
  },
  userBubble: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
  },
  botBubble: {
    backgroundColor: 'rgba(107, 158, 118, 0.08)',
    border: '1px solid rgba(107, 158, 118, 0.2)',
    color: 'var(--color-text-primary)',
  },
  adminBubble: {
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-accent-border)',
    borderLeft: '3px solid var(--color-accent)',
    color: 'var(--color-text-primary)',
  },
  botLabel: {
    fontSize: '8px',
    color: 'var(--color-success)',
    letterSpacing: '0.15em',
    fontWeight: 700,
    marginBottom: '2px',
  },
  adminLabel: {
    fontSize: '8px',
    color: 'var(--color-accent)',
    letterSpacing: '0.15em',
    fontWeight: 700,
    marginBottom: '2px',
  },
  timeText: {
    fontSize: '9px',
    color: 'var(--color-text-tertiary)',
    textAlign: 'right' as const,
    marginTop: '4px',
  },
  chatInputRow: {
    display: 'flex',
    gap: '0.75rem',
    padding: '1.0rem 1.5rem',
    borderTop: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
  },
  chatComposer: {
    flex: 1,
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '0.75rem 1.0rem',
    borderRadius: '4px',
    outline: 'none',
    fontSize: '14px',
  },
  sendBtn: {
    padding: '0.75rem 1.5rem',
    flexShrink: 0,
    borderRadius: '4px',
  },
};

export default Concierge;
