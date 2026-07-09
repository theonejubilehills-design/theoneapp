import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { playClickSound } from '../utils/sound';
import { 
  FaTachometerAlt, 
  FaUsers, 
  FaCalendarAlt, 
  FaWallet, 
  FaComments, 
  FaSlidersH, 
  FaStar, 
  FaSignOutAlt,
  FaCog
} from 'react-icons/fa';

export const Sidebar: React.FC = () => {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to log out of the admin portal?")) {
      await logout();
      navigate('/login');
    }
  };

  const isSubAdmin = userProfile?.isSubAdmin === true;

  const navItems = [
    { path: '/', label: 'Dashboard', icon: <FaTachometerAlt /> },
    { path: '/members', label: 'Members', icon: <FaUsers /> },
    { path: '/bookings', label: 'Bookings', icon: <FaCalendarAlt /> },
    { path: '/payments', label: 'Payments', icon: <FaWallet /> },
    { path: '/concierge', label: 'Concierge', icon: <FaComments /> },
    { path: '/pricing', label: 'Pricing Config', icon: <FaSlidersH /> },
    { path: '/settings', label: 'Settings', icon: <FaCog /> },
    ...(!isSubAdmin ? [{ path: '/reviews', label: 'Reviews', icon: <FaStar /> }] : []),
  ];

  return (
    <div style={styles.sidebar}>
      {/* Brand Header */}
      <div style={styles.brand}>
        <span style={styles.brandSubtitle}>THE CLUB</span>
        <h2 style={styles.brandTitle}>THE ONE</h2>
        <div style={styles.brandDivider}></div>
      </div>

      {/* Nav List */}
      <nav style={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={playClickSound}
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
            end={item.path === '/'}
          >
            <span style={styles.icon}>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer Profile & Logout */}
      <div style={styles.footer}>
        <div style={styles.profileBox}>
          <div style={styles.avatar}>
            {userProfile?.name?.charAt(0) || 'A'}
          </div>
          <div style={styles.profileDetails}>
            <div style={styles.profileName}>{userProfile?.name || 'Administrator'}</div>
            <div style={styles.profileRole}>
              {userProfile?.isSubAdmin ? 'Sub Admin' : 'Super Admin'}
            </div>
          </div>
        </div>
        <button onClick={() => { playClickSound(); handleLogout(); }} style={styles.logoutBtn} className="sidebar-logout-btn">
          <FaSignOutAlt style={{ marginRight: '8px' }} />
          Log Out
        </button>
      </div>
    </div>
  );
};

const styles = {
  sidebar: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    bottom: 0,
    width: '260px',
    backgroundColor: '#1a110d',
    borderRight: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 100,
  },
  brand: {
    padding: '2.5rem 1.75rem 1.5rem 1.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  brandSubtitle: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.3em',
    color: '#a38c81',
    textTransform: 'uppercase' as const,
    marginBottom: '4px',
  },
  brandTitle: {
    fontSize: '2.0rem',
    fontStyle: 'italic',
    fontWeight: 500,
    color: '#f1dfd7',
    fontFamily: "'Cormorant Garamond', serif",
  },
  brandDivider: {
    height: '1px',
    backgroundColor: 'rgba(201, 122, 70, 0.2)',
    marginTop: '1.25rem',
    width: '100%',
  },
  nav: {
    flex: 1,
    padding: '1.0rem 1.0rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    overflowY: 'auto' as const,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.85rem 1.0rem',
    color: '#dcc1b5',
    textDecoration: 'none',
    fontSize: '13px',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 500,
    letterSpacing: '0.05em',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
  },
  navLinkActive: {
    backgroundColor: 'rgba(201, 122, 70, 0.1)',
    color: '#C97A46',
    borderLeft: '3px solid #C97A46',
    paddingLeft: '0.85rem',
  },
  icon: {
    marginRight: '0.75rem',
    fontSize: '15px',
    display: 'flex',
    alignItems: 'center',
  },
  footer: {
    padding: '1.5rem',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.0rem',
    backgroundColor: '#150d0a',
  },
  profileBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  avatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    backgroundColor: '#C97A46',
    color: '#1a110d',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    flexShrink: 0,
  },
  profileDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  profileName: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f1dfd7',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  },
  profileRole: {
    fontSize: '11px',
    color: '#a38c81',
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid rgba(201, 122, 70, 0.3)',
    color: '#C97A46',
    padding: '0.6rem',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    width: '100%',
    transition: 'all 0.3s ease',
  },
};
