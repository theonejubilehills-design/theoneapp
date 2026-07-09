import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  onAuthStateChanged,
  signOut,
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';

export interface UserProfile {
  name: string;
  phoneNumber: string;
  gender: 'Male' | 'Female';
  membershipType: 'Basic' | 'Gold' | 'Trial' | 'Wellness';
  isAdmin: boolean;
  trialStartDate?: string;
  trialEndDate?: string;
  membershipStartDate?: string;
  membershipEndDate?: string;
  avatarUrl?: string;
  isBlocked?: boolean;
  noShowCount?: number;
  isSubAdmin?: boolean;
  isStaff?: boolean;
  staffName?: string;
}

interface User {
  phoneNumber: string;
  isAdmin: boolean;
  isSubAdmin?: boolean;
  isStaff?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  isVerificationSent: boolean;
  sendVerificationCode: (phoneNumber: string, recaptchaVerifier: any) => Promise<{ success: boolean; error?: string }>;
  confirmVerificationCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const withTimeout = (promise: Promise<any>, ms: number): Promise<any> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Firebase timeout'));
    }, ms);

    promise
      .then((val) => {
        clearTimeout(timeoutId);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerificationSent, setIsVerificationSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const fetchAndSyncProfile = async (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const isHardcodedAdmin = cleanPhone === '8341664756' || cleanPhone === '918341664756';
    const isHardcodedSubAdmin = false;
    const isMockNumber = false;

    console.log(`[AuthSync] Syncing phone: ${phone}, isMock: ${isMockNumber}`);
    
    let isAdmin = isHardcodedAdmin;
    let isSubAdmin = false;
    let membershipType: 'Basic' | 'Gold' | 'Trial' | 'Wellness' = isAdmin ? 'Gold' : 'Basic';
    let gender: 'Male' | 'Female' = 'Female';
    let name = isHardcodedAdmin ? 'Admin Coach' : 'Athlete';

    let profile: UserProfile = {
      name,
      phoneNumber: phone,
      gender,
      membershipType,
      isAdmin,
      isSubAdmin,
    };

    // Check allowed_users for admin status
    try {
      let allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', phone)), 3000);
      if (!allowedSnap.exists()) {
        allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', cleanPhone)), 3000);
      }
      if (!allowedSnap.exists()) {
        const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
        allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', raw10Digits)), 3000);
      }

      let isRegistered = false;
      let userDocRef = doc(db, 'users', phone);
      let userSnap = await withTimeout(getDoc(userDocRef), 3000);
      if (!userSnap.exists()) {
        userDocRef = doc(db, 'users', cleanPhone);
        userSnap = await withTimeout(getDoc(userDocRef), 3000);
      }
      if (!userSnap.exists()) {
        const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
        userDocRef = doc(db, 'users', raw10Digits);
        userSnap = await withTimeout(getDoc(userDocRef), 3000);
      }
      if (userSnap.exists()) {
        isRegistered = true;
      }

      if (allowedSnap.exists()) {
        const allowedData = allowedSnap.data();
        const firestoreIsSubAdmin = allowedData.isSubAdmin === true;
        const mergedIsAdmin = isHardcodedAdmin || allowedData.isAdmin === true || firestoreIsSubAdmin;
        const mergedIsSubAdmin = firestoreIsSubAdmin;
        
        isAdmin = mergedIsAdmin;
        isSubAdmin = mergedIsSubAdmin;
      } else if (userSnap.exists()) {
        const userData = userSnap.data();
        const firestoreIsSubAdmin = userData.isSubAdmin === true;
        const mergedIsAdmin = isHardcodedAdmin || userData.isAdmin === true || firestoreIsSubAdmin;
        const mergedIsSubAdmin = firestoreIsSubAdmin;

        isAdmin = mergedIsAdmin;
        isSubAdmin = mergedIsSubAdmin;
      } else if (!isHardcodedAdmin) {
        throw new Error('auth/user-not-whitelisted');
      }
    } catch (e: any) {
      console.warn('Allowed users check failed:', e);
      if (!isHardcodedAdmin) {
        try {
          let userSnap = await withTimeout(getDoc(doc(db, 'users', phone)), 3000);
          if (!userSnap.exists()) {
            userSnap = await withTimeout(getDoc(doc(db, 'users', cleanPhone)), 3000);
          }
          if (!userSnap.exists()) {
            const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
            userSnap = await withTimeout(getDoc(doc(db, 'users', raw10Digits)), 3000);
          }
          if (!userSnap.exists()) {
            throw new Error('auth/user-not-whitelisted');
          }
        } catch (innerErr) {
          throw new Error('auth/user-not-whitelisted');
        }
      }
    }

    // Require admin or sub-admin permissions
    if (!isAdmin && !isSubAdmin) {
      throw new Error('auth/unauthorized-access');
    }

    profile.isAdmin = isAdmin;
    profile.isSubAdmin = isSubAdmin;
    profile.membershipType = isAdmin ? 'Gold' : 'Basic';

    try {
      const userDocRef = doc(db, 'users', phone);
      const userSnap = await withTimeout(getDoc(userDocRef), 2000);
      if (userSnap.exists()) {
        const data = userSnap.data();
        profile = {
          name: data.name || name,
          phoneNumber: phone,
          gender: data.gender || gender,
          membershipType: data.membershipType || (isAdmin ? 'Gold' : 'Basic'),
          isAdmin: isHardcodedAdmin || (data.isAdmin !== undefined ? data.isAdmin : isAdmin),
          isSubAdmin: isHardcodedSubAdmin || (data.isSubAdmin !== undefined ? data.isSubAdmin : isSubAdmin),
          isStaff: data.isStaff,
          staffName: data.staffName,
          trialStartDate: data.trialStartDate,
          trialEndDate: data.trialEndDate,
          membershipStartDate: data.membershipStartDate,
          membershipEndDate: data.membershipEndDate,
          avatarUrl: data.avatarUrl || '',
          isBlocked: data.isBlocked || false,
          noShowCount: data.noShowCount,
        };
      } else {
        const now = new Date();
        const startISO = now.toISOString();
        const end = new Date(now);
        end.setDate(now.getDate() + 30);
        const endISO = end.toISOString();

        await withTimeout(setDoc(userDocRef, {
          name: profile.name,
          phoneNumber: profile.phoneNumber,
          gender: profile.gender,
          membershipType: profile.membershipType,
          isAdmin: profile.isAdmin,
          isSubAdmin: profile.isSubAdmin,
          membershipStartDate: startISO,
          membershipEndDate: endISO,
          createdAt: new Date().toISOString(),
        }), 2000);
      }
    } catch (e) {
      console.error('Firestore profile sync failed:', e);
      if (!isMockNumber) {
        throw e;
      }
    }

    setUser({ phoneNumber: phone, isAdmin: profile.isAdmin, isSubAdmin: profile.isSubAdmin, isStaff: profile.isStaff });
    setUserProfile(profile);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        const activeMockPhone = localStorage.getItem('mock_user_phone');
        if (activeMockPhone) {
          await fetchAndSyncProfile(activeMockPhone);
        } else if (firebaseUser && firebaseUser.phoneNumber) {
          await fetchAndSyncProfile(firebaseUser.phoneNumber);
        } else {
          setUser(null);
          setUserProfile(null);
        }
      } catch (e) {
        console.warn('Auto login failed:', e);
        await logout();
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshUserProfile = async () => {
    if (user?.phoneNumber) {
      await fetchAndSyncProfile(user.phoneNumber);
    }
  };

  const sendVerificationCode = async (
    phoneNumber: string,
    recaptchaVerifier: any
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const isHardcodedAdmin = cleanPhone === '8341664756' || cleanPhone === '918341664756';

      // Whitelist check
      try {
        let allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', phoneNumber)), 3000);
        if (!allowedSnap.exists()) {
          allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', cleanPhone)), 3000);
        }
        if (!allowedSnap.exists()) {
          const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
          allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', raw10Digits)), 3000);
        }

        let isRegisteredUser = false;
        let userData: any = null;
        if (!allowedSnap.exists()) {
          let userSnap = await withTimeout(getDoc(doc(db, 'users', phoneNumber)), 3000);
          if (!userSnap.exists()) {
            userSnap = await withTimeout(getDoc(doc(db, 'users', cleanPhone)), 3000);
          }
          if (!userSnap.exists()) {
            const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
            userSnap = await withTimeout(getDoc(doc(db, 'users', raw10Digits)), 3000);
          }
          if (userSnap.exists()) {
            isRegisteredUser = true;
            userData = userSnap.data();
          }
        }

        // Check if admin inside allowed_users or users
        if (!isHardcodedAdmin) {
          const allowedData = allowedSnap.exists() ? allowedSnap.data() : userData;
          if (allowedData?.isAdmin !== true && allowedData?.isSubAdmin !== true) {
            return { success: false, error: 'auth/unauthorized-access' };
          }
        }
      } catch (e: any) {
        console.error('Allowed users check failed before sending OTP:', e);
        return { success: false, error: e.code || e.message || 'auth/network-request-failed' };
      }

      // Real Phone Auth
      try {
        const confirmResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
        setConfirmationResult(confirmResult);
        setIsVerificationSent(true);
        return { success: true };
      } catch (authErr: any) {
        console.error('Real Firebase Phone Auth failed:', authErr);
        return { success: false, error: authErr.code || authErr.message };
      }
    } catch (e: any) {
      console.error('[Auth] sendVerificationCode error:', e);
      return { success: false, error: e.message || String(e) };
    }
  };

  const confirmVerificationCode = async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!confirmationResult) {
      return { success: false, error: 'No OTP session found.' };
    }
    try {
      const userCredential = await confirmationResult.confirm(code);
      const phone = userCredential.user?.phoneNumber;
      if (phone) {
        await fetchAndSyncProfile(phone);
      }
      setIsVerificationSent(false);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.code || e?.message || 'Invalid OTP' };
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('mock_user_phone');
    localStorage.removeItem('pending_mock_phone');
    setUserProfile(null);
    setConfirmationResult(null);
    setIsVerificationSent(false);
    try {
      await signOut(auth);
    } catch (e) {
      console.error('signOut error:', e);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      isLoading,
      isVerificationSent,
      sendVerificationCode,
      confirmVerificationCode,
      logout,
      refreshUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
