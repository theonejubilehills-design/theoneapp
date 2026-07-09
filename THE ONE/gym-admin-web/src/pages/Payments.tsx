import React, { useState, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import GlassCard from '../components/GlassCard';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { FaSearch, FaDollarSign, FaCoins, FaReceipt, FaTimes, FaRegMoneyBillAlt } from 'react-icons/fa';

// Format YYYY-MM-DD or ISO timestamp → DD-MM-YYYY
const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
};

export const Payments: React.FC = () => {
  const { dues } = useAdminData();
  
  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Mark Paid Modal state
  const [selectedDue, setSelectedDue] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'Cash' | 'Card' | 'Bank Transfer'>('UPI');
  const [loading, setLoading] = useState(false);

  // Compute stats
  const stats = useMemo(() => {
    let uncollected = 0;
    let collected = 0;
    let transactions = 0;

    dues.forEach(d => {
      const amt = Number(d.amount) || 0;
      if (d.status === 'paid') {
        collected += amt;
        transactions++;
      } else if (d.status === 'pending') {
        uncollected += amt;
      }
    });

    return { uncollected, collected, transactions };
  }, [dues]);

  // Filter list
  const filteredDues = useMemo(() => {
    return dues.filter(d => {
      const nameMatch = d.userName.toLowerCase().includes(searchTerm.toLowerCase());
      const phoneMatch = d.userId.includes(searchTerm);
      const searchMatch = nameMatch || phoneMatch;

      const statMatch = statusFilter === 'All' || d.status === statusFilter;

      return searchMatch && statMatch;
    });
  }, [dues, searchTerm, statusFilter]);

  // Mark paid operation
  const handleMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDue) return;

    setLoading(true);
    try {
      const dueRef = doc(db, 'dues', selectedDue.id);
      await updateDoc(dueRef, {
        status: 'paid',
        paidAt: new Date().toISOString(),
        paymentMethod: paymentMethod
      });
      alert(`Ledger updated: ₹${selectedDue.amount} collected via ${paymentMethod}.`);
      setSelectedDue(null);
    } catch (err: any) {
      alert(`Failed to update payment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <span className="label-spaced">FINANCIAL DEPT</span>
        <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Payments</h1>
        <p className="text-muted">Manage member receipts, pending dues, and ledger history.</p>
      </div>

      {/* Mini Stats Banner */}
      <div className="bento-grid" style={{ marginBottom: '2.0rem' }}>
        <GlassCard>
          <div style={styles.statHeader}>
            <span className="label-spaced" style={{ fontSize: '8px' }}>Total Collected</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(107,158,118,0.1)', color: 'var(--color-success)' }}>
              <FaCoins />
            </span>
          </div>
          <div style={styles.statVal}>₹{stats.collected.toLocaleString()}</div>
          <div style={styles.statFooter}>{stats.transactions} paid accounts</div>
        </GlassCard>

        <GlassCard>
          <div style={styles.statHeader}>
            <span className="label-spaced" style={{ fontSize: '8px' }}>Outstanding Dues</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(255,180,171,0.1)', color: 'var(--color-error)' }}>
              <FaDollarSign />
            </span>
          </div>
          <div style={styles.statVal}>₹{stats.uncollected.toLocaleString()}</div>
          <div style={styles.statFooter}>
            {dues.filter(d => d.status === 'pending').length} pending collection requests
          </div>
        </GlassCard>

        <GlassCard>
          <div style={styles.statHeader}>
            <span className="label-spaced" style={{ fontSize: '8px' }}>Total Transactions</span>
            <span style={{ ...styles.iconBadge, backgroundColor: 'rgba(217,164,92,0.1)', color: 'var(--color-gold)' }}>
              <FaReceipt />
            </span>
          </div>
          <div style={styles.statVal}>{dues.length}</div>
          <div style={styles.statFooter}>Overall records in database</div>
        </GlassCard>
      </div>

      {/* Filter and Search Bar */}
      <GlassCard style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={styles.filterRow}>
          <div style={styles.searchBox}>
            <FaSearch style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by client name or phone number..."
              style={styles.searchInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={styles.filterControl}>
            <span className="label-spaced" style={{ fontSize: '8px', marginRight: '8px' }}>Ledger Status</span>
            <select 
              style={styles.selectLuxury}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="pending">Pending Collection</option>
              <option value="paid">Settled / Paid</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Payments Ledger Table */}
      <GlassCard style={{ padding: 0 }}>
        <div className="table-container">
          <table className="luxury-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Athlete Name</th>
                <th>Client ID (Phone)</th>
                <th>Service Charged</th>
                <th>Price</th>
                <th>Payment Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDues.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                    <p className="text-muted">No dues matches this criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredDues.map((due) => {
                  const dateStr = due.createdAt || due.date;
                  const displayDate = formatDateDMY(dateStr);
                  return (
                    <tr key={due.id}>
                      <td style={{ fontWeight: 500 }}>{displayDate}</td>
                      <td style={{ fontWeight: 600 }}>{due.userName}</td>
                      <td>{due.userId}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{due.serviceName}</td>
                      <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>₹{due.amount}</td>
                      <td>
                        <span className={`badge-status ${due.status}`}>
                          {due.status === 'paid' ? `Paid (${due.paymentMethod || 'UPI'})` : 'Pending'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {due.status === 'pending' ? (
                          <button 
                            className="btn-hero" 
                            style={{ padding: '0.45rem 1.0rem', fontSize: '11px', borderRadius: '4px' }}
                            onClick={() => setSelectedDue(due)}
                          >
                            <FaRegMoneyBillAlt /> Collect Payment
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                            Settled on {due.paidAt ? formatDateDMY(due.paidAt) : 'N/A'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ───────────────────────────────────────────────────────────────────
          MARK PAID MODAL
          ─────────────────────────────────────────────────────────────────── */}
      {selectedDue && (
        <>
          <div className="modal-overlay" onClick={() => setSelectedDue(null)}></div>
          <div className="modal-content" style={{ borderRadius: '4px' }}>
            <div style={styles.modalHeader}>
              <h2 className="title-card" style={{ fontStyle: 'italic' }}>Collect Outstanding Dues</h2>
              <button className="btn-icon" onClick={() => setSelectedDue(null)}>
                <FaTimes />
              </button>
            </div>

            <div style={{ margin: '1.5rem 0 2.0rem 0' }}>
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                You are recording a manual payment collection for:
              </p>
              <div style={styles.dueDetails}>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-accent)' }}>
                  ₹{selectedDue.amount}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                  {selectedDue.userName} ({selectedDue.userId})
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                  Charge for: {selectedDue.serviceName}
                </div>
              </div>
            </div>

            <form onSubmit={handleMarkPaid}>
              <div className="form-group">
                <label className="label-spaced">Payment Method</label>
                <select
                  style={styles.selectFormLuxury}
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                >
                  <option value="UPI">UPI (Google Pay, PhonePe, Paytm)</option>
                  <option value="Cash">Cash Handover</option>
                  <option value="Card">Credit / Debit Card</option>
                  <option value="Bank Transfer">Direct Bank Wire / IMPS</option>
                </select>
              </div>

              <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1.0rem' }}>
                <button type="submit" className="btn-hero" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Recording...' : 'Settle Invoice'}
                </button>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedDue(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}
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
  filterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1.5rem',
    flexWrap: 'wrap' as const,
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    padding: '0.5rem 1.0rem',
    borderRadius: '4px',
    flex: 1,
    minWidth: '260px',
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
    fontSize: '14px',
    width: '100%',
  },
  filterControl: {
    display: 'flex',
    alignItems: 'center',
  },
  selectLuxury: {
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '0.45rem 1.5rem 0.45rem 0.75rem',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    cursor: 'pointer',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueDetails: {
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    padding: '1.0rem',
    borderRadius: '4px',
  },
  selectFormLuxury: {
    width: '100%',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '1.5px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '0.75rem 0',
    fontSize: '16px',
    outline: 'none',
    cursor: 'pointer',
  },
};

export default Payments;
