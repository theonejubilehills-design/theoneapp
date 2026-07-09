import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, ImageBackground, Image, Animated, Alert, ActivityIndicator, View, LayoutAnimation } from 'react-native';
import PressSpring from '@/components/PressSpring';
import { useRouter } from 'expo-router';
import { Text } from '@/components/Themed';
import { playClickSound, preloadSound, playSlideSound } from '../../utils/SoundManager';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { useAuth } from '../../context/AuthContext';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { db } from '../../firebaseConfig';
import { doc, onSnapshot, collection, query, where, updateDoc, deleteDoc, getDocs, addDoc, increment } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookingCard } from '@/components/BookingCard';
import CustomAlertModal, { AlertButton } from '@/components/CustomAlertModal';

const SERVICE_IMAGES: Record<string, any> = {
  yoga: require('../../assets/images/yoga.jpg'),
  pilates: require('../../assets/images/pilates.jpg'),
  kickboxing: require('../../assets/images/kickboxing.jpg'),
  'general-massage': require('../../assets/images/new massage logo.png'),

  cryo: require('../../assets/images/new cryo image.png'),
  sauna: require('../../assets/images/new infra red imge.png'),
  'red-light': require('../../assets/images/red_light.jpg'),
  hbot: require('../../assets/images/hbot_new.jpg'),
  physio: require('../../assets/images/physio.jpg'),
  'salon': require('../../assets/images/salon_bright.png'),
  'board-room': require('../../assets/images/br.png'),
  gym: require('../../assets/images/gym.jpg')
};

const SERVICE_TAGS: Record<string, { intensity: string; focus: string }> = {
  yoga: { intensity: 'LOW IMPACT', focus: 'MIND & BALANCE' },
  pilates: { intensity: 'ALL LEVELS', focus: 'STRENGTH & FLEX' },
  kickboxing: { intensity: 'HIGH INTENSITY', focus: 'CARDIO & POWER' },
  'general-massage': { intensity: 'RECOVERY', focus: 'DEEP RELIEF' },

  cryo: { intensity: 'BIOHACKING', focus: 'CRYO RECOVERY' },
  sauna: { intensity: 'BIOHACKING', focus: 'SWEAT RECOVERY' },
  'red-light': { intensity: 'RECOVERY', focus: 'CELLULAR BOOST' },
  hbot: { intensity: 'THERAPY', focus: 'OXYGEN FLOOD' },
  physio: { intensity: 'CLINICAL', focus: 'REHABILITATION' },
  'salon': { intensity: 'GROOMING', focus: 'HAIRCUT STYLE' },
  'board-room': { intensity: 'WORKSPACE', focus: 'MEETING & FOCUS' },
};

interface Service {
  id: string;
  name: string;
  duration: string;
  description: string;
  floor: string;
  icon: keyof typeof FontAwesome.glyphMap;
}

interface Category {
  title: string;
  floor: string;
  services: Service[];
}

