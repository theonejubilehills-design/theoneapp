import React, { useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import GlassCard from '../components/GlassCard';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FaStar, FaRegStar, FaExclamationTriangle, FaCheckCircle, FaInbox } from 'react-icons/fa';

// Format YYYY-MM-DD or ISO timestamp → DD-MM-YYYY HH:MM
const formatDateDMY = (isoStr?: any): string => {
  if (!isoStr) return 'N/A';
  const d = isoStr.toDate ? isoStr.toDate() : new Date(isoStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
};

export const Reviews: React.FC = () => {
  const { feedbacks } = useAdminData();

  // Mark Feedback as Read
  const handleMarkAsRead = async (id: string, currentStatus: string) => {
    if (currentStatus === 'read') return;
    try {
      await updateDoc(doc(db, 'feedbacks', id), {
        status: 'read'
      });
    } catch (error) {
      console.error("Failed to mark review as read:", error);
    }
  };

  // Compute analytics
  const analytics = useMemo(() => {
    if (feedbacks.length === 0) return { avg: 5.0, count: 0, critical: 0, unread: 0 };
    
    let sum = 0;
    let critical = 0;
    let unread = 0;

    feedbacks.forEach(f => {
      sum += f.rating;
      if (f.rating <= 3) critical++;
      if (f.status === 'new') unread++;
    });

    return {
      avg: (sum / feedbacks.length).toFixed(1),
      count: feedbacks.length,
      critical,
      unread
    };
  }, [feedbacks]);

  // Star renderer
  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= rating) {
        stars.push(<FaStar key={i} style={{ color: 'var(--color-accent)', marginRight: '2px' }} />);
      } else {
        stars.push(<FaRegStar key={i} style={{ color: 'var(--color-text-tertiary)', marginRight: '2px' }} />);
      }
    }
    return <span style={{ display: 'inline-flex', alignItems: 'center' }}>{stars}</span>;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <span className="label-spaced">ATHLETE SATISFACTION</span>
        <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Athlete Reviews</h1>
        <p className="text-muted">Inspect rating reports and text reviews submitted by club guests.</p>
      </div>

      {/* Mini Stats Banner */}
      <div className="bento-grid" style={{ marginBottom: '2.0rem' }}>
        <GlassCard>
          <div style={styles.statHeader}>
            <span className="label-spaced" style={{ fontSize: '8px' }}>Average Rating</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(217,164,92,0.1)', color: 'var(--color-gold)' }}>
              <FaStar />
            </span>
          </div>
          <div style={styles.statVal}>{analytics.avg} <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>/ 5</span></div>
          <div style={styles.statFooter}>Across {analytics.count} reviews</div>
        </GlassCard>

        <GlassCard>
          <div style={styles.statHeader}>
            <span className="label-spaced" style={{ fontSize: '8px' }}>Critical Reports</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(255,180,171,0.1)', color: 'var(--color-error)' }}>
              <FaExclamationTriangle />
            </span>
          </div>
          <div style={styles.statVal}>{analytics.critical}</div>
          <div style={styles.statFooter}>Reviews with 3 stars or lower</div>
        </GlassCard>

        <GlassCard>
          <div style={styles.statHeader}>
            <span className="label-spaced" style={{ fontSize: '8px' }}>New Inquiries</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(107,158,118,0.1)', color: 'var(--color-success)' }}>
              <FaInbox />
            </span>
          </div>
          <div style={styles.statVal}>{analytics.unread}</div>
          <div style={styles.statFooter}>Unread guest comments</div>
        </GlassCard>
      </div>

      {/* Reviews feed grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.0rem' }}>
        {feedbacks.length === 0 ? (
          <GlassCard style={{ textAlign: 'center', padding: '4.0rem 1.0rem' }}>
            <p className="text-muted">No athlete reviews found in the system.</p>
          </GlassCard>
        ) : (
          feedbacks.map((item) => {
            const isLowRating = item.rating <= 3;
            const isNew = item.status === 'new';
            const dateStr = item.createdAt 
              ? formatDateDMY(item.createdAt)
              : 'N/A';

            return (
              <GlassCard
                key={item.id}
                onClick={() => handleMarkAsRead(item.id, item.status)}
                style={{
                  ...styles.reviewCard,
                  ...(isLowRating ? styles.criticalBorder : {}),
                  ...(isNew ? styles.unreadGlow : {}),
                  cursor: isNew ? 'pointer' : 'default'
                }}
              >
                <div style={styles.reviewHeader}>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {item.userName || 'Anonymous Athlete'}
                    </h3>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                      Athlete ID: {item.userId}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={styles.starsWrapper}>
                      {renderStars(item.rating)}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                      {dateStr}
                    </span>
                  </div>
                </div>

                <div style={styles.serviceTagRow}>
                  <span style={styles.serviceTag}>
                    {item.serviceName.toUpperCase()}
                  </span>
                  {isNew && (
                    <span style={styles.newBadge}>NEW</span>
                  )}
                  {!isNew && (
                    <span style={{ fontSize: '11px', color: 'var(--color-success)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <FaCheckCircle /> Audited
                    </span>
                  )}
                </div>

                {item.comments ? (
                  <div style={{
                    ...styles.commentsBox,
                    backgroundColor: isLowRating ? 'rgba(196, 96, 87, 0.05)' : 'var(--color-bg)'
                  }}>
                    "{item.comments}"
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                    No comments provided.
                  </p>
                )}
              </GlassCard>
            );
          })
        )}
      </div>
    </div>
  );
};

const styles = {
  statHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  iconBadge: {
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
  },
  statVal: {
    fontSize: '2.0rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: '0.25rem',
  },
  statFooter: {
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
  },
  reviewCard: {
    padding: '1.25rem 1.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
    border: '1px solid var(--color-border)',
    transition: 'all 0.3s ease',
  },
  unreadGlow: {
    borderColor: 'rgba(201, 122, 70, 0.25)',
    backgroundColor: 'rgba(201, 122, 70, 0.01)',
  },
  criticalBorder: {
    borderColor: 'rgba(196, 96, 87, 0.45)',
  },
  reviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  starsWrapper: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--color-border)',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
  },
  serviceTagRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  serviceTag: {
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-secondary)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
  },
  newBadge: {
    backgroundColor: 'var(--color-success)',
    color: '#0B0B0B',
    fontSize: '9px',
    fontWeight: 800,
    padding: '0.15rem 0.4rem',
    borderRadius: '2px',
  },
  commentsBox: {
    padding: '0.85rem 1.0rem',
    borderRadius: '4px',
    fontStyle: 'italic',
    fontSize: '13.5px',
    lineHeight: '1.5',
    color: 'var(--color-text-primary)',
    marginTop: '0.25rem',
    border: '1px solid rgba(255,255,255,0.02)',
  },
};

export default Reviews;
