import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { RecaptchaVerifier } from 'firebase/auth';
import { auth } from '../firebase';
import nLogo from '../assets/n_logo.png';

export const Login: React.FC = () => {
  const { user, sendVerificationCode, confirmVerificationCode, isVerificationSent } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Setup Recaptcha — always create fresh (verifier is single-use after any attempt)
  const setupRecaptcha = () => {
    // Destroy previous verifier if it exists
    if ((window as any).recaptchaVerifier) {
      try { (window as any).recaptchaVerifier.clear(); } catch (_) {}
      (window as any).recaptchaVerifier = null;
    }

    // Fully remove the old container from the DOM so Firebase's internal
    // element registry doesn't complain about "already rendered".
    // innerHTML = '' is NOT enough — we need a brand-new element.
    const old = document.getElementById('recaptcha-container');
    if (old) old.parentNode?.removeChild(old);
    const container = document.createElement('div');
    container.id = 'recaptcha-container';
    document.body.appendChild(container);

    // Pass the element reference directly (not the ID string) to avoid registry collisions
    const verifier = new RecaptchaVerifier(auth, container, {
      size: 'invisible',
      callback: () => {
        console.log('Recaptcha solved');
      }
    });
    (window as any).recaptchaVerifier = verifier;
    return verifier;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) {
      setError('Please enter a valid phone number.');
      return;
    }

    setError('');
    setLoading(true);

    // Format phone with +91 if length is 10 and doesn't start with +
    let formattedPhone = phoneNumber.trim();
    if (formattedPhone.length === 10 && !formattedPhone.startsWith('+')) {
      formattedPhone = `+91${formattedPhone}`;
    }

    try {
      const verifier = setupRecaptcha();
      const res = await sendVerificationCode(formattedPhone, verifier);
      if (res.success) {
        setError('');
      } else {
        if (res.error === 'auth/user-not-whitelisted') {
          setError('Access Denied. This number is not whitelisted in the admin database.');
        } else if (res.error === 'auth/unauthorized-access') {
          setError('Access Denied. Whitelisted user does not have administrative rights.');
        } else {
          setError(res.error || 'Failed to send OTP. Please try again.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      setError('Please enter a 6-digit verification code.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await confirmVerificationCode(otp);
      if (res.success) {
        navigate('/');
      } else {
        setError(res.error || 'Invalid OTP. Please check the code.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background radial glow */}
      <div className="bg-glow" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></div>
      <div id="recaptcha-container"></div>

      <div className="glass-card accent-glow" style={{ width: '100%', maxWidth: '400px', zIndex: 1, padding: '3rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <span className="label-spaced" style={{ fontSize: '9px', color: 'var(--color-accent)' }}>ADMIN TERMINAL</span>
          <div className="logo-row" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '0.2rem', marginTop: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="logo-text" style={{ fontFamily: 'var(--font-body)', fontSize: '3.0rem', fontWeight: 200, color: '#FFFFFF', letterSpacing: '0.12em', lineHeight: 1 }}>THE</span>
            <span style={{ width: '1.2rem' }}></span>
            <span className="logo-text" style={{ fontFamily: 'var(--font-body)', fontSize: '3.0rem', fontWeight: 200, color: '#FFFFFF', letterSpacing: '0.12em', lineHeight: 1 }}>O</span>
            <img src={nLogo} alt="N" style={{ width: '1.5rem', height: '2.1rem', marginLeft: '0.4rem', marginRight: '0.6rem', marginBottom: '0.3rem', objectFit: 'contain' }} />
            <span className="logo-text" style={{ fontFamily: 'var(--font-body)', fontSize: '3.0rem', fontWeight: 200, color: '#FFFFFF', letterSpacing: '0.12em', lineHeight: 1 }}>E</span>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>Administrative clearance required</p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(255, 180, 171, 0.1)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            padding: '0.75rem 1.0rem',
            borderRadius: '4px',
            fontSize: '13px',
            marginBottom: '1.5rem',
            lineHeight: '1.4'
          }}>
            {error}
          </div>
        )}

        {!isVerificationSent ? (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <label className="label-spaced">Phone Number</label>
              <input
                type="tel"
                placeholder="e.g. 8341664756 or +91..."
                className="input-luxury"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={loading}
              />
            </div>
            
            <button type="submit" className="btn-hero" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Verifying Whitelist...' : 'Request Access Code'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                Demo codes available for Whitelisted admins
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <label className="label-spaced">Enter 6-Digit Code</label>
              <input
                type="text"
                placeholder="123456"
                className="input-luxury"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                disabled={loading}
                style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: '20px' }}
              />
            </div>

            <button type="submit" className="btn-hero" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Authorizing Access...' : 'Verify & Enter'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.75rem' }}
              onClick={() => window.location.reload()}
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