const CATEGORIES: Category[] = [
  {
    title: 'Sessions',
    floor: '4th Floor',
    services: [
      { id: 'yoga', name: 'Yoga', duration: '60 mins', description: 'Mon / Wed / Fri • Max 10 people', floor: '4th Floor', icon: 'leaf' },
      { id: 'pilates', name: 'Pilates', duration: '60 mins', description: 'Mon–Sat • Max 3 people • Level selection', floor: '4th Floor', icon: 'child' },
      { id: 'kickboxing', name: 'Kickboxing', duration: '60 mins', description: 'Schedule controlled by trainer • Max 3–5 people', floor: '4th Floor', icon: 'hand-rock-o' },
    ],
  },
  {
    title: 'Massage & Wellness',
    floor: '1st Floor',
    services: [
      { id: 'general-massage', name: 'Massages', duration: '120 mins', description: 'Includes optional 30 min Steam/Sauna • Max 2 concurrent sessions', floor: '1st Floor', icon: 'heart' },
      { id: 'salon', name: 'Hair Salon (Unisex)', duration: '60 mins', description: 'Premium haircutting & styling services for all genders', floor: '2nd Floor', icon: 'scissors' },
    ],
  },
  {
    title: 'Therapy & Recovery',
    floor: '1st Floor',
    services: [
      { id: 'cryo', name: 'Cryo Chamber', duration: '60 mins', description: 'Ultra-cold recovery • 3-hour session gaps required', floor: '1st Floor', icon: 'snowflake-o' },
      { id: 'sauna', name: 'Sauna', duration: '15 mins', description: 'Deep cell heat & sweat recovery', floor: '1st Floor', icon: 'fire' },
      { id: 'red-light', name: 'Infrared Chamber', duration: '15 mins', description: 'Cellular recovery & collagen boost', floor: '1st Floor', icon: 'lightbulb-o' },
      { id: 'hbot', name: 'HBOT Chamber', duration: '30 mins / 60 mins', description: 'Hyperbaric Oxygen Therapy chamber for healing & recovery', floor: '2nd Floor', icon: 'heartbeat' },
    ],
  },
  {
    title: 'Physiotherapy',
    floor: '2nd Floor',
    services: [
      { id: 'physio', name: 'Physiotherapy', duration: '45 mins', description: '7:30 AM – 12:00 PM slots available', floor: '2nd Floor', icon: 'medkit' },
    ],
  },
  {
    title: 'Board Room',
    floor: 'Ground Floor',
    services: [
      { id: 'board-room', name: 'Board Room', duration: 'Flexible', description: 'Professional meeting room for work & discussions • ₹5,000 / hr • Chargeable for all memberships', floor: 'Ground Floor', icon: 'briefcase' },
    ],
  },
];

const getCategoryIcon = (idx: number) => {
  const icons = ['leaf', 'heart', 'thermometer-half', 'medkit', 'briefcase'];
  return icons[idx] || 'circle';
};

const FILTER_CATEGORIES = [
  { id: 'All', label: 'All', icon: 'th-large' as const },
  { id: 'Classes', label: 'Sessions', icon: 'leaf' as const },
  { id: 'Wellness', label: 'Wellness', icon: 'heart' as const },
  { id: 'Therapy', label: 'Therapy', icon: 'snowflake-o' as const },
  { id: 'Physio', label: 'Physio', icon: 'medkit' as const },
  { id: 'Board Room', label: 'Board Room', icon: 'briefcase' as const },
];

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

