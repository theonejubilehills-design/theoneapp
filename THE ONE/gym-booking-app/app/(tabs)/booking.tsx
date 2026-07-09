import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, TouchableOpacity, Alert, Modal, Image, Animated, View } from 'react-native';
import { Text } from '@/components/Themed';
import { playClickSound, preloadSound } from '../../utils/SoundManager';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookingCard } from '@/components/BookingCard';
import CustomAlertModal, { AlertButton } from '@/components/CustomAlertModal';
import FeedbackModal from '@/components/FeedbackModal';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useRouter, Redirect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { updateDoc, doc, deleteDoc, getDocs, addDoc, increment } from 'firebase/firestore';
import PressSpring from '@/components/PressSpring';

interface Booking {
  id: string;
  equipment: string;
  subService?: string;
  date: string;
  time: string;
  createdAt: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'pending_join_request' | 'pending' | 'pending_group_fill';
  updatedByAdmin?: boolean;
  updatedAt?: string;
  lastChangeSummary?: string;
  therapistName?: string;
  trainerName?: string;
  pilatesLevel?: string;
  steamSaunaIncluded?: boolean;
  feedbackSubmitted?: boolean;
  saunaCategory?: string;
  saunaType?: 'sauna' | 'steam' | null;
  isJoiner?: boolean;
  hostName?: string;
  userId?: string;
  primaryBookingId?: string;
}


