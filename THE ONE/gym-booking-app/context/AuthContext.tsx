import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { db, auth } from '../firebaseConfig';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  expiryNotificationSent?: boolean;
  avatarUrl?: string;
  isBlocked?: boolean;
  noShowCount?: number;
  isSubAdmin?: boolean;
  isStaff?: boolean;
  staffName?: string;
  birthday?: string; // stored as "MM-DD" for annual comparison
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
  sendVerificationCode: (phoneNumber: string, recaptchaVerifier: any) => Promise<{ success: boolean; error?: string }>;
  confirmVerificationCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  updateUserProfile: (name: string, gender: 'Male' | 'Female', avatarUrl?: string, birthday?: string) => Promise<boolean>;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmationResult, setConfirmationResult] = useState<any>(null);

  const fetchAndSyncProfile = async (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const isHardcodedAdmin = cleanPhone === '8341664756' || cleanPhone === '918341664756';
    const isHardcodedSubAdmin = false;
    const isMockNumber = false;

    console.log(`[AuthSync] Syncing phone: ${phone}, clean: ${cleanPhone}, isMock: ${isMockNumber}`);
    
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

    // Real Firebase Mode - Sync with Firestore remote server directly (no local caches)
    try {
      // Check allowed_users for admin status (supporting both prefixed and non-prefixed doc IDs)
      let allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', phone)), 5000);
      if (!allowedSnap.exists()) {
        allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', cleanPhone)), 5000);
      }
      if (!allowedSnap.exists()) {
        const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
        allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', raw10Digits)), 5000);
      }

      let isRegistered = false;
      let userDocRef = doc(db, 'users', phone);
      let userSnap = await withTimeout(getDoc(userDocRef), 5000);
      if (!userSnap.exists()) {
        userDocRef = doc(db, 'users', cleanPhone);
        userSnap = await withTimeout(getDoc(userDocRef), 5000);
      }
      if (!userSnap.exists()) {
        const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
        userDocRef = doc(db, 'users', raw10Digits);
        userSnap = await withTimeout(getDoc(userDocRef), 5000);
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
      }
    } catch (e) {
      console.warn('Allowed users check failed (ignoring restriction):', e);
    }

    profile.isAdmin = isAdmin;
    profile.isSubAdmin = isSubAdmin;
    profile.membershipType = isAdmin ? 'Gold' : 'Basic';

    try {
      const userDocRef = doc(db, 'users', phone);
      const userSnap = await withTimeout(getDoc(userDocRef), 5000);
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
          expiryNotificationSent: data.expiryNotificationSent || false,
          avatarUrl: data.avatarUrl || '',
          isBlocked: data.isBlocked || false,
          noShowCount: data.noShowCount,
          birthday: data.birthday || undefined,
        };
      } else {
        // Document doesn't exist, create it in Firestore with default validity of 30 days (7 days for trial)
        const now = new Date();
        const startISO = now.toISOString();
        const end = new Date(now);
        end.setDate(now.getDate() + ((profile.membershipType as string) === 'Trial' ? 7 : 30));
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
          trialStartDate: (profile.membershipType as string) === 'Trial' ? startISO : null,
          trialEndDate: (profile.membershipType as string) === 'Trial' ? endISO : null,
          expiryNotificationSent: false,
          avatarUrl: '',
          createdAt: new Date().toISOString(),
        }), 5000);
      }
    } catch (e) {
      console.error('Firestore profile sync failed:', e);
      // If Firestore failed, propagate the error if not a hardcoded mock number
      if (!isMockNumber) {
        throw e;
      }
    }

    // Ensure hardcoded admins always retain admin rights
    if (isHardcodedAdmin) {
      profile.isAdmin = true;
      profile.membershipType = 'Gold';
    }

    setUser({ phoneNumber: phone, isAdmin: profile.isAdmin, isSubAdmin: profile.isSubAdmin, isStaff: profile.isStaff });
    setUserProfile(profile);

    // Sync push token
    if (Platform.OS !== 'web') {
      try {
        const { registerForPushNotificationsAsync } = require('../utils/notifications');
        registerForPushNotificationsAsync().then((token: string | null) => {
          if (token) {
            updateDoc(doc(db, 'users', phone), { pushToken: token }).catch((err: any) => {
              console.error('Failed to save push token to database:', err);
            });
          }
        }).catch((err: any) => {
          console.warn('Push notification token generation failed:', err);
        });
      } catch (err) {
        console.warn('Notifications module not imported:', err);
      }
    }
  };

  useEffect(() => {
    // Clear old legacy variables
    AsyncStorage.removeItem('user_phone').catch(() => {});
    AsyncStorage.removeItem('user_is_admin').catch(() => {});

    const handleUserChange = async (firebaseUser: any) => {
      try {
        const activeMockPhone = await AsyncStorage.getItem('mock_user_phone');
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
    };

    let unsubscribe: () => void;
    if (Platform.OS === 'web') {
      const { onAuthStateChanged } = require('firebase/auth');
      unsubscribe = onAuthStateChanged(auth, handleUserChange);
    } else {
      unsubscribe = auth.onAuthStateChanged(handleUserChange);
    }

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
    console.log(`[Auth] sendVerificationCode called for phone: ${phoneNumber}`);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const isHardcodedAdmin = cleanPhone === '8341664756' || cleanPhone === '918341664756';

      // Verify if user is registered in 'users' or 'allowed_users' collections before sending OTP
      if (!isHardcodedAdmin) {
        let isRegistered = false;
        try {
          // Check users collection (standard register)
          let userDocRef = doc(db, 'users', phoneNumber);
          let userSnap = await withTimeout(getDoc(userDocRef), 5000);
          if (!userSnap.exists()) {
            userDocRef = doc(db, 'users', cleanPhone);
            userSnap = await withTimeout(getDoc(userDocRef), 5000);
          }
          if (!userSnap.exists()) {
            const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
            userDocRef = doc(db, 'users', raw10Digits);
            userSnap = await withTimeout(getDoc(userDocRef), 5000);
          }
          if (userSnap.exists()) {
            isRegistered = true;
          }

          // Check allowed_users collection
          if (!isRegistered) {
            let allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', phoneNumber)), 5000);
            if (!allowedSnap.exists()) {
              allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', cleanPhone)), 5000);
            }
            if (!allowedSnap.exists()) {
              const raw10Digits = cleanPhone.startsWith('91') && cleanPhone.length === 12 ? cleanPhone.substring(2) : cleanPhone;
              allowedSnap = await withTimeout(getDoc(doc(db, 'allowed_users', raw10Digits)), 5000);
            }
            if (allowedSnap.exists()) {
              isRegistered = true;
            }
          }
        } catch (dbErr) {
          console.warn('[Auth] Firestore membership check failed, allowing OTP attempt:', dbErr);
          isRegistered = true; // allow on db error to not block users due to transient db issue
        }

        if (!isRegistered) {
          console.log(`[Auth] Blocked OTP send because phone number ${phoneNumber} is not registered.`);
          return { success: false, error: 'auth/user-not-registered' };
        }
      }

      if (auth && typeof auth.signInWithPhoneNumber === 'function') {
        console.log(`[RealAuth Native] Calling signInWithPhoneNumber for ${phoneNumber}`);
        const confirmResult = await auth.signInWithPhoneNumber(phoneNumber);
        setConfirmationResult(confirmResult);
      } else {
        const { signInWithPhoneNumber } = require('firebase/auth');
        console.log(`[RealAuth Web/Fallback] Calling signInWithPhoneNumber for ${phoneNumber}`);
        const confirmResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
        setConfirmationResult(confirmResult);
      }
      return { success: true };
    } catch (e: any) {
      console.error('[Auth] sendVerificationCode error:', e);
      return { success: false, error: e.message || String(e) };
    }
  };

  const confirmVerificationCode = async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!confirmationResult) {
      return { success: false, error: 'No OTP session found. Please request a new code.' };
    }
    try {
      const userCredential = await confirmationResult.confirm(code);
      const phone = userCredential.user?.phoneNumber;
      if (phone) {
        await fetchAndSyncProfile(phone);
      } else {
        console.warn('Firebase confirmed login, but no phone number was returned.');
      }
      return { success: true };
    } catch (e: any) {
      console.error('confirmVerificationCode error:', e);
      return { success: false, error: e?.code || e?.message || 'Invalid OTP' };
    }
  };

  const updateUserProfile = async (name: string, gender: 'Male' | 'Female', avatarUrl?: string, birthday?: string): Promise<boolean> => {
    if (!userProfile) return false;
    const updatedProfile = { ...userProfile, name, gender };
    if (avatarUrl !== undefined) {
      updatedProfile.avatarUrl = avatarUrl;
    }
    if (birthday !== undefined) {
      updatedProfile.birthday = birthday;
    }
    
    // 1. Update Firestore directly
    const updateData: any = { name, gender };
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl;
    }
    if (birthday !== undefined) {
      updateData.birthday = birthday;
    }
    await updateDoc(doc(db, 'users', userProfile.phoneNumber), updateData);

    setUserProfile(updatedProfile);
    return true;
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem('mock_user_phone');
    await AsyncStorage.removeItem('pending_mock_phone');
    setUserProfile(null);
    setConfirmationResult(null);
    try {
      if (Platform.OS === 'web') {
        const { signOut } = require('firebase/auth');
        await signOut(auth);
      } else {
        await auth.signOut();
      }
    } catch (e) {
      console.error('signOut error:', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, isLoading, sendVerificationCode, confirmVerificationCode, updateUserProfile, logout, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