export default function BookingScreen() {
  const router = useRouter();
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { user, userProfile } = useAuth();

  // Listen to custom service timings/durations from settings
  const [firestoreServiceSettings, setFirestoreServiceSettings] = useState<any>(null);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'services'), (docSnap) => {
      if (docSnap.exists()) {
        setFirestoreServiceSettings(docSnap.data());
      }
    }, (err) => {
      console.error('Failed to listen to settings/services:', err);
    });
    return unsub;
  }, []);

  useEffect(() => {
    preloadSound();
  }, []);
  const userGender = userProfile?.gender || 'Female';
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dues, setDues] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

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

  // Bookings real-time listener to get the upcoming bookings
  useEffect(() => {
    if (!user?.phoneNumber) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'bookings'),
      where('userId', '==', user.phoneNumber),
      where('status', 'in', ['confirmed', 'pending_join_request'])
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
            saunaCategory: data.saunaCategory,
            isJoiner: data.isJoiner,
            hostName: data.hostName,
            userId: data.userId,
            primaryBookingId: data.primaryBookingId,
            subService: data.subService,
          });
        });

        // Sort by date and time ascending so closest is first
        const sortedList = list.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );
        setUpcomingBookings(sortedList);
        setLoading(false);
      },
      (error) => {
        console.warn('Firestore bookings sub failed in BookingScreen:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user?.phoneNumber]);

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
  };

  const getMembershipLabel = () => {
    if (userProfile?.membershipType === 'Gold') return 'GOLD MEMBER';
    if (userProfile?.membershipType === 'Trial') return 'TRIAL ACCESS';
    if (userProfile?.membershipType === 'Wellness') return 'WELLNESS PLAN';
    return 'BASIC MEMBER';
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

  const getServiceFloor = (serviceId: string) => {
    for (const cat of CATEGORIES) {
      if (cat.services.some(s => s.id === serviceId)) {
        return cat.floor;
      }
    }
    return '1st Floor';
  };

  // Dynamic capacities/trainers
  const [classesSettings, setClassesSettings] = useState<any>(null);

  // Staggered entrance animations (10 blocks: Header, Dues/Insights, and Categories)
  const entranceAnims = useRef(
    Array.from({ length: 10 }, () => ({
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

  useEffect(() => {
    // Realtime listen to class settings
    const unsub = onSnapshot(doc(db, 'settings', 'classes'), (snap) => {
      if (snap.exists()) {
        setClassesSettings(snap.data());
      }
    }, (err) => console.warn('Could not listen to class settings:', err));
    return unsub;
  }, []);

  const getDynamicDescription = (svc: Service) => {
    if (!classesSettings) return svc.description;
    if (svc.id === 'yoga') {
      const cap = classesSettings.yoga?.maxCapacity ?? 10;
      const trainer = classesSettings.yoga?.trainer ?? 'Sarah';
      return `Mon / Wed / Fri • Max ${cap} people • Trainer: ${trainer}`;
    }
    if (svc.id === 'pilates') {
      const cap = classesSettings.pilates?.maxCapacity ?? 3;
      const trainer = classesSettings.pilates?.trainer ?? 'Elena';
      return `Wed: Focused on Stretching • Tue/Thu/Sat: Advanced Session (High Intensity) • Mon/Fri: Beginner Session (Low Intensity) • Max ${cap} people • Trainer: ${trainer}`;
    }
    if (svc.id === 'kickboxing') {
      const cap = classesSettings.kickboxing?.maxCapacity ?? 5;
      const trainer = classesSettings.kickboxing?.trainer ?? 'Coach Marcus';
      return `Max ${cap} people • Trainer: ${trainer}`;
    }
    return svc.description;
  };

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

      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
        
      {/* Block 0: Header Section */}
      <Animated.View style={{ opacity: entranceAnims[0].opacity, transform: [{ translateY: entranceAnims[0].translateY }] }}>
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.greeting, { color: TheOneColors.accent, fontFamily: TheOneTypography.bodyFamily }]}>WELCOME BACK</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
              <Text style={[styles.name, { color: colors.text, fontFamily: TheOneTypography.headlineFamily, fontStyle: 'italic' }]}>
                {userProfile?.name || 'Athlete'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PressSpring 
              style={{ marginRight: 20, position: 'relative' }}
              onPress={() => { playClickSound(); setShowNotifications(true); }}
              fullWidth={false}
            >
              <FontAwesome name="bell-o" size={22} color={colors.text} />
              {unreadCount > 0 && (
                <View style={{ position: 'absolute', top: -4, right: -6, backgroundColor: TheOneColors.accent, borderRadius: 10, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#0B0B0B', fontSize: 9, fontWeight: '800' }}>{unreadCount}</Text>
                </View>
              )}
            </PressSpring>
            <PressSpring 
              style={[styles.avatarContainer, { borderColor: colors.border }]}
              onPress={() => { playClickSound(); router.push('/(tabs)/profile'); }}
              fullWidth={false}
            >
              {userProfile?.avatarUrl ? (
                <Image source={{ uri: userProfile.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <FontAwesome name="user-circle-o" size={30} color={colors.secondaryText} />
              )}
            </PressSpring>
          </View>
        </View>
      </Animated.View>
      
      {/* Block 1: Dues and Daily Insight */}
      <Animated.View style={{ opacity: entranceAnims[1].opacity, transform: [{ translateY: entranceAnims[1].translateY }] }}>


        {/* Hero Banner + Next Visit */}
        <View style={[styles.ntcBanner, { backgroundColor: 'transparent', borderColor: 'transparent', padding: 0, flexDirection: 'column', gap: 10 }]}>

          {/* Top: Gym Hero Image Card */}
          <PressSpring
            style={{ width: '100%' }}
            contentStyle={{ flex: 1 }}
            onPress={() => { playClickSound(); }}
            scaleTo={0.98}
            hapticStyle="light"
            fullWidth={true}
          >
            <View style={styles.heroBannerCard}>
              <Image
                source={require('../../assets/images/ChatGPT Image Jul 6, 2026, 03_30_02 PM.png')}
                style={styles.heroBannerImage}
                resizeMode="cover"
              />
            </View>
          </PressSpring>

          {/* Bottom: Next Visit Card */}
          <View style={{ width: '100%' }}>
            <View style={[styles.clubInfoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <FontAwesome name="calendar" size={11} color={colors.tint} style={{ marginRight: 6 }} />
                <Text style={[styles.clubInfoLabel, { color: colors.tint }]}>NEXT SESSION</Text>
              </View>
              {upcomingBookings.length > 0 ? (
                <>
                  <Text style={[styles.clubInfoValue, { color: colors.text }]}>
                    {formatDateDMY(upcomingBookings[0].date)} at {upcomingBookings[0].time.split(' - ')[0]}
                  </Text>
                  <Text style={[styles.clubInfoSubtext, { color: colors.secondaryText, marginTop: 4 }]}>
                    {formatEquipmentName(upcomingBookings[0].equipment)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.clubInfoValue, { color: colors.secondaryText, fontSize: 12 }]}>
                    No upcoming sessions
                  </Text>
                  <Text style={[styles.clubInfoSubtext, { color: colors.secondaryText, marginTop: 4 }]}>
                    Book one now →
                  </Text>
                </>
              )}
            </View>
          </View>

        </View>
      </Animated.View>

      <Text style={[styles.headerTitle, { color: colors.text, fontFamily: TheOneTypography.headlineFamily, marginTop: 24 }]}>WELLNESS SANCTUARY</Text>
      <Text style={[styles.headerSubtitle, { color: colors.secondaryText, fontFamily: TheOneTypography.bodyFamily, marginBottom: 16 }]}>Select a service below to schedule a session</Text>

      {/* Horizontal Category Switcher Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryChipsContainer}
        style={{ marginBottom: 24 }}
      >
        {FILTER_CATEGORIES.map((filterCat) => {
          const isSelected = selectedCategory === filterCat.id;
          return (
            <TouchableOpacity
              key={filterCat.id}
              style={[
                styles.categoryChip,
                isSelected
                  ? { backgroundColor: colors.tint, borderColor: colors.tint }
                  : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
              ]}
              onPress={() => {
                playSlideSound();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSelectedCategory(filterCat.id);
              }}
            >
              <FontAwesome
                name={filterCat.icon}
                size={12}
                color={isSelected ? '#0B0B0B' : colors.secondaryText}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.categoryChipText,
                  isSelected
                    ? { color: '#0B0B0B', fontWeight: '800' }
                    : { color: colors.secondaryText, fontWeight: '500' }
                ]}
              >
                {filterCat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>


      {/* CATEGORIES & SERVICES LIST */}
      {CATEGORIES.map((cat, idx) => {
        // Filter categories based on selected tab
        if (selectedCategory !== 'All') {
          const categoryMap: Record<string, string> = {
            Classes: 'Sessions',
            Wellness: 'Massage & Wellness',
            Therapy: 'Therapy & Recovery',
            Physio: 'Physiotherapy',
            'Board Room': 'Board Room',
          };
          if (cat.title !== categoryMap[selectedCategory]) {
            return null;
          }
        }

        const filteredServices = cat.services;

        if (filteredServices.length === 0) return null;

        return (
          <Animated.View 
            key={idx} 
            style={{ 
              opacity: entranceAnims[idx + 2]?.opacity || 1, 
              transform: [{ translateY: entranceAnims[idx + 2]?.translateY || 0 }] 
            }}
          >
            <View style={styles.categoryBlock}>
              <View style={styles.categoryHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' }}>
                  <FontAwesome name={getCategoryIcon(idx) as any} size={13} color={colors.tint} style={{ marginRight: 8 }} />
                  <Text style={[styles.categoryTitle, { color: colors.text, fontFamily: TheOneTypography.headlineFamily }]}>{cat.title.toUpperCase()}</Text>
                </View>
                <View style={[styles.floorBadge, { backgroundColor: 'rgba(184, 70, 0, 0.08)' }]}>
                  <Text style={[styles.floorBadgeText, { color: colors.tint, fontFamily: TheOneTypography.bodyFamily }]}>{cat.floor.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.servicesGrid}>
                {filteredServices.map((svc) => {
                  const bgImg = SERVICE_IMAGES[svc.id] || SERVICE_IMAGES.gym;
                  const customDur = firestoreServiceSettings?.[svc.id]?.duration;
                  const displayDuration = customDur ? `${customDur} mins` : svc.duration;
                  return (
                    <PressSpring
                      key={svc.id}
                      style={[styles.serviceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => {
                        playClickSound();
                        if (userProfile?.membershipType === 'Wellness' && ['yoga', 'pilates', 'kickboxing'].includes(svc.id)) {
                          Alert.alert(
                            'Access Restricted',
                            'Wellness members do not have access to fitness sessions (Yoga, Pilates, Kickboxing). Upgrade your membership.'
                          );
                        } else {
                          router.push(`/booking/${svc.id}`);
                        }
                      }}
                    >
                      <View style={{ backgroundColor: 'transparent' }}>
                        <Image source={bgImg} style={styles.cardImage} resizeMode="cover" />
                        
                        <View style={styles.cardContent}>
                          {/* Tags Row */}
                          <View style={styles.cardTagsRow}>
                            {SERVICE_TAGS[svc.id] && (
                              <View style={[styles.tagBadge, { backgroundColor: 'rgba(226, 93, 27, 0.12)' }]}>
                                <Text style={[styles.tagBadgeText, { color: colors.tint }]}>
                                  {SERVICE_TAGS[svc.id].intensity}
                                </Text>
                              </View>
                            )}
                            {SERVICE_TAGS[svc.id] && (
                              <View style={[styles.tagBadge, { backgroundColor: 'rgba(255, 255, 255, 0.06)' }]}>
                                <Text style={[styles.tagBadgeText, { color: colors.secondaryText }]}>
                                  {SERVICE_TAGS[svc.id].focus}
                                </Text>
                              </View>
                            )}
                            <View style={[styles.tagBadge, { backgroundColor: 'rgba(255, 255, 255, 0.04)', marginLeft: 'auto', marginRight: 0 }]}>
                              <Text style={[styles.tagBadgeText, { color: colors.secondaryText }]}>{svc.floor.toUpperCase()}</Text>
                            </View>
                          </View>

                          {/* Service Title */}
                          <Text style={[styles.cardServiceName, { color: colors.text, fontFamily: TheOneTypography.headlineFamily, marginTop: 8 }]}>
                            {svc.name}
                          </Text>

                          {/* Service Description */}
                          <Text style={[styles.cardServiceDesc, { color: colors.secondaryText, fontFamily: TheOneTypography.bodyFamily, marginTop: 4 }]}>
                            {getDynamicDescription(svc)}
                          </Text>

                          {/* Divider */}
                          <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                          {/* Bottom Row */}
                          <View style={styles.cardBottomRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' }}>
                              <FontAwesome name="clock-o" size={11} color={colors.tint} style={{ marginRight: 6 }} />
                              <Text style={[styles.cardDurationText, { color: colors.text, fontFamily: TheOneTypography.bodyFamily }]}>
                                {displayDuration.toUpperCase()}
                              </Text>
                            </View>

                            <View style={[styles.cardBookBtn, { backgroundColor: TheOneColors.accent }]}>
                              <Text style={[styles.cardBookBtnText, { color: '#0B0B0B' }]}>SCHEDULE</Text>
                              <FontAwesome name="arrow-right" size={10} color="#0B0B0B" style={{ marginLeft: 6 }} />
                            </View>
                          </View>
                        </View>

                        {userProfile?.membershipType === 'Wellness' && ['yoga', 'pilates', 'kickboxing'].includes(svc.id) && (
                          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', borderRadius: 20 }]}>
                            <FontAwesome name="lock" size={28} color={TheOneColors.accent} style={{ marginBottom: 4 }} />
                            <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 14, letterSpacing: 1, fontFamily: TheOneTypography.headlineFamily }}>ACCESS RESTRICTED</Text>
                            <Text style={{ color: '#EBEBF5', fontSize: 11, fontFamily: TheOneTypography.bodyFamily }}>Wellness Plan Excludes Sessions</Text>
                          </View>
                        )}
                      </View>
                    </PressSpring>
                  );
                })}
              </View>
            </View>
          </Animated.View>
        );
      })}
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
    fontSize: 28,
    letterSpacing: 0.5,
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 6,
    marginBottom: 24,
  },
  gymCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 32,
    overflow: 'hidden',
  },
  gymCardBgImage: {
    width: '100%',
    minHeight: 220,
  },
  gymCardGradient: {
    padding: 20,
  },
  gymCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  gymIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: TheOneColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  gymTitleArea: {
    backgroundColor: 'transparent',
  },
  gymTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  gymFloor: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  gymDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8E8E93',
    marginBottom: 16,
  },
  gymInfoBtn: {
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  gymInfoBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  categoryBlock: {
    marginBottom: 28,
    backgroundColor: 'transparent',
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: 'transparent',
  },
  categoryTitle: {
    fontSize: 14,
    letterSpacing: 1.5,
  },
  floorBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  floorBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  servicesGrid: {
    backgroundColor: 'transparent',
  },
  serviceCard: {
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardContent: {
    padding: 16,
    backgroundColor: 'transparent',
  },
  cardTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  cardDurationText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  categoryChipsContainer: {
    flexDirection: 'row',
    paddingRight: 24,
    backgroundColor: 'transparent',
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 100,
    marginRight: 10,
  },
  categoryChipText: {
    fontSize: 12,
    letterSpacing: 0.5,
    fontFamily: TheOneTypography.bodyFamily,
  },
  tagBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginRight: 6,
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: TheOneTypography.bodyFamily,
  },
  cardServiceName: {
    fontSize: 19,
    letterSpacing: 0.3,
  },
  cardServiceDesc: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 14,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  cardBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  cardBookBtnText: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
    fontFamily: TheOneTypography.bodyFamily,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 6,
  },
  modalScroll: {
    marginBottom: 24,
  },
  guidelineRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  guidelineIcon: {
    marginRight: 14,
    marginTop: 2,
    width: 20,
    textAlign: 'center',
  },
  guidelineTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F5F2EB',
    marginBottom: 4,
  },
  guidelineText: {
    fontSize: 13,
    color: '#CBB89D',
    lineHeight: 18,
  },
  modalCloseBtn: {
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 1.5,
  },
  nextVisitCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
    backgroundColor: TheOneColors.charcoal,
    borderColor: TheOneColors.charcoalBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  nextVisitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: 10,
  },
  nextVisitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextVisitLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  activeStatusBadge: {
    backgroundColor: 'rgba(76, 217, 100, 0.12)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  activeStatusText: {
    color: '#4CD964',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  nextVisitBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextVisitTimeCol: {
    flex: 1.1,
  },
  nextVisitDateText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: TheOneTypography.headlineFamily,
    letterSpacing: 0.3,
  },
  nextVisitTimeText: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    fontFamily: TheOneTypography.bodyFamily,
  },
  nextVisitDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 16,
  },
  nextVisitServiceCol: {
    flex: 1.5,
  },
  nextVisitServiceText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: TheOneTypography.headlineFamily,
    letterSpacing: 0.3,
  },
  nextVisitFloorText: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: TheOneTypography.bodyFamily,
  },
  section: {
    backgroundColor: 'transparent',
    marginBottom: 24,
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
  centerContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  emptyCard: {
    borderRadius: 20,
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
    fontSize: 9,
    letterSpacing: 3.2,
    textTransform: 'uppercase',
    fontWeight: '700',
    opacity: 0.85,
  },
  name: {
    fontSize: 35,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  avatarContainer: {
    width: 42,
    height: 42,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TheOneColors.charcoal,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  membershipPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
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
  duesAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 24,
  },
  duesAlertText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
    flex: 1,
  },
  ntcBanner: {
    marginBottom: 32,
  },
  heroBannerCard: {
    height: 190,
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 20,
  },
  heroBannerImage: {
    position: 'absolute',
    top: -100,
    left: 0,
    right: 0,
    width: '100%',
    height: 290,
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
    borderRadius: 20,
  },
  heroBookBtnText: {
    color: '#0B0B0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  clubInfoCard: {
    borderRadius: 20,
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
