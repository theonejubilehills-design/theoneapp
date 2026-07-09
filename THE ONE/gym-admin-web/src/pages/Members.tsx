import React, { useState, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import GlassCard from '../components/GlassCard';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { FaSearch, FaPlus, FaTimes, FaEdit, FaTrash, FaCheck, FaUserPlus, FaUserCheck, FaUserSlash, FaShieldAlt, FaUserShield, FaCrown } from 'react-icons/fa';

// Format YYYY-MM-DD or ISO timestamp → DD-MM-YYYY
const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
};

export const Members: React.FC = () => {
  const { users, bookings, dues } = useAdminData();
  const { userProfile } = useAuth();

  const isSuperAdmin = userProfile?.isAdmin && !userProfile?.isSubAdmin;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [membershipFilter, setMembershipFilter] = useState('All');
  const [blockedFilter, setBlockedFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');

  // Selected User for details drawer
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Registration Drawer state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  // Form fields
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGender, setRegGender] = useState<'Male' | 'Female'>('Female');
  const [regMembership, setRegMembership] = useState<'Basic' | 'Gold' | 'Trial' | 'Wellness'>('Basic');
  const [regRole, setRegRole] = useState<'Member' | 'Sub Admin' | 'Staff'>('Member');
  const [regDesignation, setRegDesignation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Edit fields (for selected user)
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<'Male' | 'Female'>('Female');
  const [editMembership, setEditMembership] = useState<'Basic' | 'Gold' | 'Trial' | 'Wellness'>('Basic');
  const [editExpiryDate, setEditExpiryDate] = useState('');

  // Filter users list
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const nameMatch = u.name.toLowerCase().includes(searchTerm.toLowerCase());
      const phoneMatch = u.phoneNumber?.includes(searchTerm) || u.id.includes(searchTerm);
      const searchMatch = nameMatch || phoneMatch;

      const memMatch = membershipFilter === 'All' || u.membershipType === membershipFilter;

      const blockMatch = blockedFilter === 'All' ||
        (blockedFilter === 'Blocked' && u.isBlocked) ||
        (blockedFilter === 'Active' && !u.isBlocked);

      const roleMatch = roleFilter === 'All' ||
        (roleFilter === 'Sub Admin' && u.isSubAdmin) ||
        (roleFilter === 'Staff' && u.isStaff) ||
        (roleFilter === 'Admin' && u.isAdmin && !u.isSubAdmin && !u.isStaff) ||
        (roleFilter === 'Member' && !u.isAdmin && !u.isSubAdmin && !u.isStaff);

      return searchMatch && memMatch && blockMatch && roleMatch;
    });
  }, [users, searchTerm, membershipFilter, blockedFilter, roleFilter]);

  // View historical bookings for selected user
  const userBookings = useMemo(() => {
    if (!selectedUser) return [];
    return bookings.filter(b => b.userId === selectedUser.id || b.userId === selectedUser.phoneNumber);
  }, [selectedUser, bookings]);

  // View historical dues for selected user
  const userDues = useMemo(() => {
    if (!selectedUser) return [];
    return dues.filter(d => d.userId === selectedUser.id);
  }, [selectedUser, dues]);

  // View pending dues for selected user
  const pendingDues = useMemo(() => {
    return userDues.filter(d => d.status === 'pending');
  }, [userDues]);

  const pendingAmount = useMemo(() => {
    return pendingDues.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  }, [pendingDues]);

  // Open Details Drawer
  const openDetails = (user: any) => {
    setSelectedUser(user);
    setEditName(user.name);
    setEditGender(user.gender);
    setEditMembership(user.membershipType);

    const expiry = user.membershipEndDate || user.trialEndDate || '';
    if (expiry) {
      setEditExpiryDate(expiry.substring(0, 10)); // YYYY-MM-DD
    } else {
      setEditExpiryDate('');
    }
  };

  // Save edits to Firestore
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setLoading(true);
    setError('');

    const isMembershipChanged = selectedUser.membershipType !== editMembership;
    if (isMembershipChanged) {
      if (!isSuperAdmin) {
        setError('Only main Admins can change membership types.');
        setLoading(false);
        return;
      }
      const confirm1 = window.confirm(`Are you sure you want to change ${selectedUser.name}'s membership from ${selectedUser.membershipType} to ${editMembership}?`);
      if (!confirm1) {
        setLoading(false);
        return;
      }
      const confirm2 = window.confirm(`WARNING: This will immediately modify their booking rules and limits. Confirm again to apply membership change?`);
      if (!confirm2) {
        setLoading(false);
        return;
      }
    }

    try {
      const userRef = doc(db, 'users', selectedUser.id);
      const updates: any = {
        name: editName,
        gender: editGender,
        membershipType: editMembership,
      };

      if (editExpiryDate) {
        const expDate = new Date(editExpiryDate).toISOString();
        if (editMembership === 'Trial') {
          updates.trialEndDate = expDate;
        } else {
          updates.membershipEndDate = expDate;
        }
      }

      await updateDoc(userRef, updates);
      setSelectedUser({ ...selectedUser, ...updates });
      alert('Athlete profile updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update athlete.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle Sub Admin Role
  const toggleSubAdminRole = async (user: any) => {
    if (!isSuperAdmin) {
      alert('Only Super Admins can manage sub-admin roles.');
      return;
    }

    if (user.isAdmin && !user.isSubAdmin) {
      alert('Cannot change the role of the Super Admin account.');
      return;
    }

    const newSubAdminStatus = !user.isSubAdmin;
    const action = newSubAdminStatus ? 'promote to Sub Admin' : 'remove Sub Admin access from';

    if (!window.confirm(`Are you sure you want to ${action} ${user.name}?`)) {
      return;
    }

    setLoading(true);
    try {
      const userId = user.id;

      // Update users collection
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        isSubAdmin: newSubAdminStatus,
        isAdmin: newSubAdminStatus, // sub-admins need isAdmin = true to access the web portal
      });

      // Update allowed_users collection so the mobile app auth also reflects this
      const allowedRef = doc(db, 'allowed_users', userId);
      await setDoc(allowedRef, {
        phoneNumber: userId,
        isAdmin: newSubAdminStatus,
        isSubAdmin: newSubAdminStatus,
      }, { merge: true });

      // Update local state
      const updatedUser = {
        ...user,
        isSubAdmin: newSubAdminStatus,
        isAdmin: newSubAdminStatus
      };
      setSelectedUser(updatedUser);

      alert(newSubAdminStatus
        ? `✅ ${user.name} has been promoted to Sub Admin. They can now log into the admin portal.`
        : `✅ ${user.name}'s Sub Admin access has been revoked.`
      );
    } catch (err: any) {
      alert(`Failed to update role: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Block/Unblock User
  const toggleBlockStatus = async (user: any) => {
    const action = user.isBlocked ? 'unblock' : 'block';
    if (!window.confirm(`Are you sure you want to ${action} ${user.name}?`)) {
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        isBlocked: !user.isBlocked
      });
      if (selectedUser && selectedUser.id === user.id) {
        setSelectedUser({ ...selectedUser, isBlocked: !user.isBlocked });
      }
    } catch (err: any) {
      alert(`Failed to block/unblock: ${err.message}`);
    }
  };

  // Register New User
  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regPhone) {
      setError('Please fill in name and phone number.');
      return;
    }

    setLoading(true);
    setError('');

    // Clean phone number format
    let cleanPhone = regPhone.trim();
    if (cleanPhone.length === 10 && !cleanPhone.startsWith('+')) {
      cleanPhone = `+91${cleanPhone}`;
    }

    const isSubAdminReg = regRole === 'Sub Admin';
    const isStaffReg = regRole === 'Staff';

    try {
      const userRef = doc(db, 'users', cleanPhone);

      const now = new Date();
      const startISO = now.toISOString();
      const end = new Date(now);
      if (isSubAdminReg || isStaffReg) {
        end.setFullYear(now.getFullYear() + 10);
      } else {
        end.setDate(now.getDate() + (regMembership === 'Trial' ? 7 : 30));
      }
      const endISO = end.toISOString();

      const newUserData: any = {
        name: regName,
        phoneNumber: cleanPhone,
        gender: regGender,
        membershipType: (isSubAdminReg || isStaffReg) ? 'Gold' : regMembership,
        isAdmin: isSubAdminReg,
        isSubAdmin: isSubAdminReg,
        isStaff: isStaffReg,
        staffName: isStaffReg ? regName.trim() : null,
        membershipStartDate: startISO,
        membershipEndDate: endISO,
        trialStartDate: regMembership === 'Trial' && !isSubAdminReg && !isStaffReg ? startISO : null,
        trialEndDate: regMembership === 'Trial' && !isSubAdminReg && !isStaffReg ? endISO : null,
        createdAt: startISO,
        designation: (isSubAdminReg || isStaffReg) ? regDesignation.trim() : null,
      };

      await setDoc(userRef, newUserData);

      // Whitelist in allowed_users — write BOTH formats (+91XXXXXXXXXX and raw 10-digit)
      // so login always works regardless of how Firebase Phone Auth returns the number
      const allowedPayload = {
        phoneNumber: cleanPhone,
        isAdmin: isSubAdminReg,
        isSubAdmin: isSubAdminReg,
        isStaff: isStaffReg,
      };
      // Format 1: with country code (+91XXXXXXXXXX)
      await setDoc(doc(db, 'allowed_users', cleanPhone), allowedPayload);
      // Format 2: raw 10 digits (some Firebase auth flows return without country code)
      const raw10 = cleanPhone.startsWith('+91') ? cleanPhone.slice(3) : cleanPhone.replace(/\D/g, '').slice(-10);
      if (raw10 !== cleanPhone) {
        await setDoc(doc(db, 'allowed_users', raw10), allowedPayload);
      }

      alert(isSubAdminReg
        ? `✅ Sub Admin ${regName} registered! They can now log into the admin portal with their phone number.`
        : isStaffReg
        ? `✅ Staff Member ${regName} registered and whitelisted successfully!`
        : `✅ Member ${regName} registered and whitelisted successfully!`
      );

      // Reset form
      setRegName('');
      setRegPhone('');
      setRegRole('Member');
      setRegDesignation('');
      setIsRegisterOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to register athlete.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to get role label and badge
  const getRoleBadge = (user: any) => {
    if (user.isAdmin && !user.isSubAdmin) {
      return <span style={roleBadgeStyle('#C97A46', 'rgba(201,122,70,0.1)')}><FaCrown style={{ marginRight: 3, fontSize: 9 }} />Super Admin</span>;
    }
    if (user.isSubAdmin) {
      return <span style={roleBadgeStyle('#6b9e76', 'rgba(107,158,118,0.12)')}><FaShieldAlt style={{ marginRight: 3, fontSize: 9 }} />Sub Admin</span>;
    }
    if (user.isStaff) {
      return <span style={roleBadgeStyle('#a08090', 'rgba(160,128,144,0.12)')}><FaUserShield style={{ marginRight: 3, fontSize: 9 }} />Staff</span>;
    }
    return <span style={roleBadgeStyle('#a38c81', 'rgba(163,140,129,0.1)')}>Member</span>;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <span className="label-spaced">ATHLETE CATALOG</span>
          <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Members</h1>
          <p className="text-muted">Register, search, and manage memberships and roles for THE ONE.</p>
        </div>
        {isSuperAdmin && (
          <button className="btn-hero" onClick={() => setIsRegisterOpen(true)}>
            <FaUserPlus /> Register Athlete
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <GlassCard style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={styles.filterRow}>
          <div style={styles.searchBox}>
            <FaSearch style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by name, phone..."
              style={styles.searchInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={styles.filtersGroup}>
            <div style={styles.filterControl}>
              <span className="label-spaced" style={{ fontSize: '8px', marginRight: '8px' }}>Role</span>
              <select
                style={styles.selectLuxury}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="All">All Roles</option>
                <option value="Sub Admin">Sub Admins</option>
                <option value="Staff">Staff Members</option>
                <option value="Member">Members</option>
                <option value="Admin">Super Admin</option>
              </select>
            </div>

            <div style={styles.filterControl}>
              <span className="label-spaced" style={{ fontSize: '8px', marginRight: '8px' }}>Membership</span>
              <select
                style={styles.selectLuxury}
                value={membershipFilter}
                onChange={(e) => setMembershipFilter(e.target.value)}
              >
                <option value="All">All Types</option>
                <option value="Gold">Gold</option>
                <option value="Basic">Basic</option>
                <option value="Trial">Trial</option>
                <option value="Wellness">Wellness</option>
              </select>
            </div>

            <div style={styles.filterControl}>
              <span className="label-spaced" style={{ fontSize: '8px', marginRight: '8px' }}>Status</span>
              <select
                style={styles.selectLuxury}
                value={blockedFilter}
                onChange={(e) => setBlockedFilter(e.target.value)}
              >
                <option value="All">All Users</option>
                <option value="Active">Active Only</option>
                <option value="Blocked">Blocked Only</option>
              </select>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Members Table */}
      <GlassCard style={{ padding: 0 }}>
        <div className="table-container">
          <table className="luxury-table">
            <thead>
              <tr>
                <th>Athlete</th>
                <th>Phone</th>
                <th>Gender</th>
                <th>Membership</th>
                <th>Role</th>
                <th>Expires</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                    <p className="text-muted">No members match the filters.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const expiry = (user.isSubAdmin || user.isStaff) ? null : (user.membershipEndDate || user.trialEndDate);
                  const expiryStr = expiry ? formatDateDMY(expiry) : 'N/A';
                  return (
                    <tr key={user.id}>
                      <td style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => openDetails(user)}>
                        {user.name}
                      </td>
                      <td>{user.phoneNumber || user.id}</td>
                      <td>{user.gender}</td>
                      <td>
                        {user.isSubAdmin || user.isStaff ? (
                          <span className="text-muted" style={{ fontSize: '12px' }}>None</span>
                        ) : (
                          <span className={`badge badge-${user.membershipType.toLowerCase()}`}>
                            {user.membershipType}
                          </span>
                        )}
                      </td>
                      <td>{getRoleBadge(user)}</td>
                      <td>{expiryStr}</td>
                      <td>
                        {user.isBlocked ? (
                          <span style={{ color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <FaUserSlash /> Blocked
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            <FaUserCheck /> Active
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '11px', borderRadius: '4px' }} onClick={() => openDetails(user)}>
                            Manage
                          </button>
                          <button
                            className="btn-outline"
                            style={{
                              padding: '0.4rem 0.8rem',
                              fontSize: '11px',
                              borderRadius: '4px',
                              borderColor: user.isBlocked ? 'var(--color-success)' : 'var(--color-error)',
                              color: user.isBlocked ? 'var(--color-success)' : 'var(--color-error)'
                            }}
                            onClick={() => toggleBlockStatus(user)}
                          >
                            {user.isBlocked ? 'Unblock' : 'Block'}
                          </button>
                        </div>
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
          REGISTRATION DRAWER
          ─────────────────────────────────────────────────────────────────── */}
      {isRegisterOpen && (
        <>
          <div className="modal-overlay" onClick={() => setIsRegisterOpen(false)}></div>
          <div className="drawer">
            <div style={styles.drawerHeader}>
              <h2 className="title-card" style={{ fontStyle: 'italic' }}>Register New Member</h2>
              <button className="btn-icon" onClick={() => setIsRegisterOpen(false)}>
                <FaTimes />
              </button>
            </div>

            {error && <div style={styles.drawerError}>{error}</div>}

            <form onSubmit={handleRegisterUser}>
              {/* Role Selection at top */}
              <div className="form-group">
                <label className="label-spaced">Account Role</label>
                <div style={{ display: 'flex', gap: '1rem', padding: '0.5rem 0', flexWrap: 'wrap' }}>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="regRole"
                      checked={regRole === 'Member'}
                      onChange={() => setRegRole('Member')}
                      style={{ marginRight: '6px' }}
                    />
                    Member (Mobile App)
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="regRole"
                      checked={regRole === 'Sub Admin'}
                      onChange={() => setRegRole('Sub Admin')}
                      style={{ marginRight: '6px' }}
                    />
                    <FaShieldAlt style={{ marginRight: '4px', color: '#6b9e76' }} />
                    Sub Admin (Web Portal)
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="regRole"
                      checked={regRole === 'Staff'}
                      onChange={() => setRegRole('Staff')}
                      style={{ marginRight: '6px' }}
                    />
                    <FaUserShield style={{ marginRight: '4px', color: '#a08090' }} />
                    Staff Member (Coach, Masseuse, etc.)
                  </label>
                </div>
                {regRole === 'Sub Admin' && (
                  <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.8rem', backgroundColor: 'rgba(107,158,118,0.08)', border: '1px solid rgba(107,158,118,0.25)', borderRadius: '4px', fontSize: '12px', color: '#6b9e76' }}>
                    <FaShieldAlt style={{ marginRight: '6px' }} />
                    Sub Admins can access: Dashboard, Members, Bookings, Payments, Concierge & Pricing. They <strong>cannot</strong> see Reviews.
                  </div>
                )}
                {regRole === 'Staff' && (
                  <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.8rem', backgroundColor: 'rgba(160,128,144,0.08)', border: '1px solid rgba(160,128,144,0.25)', borderRadius: '4px', fontSize: '12px', color: '#a08090' }}>
                    <FaUserShield style={{ marginRight: '6px' }} />
                    Staff accounts (Coaches, Masseuses, Salon Professionals etc.) do not have any membership plan.
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="label-spaced">{regRole === 'Sub Admin' ? 'Sub Admin Name' : regRole === 'Staff' ? 'Staff Name' : 'Client Name'}</label>
                <input
                  type="text"
                  required
                  placeholder={regRole === 'Sub Admin' ? 'Sub Admin Name' : regRole === 'Staff' ? 'Staff Name' : 'Client Name'}
                  className="input-luxury"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="label-spaced">{regRole === 'Sub Admin' ? 'Sub Admin Contact Number' : regRole === 'Staff' ? 'Staff Contact Number' : 'Client Contact Number'}</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 8341664756"
                  className="input-luxury"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="label-spaced">Gender</label>
                <div style={styles.radioGroup}>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="gender"
                      checked={regGender === 'Male'}
                      onChange={() => setRegGender('Male')}
                      style={{ marginRight: '6px' }}
                    />
                    Male
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="gender"
                      checked={regGender === 'Female'}
                      onChange={() => setRegGender('Female')}
                      style={{ marginRight: '6px' }}
                    />
                    Female
                  </label>
                </div>
              </div>

              {(regRole === 'Sub Admin' || regRole === 'Staff') && (
                <div className="form-group">
                  <label className="label-spaced">Designation</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Manager, Coach, Masseuse, Salon Professional"
                    className="input-luxury"
                    value={regDesignation}
                    onChange={(e) => setRegDesignation(e.target.value)}
                  />
                </div>
              )}

              {regRole === 'Member' && (
                <div className="form-group">
                  <label className="label-spaced">Membership Type</label>
                  <select
                    style={styles.selectFormLuxury}
                    value={regMembership}
                    onChange={(e: any) => setRegMembership(e.target.value)}
                  >
                    <option value="Basic">Basic Membership</option>
                    <option value="Gold">Gold Membership</option>
                    <option value="Wellness">Wellness Membership</option>
                    <option value="Trial">Trial Access (7 Days)</option>
                  </select>
                </div>
              )}

              <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1.0rem' }}>
                <button type="submit" className="btn-hero" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Creating...' : regRole === 'Sub Admin' ? 'Create Sub Admin' : 'Register Member'}
                </button>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsRegisterOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ───────────────────────────────────────────────────────────────────
          MEMBER PROFILE DETAILS DRAWER
          ─────────────────────────────────────────────────────────────────── */}
      {selectedUser && (
        <>
          <div className="modal-overlay" onClick={() => setSelectedUser(null)}></div>
          <div className="drawer" style={{ width: '560px' }}>
            <div style={styles.drawerHeader}>
              <div>
                <span className="label-spaced">Athlete Profile</span>
                <h2 className="title-card" style={{ fontStyle: 'italic', fontSize: '1.8rem', marginTop: '0.25rem' }}>
                  {selectedUser.name}
                </h2>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getRoleBadge(selectedUser)}
                  {selectedUser.designation && (
                    <span className="text-muted" style={{ fontSize: '12px' }}>
                      ({selectedUser.designation})
                    </span>
                  )}
                </div>
              </div>
              <button className="btn-icon" onClick={() => setSelectedUser(null)}>
                <FaTimes />
              </button>
            </div>

            {error && <div style={styles.drawerError}>{error}</div>}

            {/* Quick Status Overview */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '2rem',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '6px',
              padding: '1rem'
            }}>
              <div>
                <span className="label-spaced" style={{ fontSize: '9px', display: 'block', marginBottom: '0.25rem' }}>TOTAL BOOKINGS</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>{userBookings.length}</span>
              </div>
              <div>
                <span className="label-spaced" style={{ fontSize: '9px', display: 'block', marginBottom: '0.25rem' }}>PENDING PAYMENTS</span>
                {pendingAmount > 0 ? (
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-error)' }}>
                    ₹{pendingAmount} <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>({pendingDues.length} pending)</span>
                  </span>
                ) : (
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-success)', display: 'flex', alignItems: 'center', height: '1.5rem' }}>
                    ✓ Clear
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '1.0rem' }} className="label-spaced">
                {isSuperAdmin ? 'Configure Subscription' : 'Configure Profile'}
              </h3>

              <div className="form-group">
                <label className="label-spaced">
                  {selectedUser.isSubAdmin ? 'Sub Admin Name' : selectedUser.isStaff ? 'Staff Name' : 'Client Name'}
                </label>
                <input
                  type="text"
                  className="input-luxury"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="label-spaced">Gender</label>
                <div style={styles.radioGroup}>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="editGender"
                      checked={editGender === 'Male'}
                      onChange={() => setEditGender('Male')}
                      style={{ marginRight: '6px' }}
                    />
                    Male
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="editGender"
                      checked={editGender === 'Female'}
                      onChange={() => setEditGender('Female')}
                      style={{ marginRight: '6px' }}
                    />
                    Female
                  </label>
                </div>
              </div>

              {isSuperAdmin && !selectedUser.isSubAdmin && !selectedUser.isStaff && (
                <>
                  <div className="form-group">
                    <label className="label-spaced">Membership Type</label>
                    <select
                      style={styles.selectFormLuxury}
                      value={editMembership}
                      onChange={(e: any) => setEditMembership(e.target.value)}
                    >
                      <option value="Basic">Basic Membership</option>
                      <option value="Gold">Gold Membership</option>
                      <option value="Wellness">Wellness Membership</option>
                      <option value="Trial">Trial Access</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="label-spaced">Membership Expiry Date</label>
                    <input
                      type="date"
                      className="input-luxury"
                      value={editExpiryDate}
                      onChange={(e) => setEditExpiryDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '1.0rem' }}>
                <button type="submit" className="btn-hero" disabled={loading} style={{ flex: 1 }}>
                  {loading ? 'Saving...' : 'Save Profile Changes'}
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  style={{
                    borderColor: selectedUser.isBlocked ? 'var(--color-success)' : 'var(--color-error)',
                    color: selectedUser.isBlocked ? 'var(--color-success)' : 'var(--color-error)'
                  }}
                  onClick={() => toggleBlockStatus(selectedUser)}
                >
                  {selectedUser.isBlocked ? 'Unblock Athlete' : 'Block Athlete'}
                </button>
              </div>
            </form>

            {/* Sub Admin Role Management — only Super Admins can see & use this */}
            {isSuperAdmin && !selectedUser.isAdmin && (
              <div style={{ marginBottom: '2rem', padding: '1.25rem', backgroundColor: 'rgba(107,158,118,0.05)', border: '1px solid rgba(107,158,118,0.15)', borderRadius: '4px' }}>
                <h3 style={{ fontSize: '13px', marginBottom: '0.75rem', color: '#6b9e76' }} className="label-spaced">
                  <FaShieldAlt style={{ marginRight: '6px' }} />
                  Portal Access Control
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
                  {selectedUser.isSubAdmin
                    ? `${selectedUser.name} currently has Sub Admin access to the web portal. Revoking will prevent them from logging in.`
                    : `Promote ${selectedUser.name} to Sub Admin to grant them access to the management portal (Members, Bookings, Payments, Concierge, Pricing).`
                  }
                </p>
                <button
                  className={selectedUser.isSubAdmin ? 'btn-outline' : 'btn-secondary'}
                  style={{
                    width: '100%',
                    borderColor: selectedUser.isSubAdmin ? 'var(--color-error)' : '#6b9e76',
                    color: selectedUser.isSubAdmin ? 'var(--color-error)' : '#6b9e76',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '0.6rem',
                    fontSize: '12px'
                  }}
                  onClick={() => toggleSubAdminRole(selectedUser)}
                  disabled={loading}
                >
                  <FaUserShield />
                  {selectedUser.isSubAdmin ? 'Revoke Sub Admin Access' : 'Promote to Sub Admin'}
                </button>
              </div>
            )}

            {/* If the user is already Super Admin */}
            {selectedUser.isAdmin && !selectedUser.isSubAdmin && (
              <div style={{ marginBottom: '2rem', padding: '1.0rem', backgroundColor: 'rgba(201,122,70,0.06)', border: '1px solid rgba(201,122,70,0.2)', borderRadius: '4px', fontSize: '12px', color: 'var(--color-accent)' }}>
                <FaCrown style={{ marginRight: '6px' }} />
                This is the Super Admin account. Role cannot be changed.
              </div>
            )}

            {/* History tabs */}
            <div>
              <h3 style={{ fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '1.0rem' }} className="label-spaced">
                Booking History ({userBookings.length})
              </h3>
              {userBookings.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '13px', fontStyle: 'italic', marginBottom: '2rem' }}>No historical bookings found.</p>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {userBookings.map((b: any) => (
                    <div key={b.id} style={styles.historyCard}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{b.serviceName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{b.date} @ {b.time}</div>
                      </div>
                      <span className={`badge-status ${b.status}`} style={{ fontSize: '9px' }}>{b.status}</span>
                    </div>
                  ))}
                </div>
              )}

              <h3 style={{ fontSize: '14px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '1.0rem' }} className="label-spaced">
                Payments History ({userDues.length})
              </h3>
              {userDues.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '13px', fontStyle: 'italic' }}>No transactions recorded.</p>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {userDues.map((d: any) => (
                    <div key={d.id} style={styles.historyCard}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>₹{d.amount} — {d.serviceName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Due: {d.date}</div>
                      </div>
                      <span className={`badge-status ${d.status}`} style={{ fontSize: '9px' }}>{d.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const roleBadgeStyle = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: '3px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.05em',
  color,
  backgroundColor: bg,
  border: `1px solid ${color}33`,
  textTransform: 'uppercase',
  fontFamily: 'Inter, sans-serif',
  whiteSpace: 'nowrap',
});

const styles = {
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
  filtersGroup: {
    display: 'flex',
    gap: '1.0rem',
    alignItems: 'center',
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
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '2.0rem',
  },
  drawerError: {
    backgroundColor: 'rgba(255, 180, 171, 0.1)',
    border: '1px solid var(--color-error)',
    color: 'var(--color-error)',
    padding: '0.75rem 1.0rem',
    borderRadius: '4px',
    fontSize: '13px',
    marginBottom: '1.5rem',
  },
  radioGroup: {
    display: 'flex',
    gap: '1.5rem',
    padding: '0.5rem 0',
  },
  radioLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    cursor: 'pointer',
    fontSize: '14px',
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
  historyCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
    border: '1px solid rgba(255,255,255,0.03)',
    padding: '0.75rem',
    borderRadius: '4px',
  },
};

export default Members;