export default function DashboardScreen() {
  const { user, userProfile, logout } = useAuth();
  const router = useRouter();
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };

  useEffect(() => {
    preloadSound();
  }, []);

  // Staggered entrance animations (5 blocks: Header, Dues/Insight, Sauna Approvals, Upcoming, Past)
  const entranceAnims = useRef(
    Array.from({ length: 5 }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(20),
    }))
  ).current;

  useEffect(() => {
    const animations = entranceAnims.map((anim) => {
      return Animated.parallel([
        Animated.timing(anim.opacity, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.spring(anim.translateY, {
          toValue: 0,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
      ]);
    });

    Animated.stagger(100, animations).start();
  }, []);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [dues, setDues] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // Notifications real-time listener
  useEffect(() => {
    if (!user?.phoneNumber) return;

    const qNotifs = query(
      collection(db, 'in_app_notifications'),
      where('userId', '==', user.phoneNumber)
    );
    const unsubscribeNotifs = onSnapshot(
      qNotifs,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setNotifications(list);
      },
      (error) => {
        console.warn('Firestore notifs sub failed:', error);
      }
    );
    return () => unsubscribeNotifs();
  }, [user?.phoneNumber]);

  // Dues real-time listener
  useEffect(() => {
    if (!user?.phoneNumber) return;

    const qDues = query(
      collection(db, 'dues'),
      where('userId', '==', user.phoneNumber),
      where('status', '==', 'pending')
    );
    const unsubscribeDues = onSnapshot(
      qDues,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        setDues(list);
      },
      (error) => {
        console.warn('Firestore dues sub failed:', error);
      }
    );
    return () => unsubscribeDues();
  }, [user?.phoneNumber]);

  // Bookings real-time listener
  useEffect(() => {
    if (!user?.phoneNumber) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'bookings'),
      where('userId', '==', user.phoneNumber)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Booking[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          list.push({
            id: doc.id,
            equipment: data.serviceId || data.equipment || '',
            date: data.date || '',
            time: data.time || '',
            createdAt: data.createdAt || new Date().toISOString(),
            status: data.status || 'confirmed',
            updatedByAdmin: data.updatedByAdmin || false,
            updatedAt: data.updatedAt,
            lastChangeSummary: data.lastChangeSummary,
            therapistName: data.therapistName,
            trainerName: data.trainerName,
            pilatesLevel: data.pilatesLevel,
            steamSaunaIncluded: data.steamSaunaIncluded,
            feedbackSubmitted: data.feedbackSubmitted || false,
            saunaCategory: data.saunaCategory,
            isJoiner: data.isJoiner,
            hostName: data.hostName,
            userId: data.userId,
            primaryBookingId: data.primaryBookingId,
            subService: data.subService,
          });
        });

        // Sort by createdAt descending client-side
        const sortedList = list.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setBookings(sortedList);
        setLoading(false);
      },
      (error) => {
        console.warn('Firestore bookings sub failed:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.phoneNumber]);

  // Feedback Request Logic
  const [feedbackBooking, setFeedbackBooking] = useState<any>(null);
  
  useEffect(() => {
    if (bookings.length === 0) return;

    const parseTimeToMinutes = (timeStr?: string) => {
      if (!timeStr || !timeStr.includes(':')) return 0;
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (hours === 12) hours = 0;
      if (modifier === 'PM') hours += 12;
      return hours * 60 + minutes;
    };

    const getLocalDateString = () => {
      const d = new Date();
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${da}`;
    };

    const todayDateStr = getLocalDateString();
    const currentMins = new Date().getHours() * 60 + new Date().getMinutes();

    // Find the first confirmed booking that is in the past and hasn't been reviewed
    const unreviewed = bookings.find(b => {
      if (b.status !== 'confirmed') return false;
      if (b.feedbackSubmitted) return false;
      
      if (b.date < todayDateStr) return true; // past day
      if (b.date === todayDateStr) {
        // check if end time passed
        const endPart = b.time.split(' - ')[1];
        if (endPart) {
          const endMins = parseTimeToMinutes(endPart);
          if (endMins > 0 && currentMins >= endMins) return true; // time has passed today
        }
      }
      return false;
    });

    if (unreviewed && !feedbackBooking) {
      setFeedbackBooking(unreviewed);
    }
  }, [bookings]);

  // Check membership expiry and issue renewal notification
  useEffect(() => {
    if (!userProfile || !user?.phoneNumber) return;

    const expiryDateStr = userProfile.membershipEndDate || userProfile.trialEndDate;
    if (!expiryDateStr) return;

    const expiryDate = new Date(expiryDateStr);
    const now = new Date();

    if (now.getTime() > expiryDate.getTime()) {
      if (!userProfile.expiryNotificationSent) {
        const sendExpiryNotification = async () => {
          try {
            // Write notification document
            await addDoc(collection(db, 'in_app_notifications'), {
              userId: user.phoneNumber,
              title: 'Membership Expired',
              body: `Your ${userProfile.membershipType} membership expired on ${expiryDateStr.split('T')[0]}. Please contact the admin to renew.`,
              read: false,
              createdAt: new Date().toISOString()
            });

            // Set flag on user profile doc in Firestore to avoid duplicate writes
            await updateDoc(doc(db, 'users', user.phoneNumber), {
              expiryNotificationSent: true
            });
            console.log(`[ExpiryCheck] Expiration notification sent successfully for user ${user.phoneNumber}`);
          } catch (e) {
            console.error('Failed to create expiry notification or update userProfile flag:', e);
          }
        };
        sendExpiryNotification();
      }
    }
  }, [userProfile, user?.phoneNumber]);

  // Multiplayer Sauna Logic
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  useEffect(() => {
    if (!user?.phoneNumber) return;
    const q = query(
      collection(db, 'join_requests'),
      where('primaryUserId', '==', user.phoneNumber),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setJoinRequests(list);
    });
    return () => unsubscribe();
  }, [user?.phoneNumber]);

  // Group members logic (no longer relies on pending_group_fill)

  const acceptJoinRequest = async (req: any) => {
    try {
      // 1. Update request status
      await updateDoc(doc(db, 'join_requests', req.id), { status: 'accepted' });
      
      const isGroup = req.saunaCategory === 'Group (2-8)';

      // 2. Update primary booking
      if (!isGroup) {
        await updateDoc(doc(db, 'bookings', req.primaryBookingId), { status: 'confirmed' });
      }

      // 3. Find the requester's booking and confirm it
      const q = query(collection(db, 'bookings'), where('primaryBookingId', '==', req.primaryBookingId), where('userId', '==', req.requesterId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, 'bookings', snap.docs[0].id), { status: 'confirmed' });
      }
      showAlert('Success', `${req.requesterName} has been added to your session!`);
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to accept request.');
    }
  };

  const rejectJoinRequest = async (req: any) => {
    try {
      await updateDoc(doc(db, 'join_requests', req.id), { status: 'rejected' });
      const q = query(collection(db, 'bookings'), where('primaryBookingId', '==', req.primaryBookingId), where('userId', '==', req.requesterId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, 'bookings', snap.docs[0].id), { status: 'cancelled' });
      }
      showAlert('Rejected', 'Request rejected.');
    } catch (e) {
      console.error(e);
    }
  };

  const confirmGroupBooking = async (booking: any) => {
    try {
      await updateDoc(doc(db, 'bookings', booking.id), { status: 'confirmed' });
      const q = query(collection(db, 'bookings'), where('primaryBookingId', '==', booking.id));
      const snap = await getDocs(q);
      const updatePromises = snap.docs.map(d => updateDoc(doc(db, 'bookings', d.id), { status: 'confirmed' }));
      await Promise.all(updatePromises);
      showAlert('Group Confirmed', 'Your group session is fully booked and confirmed!');
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Failed to confirm group.');
    }
  };

  const formatEquipmentName = (id: string) => {
    const map: Record<string, string> = {
      cryochamber: 'Cryochamber',
      cryo: 'Cryo Chamber',
      sauna: 'Sauna',
      'squat-rack': 'Pro Squat Rack',
      massage: 'Massage Gun Station',
      'general-massage': 'Massages',
      physio: 'Physiotherapy',
      salon: 'Hair Salon (Unisex)',
      yoga: 'Yoga',
      pilates: 'Pilates',
      kickboxing: 'Kickboxing',
    };
    return map[id] || id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatDateDMY = (dateStr?: string): string => {
    if (!dateStr) return '';
    const datePart = dateStr.split('T')[0];
    const parts = datePart.split('-');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return dateStr;
  };

  // Dynamic Goal Progress calculations
  const upcomingBookings = bookings.filter(b => ['confirmed', 'pending_join_request'].includes(b.status));
  const pastBookings = bookings.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show');
  const totalBookings = upcomingBookings.length;
  const isGold = userProfile?.membershipType === 'Gold';

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleReadNotification = async (notif: any) => {
    if (!notif.read) {
      try {
        await updateDoc(doc(db, 'in_app_notifications', notif.id), { read: true });
      } catch (e) {
        console.warn('Failed to mark read', e);
      }
    }
    setShowNotifications(false);
    router.push('/(tabs)');
  };

  const handleCancelUserBooking = (booking: Booking) => {
    const dateParts = booking.date.split('-');
    const [timeStartStr] = booking.time.split(' - ');
    const isPM = timeStartStr.includes('PM');
    const [hourStr, minStr] = timeStartStr.replace(' AM', '').replace(' PM', '').split(':');
    let hour = parseInt(hourStr);
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    const sessionStart = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), hour, parseInt(minStr));
    const now = new Date();
    
    const hoursUntilSession = (sessionStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isNoShow = hoursUntilSession <= 2 && hoursUntilSession >= 0;
    const finalStatus = isNoShow ? 'no_show' : 'cancelled';

    const alertMessage = 'Are you sure you want to cancel this booking?';

    showAlert(
      'Cancel Session',
      alertMessage,
      [
        { text: 'No, Keep It', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Cancel booking
              await updateDoc(doc(db, 'bookings', booking.id), {
                status: finalStatus,
                cancelledAt: new Date().toISOString()
              });

              if (isNoShow && booking.userId) {
                const userRef = doc(db, 'users', booking.userId);
                await updateDoc(userRef, {
                  noShowCount: increment(1)
                });
              }
              
              // 1b. If this is a Host booking, cascade cancel to all joiners
              if (!booking.isJoiner && (booking.saunaCategory === 'Couple' || booking.saunaCategory === 'Group (2-8)')) {
                const joinerQ = query(collection(db, 'bookings'), where('primaryBookingId', '==', booking.id));
                const joinerSnap = await getDocs(joinerQ);
                const joinerUpdates = joinerSnap.docs.map(d => updateDoc(doc(db, 'bookings', d.id), { 
                  status: finalStatus, 
                  cancelledByHost: true,
                  cancelledAt: new Date().toISOString()
                }));
                await Promise.all(joinerUpdates);

                // also delete all pending join requests for this host
                const reqQ = query(collection(db, 'join_requests'), where('primaryBookingId', '==', booking.id));
                const reqSnap = await getDocs(reqQ);
                const reqDeletes = reqSnap.docs.map(d => deleteDoc(doc(db, 'join_requests', d.id)));
                await Promise.all(reqDeletes);
              }

              // 1c. If this is a Joiner booking, delete their pending join request
              if (booking.isJoiner) {
                const reqQ = query(
                  collection(db, 'join_requests'), 
                  where('primaryBookingId', '==', booking.primaryBookingId),
                  where('requesterId', '==', booking.userId)
                );
                const reqSnap = await getDocs(reqQ);
                const reqDeletes = reqSnap.docs.map(d => deleteDoc(doc(db, 'join_requests', d.id)));
                await Promise.all(reqDeletes);
              }
              
              // 2. Find pending dues and delete them
              if (user?.phoneNumber) {
                const duesQ = query(
                  collection(db, 'dues'),
                  where('userId', '==', user.phoneNumber),
                  where('status', '==', 'pending')
                );
                const duesSnap = await getDocs(duesQ);
                const matchingDues = duesSnap.docs.filter(d => {
                  const data = d.data();
                  return data.date === booking.date && data.serviceName === formatEquipmentName(booking.equipment);
                });
                const deletePromises = matchingDues.map(d => deleteDoc(doc(db, 'dues', d.id)));
                await Promise.all(deletePromises);
              }
              
              // 3. Handle waitlist notifications
              const waitlistQ = query(
                collection(db, 'waitlists'),
                where('serviceId', '==', booking.equipment),
                where('date', '==', booking.date),
                where('time', '==', booking.time)
              );
              const waitlistSnap = await getDocs(waitlistQ);
              
              if (!waitlistSnap.empty) {
                const notifyPromises = waitlistSnap.docs.map(wDoc => {
                  const wData = wDoc.data();
                  return addDoc(collection(db, 'in_app_notifications'), {
                    userId: wData.userId,
                    title: 'Spot Available!',
                    body: `A spot just opened up for ${wData.serviceName || 'your selected class'} on ${formatDateDMY(booking.date)} at ${booking.time}. Book it now before it's gone!`,
                    read: false,
                    createdAt: new Date().toISOString()
                  });
                });
                await Promise.all(notifyPromises);
                
                const deleteWaitlistPromises = waitlistSnap.docs.map(wDoc => deleteDoc(doc(db, 'waitlists', wDoc.id)));
                await Promise.all(deleteWaitlistPromises);
              }
              
              showAlert('Success', 'Your booking has been cancelled successfully.');
              
            } catch (err) {
              console.error(err);
              showAlert('Error', 'Failed to cancel the booking. Please try again.');
            }
          }
        }
      ]
    );
  };

  const getMembershipLabel = () => {
    if (userProfile?.membershipType === 'Gold') return 'GOLD MEMBER';
    if (userProfile?.membershipType === 'Trial') return 'TRIAL ACCESS';
    if (userProfile?.membershipType === 'Wellness') return 'WELLNESS PLAN';
    return 'BASIC MEMBER';
  };

  const getMembershipColor = (): [string, string] => {
    if (userProfile?.membershipType === 'Gold') return ['#D4AF37', '#AA7C11']; 
    if (userProfile?.membershipType === 'Trial') return ['#CD7F32', '#9C561A']; 
    if (userProfile?.membershipType === 'Wellness') return ['#4E9F3D', '#1E5128']; 
    return ['#6C757D', '#495057']; 
  };



  if (userProfile?.isAdmin) {
    return <Redirect href="/(admin)" />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <Modal
        visible={showNotifications}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontFamily: TheOneTypography.headlineFamily, color: colors.text }}>Notifications</Text>
            <PressSpring onPress={() => { playClickSound(); setShowNotifications(false); }} scaleTo={0.88} hapticStyle="selection" fullWidth={false}>
              <FontAwesome name="times" size={20} color={colors.secondaryText} />
            </PressSpring>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
            {notifications.length === 0 ? (
              <Text style={{ color: colors.secondaryText, marginTop: 40, textAlign: 'center', fontFamily: TheOneTypography.bodyFamily }}>You have no notifications right now.</Text>
            ) : (
              notifications.map(notif => (
                <PressSpring 
                  key={notif.id} 
                  contentStyle={{
                    backgroundColor: notif.read ? 'transparent' : 'rgba(184, 70, 0, 0.08)',
                    padding: 16, 
                    borderRadius: 12, 
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: notif.read ? colors.border : TheOneColors.accentBorder
                  }}
                  onPress={() => { playClickSound(); handleReadNotification(notif); }}
                  scaleTo={0.97}
                  hapticStyle="light"
                  fullWidth={true}
                >
                  <View>
                    <Text style={{ fontSize: 15, fontFamily: TheOneTypography.bodyFamily, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{notif.title}</Text>
                    <Text style={{ fontSize: 13, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText }}>{notif.body}</Text>
                  </View>
                </PressSpring>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
        <Text style={{ fontSize: 28, fontFamily: TheOneTypography.headlineFamily, color: colors.text, marginTop: 10 }}>CLUB DASHBOARD</Text>
        <Text style={{ fontSize: 14, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText, marginTop: 6, marginBottom: 24 }}>Manage your bookings, approvals & history</Text>

      {/* Block 2: Pending Sauna Approvals */}
      <Animated.View style={{ opacity: entranceAnims[2].opacity, transform: [{ translateY: entranceAnims[2].translateY }] }}>
        {(joinRequests.length > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Pending Sauna Approvals</Text>
            
            {joinRequests.map(req => (
              <View key={req.id} style={{ backgroundColor: colors.card, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: TheOneColors.accentBorder, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <FontAwesome name={req.saunaCategory === 'Group (2-8)' ? 'users' : 'heart'} size={14} color={TheOneColors.accent} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 16, fontFamily: TheOneTypography.headlineFamily, color: colors.text }}>{req.saunaCategory === 'Group (2-8)' ? 'Group Request' : 'Couple Request'}</Text>
                </View>
                <Text style={{ fontSize: 13, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText, marginBottom: 12 }}>
                  <Text style={{ fontWeight: '600', color: colors.text }}>{req.requesterName}</Text> wants to join your {req.serviceName} session on {formatDateDMY(req.date)} at {req.time}.
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PressSpring 
                    style={{ flex: 1 }}
                    contentStyle={{
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: TheOneColors.error,
                      backgroundColor: 'transparent',
                      alignItems: 'center',
                    }}
                    onPress={() => { playClickSound(); rejectJoinRequest(req); }}
                  >
                    <Text style={{ color: TheOneColors.error, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>REJECT</Text>
                  </PressSpring>
                  <PressSpring 
                    style={{ flex: 1 }}
                    contentStyle={{
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: TheOneColors.accent,
                      backgroundColor: 'transparent',
                      alignItems: 'center',
                    }}
                    onPress={() => { playClickSound(); acceptJoinRequest(req); }}
                  >
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>ACCEPT</Text>
                  </PressSpring>
                </View>
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      {/* Block 3: Bookings Section */}
      <Animated.View style={{ opacity: entranceAnims[3].opacity, transform: [{ translateY: entranceAnims[3].translateY }] }}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Bookings</Text>
            <Pressable style={styles.viewAllButton}>
              <Text style={[styles.viewAllText, { color: colors.tint }]}>See all ({totalBookings})</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : upcomingBookings.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <FontAwesome name="calendar-o" size={32} color={colors.secondaryText} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No upcoming bookings</Text>
              <Text style={[styles.emptySubtext, { color: colors.secondaryText }]}>Book a facility recovery session to get started</Text>
            </View>
          ) : (
            upcomingBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                bookingId={booking.id}
                equipment={formatEquipmentName(booking.equipment)}
                subService={booking.subService}
                time={booking.time}
                date={booking.date}
                status={booking.status}
                therapistName={booking.therapistName}
                trainerName={booking.trainerName}
                pilatesLevel={booking.pilatesLevel}
                steamSaunaIncluded={booking.steamSaunaIncluded}
                saunaCategory={booking.saunaCategory}
                isJoiner={booking.isJoiner}
                hostName={booking.hostName}
                onCancel={() => handleCancelUserBooking(booking)}
              />
            ))
          )}
        </View>
      </Animated.View>

      {/* Block 4: Past Bookings Section */}
      <Animated.View style={{ opacity: entranceAnims[4].opacity, transform: [{ translateY: entranceAnims[4].translateY }] }}>
        <View style={[styles.section, { marginTop: 10 }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Past Bookings</Text>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="small" color={colors.tint} />
            </View>
          ) : pastBookings.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <FontAwesome name="history" size={32} color={colors.secondaryText} style={{ marginBottom: 12 }} />
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No past sessions yet</Text>
            </View>
          ) : (
            pastBookings.map((booking) => (
              <BookingCard 
                key={booking.id}
                bookingId={booking.id}
                equipment={formatEquipmentName(booking.equipment)} 
                subService={booking.subService}
                date={booking.date} 
                time={booking.time} 
                status={booking.status}
                updatedByAdmin={booking.updatedByAdmin}
                lastChangeSummary={booking.lastChangeSummary}
                therapistName={booking.therapistName}
                trainerName={booking.trainerName}
                pilatesLevel={booking.pilatesLevel}
                steamSaunaIncluded={booking.steamSaunaIncluded}
                saunaCategory={booking.saunaCategory}
                isJoiner={booking.isJoiner}
                hostName={booking.hostName}
              />
            ))
          )}
        </View>
      </Animated.View>
      <FeedbackModal 
        visible={!!feedbackBooking} 
        booking={feedbackBooking} 
        userProfile={userProfile}
        onClose={() => setFeedbackBooking(null)}
        onSubmitted={() => setFeedbackBooking(null)}
      />
      </ScrollView>

      {/* Global Alert Modal */}
      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />

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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    backgroundColor: 'transparent',
  },
  headerTextContainer: {
    backgroundColor: 'transparent',
  },
  greeting: {
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    opacity: 0.6,
  },
  name: {
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TheOneColors.charcoal,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  progressCard: {
    flexDirection: 'row',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    alignItems: 'center',
    marginBottom: 32,
  },
  progressRingWrapper: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  progressRingBackground: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 6,
  },
  progressRingActive: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 6,
    transform: [{ rotate: '45deg' }],
  },
  progressRingCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  progressRingText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  progressRingSubtext: {
    fontSize: 10,
    fontWeight: '500',
  },
  progressDetails: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  progressDesc: {
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 16,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  section: {
    backgroundColor: 'transparent',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    letterSpacing: 0.5,
  },
  viewAllButton: {
    backgroundColor: 'transparent',
  },
  viewAllText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    letterSpacing: 1,
  },
  centerContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: TheOneTypography.bodyFamily,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    textAlign: 'center',
  },
  duesAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  duesAlertText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
    flex: 1,
  },
  membershipPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    backgroundColor: TheOneColors.charcoal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  membershipBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: TheOneColors.accent,
    fontFamily: TheOneTypography.bodyFamily,
  },
  classLimitCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 32,
  },
  classLimitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  classLimitTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  classLimitCount: {
    fontSize: 15,
    fontWeight: '700',
  },
  classLimitDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    padding: 30,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  popupIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  popupTitle: {
    fontSize: 20,
    fontFamily: TheOneTypography.headlineFamily,
    marginBottom: 10,
    textAlign: 'center',
  },
  popupMessage: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  popupButton: {
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  popupButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    backgroundColor: 'transparent',
  },
  statsCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'flex-start',
  },
  statsValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  ntcBanner: {
    marginBottom: 32,
  },
  ntcBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  ntcBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  ntcBannerDesc: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  // Hero banner styles
  heroBannerCard: {
    height: 190,
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 12,
  },
  heroBannerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroBannerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroBannerContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    backgroundColor: 'transparent',
  },
  heroBannerTopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  heroBannerBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: TheOneColors.accent,
    textTransform: 'uppercase',
  },
  heroBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: 10,
    fontFamily: TheOneTypography.headlineFamily,
  },
  heroBookBtn: {
    alignSelf: 'flex-start',
    backgroundColor: TheOneColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 12,
  },
  heroBookBtnText: {
    color: '#0B0B0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  // Next visit / club info card
  clubInfoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'flex-start',
  },
  clubInfoLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  clubInfoValue: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  clubInfoSubtext: {
    fontSize: 11,
    lineHeight: 15,
  },
});
