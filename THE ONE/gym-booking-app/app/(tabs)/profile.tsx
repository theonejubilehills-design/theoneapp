import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, FlatList, Image, Platform, Modal, Animated, Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import CustomAlertModal, { AlertButton } from '@/components/CustomAlertModal';
import { db } from '../../firebaseConfig';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, addDoc, serverTimestamp, setDoc, getDocs
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PressSpring from '@/components/PressSpring';

interface Due {
  id: string;
  amount: number;
  serviceName: string;
  date: string;
  status: 'pending' | 'paid';
}

interface Payment {
  id: string;
  amount: number;
  serviceName: string;
  date: string;
  paymentMethod: string;
}

// Format YYYY-MM-DD or ISO timestamp → DD-MM-YYYY
const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
};

export default function ProfileScreen() {
  const { user, userProfile, updateUserProfile, logout } = useAuth();
  const router = useRouter();
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<'Male' | 'Female'>('Female');
  const [editBirthday, setEditBirthday] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Firestore states
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalBookingsCount, setTotalBookingsCount] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  // Birthday Popup State
  const [showBirthdayPopup, setShowBirthdayPopup] = useState(false);
  const birthdayAnim = useRef(new Animated.Value(0)).current;
  const birthdayScale = useRef(new Animated.Value(0.5)).current;

  // Gold Confetti Particle Configuration (25 particles)
  const PARTICLE_COUNT = 25;
  const birthdayParticles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      anim: new Animated.Value(0),
      delay: Math.random() * 4000,
      size: 6 + Math.random() * 10,
      left: `${Math.random() * 100}%`,
      swayRange: (Math.random() - 0.5) * 80,
      color: ['#FFD700', '#F0E68C', '#DAA520', '#DFBA73', '#FCF6BA'][Math.floor(Math.random() * 5)],
      type: ['star', 'circle', 'diamond'][Math.floor(Math.random() * 3)] as 'star' | 'circle' | 'diamond'
    }))
  ).current;

  // Trigger continuous falling particles loop when birthday popup is active
  useEffect(() => {
    if (showBirthdayPopup) {
      birthdayParticles.forEach(p => {
        p.anim.setValue(0);
        Animated.loop(
          Animated.sequence([
            Animated.delay(p.delay),
            Animated.timing(p.anim, {
              toValue: 1,
              duration: 3500 + Math.random() * 2500,
              useNativeDriver: true,
            })
          ])
        ).start();
      });
    } else {
      birthdayParticles.forEach(p => p.anim.setValue(0));
    }
  }, [showBirthdayPopup]);

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

  // Initialize editing inputs
  useEffect(() => {
    if (userProfile) {
      setEditName(userProfile.name);
      setEditGender(userProfile.gender);
      
      // format MM-DD into DD-MM for display during edit
      if (userProfile.birthday) {
        const parts = userProfile.birthday.split('-');
        if (parts.length === 2) {
          setEditBirthday(`${parts[1]}-${parts[0]}`);
        } else {
          setEditBirthday(userProfile.birthday);
        }
      } else {
        setEditBirthday('');
      }
    }
  }, [userProfile, isEditing]);

  // Birthday check — fires when userProfile loads
  useEffect(() => {
    if (!userProfile?.birthday) return;
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayMMDD = `${mm}-${dd}`;
    if (userProfile.birthday !== todayMMDD) return;

    // Only show once per day
    const storageKey = `birthday_shown_${user?.phoneNumber}_${today.getFullYear()}`;
    AsyncStorage.getItem(storageKey).then((shown) => {
      if (!shown) {
        AsyncStorage.setItem(storageKey, 'true');
        // Slight delay so profile loads first
        setTimeout(() => {
          setShowBirthdayPopup(true);
          Animated.parallel([
            Animated.timing(birthdayAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.spring(birthdayScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
          ]).start();
        }, 800);
      }
    });
  }, [userProfile?.birthday]);

  // Firestore Realtime Listeners directly (no local fallbacks)
  useEffect(() => {
    if (!user?.phoneNumber) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    // 1. Unpaid Dues Listener
    const qDues = query(
      collection(db, 'dues'),
      where('userId', '==', user.phoneNumber),
      where('status', '==', 'pending')
    );
    const unsubDues = onSnapshot(qDues, (snap) => {
      const list: Due[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Due);
      });
      setDues(list);
    }, (err) => {
      console.error('Dues listener failed:', err);
    });

    // 2. Payments History Listener
    const qPayments = query(
      collection(db, 'payments'),
      where('userId', '==', user.phoneNumber)
    );
    const unsubPayments = onSnapshot(qPayments, (snap) => {
      const list: Payment[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Payment);
      });
      // Sort newest first
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPayments(list);
    }, (err) => {
      console.error('Payments listener failed:', err);
    });

    // 3. Bookings Count Listener
    const qBookings = query(
      collection(db, 'bookings'),
      where('userId', '==', user.phoneNumber),
      where('status', '==', 'confirmed')
    );
    const unsubBookings = onSnapshot(qBookings, (snap) => {
      setTotalBookingsCount(snap.size);
      setLoadingData(false);
    }, (err) => {
      console.error('Bookings count listener failed:', err);
      setLoadingData(false);
    });

    return () => {
      unsubDues();
      unsubPayments();
      unsubBookings();
    };
  }, [user?.phoneNumber]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      showAlert('Required Field', 'Name cannot be empty.');
      return;
    }

    let formattedBirthday = '';
    if (editBirthday.trim()) {
      const cleanInput = editBirthday.trim().replace(/[\/\s]/g, '-');
      const parts = cleanInput.split('-');
      if (parts.length !== 2 || isNaN(parseInt(parts[0])) || isNaN(parseInt(parts[1]))) {
        showAlert('Invalid Birthday', 'Please enter your birthday in DD-MM format (e.g. 15-07 for July 15).');
        return;
      }
      const dayNum = parseInt(parts[0], 10);
      const monthNum = parseInt(parts[1], 10);
      if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) {
        showAlert('Invalid Birthday', 'Please enter valid date values (Day: 1-31, Month: 1-12).');
        return;
      }
      
      const dd = String(dayNum).padStart(2, '0');
      const mm = String(monthNum).padStart(2, '0');
      formattedBirthday = `${mm}-${dd}`; // Store as MM-DD in Firebase
    }

    setIsSaving(true);
    const success = await updateUserProfile(editName.trim(), editGender, undefined, formattedBirthday || '');
    setIsSaving(false);
    if (success) {
      setIsEditing(false);
      showAlert('Success', 'Profile updated successfully.');
    } else {
      showAlert('Error', 'Failed to update profile.');
    }
  };

  // Pay simulator
  const handlePayDue = async (due: Due) => {
    if (!userProfile) return;

    showAlert(
      'Confirm Payment',
      `Pay ₹${due.amount} for "${due.serviceName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now (Simulate)',
          onPress: async () => {
            try {
              // 1. Update due status in Firestore
              const dueDocRef = doc(db, 'dues', due.id);
              await updateDoc(dueDocRef, {
                status: 'paid',
                paidAt: new Date().toISOString()
              });

              // 2. Add payment log
              const paymentData = {
                userId: userProfile.phoneNumber,
                userName: userProfile.name,
                dueId: due.id,
                amount: due.amount,
                serviceName: due.serviceName,
                date: new Date().toISOString().split('T')[0],
                paymentMethod: 'Simulated Gateway',
                createdAt: new Date().toISOString()
              };
              await addDoc(collection(db, 'payments'), paymentData);

              showAlert('Success', 'Payment simulated successfully!');
            } catch (e: any) {
              console.error('Payment simulation failed:', e);
              showAlert('Payment Failed', e.message || String(e));
            }
          }
        }
      ]
    );
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('Permission Denied', 'We need media library permissions to upload a photo.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const base64Image = `data:image/jpeg;base64,${asset.base64}`;
        
        setIsSaving(true);
        const success = await updateUserProfile(userProfile?.name || 'Athlete', userProfile?.gender || 'Female', base64Image);
        setIsSaving(false);
        if (success) {
          showAlert('Success', 'Profile photo updated successfully!');
        } else {
          showAlert('Error', 'Failed to save profile photo.');
        }
      }
    } catch (error) {
      console.error('Image picking error:', error);
      showAlert('Error', 'An error occurred while picking the image.');
    }
  };

  const isGold = userProfile?.membershipType === 'Gold';
  const isTrial = userProfile?.membershipType === 'Trial';
  const isWellness = userProfile?.membershipType === 'Wellness';

  const isTrialExpired = isTrial && userProfile?.trialEndDate && new Date(userProfile.trialEndDate).getTime() < Date.now();

  const dismissButtonScale = useRef(new Animated.Value(1)).current;
  const handleDismissPressIn = () => {
    Animated.spring(dismissButtonScale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };
  const handleDismissPressOut = () => {
    Animated.spring(dismissButtonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const closeBirthdayPopup = () => {
    Animated.parallel([
      Animated.timing(birthdayAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(birthdayScale, { toValue: 0.5, duration: 250, useNativeDriver: true }),
    ]).start(() => setShowBirthdayPopup(false));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />

      {/* 🎂 Birthday Popup */}
      <Modal visible={showBirthdayPopup} transparent animationType="none" onRequestClose={closeBirthdayPopup}>
        <Animated.View style={[{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.9)', // Deep overlay for premium feel
        }, { opacity: birthdayAnim }]}>
          
          {/* Continuous falling gold confetti particles */}
          {birthdayParticles.map(p => {
            const translateY = p.anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-60, 800]
            });
            const translateX = p.anim.interpolate({
              inputRange: [0, 0.25, 0.5, 0.75, 1],
              outputRange: [0, p.swayRange, -p.swayRange, p.swayRange, 0]
            });
            const opacity = p.anim.interpolate({
              inputRange: [0, 0.1, 0.85, 1],
              outputRange: [0, 1, 1, 0]
            });
            const rotate = p.anim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg']
            });

            return (
              <Animated.View
                key={p.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: p.left as any,
                  opacity,
                  transform: [{ translateY }, { translateX }, { rotate }],
                  zIndex: 999,
                }}
              >
                {p.type === 'star' ? (
                  <FontAwesome name="star" size={p.size} color={p.color} />
                ) : p.type === 'diamond' ? (
                  <FontAwesome name="diamond" size={p.size} color={p.color} />
                ) : (
                  <View style={{ width: p.size, height: p.size, borderRadius: p.size / 2, backgroundColor: p.color }} />
                )}
              </Animated.View>
            );
          })}

          <Animated.View style={[{
            width: '90%',
            maxWidth: 380,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: '#DFBA73', // luxurious gold border
            overflow: 'hidden',
            backgroundColor: '#151515',
            transform: [{ scale: birthdayScale }],
            shadowColor: '#DFBA73',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
          }]}>
            <LinearGradient
              colors={['#181512', '#0D0B0A']}
              style={{ padding: 24, alignItems: 'center' }}
            >
              {/* Header brand tag */}
              <Text style={{
                fontSize: 12,
                color: '#DFBA73',
                fontFamily: TheOneTypography.bodyFamily,
                letterSpacing: 6,
                fontWeight: '600',
                marginBottom: 4,
                textTransform: 'uppercase',
              }}>
                ✦ T H E   O N E ✦
              </Text>
              
              <Text style={{
                fontSize: 10,
                color: '#A7A7A7',
                fontFamily: TheOneTypography.bodyFamily,
                letterSpacing: 2,
                fontWeight: '500',
                marginBottom: 20,
                textTransform: 'uppercase',
              }}>
                Exclusive Member Gift
              </Text>

              {/* Luxury Gift Card visual */}
              <View style={{
                width: '100%',
                aspectRatio: 1.58,
                borderRadius: 8,
                overflow: 'hidden',
                marginBottom: 24,
                borderWidth: 1,
                borderColor: 'rgba(223, 186, 115, 0.4)',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 5,
              }}>
                <LinearGradient
                  colors={['#DFBA73', '#C5A059', '#9E7A3B', '#C5A059', '#DFBA73']}
                  start={[0, 0]}
                  end={[1, 1]}
                  style={{
                    flex: 1,
                    padding: 16,
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View>
                      <Text style={{ color: '#0B0B0B', fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>BIRTHDAY VIP CREDIT</Text>
                      <Text style={{ color: 'rgba(11, 11, 11, 0.6)', fontSize: 7, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 }}>THE ONE CLUB & SANCTUARY</Text>
                    </View>
                    <FontAwesome name="bolt" size={24} color="#0B0B0B" />
                  </View>

                  <View style={{ marginVertical: 8 }}>
                    <Text style={{
                      color: '#0B0B0B',
                      fontSize: 36,
                      fontFamily: TheOneTypography.headlineFamily,
                      fontWeight: '800',
                      letterSpacing: 1,
                    }}>
                      ₹5,000
                    </Text>
                    <Text style={{ color: '#0B0B0B', fontSize: 8, fontWeight: '600', letterSpacing: 1.5, marginTop: 4 }}>BOARD ROOM BOOKING CREDIT</Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <View>
                      <Text style={{ color: 'rgba(11, 11, 11, 0.6)', fontSize: 7, fontWeight: '600' }}>MEMBERSHIP HOLDER</Text>
                      <Text style={{ color: '#0B0B0B', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 }}>{userProfile?.name?.toUpperCase() || 'VALUED MEMBER'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: 'rgba(11, 11, 11, 0.6)', fontSize: 7, fontWeight: '600' }}>VALIDITY</Text>
                      <Text style={{ color: '#0B0B0B', fontSize: 8, fontWeight: '700', marginTop: 2 }}>30 DAYS</Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              {/* Greeting Message */}
              <Text style={{
                fontSize: 22,
                fontFamily: TheOneTypography.headlineFamily,
                color: '#DFBA73',
                letterSpacing: 2,
                textAlign: 'center',
                marginBottom: 8,
              }}>
                HAPPY BIRTHDAY
              </Text>
              
              <Text style={{
                fontSize: 13,
                fontFamily: TheOneTypography.bodyFamily,
                color: '#F5F5F5',
                textAlign: 'center',
                lineHeight: 20,
                marginBottom: 24,
                letterSpacing: 0.3,
                paddingHorizontal: 10,
              }}>
                Wishing you a day of pure relaxation and wellness. We've credited <Text style={{ color: '#DFBA73', fontWeight: '700' }}>₹5,000</Text> to your profile to book the board room.
              </Text>

              {/* Refined Dismiss Button with local scale animation */}
              <Animated.View style={{ transform: [{ scale: dismissButtonScale }], width: '100%' }}>
                <Pressable
                  onPress={closeBirthdayPopup}
                  onPressIn={handleDismissPressIn}
                  onPressOut={handleDismissPressOut}
                  style={{ width: '100%' }}
                >
                  <LinearGradient
                    colors={['#DFBA73', '#9E7A3B']}
                    start={[0, 0]}
                    end={[1, 0]}
                    style={{
                      paddingVertical: 14,
                      borderRadius: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                    }}
                  >
                    <Text style={{ color: '#0B0B0B', fontWeight: '700', fontSize: 11, letterSpacing: 3 }}>
                      ACCEPT GIFT
                    </Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </Modal>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>PROFILE</Text>

      {/* User Information */}
      <View style={styles.userCard}>
        <PressSpring
          onPress={handlePickImage}
          style={[styles.avatarContainer, { borderColor: colors.border }]}
          scaleTo={0.93}
          hapticStyle="selection"
          fullWidth={false}
        >
          {userProfile?.avatarUrl ? (
            <Image source={{ uri: userProfile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <FontAwesome name="user-circle" size={60} color={(isGold || isWellness || isTrial) ? TheOneColors.accent : colors.secondaryText} style={{ alignSelf: 'center' }} />
          )}
          <View style={styles.cameraOverlay}>
            <FontAwesome name="camera" size={10} color="#FFFFFF" />
          </View>
        </PressSpring>

        {!isEditing ? (
          <View style={styles.infoCenter}>
            <Text style={[styles.phoneText, { color: colors.text }]}>
              {userProfile?.name || 'Athlete'}
            </Text>
            <Text style={[styles.genderText, { color: colors.secondaryText }]}>
              Gender: {userProfile?.gender || 'Female'} • {user?.phoneNumber}
            </Text>
            {userProfile?.birthday && (
              <Text style={[styles.genderText, { color: colors.secondaryText, marginTop: 4 }]}>
                🎂 Birthday: {(() => {
                  const parts = userProfile.birthday.split('-');
                  if (parts.length === 2) {
                    const [mm, dd] = parts;
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return `${dd} ${months[parseInt(mm, 10) - 1]}`;
                  }
                  return userProfile.birthday;
                })()}
              </Text>
            )}
            <PressSpring 
              onPress={() => setIsEditing(true)} 
              contentStyle={styles.editBtn}
              scaleTo={0.95}
              hapticStyle="light"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome name="pencil" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.editBtnText}>Edit Details</Text>
              </View>
            </PressSpring>
          </View>
        ) : (
          <View style={styles.editForm}>
            <Text style={{ color: colors.secondaryText, fontSize: 11, fontWeight: '700', marginBottom: 4, textAlign: 'center' }}>FULL NAME</Text>
            <TextInput
              style={[
                {
                  backgroundColor: 'transparent',
                  borderWidth: 0,
                  borderBottomWidth: 1,
                  borderBottomColor: TheOneColors.accent,
                  paddingVertical: 10,
                  paddingHorizontal: 0,
                  color: TheOneColors.textPrimary,
                  fontSize: 16,
                  fontFamily: TheOneTypography.bodyFamily,
                  textAlign: 'center',
                  marginBottom: 16,
                },
                Platform.select({ web: { outlineStyle: 'none' } }) as any
              ]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your Name"
              placeholderTextColor="#8A8A8F"
            />
            
            <Text style={{ color: colors.secondaryText, fontSize: 11, fontWeight: '700', marginBottom: 4, textAlign: 'center' }}>BIRTHDAY (DD-MM)</Text>
            <TextInput
              style={[
                {
                  backgroundColor: 'transparent',
                  borderWidth: 0,
                  borderBottomWidth: 1,
                  borderBottomColor: TheOneColors.accent,
                  paddingVertical: 10,
                  paddingHorizontal: 0,
                  color: TheOneColors.textPrimary,
                  fontSize: 16,
                  fontFamily: TheOneTypography.bodyFamily,
                  textAlign: 'center',
                  marginBottom: 16,
                },
                Platform.select({ web: { outlineStyle: 'none' } }) as any
              ]}
              value={editBirthday}
              onChangeText={setEditBirthday}
              placeholder="e.g. 15-07"
              placeholderTextColor="#8A8A8F"
              keyboardType="numbers-and-punctuation"
            />
            


            <View style={styles.editActionRow}>
              <PressSpring 
                style={{ width: '48%' }}
                contentStyle={styles.cancelBtn}
                onPress={() => setIsEditing(false)}
                scaleTo={0.95}
                hapticStyle="light"
                fullWidth={true}
              >
                <Text style={[styles.cancelBtnText, { textAlign: 'center' }]}>Cancel</Text>
              </PressSpring>

              <PressSpring
                style={{ width: '48%' }}
                contentStyle={[
                  styles.saveBtn,
                  { borderColor: TheOneColors.accent, borderWidth: 1.5, backgroundColor: 'transparent' },
                  isSaving && { opacity: 0.6 }
                ]}
                onPress={handleSaveProfile}
                disabled={isSaving}
                scaleTo={0.94}
                hapticStyle="medium"
                fullWidth={true}
              >
                {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.saveBtnText, { textAlign: 'center' }]}>Save</Text>}
              </PressSpring>
            </View>
          </View>
        )}
      </View>



      {/* Apple Wallet Inspired Digital Pass */}
      <View style={[
        styles.walletCard,
        {
          borderColor: (isGold || isWellness || isTrial) ? TheOneColors.accent : TheOneColors.charcoalBorder,
          borderWidth: 1.5,
          backgroundColor: '#121214',
        }
      ]}>
        {/* Pass Header */}
        <View style={styles.walletHeader}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={styles.walletLogoPrefix}>T H E   O</Text>
              <View style={styles.walletCustomN}>
                <View style={styles.walletCustomNLegLeft} />
                <View style={styles.walletCustomNLegRight} />
                <View style={styles.walletCustomNBar} />
              </View>
              <Text style={styles.walletLogoSuffix}>E</Text>
            </View>
            <Text style={styles.walletSubtitle}>LUXURY WELLNESS CLUB</Text>
          </View>
          <View style={[
            styles.walletBadge,
            { backgroundColor: (isGold || isWellness || isTrial) ? 'rgba(184, 70, 0, 0.1)' : 'rgba(255,255,255,0.05)' }
          ]}>
            <Text style={[
              styles.walletBadgeText,
              { color: (isGold || isWellness || isTrial) ? TheOneColors.accent : '#8E8E93' }
            ]}>
              {isGold ? 'GOLD MEMBER' : isTrial ? 'TRIAL PASS' : isWellness ? 'WELLNESS MEMBER' : 'BASIC ENTRY'}
            </Text>
          </View>
        </View>

        {/* Pass Details Grid */}
        <View style={styles.walletDetailsGrid}>
          <View style={styles.walletDetailCol}>
            <Text style={styles.walletLabel}>CARD HOLDER</Text>
            <Text style={styles.walletValue}>{userProfile?.name?.toUpperCase() || 'ATHLETE'}</Text>
          </View>
          <View style={[styles.walletDetailCol, { alignItems: 'flex-end' }]}>
            <Text style={styles.walletLabel}>VALID THRU</Text>
            <Text style={styles.walletValue}>
              {userProfile?.membershipEndDate
                ? (new Date(userProfile.membershipEndDate).getTime() < Date.now() ? 'EXPIRED' : userProfile.membershipEndDate.split('T')[0])
                : (isTrial 
                  ? (userProfile?.trialEndDate?.split('T')[0] || 'EXPIRED')
                  : (isGold 
                    ? 'UNLIMITED' 
                    : 'ACTIVE'))}
            </Text>
          </View>
        </View>

        {/* Description / Rules */}
        <Text style={styles.walletDescText}>
          {isGold
            ? 'No limits. Unlimited bookings. Priority access to massage rooms and recovery chambers.'
            : isTrial
              ? 'Trial Membership: Max usage 90 mins per visit. Yoga/Pilates/Kickboxing: max 2 sessions/week.'
              : isWellness
              ? 'Wellness Membership: Access to premium wellness services. Max 2 sessions/week.'
              : 'Max usage: 90 mins per visit. Yoga/Pilates/Kickboxing sessions: max 2 sessions per week.'}
        </Text>

        <View style={styles.walletDivider} />

        {/* Barcode Visual Section */}
        <View style={styles.barcodeSection}>
          <View style={styles.barcodeContainer}>
            <View style={[styles.barcodeBar, { width: 3, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 1, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 4, marginRight: 1 }]} />
            <View style={[styles.barcodeBar, { width: 2, marginRight: 3 }]} />
            <View style={[styles.barcodeBar, { width: 1, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 3, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 4, marginRight: 1 }]} />
            <View style={[styles.barcodeBar, { width: 2, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 1, marginRight: 3 }]} />
            <View style={[styles.barcodeBar, { width: 3, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 4, marginRight: 1 }]} />
            <View style={[styles.barcodeBar, { width: 2, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 1, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 3, marginRight: 1 }]} />
            <View style={[styles.barcodeBar, { width: 4, marginRight: 3 }]} />
            <View style={[styles.barcodeBar, { width: 2, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 1, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 3, marginRight: 3 }]} />
            <View style={[styles.barcodeBar, { width: 4, marginRight: 1 }]} />
            <View style={[styles.barcodeBar, { width: 2, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 1, marginRight: 2 }]} />
            <View style={[styles.barcodeBar, { width: 3, marginRight: 1 }]} />
            <View style={[styles.barcodeBar, { width: 4, marginRight: 3 }]} />
            <View style={[styles.barcodeBar, { width: 2, marginRight: 2 }]} />
          </View>
          <Text style={styles.barcodeText}>*ONE-{user?.phoneNumber?.slice(-4)}*</Text>
        </View>
      </View>

      {/* Statistics Section */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{totalBookingsCount}</Text>
          <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Total Bookings</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: dues.length > 0 ? TheOneColors.accent : colors.text }]}>{dues.length}</Text>
          <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Active Dues</Text>
        </View>
      </View>

      {/* Active Dues Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Unpaid Dues</Text>
        {dues.length === 0 ? (
          <View style={[styles.emptySectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FontAwesome name="check-circle" size={24} color={TheOneColors.success} style={{ marginBottom: 6 }} />
            <Text style={[styles.emptySectionText, { color: colors.secondaryText }]}>No outstanding dues. You are all set!</Text>
          </View>
        ) : (
          dues.map((due) => (
            <View key={due.id} style={[styles.dueRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.dueDetails}>
                <Text style={[styles.dueTitle, { color: colors.text }]}>{due.serviceName}</Text>
                <Text style={[styles.dueSub, { color: colors.secondaryText }]}>Issued: {formatDateDMY(due.date)}</Text>
              </View>
              <View style={styles.duePayArea}>
                <Text style={[styles.dueAmount, { marginRight: 0 }]}>₹{due.amount}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Transaction & Payment History Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Payment History</Text>
        {payments.length === 0 ? (
          <View style={[styles.emptySectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FontAwesome name="history" size={24} color={colors.secondaryText} style={{ marginBottom: 6 }} />
            <Text style={[styles.emptySectionText, { color: colors.secondaryText }]}>No past transactions found.</Text>
          </View>
        ) : (
          payments.slice(0, 10).map((pay) => (
            <View key={pay.id} style={[styles.payHistoryRow, { borderBottomColor: colors.border }]}>
              <View style={styles.payDetails}>
                <Text style={[styles.payTitle, { color: colors.text }]}>{pay.serviceName}</Text>
                <Text style={[styles.paySub, { color: colors.secondaryText }]}>{formatDateDMY(pay.date)} • {pay.paymentMethod}</Text>
              </View>
              <Text style={styles.payAmount}>+₹{pay.amount}</Text>
            </View>
          ))
        )}
      </View>

      {/* Admin Panel access if admin */}
      {userProfile?.isAdmin && (
        <View style={styles.adminSection}>
          <Link href="/(admin)" asChild>
            <PressSpring 
              contentStyle={styles.adminBtn}
              scaleTo={0.94}
              hapticStyle="heavy"
              fullWidth={true}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <FontAwesome name="cog" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
                <Text style={styles.adminBtnText}>Admin Console</Text>
              </View>
            </PressSpring>
          </Link>
        </View>
      )}

      {/* Logout Button */}
      <PressSpring
        contentStyle={[styles.logoutButton, { backgroundColor: TheOneColors.charcoal, borderColor: 'rgba(255,255,255,0.08)', width: '100%' }]}
        onPress={handleLogout}
        scaleTo={0.94}
        hapticStyle="heavy"
        fullWidth={true}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <FontAwesome name="sign-out" size={18} color={TheOneColors.error} style={{ marginRight: 10 }} />
          <Text style={[styles.logoutText, { color: TheOneColors.error }]}>LOG OUT</Text>
        </View>
      </PressSpring>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 110,
  },
  headerTitle: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    letterSpacing: 2.5,
    marginTop: 10,
    marginBottom: 24,
  },
  userCard: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  infoCenter: {
    alignItems: 'center',
  },
  phoneText: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: TheOneTypography.headlineFamily,
    letterSpacing: 0.2,
  },
  genderText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 4,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  editBtnText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  editForm: {
    width: '100%',
    paddingHorizontal: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 12,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  genderSelectionBtn: {
    width: '48%',
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderBtnText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  editActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelBtn: {
    width: '48%',
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveBtn: {
    width: '48%',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: TheOneColors.textPrimary,
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  walletCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  walletLogoPrefix: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
    lineHeight: 18,
  },
  walletLogoSuffix: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
    lineHeight: 18,
  },
  walletCustomN: {
    width: 11,
    height: 12,
    marginHorizontal: 3,
    marginBottom: 2,
    position: 'relative',
  },
  walletCustomNLegLeft: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 2.2,
    height: 12,
    backgroundColor: TheOneColors.accent,
  },
  walletCustomNLegRight: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 2.2,
    height: 12,
    backgroundColor: TheOneColors.accent,
  },
  walletCustomNBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2.2,
    backgroundColor: TheOneColors.accent,
  },
  walletSubtitle: {
    color: '#8E8E93',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 2,
  },
  walletBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  walletBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  walletDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  walletDetailCol: {
    flex: 1,
  },
  walletLabel: {
    color: '#8E8E93',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  walletValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  walletDescText: {
    color: '#D1D1D6',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    opacity: 0.9,
    marginBottom: 16,
  },
  walletDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },
  barcodeSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  barcodeContainer: {
    flexDirection: 'row',
    height: 36,
    alignItems: 'stretch',
    opacity: 0.85,
  },
  barcodeBar: {
    backgroundColor: '#FFFFFF',
    height: '100%',
  },
  barcodeText: {
    color: '#8E8E93',
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  statBox: {
    width: '48%',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  emptySectionCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySectionText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  dueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
  },
  dueDetails: {
    flex: 1,
  },
  dueTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  dueSub: {
    fontSize: 12,
    marginTop: 2,
  },
  duePayArea: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: TheOneColors.accent,
    marginRight: 12,
  },
  payButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  payButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  payHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  payDetails: {
    flex: 1,
  },
  payTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  paySub: {
    fontSize: 12,
    marginTop: 2,
  },
  payAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: TheOneColors.success,
  },
  adminSection: {
    marginBottom: 20,
  },
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    paddingVertical: 16,
  },
  adminBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 16,
  },
  logoutText: {
    color: TheOneColors.error,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
  },
  settingsCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingRow: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingIcon: {
    width: 24,
    textAlign: 'center',
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  themeSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  themeOptionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 20,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: TheOneColors.accent,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: TheOneColors.black,
  },
});
