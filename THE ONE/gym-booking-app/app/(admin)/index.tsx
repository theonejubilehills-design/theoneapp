import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  FlatList, ScrollView, ActivityIndicator, Pressable, Modal, Platform
} from 'react-native';
import { Link } from 'expo-router';
import { db } from '../../firebaseConfig';
import {
  collection, doc, setDoc, deleteDoc,
  updateDoc, onSnapshot
} from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import CustomAlertModal, { AlertButton } from '@/components/CustomAlertModal';
import { useAuth } from '../../context/AuthContext';
import PressSpring from '@/components/PressSpring';

interface UserProfile {
  id: string; // phone number
  phoneNumber?: string;
  name: string;
  gender: 'Male' | 'Female';
  membershipType: 'Basic' | 'Gold' | 'Trial' | 'Wellness';
  isAdmin: boolean;
  trialStartDate?: string;
  trialEndDate?: string;
  membershipStartDate?: string;
  membershipEndDate?: string;
  isSubAdmin?: boolean;
  isStaff?: boolean;
  staffName?: string;
  isBlocked?: boolean;
  noShowCount?: number;
  designation?: string;
}

export default function AdminDashboard() {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();

  // Success Popup Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [] as AlertButton[] | undefined
  });
  const showAlert = (title: string, message: string, buttons?: AlertButton[]) => {
    setAlertConfig({ visible: true, title, message, buttons });
  };
  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  // Focused field tracking for visual glow borders
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const getLocalDateString = (date: Date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  // Expanded directory user card
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Register Member Form State
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGender, setRegGender] = useState<'Male' | 'Female'>('Male');
  const [regSubscription, setRegSubscription] = useState<'Basic' | 'Gold' | 'Trial' | 'Wellness'>('Basic');
  const [regRole, setRegRole] = useState<'Member' | 'Sub-Admin' | 'Staff Member'>('Member');
  const [regStaffName, setRegStaffName] = useState('');
  const [regTrialDuration, setRegTrialDuration] = useState('7');
  const [regStartDate, setRegStartDate] = useState(getLocalDateString());
  const [regEndDate, setRegEndDate] = useState('');
  const [regBirthday, setRegBirthday] = useState(''); // stored as YYYY-MM-DD, compared as MM-DD
  const [regDesignation, setRegDesignation] = useState('');

  // Birthday Calendar State
  const [birthdayCalendarVisible, setBirthdayCalendarVisible] = useState(false);
  const [birthdayCalendarMonth, setBirthdayCalendarMonth] = useState(new Date().getMonth());
  const [birthdayCalendarYear, setBirthdayCalendarYear] = useState(new Date().getFullYear());

  // Calendar Picker State
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<'start' | 'end' | null>(null);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date().getMonth());
  const [currentCalendarYear, setCurrentCalendarYear] = useState(new Date().getFullYear());

  // Auto calculate default End Date based on Plan or Start Date selection
  useEffect(() => {
    const start = new Date(regStartDate);
    if (isNaN(start.getTime())) return;
    
    const end = new Date(start);
    if (regSubscription === 'Trial') {
      const duration = parseInt(regTrialDuration) || 7;
      end.setDate(start.getDate() + duration);
    } else {
      end.setDate(start.getDate() + 30);
    }
    setRegEndDate(getLocalDateString(end));
  }, [regSubscription, regStartDate, regTrialDuration]);

  // Search/Check State
  const [searchQuery, setSearchQuery] = useState('');

  const [loading, setLoading] = useState(true);

  // User Profiles State
  const [users, setUsers] = useState<UserProfile[]>([]);

  // Real-time bookings and dues state
  const [bookings, setBookings] = useState<any[]>([]);
  const [dues, setDues] = useState<any[]>([]);

  useEffect(() => {
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          ...data
        });
      });
      setBookings(list);
    }, (err) => {
      console.error('Bookings sub failed:', err);
    });
    return () => unsubBookings();
  }, []);

  useEffect(() => {
    const unsubDues = onSnapshot(collection(db, 'dues'), (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          ...data
        });
      });
      setDues(list);
    }, (err) => {
      console.error('Dues sub failed:', err);
    });
    return () => unsubDues();
  }, []);

  // Real-time listener for users directly from Firestore
  useEffect(() => {
    setLoading(true);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const dbList: UserProfile[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        dbList.push({
          id: doc.id,
          name: data.name || 'Athlete',
          gender: data.gender || 'Female',
          membershipType: data.membershipType || 'Basic',
          isAdmin: data.isAdmin || false,
          trialStartDate: data.trialStartDate,
          trialEndDate: data.trialEndDate,
          membershipStartDate: data.membershipStartDate,
          membershipEndDate: data.membershipEndDate,
          isBlocked: data.isBlocked,
          noShowCount: data.noShowCount,
          isSubAdmin: data.isSubAdmin,
        });
      });
      setUsers(dbList);
      setLoading(false);
    }, (err) => {
      console.error('Users sub failed:', err);
      setLoading(false);
    });

    return () => unsubUsers();
  }, []);

  // Actions  // Registration preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewUser, setPreviewUser] = useState<{
    name: string;
    phone: string;
    gender: string;
    membership: string;
    startDate: string;
    endDate: string;
    trialDays?: string;
    staffName?: string;
    birthday?: string;
    role?: string;
    designation?: string;
  } | null>(null);

  const handleRegisterMember = async () => {
    if (!regName.trim() || !regPhone.trim()) {
      showAlert('Incomplete Form', 'Please enter Name and Phone Number');
      return;
    }
    let targetPhone = regPhone.trim().replace(/\s+/g, '');
    if (!targetPhone.startsWith('+')) {
      if (targetPhone.length === 10) {
        targetPhone = '+91' + targetPhone;
      } else {
        targetPhone = '+' + targetPhone;
      }
    }
    if (targetPhone.length < 10) {
      showAlert('Invalid Phone', 'Phone number must be valid (e.g. +918341664756)');
      return;
    }

    const startDateParsed = new Date(regStartDate);
    const endDateParsed = new Date(regEndDate);
    if (isNaN(startDateParsed.getTime()) || isNaN(endDateParsed.getTime())) {
      showAlert('Invalid Date', 'Please ensure start date and end date are valid dates in YYYY-MM-DD format.');
      return;
    }

    const isSubAdmin = regRole === 'Sub-Admin';
    const isStaff = regRole === 'Staff Member';
    console.log('handleRegisterMember called with', { name: regName.trim(), phone: regPhone, gender: regGender, membership: (isSubAdmin || isStaff) ? 'Gold' : regSubscription, startDate: regStartDate, endDate: regEndDate });
    // Set preview details
    setPreviewUser({
      name: regName.trim(),
      phone: targetPhone,
      gender: regGender,
      membership: (isSubAdmin || isStaff) ? 'Gold' : regSubscription,
      startDate: (isSubAdmin || isStaff) ? getLocalDateString() : regStartDate,
      endDate: (isSubAdmin || isStaff) ? getLocalDateString(new Date(new Date().setFullYear(new Date().getFullYear() + 10))) : regEndDate,
      trialDays: !isSubAdmin && !isStaff && regSubscription === 'Trial' ? regTrialDuration : undefined,
      staffName: isStaff ? regName.trim() : undefined,
      birthday: regBirthday || undefined,
      role: isSubAdmin ? 'Sub-Admin' : isStaff ? 'Staff Member' : undefined,
      designation: (isSubAdmin || isStaff) ? regDesignation.trim() : undefined,
    });
    setShowPreview(true);
  };

  const confirmAddUser = async () => {
    if (!previewUser) return;
    console.log('confirmAddUser about to call proceedRegisterMember with', previewUser?.phone);
    try {
      await proceedRegisterMember(previewUser.phone);
      console.log('proceedRegisterMember completed');
      // Reset form after successful addition
      setRegName('');
      setRegPhone('');
      setRegGender('Male');
      setRegSubscription('Basic');
      setRegTrialDuration('7');
      setRegStartDate(getLocalDateString());
      setRegBirthday('');
      setRegDesignation('');
      setShowPreview(false);
      setPreviewUser(null);
    } catch (e: any) {
      console.error('Error in confirmAddUser:', e);
      const msg = e.message || String(e);
      showAlert('Error', 'Failed to add member: ' + msg);
    }
  };

  const proceedRegisterMember = async (cleanPhone: string) => {
    try {
      const isSubAdmin = regRole === 'Sub-Admin';
      const isStaff = regRole === 'Staff Member';

      // Parse start and end dates
      let startISO = new Date(regStartDate).toISOString();
      let endISO = new Date(regEndDate).toISOString();
      if (isSubAdmin || isStaff) {
        const now = new Date();
        const tenYearsLater = new Date();
        tenYearsLater.setFullYear(now.getFullYear() + 10);
        startISO = now.toISOString();
        endISO = tenYearsLater.toISOString();
      }

      // Ensure allowed_users collection grants privileges if applicable
      if (isSubAdmin || isStaff) {
        await setDoc(doc(db, 'allowed_users', cleanPhone), {
          phoneNumber: cleanPhone,
          isAdmin: false,
          isSubAdmin: isSubAdmin,
          isStaff: isStaff,
          addedAt: new Date().toISOString()
        });
      }

      // Add actual user profile
      // Store birthday as "MM-DD" for easy annual comparison
      const birthdayMMDD = regBirthday ? regBirthday.substring(5) : null; // extract MM-DD from YYYY-MM-DD
      const userProfileData: any = {
        name: regName.trim(),
        gender: regGender,
        membershipType: (isSubAdmin || isStaff) ? 'Gold' : regSubscription,
        isAdmin: false,
        isSubAdmin: isSubAdmin,
        isStaff: isStaff,
        staffName: isStaff ? regName.trim() : null,
        designation: (isSubAdmin || isStaff) ? regDesignation.trim() : null,
        membershipStartDate: startISO,
        membershipEndDate: endISO,
        expiryNotificationSent: false,
        ...(birthdayMMDD ? { birthday: birthdayMMDD } : {}),
      };

      if (!isSubAdmin && regSubscription === 'Trial') {
        userProfileData.trialStartDate = startISO;
        userProfileData.trialEndDate = endISO;
      }

      // Write directly to Firestore
      console.log('Writing to allowed_users for', cleanPhone);
      await setDoc(doc(db, 'allowed_users', cleanPhone), {
        phoneNumber: cleanPhone,
        isAdmin: false,
        isSubAdmin: isSubAdmin,
        isStaff: isStaff,
        addedAt: new Date().toISOString()
      });
      console.log('Writing user profile to users collection');
      await setDoc(doc(db, 'users', cleanPhone), {
        ...userProfileData,
        phoneNumber: cleanPhone,
        createdAt: new Date().toISOString()
      });

      setRegName('');
      setRegPhone('');
      setRegGender('Male');
      setRegSubscription('Basic');
      setRegRole('Member');
      setRegStaffName('');
      setRegTrialDuration('7');
      setRegBirthday('');

      setSuccessModalMessage(`Member "${userProfileData.name}" has been registered successfully!`);
      setShowSuccessModal(true);
      console.log('Firestore write successful for', cleanPhone);
    } catch (e: any) {
      console.error('Registration failed:', e);
      const errorMsg = e.message || String(e);
      showAlert('Error', 'Failed to register member: ' + errorMsg);
    }
  };

  const handleRemoveMember = async (userPhone: string) => {
    if (userPhone === '+918341664756') {
      showAlert('Action Denied', 'Cannot remove system administrator accounts.');
      return;
    }

    const performDeletion = async () => {
      try {
        // Delete directly from Firestore
        await deleteDoc(doc(db, 'allowed_users', userPhone));
        await deleteDoc(doc(db, 'users', userPhone));

        showAlert('Success', 'Member removed successfully.');
      } catch (e: any) {
        console.error('Member removal failed:', e);
        const errorMsg = e.message || String(e);
        showAlert('Removal Error', 'Failed to remove member: ' + errorMsg);
      }
    };

    showAlert(
      'Remove Member',
      `Are you sure you want to remove ${userPhone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: performDeletion }
      ]
    );
  };

  const handleUnblockUser = async (userPhone: string) => {
    try {
      await updateDoc(doc(db, 'users', userPhone), {
        isBlocked: false,
        noShowCount: 0
      });
      showAlert('Success', 'User unblocked successfully.');
    } catch (e: any) {
      console.error('Failed to unblock user:', e);
      showAlert('Error', 'Failed to unblock user.');
    }
  };

  const handleToggleMembership = async (userProf: UserProfile, type: 'Basic' | 'Gold' | 'Trial' | 'Wellness') => {
    if (userProfile?.isSubAdmin) {
      showAlert('Access Denied', 'Only main Admins can change membership types.');
      return;
    }

    if (userProf.membershipType === type) {
      return;
    }

    const performUpdate = async () => {
      try {
        const updateData: any = { 
          membershipType: type,
          expiryNotificationSent: false
        };

        const start = new Date();
        const end = new Date();
        if (type === 'Trial') {
          end.setDate(start.getDate() + 7);
          updateData.trialStartDate = start.toISOString();
          updateData.trialEndDate = end.toISOString();
        } else {
          end.setDate(start.getDate() + 30);
          updateData.trialStartDate = null;
          updateData.trialEndDate = null;
        }
        
        updateData.membershipStartDate = start.toISOString();
        updateData.membershipEndDate = end.toISOString();

        const userRef = doc(db, 'users', userProf.id);
        await updateDoc(userRef, updateData);
        showAlert('Membership Updated', `Successfully updated ${userProf.name} to ${type}`);
      } catch (e: any) {
        showAlert('Membership Update Failed', e.message || String(e));
      }
    };

    showAlert(
      'Confirm Membership Change',
      `Are you sure you want to change ${userProf.name}'s membership to ${type}?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => hideAlert() },
        {
          text: 'Confirm',
          style: 'default',
          onPress: () => {
            showAlert(
              'Verify Action (Step 2 of 2)',
              `WARNING: This will immediately modify their booking rules and limits. Confirm again to change ${userProf.name} to ${type}?`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => hideAlert() },
                {
                  text: 'Confirm & Update',
                  style: 'default',
                  onPress: () => {
                    performUpdate();
                  }
                }
              ]
            );
          }
        }
      ]
    );
  };

  const handleExtendTrial = async (userProf: UserProfile, days: number) => {
    try {
      const start = userProf.membershipStartDate || userProf.trialStartDate ? new Date(userProf.membershipStartDate || userProf.trialStartDate || '') : new Date();
      const end = userProf.membershipEndDate || userProf.trialEndDate ? new Date(userProf.membershipEndDate || userProf.trialEndDate || '') : new Date();
      end.setDate(end.getDate() + days);

      const updateData: any = {
        membershipStartDate: start.toISOString(),
        membershipEndDate: end.toISOString(),
        expiryNotificationSent: false
      };

      if (userProf.membershipType === 'Trial') {
        updateData.trialStartDate = start.toISOString();
        updateData.trialEndDate = end.toISOString();
      }

      const userRef = doc(db, 'users', userProf.id);
      await updateDoc(userRef, updateData);
      showAlert('Membership Extended', `Extended membership by ${days} days for ${userProf.name}`);
    } catch (e: any) {
      showAlert('Membership Extension Failed', e.message || String(e));
    }
  };

  // Filter users based on query
  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.id.includes(q);
  });

  const CalendarModal = () => {
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const getDaysInMonth = (year: number, month: number) => {
      return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
      return new Date(year, month, 1).getDay();
    };

    const daysCount = getDaysInMonth(currentCalendarYear, currentCalendarMonth);
    const firstDayIndex = getFirstDayOfMonth(currentCalendarYear, currentCalendarMonth);

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysCount; i++) {
      days.push(i);
    }

    const handlePrevMonth = () => {
      if (currentCalendarMonth === 0) {
        setCurrentCalendarMonth(11);
        setCurrentCalendarYear(prev => prev - 1);
      } else {
        setCurrentCalendarMonth(prev => prev - 1);
      }
    };

    const handleNextMonth = () => {
      if (currentCalendarMonth === 11) {
        setCurrentCalendarMonth(0);
        setCurrentCalendarYear(prev => prev + 1);
      } else {
        setCurrentCalendarMonth(prev => prev + 1);
      }
    };

    const handleSelectDay = (day: number) => {
      const year = currentCalendarYear;
      const month = String(currentCalendarMonth + 1).padStart(2, '0');
      const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
      
      if (calendarTarget === 'start') {
        setRegStartDate(dateStr);
      } else if (calendarTarget === 'end') {
        setRegEndDate(dateStr);
      }
      
      setCalendarVisible(false);
      setCalendarTarget(null);
    };

    const activeDateValue = calendarTarget === 'start' ? regStartDate : regEndDate;
    let selectedDay: number | null = null;
    if (activeDateValue) {
      const parts = activeDateValue.split('-');
      if (parts.length === 3 && parseInt(parts[0]) === currentCalendarYear && parseInt(parts[1]) === currentCalendarMonth + 1) {
        selectedDay = parseInt(parts[2]);
      }
    }

    return (
      <Modal
        visible={calendarVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setCalendarVisible(false);
          setCalendarTarget(null);
        }}
      >
        <Pressable style={styles.popupOverlay} onPress={() => {
          setCalendarVisible(false);
          setCalendarTarget(null);
        }}>
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card, maxWidth: 360 }]} onPress={(e) => e.stopPropagation()}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 }}>
              <TouchableOpacity onPress={handlePrevMonth} style={{ padding: 8 }}>
                <FontAwesome name="chevron-left" size={16} color={colors.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontFamily: TheOneTypography.headlineFamily, fontWeight: '700', color: colors.text }}>
                {months[currentCalendarMonth]} {currentCalendarYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={{ padding: 8 }}>
                <FontAwesome name="chevron-right" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', width: '100%', marginBottom: 8 }}>
              {weekdays.map((wd, index) => (
                <Text key={index} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontFamily: TheOneTypography.bodyFamily, fontWeight: '700', color: colors.secondaryText }}>
                  {wd}
                </Text>
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%', rowGap: 8 }}>
              {days.map((day, index) => {
                const isSelected = day === selectedDay;
                return (
                  <TouchableOpacity
                    key={index}
                    disabled={day === null}
                    style={{
                      width: '13.5%',
                      margin: '0.39%',
                      aspectRatio: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                      backgroundColor: isSelected ? '#B84600' : 'transparent',
                    }}
                    onPress={() => day !== null && handleSelectDay(day)}
                  >
                    <Text style={{
                      fontSize: 13,
                      fontWeight: isSelected ? '700' : '500',
                      color: day === null ? 'transparent' : isSelected ? '#0B0B0B' : colors.text
                    }}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.popupButton, { backgroundColor: '#1E1E22', marginTop: 20 }]}
              onPress={() => {
                setCalendarVisible(false);
                setCalendarTarget(null);
              }}
            >
              <Text style={[styles.popupButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const BirthdayCalendarModal = () => {
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
    const daysCount = getDaysInMonth(birthdayCalendarYear, birthdayCalendarMonth);
    const firstDayIndex = getFirstDayOfMonth(birthdayCalendarYear, birthdayCalendarMonth);
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysCount; i++) days.push(i);

    const handlePrev = () => {
      if (birthdayCalendarMonth === 0) { setBirthdayCalendarMonth(11); setBirthdayCalendarYear(p => p - 1); }
      else setBirthdayCalendarMonth(p => p - 1);
    };
    const handleNext = () => {
      if (birthdayCalendarMonth === 11) { setBirthdayCalendarMonth(0); setBirthdayCalendarYear(p => p + 1); }
      else setBirthdayCalendarMonth(p => p + 1);
    };
    const handleSelect = (day: number) => {
      const m = String(birthdayCalendarMonth + 1).padStart(2, '0');
      const d = String(day).padStart(2, '0');
      setRegBirthday(`${birthdayCalendarYear}-${m}-${d}`);
      setBirthdayCalendarVisible(false);
    };

    let selectedDay: number | null = null;
    if (regBirthday) {
      const parts = regBirthday.split('-');
      if (parts.length === 3 && parseInt(parts[0]) === birthdayCalendarYear && parseInt(parts[1]) === birthdayCalendarMonth + 1) {
        selectedDay = parseInt(parts[2]);
      }
    }

    return (
      <Modal
        visible={birthdayCalendarVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setBirthdayCalendarVisible(false)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setBirthdayCalendarVisible(false)}>
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card, maxWidth: 360 }]} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 13, fontFamily: TheOneTypography.bodyFamily, fontWeight: '800', color: '#B84600', marginBottom: 4, letterSpacing: 1.5 }}>🎂 SELECT BIRTHDAY</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 16 }}>
              <TouchableOpacity onPress={handlePrev} style={{ padding: 8 }}>
                <FontAwesome name="chevron-left" size={16} color={colors.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontFamily: TheOneTypography.headlineFamily, fontWeight: '700', color: colors.text }}>
                {months[birthdayCalendarMonth]} {birthdayCalendarYear}
              </Text>
              <TouchableOpacity onPress={handleNext} style={{ padding: 8 }}>
                <FontAwesome name="chevron-right" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', width: '100%', marginBottom: 8 }}>
              {weekdays.map((wd, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontFamily: TheOneTypography.bodyFamily, fontWeight: '700', color: colors.secondaryText }}>{wd}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%', rowGap: 8 }}>
              {days.map((day, index) => {
                const isSelected = day === selectedDay;
                return (
                  <TouchableOpacity
                    key={index}
                    disabled={day === null}
                    style={{ width: '13.5%', margin: '0.39%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: isSelected ? '#B84600' : 'transparent' }}
                    onPress={() => day !== null && handleSelect(day)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: isSelected ? '700' : '500', color: day === null ? 'transparent' : isSelected ? '#0B0B0B' : colors.text }}>{day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.popupButton, { backgroundColor: '#1E1E22', marginTop: 20 }]}
              onPress={() => setBirthdayCalendarVisible(false)}
            >
              <Text style={[styles.popupButtonText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
      
      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
      <CalendarModal />
      <BirthdayCalendarModal />

      {/* Top Navigation Header */}
      <View style={styles.topNav}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
          <PressSpring
            style={[styles.navBtn, styles.navBtnActive]}
            scaleTo={0.96}
            hapticStyle="selection"
            fullWidth={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome name="users" size={13} color="#B84600" style={{ marginRight: 6 }} />
              <Text style={styles.navBtnTextActive}>Members</Text>
            </View>
          </PressSpring>
          <Link href="/(admin)/bookings" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="calendar" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Bookings</Text>
              </View>
            </PressSpring>
          </Link>
          <Link href="/(admin)/payments" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="money" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Payments</Text>
              </View>
            </PressSpring>
          </Link>
          <Link href="/(admin)/pricing" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="tag" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Pricing</Text>
              </View>
            </PressSpring>
          </Link>
          <Link href="/(admin)/events" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="birthday-cake" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Events</Text>
              </View>
            </PressSpring>
          </Link>
          {!userProfile?.isSubAdmin && (
            <>
              <Link href="/(admin)/support" asChild>
                <PressSpring 
                  contentStyle={styles.navBtn}
                  scaleTo={0.96}
                  hapticStyle="selection"
                  fullWidth={false}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <FontAwesome name="comments" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                    <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Support</Text>
                  </View>
                </PressSpring>
              </Link>
              <Link href="/(admin)/feedback" asChild>
                <PressSpring 
                  contentStyle={styles.navBtn}
                  scaleTo={0.96}
                  hapticStyle="selection"
                  fullWidth={false}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <FontAwesome name="star" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                    <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Feedback</Text>
                  </View>
                </PressSpring>
              </Link>
            </>
          )}
          <Link href="/(admin)/settings" asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="cog" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Settings</Text>
              </View>
            </PressSpring>
          </Link>
        </ScrollView>
      </View>

      {/* Form: Add Gym Member */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>👤 Add New Member</Text>
        
        <View style={styles.formRow}>
          <View style={styles.formCol}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>
              {regRole === 'Sub-Admin' ? 'Sub-Admin Contact Number' : regRole === 'Staff Member' ? 'Staff Contact Number' : 'Client Phone'}
            </Text>
            <TextInput
              style={[
                styles.formInput,
                { borderBottomColor: focusedField === 'phone' ? '#B84600' : colors.border, color: colors.text },
                Platform.select({ web: { outlineStyle: 'none' } }) as any
              ]}
              placeholder="e.g. 98765 43210"
              placeholderTextColor="#5C5040"
              value={regPhone}
              onFocus={() => setFocusedField('phone')}
              onBlur={() => setFocusedField(null)}
              onChangeText={(t) => {
                let digits = t.replace(/\s+/g, '');
                if (digits.length === 10 && /^\d+$/.test(digits)) {
                  setRegPhone('+91' + digits);
                } else {
                  setRegPhone(t);
                }
              }}
              keyboardType="phone-pad"
            />
          </View>
          <View style={styles.formCol}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>
              {regRole === 'Sub-Admin' ? 'Sub-Admin Name' : regRole === 'Staff Member' ? 'Staff Name' : 'Client Name'}
            </Text>
            <TextInput
              style={[
                styles.formInput,
                { borderBottomColor: focusedField === 'name' ? '#B84600' : colors.border, color: colors.text },
                Platform.select({ web: { outlineStyle: 'none' } }) as any
              ]}
              placeholder={regRole === 'Sub-Admin' ? 'Sub-Admin Name' : regRole === 'Staff Member' ? 'Staff Name' : 'Client Name'}
              placeholderTextColor="#5C5040"
              value={regName}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
              onChangeText={setRegName}
            />
          </View>
        </View>

        {/* Birthday Field (Optional) */}
        <View style={styles.formRow}>
          <View style={[styles.formCol, { width: '100%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.formLabel, { color: colors.secondaryText, marginBottom: 0 }]}>🎂 Birthday <Text style={{ color: '#5C5040', fontSize: 11, textTransform: 'lowercase' }}>(optional)</Text></Text>
              {regBirthday ? (
                <TouchableOpacity onPress={() => setRegBirthday('')}>
                  <Text style={{ color: '#B84600', fontSize: 11, fontFamily: TheOneTypography.bodyFamily, fontWeight: '700' }}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.formInput,
                { borderBottomColor: regBirthday ? '#B84600' : colors.border, justifyContent: 'center', minHeight: 38 }
              ]}
              onPress={() => {
                if (regBirthday) {
                  const parts = regBirthday.split('-');
                  if (parts.length === 3) {
                    setBirthdayCalendarMonth(parseInt(parts[1]) - 1);
                    setBirthdayCalendarYear(parseInt(parts[0]));
                  }
                }
                setBirthdayCalendarVisible(true);
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: regBirthday ? colors.text : '#5C5040', fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>
                  {regBirthday ? (() => { const [y,m,d] = regBirthday.split('-'); return `${d}/${m}/${y}`; })() : 'Select Birthday'}
                </Text>
                <FontAwesome name="birthday-cake" size={13} color={regBirthday ? '#B84600' : '#5C5040'} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.formCol}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Gender</Text>
            <View style={styles.segmentedRow}>
              {(['Male', 'Female'] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.segmentBtn,
                    regGender === g ? { backgroundColor: '#B84600' } : { backgroundColor: 'transparent' }
                  ]}
                  onPress={() => setRegGender(g)}
                >
                  <Text style={[styles.segmentText, regGender === g ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {regRole === 'Sub-Admin' || regRole === 'Staff Member' ? (
            <View style={styles.formCol}>
              <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Designation</Text>
              <TextInput
                style={[
                  styles.formInput,
                  { borderBottomColor: focusedField === 'designation' ? '#B84600' : colors.border, color: colors.text },
                  Platform.select({ web: { outlineStyle: 'none' } }) as any
                ]}
                placeholder="e.g. Manager, Coach, Masseuse"
                placeholderTextColor="#5C5040"
                value={regDesignation}
                onFocus={() => setFocusedField('designation')}
                onBlur={() => setFocusedField(null)}
                onChangeText={setRegDesignation}
              />
            </View>
          ) : (
            <View style={styles.formCol}>
              <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Membership Plan</Text>
              <View style={styles.segmentedRow}>
                {(['Basic', 'Gold', 'Trial', 'Wellness'] as const).map((plan) => (
                  <TouchableOpacity
                    key={plan}
                    style={[
                      styles.segmentBtn,
                      regSubscription === plan ? { backgroundColor: '#B84600' } : { backgroundColor: 'transparent' }
                    ]}
                    onPress={() => setRegSubscription(plan)}
                  >
                    <Text style={[styles.segmentText, regSubscription === plan ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                      {plan}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {regRole !== 'Sub-Admin' && regRole !== 'Staff Member' && (
          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Start Date</Text>
              <TouchableOpacity
                style={[
                  styles.formInput,
                  { borderBottomColor: colors.border, justifyContent: 'center', minHeight: 38 }
                ]}
                onPress={() => {
                  setCalendarTarget('start');
                  if (regStartDate) {
                    const parts = regStartDate.split('-');
                    if (parts.length === 3) {
                      const y = parseInt(parts[0]);
                      const m = parseInt(parts[1]) - 1;
                      if (!isNaN(y) && !isNaN(m) && m >= 0 && m < 12) {
                        setCurrentCalendarMonth(m);
                        setCurrentCalendarYear(y);
                      }
                    }
                  }
                  setCalendarVisible(true);
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' }}>
                  <Text style={{ color: regStartDate ? colors.text : '#5C5040', fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>
                    {regStartDate || 'Select Start Date'}
                  </Text>
                  <FontAwesome name="calendar" size={13} color="#5C5040" />
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.formCol}>
              <Text style={[styles.formLabel, { color: colors.secondaryText }]}>End Date</Text>
              <TouchableOpacity
                style={[
                  styles.formInput,
                  { borderBottomColor: colors.border, justifyContent: 'center', minHeight: 38 }
                ]}
                onPress={() => {
                  setCalendarTarget('end');
                  if (regEndDate) {
                    const parts = regEndDate.split('-');
                    if (parts.length === 3) {
                      const y = parseInt(parts[0]);
                      const m = parseInt(parts[1]) - 1;
                      if (!isNaN(y) && !isNaN(m) && m >= 0 && m < 12) {
                        setCurrentCalendarMonth(m);
                        setCurrentCalendarYear(y);
                      }
                    }
                  }
                  setCalendarVisible(true);
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent' }}>
                  <Text style={{ color: regEndDate ? colors.text : '#5C5040', fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>
                    {regEndDate || 'Select End Date'}
                  </Text>
                  <FontAwesome name="calendar" size={13} color="#5C5040" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!userProfile?.isSubAdmin && (
          <View style={styles.formRow}>
            <View style={[styles.formCol, { width: '100%' }]}>
              <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Role Assignment</Text>
              <View style={styles.segmentedRow}>
                {(['Member', 'Sub-Admin', 'Staff Member'] as const).map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.segmentBtn,
                      regRole === role ? { backgroundColor: '#B84600' } : { backgroundColor: 'transparent' }
                    ]}
                    onPress={() => setRegRole(role)}
                  >
                    <Text style={[styles.segmentText, regRole === role ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                      {role}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {regSubscription === 'Trial' && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Trial Duration (Days)</Text>
            <TextInput
              style={[
                styles.formInput,
                { borderBottomColor: focusedField === 'trial' ? '#B84600' : colors.border, color: colors.text },
                Platform.select({ web: { outlineStyle: 'none' } }) as any
              ]}
              placeholder="e.g. 7"
              placeholderTextColor="#5C5040"
              value={regTrialDuration}
              onFocus={() => setFocusedField('trial')}
              onBlur={() => setFocusedField(null)}
              onChangeText={setRegTrialDuration}
              keyboardType="number-pad"
            />
          </View>
        )}

        <PressSpring
          contentStyle={styles.submitBtn}
          onPress={handleRegisterMember}
          scaleTo={0.94}
          hapticStyle="heavy"
          fullWidth={true}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesome name="user-plus" size={13} color="#0B0B0B" style={{ marginRight: 8 }} />
            <Text style={styles.submitBtnText}>Add Member</Text>
          </View>
        </PressSpring>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>        
        <Text style={[styles.cardTitle, { color: colors.text }]}>💰 Service Pricing</Text>
        <Text style={{ color: colors.secondaryText, fontSize: 13, lineHeight: 20, marginBottom: 16, fontFamily: TheOneTypography.bodyFamily }}>
          Manage the prices shown to Basic, Trial, and Wellness members. Gold members are not charged for these services.
        </Text>
        <Link href="/(admin)/pricing" asChild>
          <PressSpring 
            contentStyle={StyleSheet.flatten([styles.submitBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#B84600', marginTop: 0 }])}
            scaleTo={0.94}
            hapticStyle="medium"
            fullWidth={true}
          > 
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome name="edit" size={13} color="#B84600" style={{ marginRight: 8 }} />
              <Text style={[styles.submitBtnText, { color: '#B84600' }]}>Open Pricing Manager</Text>
            </View>
          </PressSpring>
        </Link>
      </View>

      {/* Preview Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showPreview}
        onRequestClose={() => setShowPreview(false)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setShowPreview(false)}>
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.popupIconCircle}>
              <FontAwesome name="info-circle" size={24} color="#B84600" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Confirm New Member</Text>
            {previewUser && (
              <View style={{ width: '100%' }}>
                <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Name: {previewUser.name}</Text>
                <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Phone: {previewUser.phone}</Text>
                <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Gender: {previewUser.gender}</Text>
                {previewUser.role === 'Sub-Admin' || previewUser.role === 'Staff Member' ? (
                  <>
                    <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Role: {previewUser.role}</Text>
                    {previewUser.designation ? (
                      <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Designation: {previewUser.designation}</Text>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Membership: {previewUser.membership}</Text>
                    <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Start Date: {previewUser.startDate}</Text>
                    <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>End Date: {previewUser.endDate}</Text>
                    {previewUser.trialDays && (
                      <Text style={[styles.popupMessage, { color: colors.text, textAlign: 'left', marginBottom: 8 }]}>Trial Days: {previewUser.trialDays}</Text>
                    )}
                  </>
                )}
                {previewUser.birthday && (
                  <Text style={[styles.popupMessage, { color: '#B84600', textAlign: 'left', marginBottom: 8, fontWeight: '700' }]}>🎂 Birthday: {(() => { const [m,d] = previewUser.birthday!.split('-'); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${d} ${months[parseInt(m)-1]}`; })()}</Text>
                )}
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, width: '100%' }}>
              <TouchableOpacity
                style={[styles.popupButton, { backgroundColor: '#B84600', flex: 0.48 }]}
                onPress={confirmAddUser}
              >
                <Text style={[styles.popupButtonText, { color: '#0B0B0B' }]}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.popupButton, { backgroundColor: '#1E1E22', flex: 0.48 }]}
                onPress={() => setShowPreview(false)}
              >
                <Text style={[styles.popupButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Lookup / Search Member */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>🔍 Search & Check Member</Text>
      
      <View style={[
        styles.searchContainer,
        {
          borderBottomColor: focusedField === 'search' ? '#B84600' : colors.border,
        }
      ]}>
        <FontAwesome name="search" size={14} color="#8C7B6B" style={{ marginRight: 10 }} />
        <TextInput
          style={[styles.searchInputField, { color: colors.text }, Platform.select({ web: { outlineStyle: 'none' } }) as any]}
          placeholder="Search by name or phone number..."
          placeholderTextColor="#5C5040"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setFocusedField('search')}
          onBlur={() => setFocusedField(null)}
        />
      </View>

      {/* Directory List */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Registered Members ({filteredUsers.length})</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#B84600" style={{ marginTop: 20 }} />
      ) : filteredUsers.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FontAwesome name="users" size={28} color={colors.secondaryText} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.secondaryText, fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>No registered members found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isUserTrial = item.membershipType === 'Trial';
            const isExpired = (item.membershipEndDate || item.trialEndDate) && new Date(item.membershipEndDate || item.trialEndDate || '').getTime() < Date.now();
            const initials = item.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const isExpanded = expandedUserId === item.id;

            const cleanId = item.id.replace(/\D/g, '');
            const raw10 = cleanId.length === 12 && cleanId.startsWith('91') ? cleanId.slice(2) : cleanId;

            const userBookings = bookings.filter(b => {
              const bClean = b.userId?.replace(/\D/g, '') || '';
              const bRaw10 = bClean.length === 12 && bClean.startsWith('91') ? bClean.slice(2) : bClean;
              return b.userId === item.id || bClean === cleanId || bRaw10 === raw10;
            });

            const pendingDues = dues.filter(d => {
              const dClean = d.userId?.replace(/\D/g, '') || '';
              const dRaw10 = dClean.length === 12 && dClean.startsWith('91') ? dClean.slice(2) : dClean;
              const isUserMatch = d.userId === item.id || dClean === cleanId || dRaw10 === raw10;
              return isUserMatch && d.status === 'pending';
            });

            const totalPendingAmount = pendingDues.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

            return (
              <Pressable 
                style={[styles.userListItem, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => setExpandedUserId(isExpanded ? null : item.id)}
              >
                <View style={styles.userInfoRow}>
                  {/* Circular Avatar */}
                  <View style={[
                    styles.userAvatar,
                    {
                      borderColor: item.membershipType === 'Gold' ? '#D4AF37' : item.membershipType === 'Trial' ? '#B84600' : '#2A2520',
                      borderWidth: 1,
                      backgroundColor: '#1E1E22',
                    }
                  ]}>
                    <Text style={[
                      styles.avatarText,
                      { color: item.membershipType === 'Gold' ? '#D4AF37' : item.membershipType === 'Trial' ? '#B84600' : '#F5F0EB' }
                    ]}>
                      {initials || 'A'}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.userListName, { color: colors.text }]}>{item.name}</Text>
                      {!item.isAdmin && item.id !== '+918341664756' && (
                        <TouchableOpacity
                          style={styles.trashBtn}
                          onPress={() => handleRemoveMember(item.id)}
                          activeOpacity={0.7}
                        >
                          <FontAwesome name="trash" size={13} color="#C46057" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <Text style={[styles.userListSub, { color: colors.secondaryText }]}>{item.id} • {item.gender}</Text>
                    
                    {/* Membership Badges */}
                    <View style={styles.badgeRow}>
                      {!item.isSubAdmin && !item.isStaff && (
                        <Text style={[
                          styles.membershipBadge,
                          item.membershipType === 'Gold' ? styles.badgeGold : item.membershipType === 'Trial' ? styles.badgeTrial : item.membershipType === 'Wellness' ? styles.badgeWellness : styles.badgeBasic
                        ]}>
                          {item.membershipType.toUpperCase()}
                        </Text>
                      )}
                      {isExpired && !item.isSubAdmin && !item.isStaff && <Text style={[styles.membershipBadge, styles.badgeExpired]}>EXPIRED</Text>}
                      {item.isBlocked && <Text style={[styles.membershipBadge, { backgroundColor: 'rgba(196, 96, 87, 0.12)', color: '#C46057' }]}>BLOCKED</Text>}
                      
                      {/* Direct Unblock Button */}
                      {item.isBlocked && (
                        <TouchableOpacity
                          style={[styles.extendBtn, { backgroundColor: 'rgba(107, 158, 118, 0.12)', borderWidth: 1, borderColor: '#6B9E76', paddingVertical: 2, paddingHorizontal: 8, marginLeft: 6, width: 'auto' }]}
                          onPress={(e) => {
                            e.stopPropagation(); // Prevent expanding the card
                            handleUnblockUser(item.id);
                          }}
                        >
                          <Text style={[styles.extendBtnText, { color: '#6B9E76', fontSize: 9, fontWeight: '800' }]}>UNBLOCK</Text>
                        </TouchableOpacity>
                      )}
                      
                      {item.isSubAdmin && (
                        <Text style={[styles.membershipBadge, { backgroundColor: '#2A2520', color: '#8C7B6B' }]}>
                          {item.designation ? `SUB-ADMIN (${item.designation.toUpperCase()})` : 'SUB-ADMIN'}
                        </Text>
                      )}
                      {item.isStaff && (
                        <Text style={[styles.membershipBadge, { backgroundColor: '#2A2228', color: '#A08090' }]}>
                          {item.designation ? `${item.designation.toUpperCase()}` : 'STAFF'}
                        </Text>
                      )}
                      {(item.isSubAdmin || item.isStaff) && (
                        <Text style={[styles.membershipBadge, { backgroundColor: '#1E1E22', color: '#8C7B6B' }]}>NO PLAN</Text>
                      )}
                    </View>

                    {item.isSubAdmin || item.isStaff ? (
                      <Text style={[styles.trialDatesText, { color: colors.secondaryText }]}>
                        Plan: None
                      </Text>
                    ) : (
                      (item.membershipStartDate || item.trialStartDate) && (
                        <Text style={[styles.trialDatesText, { color: colors.secondaryText }]}>
                          Validity: {(item.membershipStartDate || item.trialStartDate)?.split('T')[0]} to {(item.membershipEndDate || item.trialEndDate)?.split('T')[0]}
                        </Text>
                      )
                    )}
                  </View>
                </View>

                {/* Collapsible actions panel */}
                {isExpanded && !item.isAdmin && (
                  <View style={styles.userActionsCol}>
                    {/* Bookings & Payments Summary */}
                    <View style={styles.summaryContainer}>
                      <View style={styles.summarySection}>
                        <Text style={styles.summaryTitle}>Bookings Summary</Text>
                        <Text style={styles.summaryValue}>
                          Total Bookings: {userBookings.length}
                        </Text>
                        {userBookings.length > 0 ? (
                          <View style={styles.historyList}>
                            {userBookings.slice(0, 3).map((b) => (
                              <View key={b.id} style={styles.historyItem}>
                                <Text style={styles.historyText} numberOfLines={1}>
                                  {b.serviceName} ({b.date} @ {b.time})
                                </Text>
                                <Text style={[styles.statusBadge, (styles as any)[`status_${b.status}`] || styles.status_pending]}>
                                  {b.status.toUpperCase()}
                                </Text>
                              </View>
                            ))}
                            {userBookings.length > 3 && (
                              <Text style={styles.moreText}>+ {userBookings.length - 3} more bookings</Text>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.emptyText}>No bookings found</Text>
                        )}
                      </View>

                      <View style={[styles.summarySection, { marginTop: 12, marginBottom: 4 }]}>
                        <Text style={styles.summaryTitle}>Pending Payments</Text>
                        {pendingDues.length > 0 ? (
                          <View>
                            <Text style={[styles.summaryValue, { color: '#C46057', fontWeight: 'bold' }]}>
                              Total Pending: ₹{totalPendingAmount} ({pendingDues.length} dues)
                            </Text>
                            <View style={styles.historyList}>
                              {pendingDues.map((d) => (
                                <View key={d.id} style={styles.historyItem}>
                                  <Text style={styles.historyText} numberOfLines={1}>
                                    {d.serviceName} ({d.date || 'No Date'})
                                  </Text>
                                  <Text style={{ color: '#C46057', fontSize: 11, fontWeight: '600' }}>
                                    ₹{d.amount}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ) : (
                          <Text style={[styles.emptyText, { color: '#6B9E76' }]}>✓ No pending payments</Text>
                        )}
                      </View>
                    </View>

                    {!userProfile?.isSubAdmin && !item.isSubAdmin && !item.isStaff && (
                      <>
                        <Text style={styles.actionsLabel}>Change Membership Plan</Text>
                        <View style={styles.planBtnRow}>
                          {(['Basic', 'Gold', 'Trial', 'Wellness'] as const).map((type) => (
                            <TouchableOpacity
                              key={type}
                              style={[
                                styles.planBtn,
                                item.membershipType === type
                                  ? { backgroundColor: '#B84600' }
                                  : { backgroundColor: '#1E1E22', borderWidth: 1, borderColor: colors.border }
                              ]}
                              onPress={() => handleToggleMembership(item, type)}
                            >
                              <Text style={[styles.planBtnText, item.membershipType === type ? { color: '#0B0B0B' } : { color: colors.text }]}>{type}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {isUserTrial && (
                          <View style={{ marginTop: 12 }}>
                            <Text style={styles.actionsLabel}>Extend Trial Duration</Text>
                            <View style={styles.extendTrialRow}>
                              <TouchableOpacity
                                style={styles.extendBtn}
                                onPress={() => handleExtendTrial(item, 7)}
                              >
                                <Text style={styles.extendBtnText}>+7 Days</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.extendBtn}
                                onPress={() => handleExtendTrial(item, 14)}
                              >
                                <Text style={styles.extendBtnText}>+14 Days</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </>
                    )}

                    {item.isBlocked && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.actionsLabel, { color: '#C46057' }]}>User is Blocked due to No-Shows ({item.noShowCount || 3} / 3)</Text>
                        <TouchableOpacity
                          style={[styles.planBtn, { backgroundColor: '#6B9E76', marginTop: 8, width: '100%' }]}
                          onPress={() => handleUnblockUser(item.id)}
                        >
                          <Text style={[styles.planBtnText, { color: '#0B0B0B' }]}>Unblock User & Reset No-Shows</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          }}
          scrollEnabled={false}
        />
      )}

      {/* Success Confirmation Popup Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <Pressable 
          style={styles.popupOverlay} 
          onPress={() => setShowSuccessModal(false)}
        >
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { borderColor: 'rgba(107, 158, 118, 0.3)' }]}>
              <FontAwesome name="check" size={24} color="#6B9E76" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Success</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>{successModalMessage}</Text>
            <TouchableOpacity 
              style={[styles.popupButton, { backgroundColor: colors.tint }]} 
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={[styles.popupButtonText, { color: '#0B0B0B' }]}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 60,
  },
  topNav: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: TheOneColors.charcoalBorder,
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  navBtn: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  navBtnActive: {
    borderBottomColor: '#B84600',
  },
  navBtnText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  navBtnTextActive: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    color: '#B84600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    color: '#F5F0EB',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 20,
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  formCol: {
    width: '48%',
  },
  formLabel: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  formInput: {
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 0,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    marginTop: 4,
    height: 38,
    borderRadius: 12,
    overflow: 'hidden',
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  segmentText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    backgroundColor: '#B84600',
  },
  submitBtnText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 0,
    paddingVertical: 12,
    marginBottom: 24,
  },
  searchInputField: {
    flex: 1,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    height: 20,
    padding: 0,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userListItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
  },
  userListName: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  userListSub: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 2,
  },
  trashBtn: {
    padding: 6,
    backgroundColor: 'rgba(196, 96, 87, 0.08)',
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  membershipBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: TheOneTypography.bodyFamily,
    overflow: 'hidden',
  },
  badgeBasic: {
    backgroundColor: '#1E1E22',
    color: '#8C7B6B',
  },
  badgeGold: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    color: '#D4AF37',
  },
  badgeTrial: {
    backgroundColor: 'rgba(184, 70, 0, 0.12)',
    color: '#B84600',
  },
  badgeWellness: {
    backgroundColor: 'rgba(107, 158, 118, 0.12)',
    color: '#6B9E76',
  },
  badgeExpired: {
    backgroundColor: 'rgba(196, 96, 87, 0.12)',
    color: '#C46057',
  },
  trialDatesText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '500',
    marginTop: 8,
  },
  userActionsCol: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 240, 235, 0.06)',
    paddingTop: 16,
    marginTop: 16,
  },
  actionsLabel: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    color: '#8C7B6B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  planBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  planBtn: {
    width: '48%',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  planBtnText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
  },
  extendTrialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  extendBtn: {
    width: '48%',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  extendBtnText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupContainer: {
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  popupIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  popupTitle: {
    fontSize: 20,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 20,
  },
  popupButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  popupButtonText: {
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
  summaryContainer: {
    backgroundColor: '#1E1E22',
    borderWidth: 1,
    borderColor: '#232329',
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
  },
  summarySection: {
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    color: '#8C7B6B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: TheOneTypography.bodyFamily,
    marginBottom: 6,
  },
  historyList: {
    marginTop: 4,
    gap: 6,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  historyText: {
    fontSize: 11,
    color: '#A2A2A8',
    fontFamily: TheOneTypography.bodyFamily,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    fontSize: 8,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  status_confirmed: {
    backgroundColor: 'rgba(107, 158, 118, 0.12)',
    color: '#6B9E76',
  },
  status_completed: {
    backgroundColor: 'rgba(107, 158, 118, 0.12)',
    color: '#6B9E76',
  },
  status_cancelled: {
    backgroundColor: 'rgba(196, 96, 87, 0.12)',
    color: '#C46057',
  },
  status_no_show: {
    backgroundColor: 'rgba(196, 96, 87, 0.12)',
    color: '#C46057',
  },
  status_pending: {
    backgroundColor: 'rgba(184, 70, 0, 0.12)',
    color: '#B84600',
  },
  status_pending_join_request: {
    backgroundColor: 'rgba(184, 70, 0, 0.12)',
    color: '#B84600',
  },
  status_pending_group_fill: {
    backgroundColor: 'rgba(184, 70, 0, 0.12)',
    color: '#B84600',
  },
  moreText: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    color: '#8E8E93',
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
});
