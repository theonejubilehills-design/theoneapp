import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  FlatList, ScrollView, ActivityIndicator, Pressable, Modal, Platform, LayoutAnimation
} from 'react-native';
import { db } from '../../firebaseConfig';
import {
  collection, getDocs, doc, setDoc, deleteDoc,
  updateDoc, addDoc, onSnapshot, query, where, getDoc
} from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import CustomAlertModal, { AlertButton } from '@/components/CustomAlertModal';
import { useRouter, Link, Stack } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import PressSpring from '@/components/PressSpring';
import { playSlideSound, playClickSound } from '../../utils/SoundManager';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SALON_SERVICES, SPA_SERVICES, PHYSIO_SERVICES, getWellnessPrice, fetchLivePricing, LivePricing } from '../../constants/Pricing';

interface UserProfile {
  id: string; // phone number
  phoneNumber?: string;
  name: string;
  gender: 'Male' | 'Female';
  membershipType: 'Basic' | 'Gold' | 'Trial' | 'Wellness';
  isAdmin: boolean;
  isSubAdmin?: boolean;
  trialStartDate?: string;
  trialEndDate?: string;
  isBlocked?: boolean;
  noShowCount?: number;
}

interface Booking {
  id: string;
  userId: string;
  userName: string;
  userGender?: 'Male' | 'Female';
  membershipType?: 'Basic' | 'Gold' | 'Trial' | 'Wellness';
  serviceId: string;
  serviceName: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'pending_join_request' | 'pending' | 'pending_group_fill';
  therapistName?: string;
  trainerName?: string;
  pilatesLevel?: string;
  steamSaunaIncluded?: boolean;
  seen?: boolean;
  hbotConsecutive?: boolean;
  extended?: boolean;
  saunaType?: 'sauna' | 'steam' | null;
  saunaCategory?: string;
  isJoiner?: boolean;
  primaryBookingId?: string;
  floor?: string;
  staffStatus?: string;
  staffNotes?: string;
  extendedTherapy?: boolean;
  subService?: string;
}

const SERVICES_LIST = [
  { id: 'yoga', name: 'Yoga', floor: '4th Floor', charge: 0 },
  { id: 'pilates', name: 'Pilates', floor: '4th Floor', charge: 0 },
  { id: 'kickboxing', name: 'Kickboxing', floor: '4th Floor', charge: 0 },
  { id: 'general-massage', name: 'Massages', floor: '1st Floor', charge: 0 },
  { id: 'cryo', name: 'Cryo Chamber', floor: '1st Floor', charge: 3000 },
  { id: 'sauna', name: 'Sauna', floor: '1st Floor', charge: 500 },
  { id: 'red-light', name: 'Infrared Chamber', floor: '1st Floor', charge: 3000 },
  { id: 'hbot', name: 'HBOT Chamber', floor: '2nd Floor', charge: 3000 },
  { id: 'salon', name: 'Hair Salon (Unisex)', floor: '2nd Floor', charge: 0 },
  { id: 'physio', name: 'Physiotherapy', floor: '2nd Floor', charge: 0 }
];

const getLocalDateString = (date: Date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

// Format YYYY-MM-DD → DD-MM-YYYY
const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
};


const last10 = (p?: string): string => {
  if (!p) return '';
  return p.replace(/\D/g, '').slice(-10);
};

const getDayOfWeek = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
};

const parseTimeToMinutes = (timeStr?: string) => {
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/^(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const getSalonServiceDuration = (name: string): number => {
  if (!name) return 30;
  if (name.includes('Beard Trim')) return 15;
  if (name.includes('Shaving')) return 20;
  if (name.includes('Head Shave')) return 30;
  if (name.includes('Hair wash + Blowdry (Men)')) return 25;
  if (name.includes('Hair Color Root Touch-up (Men)')) return 45;
  if (name.includes('Haircut + Hairwash + Blowdry (Men)')) return 45;
  if (name.includes('Hair wash + Simple Blowdry (Women)')) return 45;
  if (name.includes('Hair wash + Soft Curls')) return 60;
  if (name.includes('Hair wash + Tong Curls')) return 60;
  if (name.includes('Hair Color Root Touch-up (Women)')) return 60;
  return 30;
};

const minutesToTimeString = (totalMinutes: number): string => {
  let minutes = totalMinutes % (24 * 60);
  let hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let ampm = 'AM';
  
  if (hour >= 12) {
    ampm = 'PM';
    if (hour > 12) hour -= 12;
  } else if (hour === 0) {
    hour = 12;
  }
  
  const minStr = String(minute).padStart(2, '0');
  const hourStr = String(hour).padStart(2, '0');
  
  return `${hourStr}:${minStr} ${ampm}`;
};

const calculateCustomEndTime = (startTimeStr: string, durationMins: number): string => {
  const startMin = parseTimeToMinutes(startTimeStr);
  return minutesToTimeString(startMin + durationMins);
};

// Allowed booking start-time window per service (in minutes from midnight)
const SERVICE_ALLOWED_HOURS: Record<string, { min: number; max: number; label: string }> = {
  'general-massage': { min: 8 * 60,        max: 20 * 60,       label: '8:00 AM – 8:00 PM' },
  'physio':          { min: 7 * 60 + 30,   max: 12 * 60,       label: '7:30 AM – 12:00 PM' },
  'yoga':            { min: 7 * 60,        max: 8 * 60,        label: '7:00 AM – 8:00 AM' },
  'pilates':         { min: 7 * 60,        max: 12 * 60,       label: '7:00 AM – 12:00 PM' },
  'kickboxing':      { min: 6 * 60,        max: 11 * 60,       label: '6:00 AM – 11:00 AM' },
  'salon':           { min: 8 * 60,        max: 19 * 60,       label: '8:00 AM – 7:00 PM' },
  'sauna':           { min: 8 * 60,        max: 19 * 60,       label: '8:00 AM – 7:00 PM' },
  'cryo':            { min: 8 * 60,        max: 21 * 60,       label: '8:00 AM – 9:00 PM' },
  'red-light':       { min: 8 * 60,        max: 19 * 60,       label: '8:00 AM – 7:00 PM' },
  'hbot':            { min: 8 * 60,        max: 18 * 60 + 30,  label: '8:00 AM – 6:30 PM' },
};

const checkMassageRoomAvailability = (
  proposedStart: number,
  proposedBlockDuration: number,
  proposedGender: 'Male' | 'Female',
  existingBookings: any[]
) => {
  const proposedEnd = proposedStart + proposedBlockDuration;
  for (let m = proposedStart; m < proposedEnd; m++) {
    let activeMales = proposedGender === 'Male' ? 1 : 0;
    let activeFemales = proposedGender === 'Female' ? 1 : 0;

    for (const b of existingBookings) {
      const timePart = b.time || '';
      if (!timePart.includes(' - ')) continue;
      const bStart = parseTimeToMinutes(timePart.split(' - ')[0]);
      const isExtended = b.extended === true || b.steamSaunaIncluded === true;
      const bDuration = isExtended ? 180 : 120;
      const bEnd = bStart + bDuration;

      if (m >= bStart && m < bEnd) {
        if (b.userGender === 'Male') {
          activeMales++;
        } else {
          activeFemales++;
        }
      }
    }

    if (activeMales > 1 || (activeMales + activeFemales) > 2) {
      return false;
    }
  }
  return true;
};

const isCryoSlotSelectable = (proposedStart: number, dayBookings: any[], isToday: boolean, currentTime: number) => {
  if (proposedStart < 300 + 180) {
    return false;
  }

  const sortedBookings = dayBookings
    .filter(b => b.serviceId === 'cryo' && b.status === 'confirmed')
    .map(b => {
      const timePart = b.time || '';
      const start = parseTimeToMinutes(timePart.split(' - ')[0]);
      return { start, end: start + 60 };
    })
    .sort((a, b) => a.start - b.start);

  const overlaps = sortedBookings.some(b => 
    Math.max(proposedStart, b.start) < Math.min(proposedStart + 60, b.end)
  );
  if (overlaps) return false;

  const newBookingsList = [...sortedBookings, { start: proposedStart, end: proposedStart + 60 }]
    .sort((a, b) => a.start - b.start);

  let lastEnd = 300;
  for (let i = 0; i < newBookingsList.length; i++) {
    const b = newBookingsList[i];
    if (i === 0) {
      const requiredTurnOn = b.start - 180;
      if (requiredTurnOn < 300) {
        return false;
      }
      if (b.start === proposedStart) {
        if (isToday && requiredTurnOn < currentTime) {
          return false;
        }
      }
      lastEnd = b.end;
    } else {
      const gap = b.start - lastEnd;
      if (gap < 240) {
        lastEnd = b.end;
      } else {
        const requiredTurnOn = b.start - 180;
        if (requiredTurnOn < lastEnd) {
          return false;
        }
        if (b.start === proposedStart) {
          if (isToday && requiredTurnOn < currentTime) {
            return false;
          }
        }
        lastEnd = b.end;
      }
    }
  }
  return true;
};

export default function AdminBookings() {
  const router = useRouter();
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };

  // Loading States
  const [loading, setLoading] = useState(true);

  // Core Lists
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingFilter, setBookingFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  // No-Show Confirmation Modal State
  const [showNoShowModal, setShowNoShowModal] = useState(false);
  const [noShowTarget, setNoShowTarget] = useState<{ id: string, name: string } | null>(null);

  // QR Scanner States
  const { logout, userProfile } = useAuth();
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [manualBookingId, setManualBookingId] = useState('');
  const [isScanningSubmitting, setIsScanningSubmitting] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    await processBookingCheckin(data);
  };

  const processBookingCheckin = async (bookingId: string) => {
    const cleanId = bookingId.trim();
    if (!cleanId) {
      showAlert('Invalid ID', 'Please enter a valid Booking ID.');
      return;
    }

    setIsScanningSubmitting(true);
    try {
      const bookingRef = doc(db, 'bookings', cleanId);
      const bookingDoc = await getDoc(bookingRef);

      if (!bookingDoc.exists()) {
        showAlert('Not Found', 'No booking found matching this ID.');
        setScanned(false);
        return;
      }

      const bookingData = bookingDoc.data();
      if (bookingData.status === 'completed') {
        showAlert('Already Checked In', `This session for ${bookingData.userName} has already been checked in.`);
        setScanned(false);
        return;
      }

      await updateDoc(bookingRef, {
        status: 'completed',
        completedAt: new Date().toISOString()
      });

      setScannerVisible(false);
      setManualBookingId('');
      setSuccessModalMessage(`Session for ${bookingData.userName} (${bookingData.serviceName}) checked in successfully via QR.`);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Error scanning QR:', err);
      showAlert('Check-in Failed', err.message || String(err));
      setScanned(false);
    } finally {
      setIsScanningSubmitting(false);
    }
  };

  // Create Booking Form State
  const [bookPhone, setBookPhone] = useState('');
  const [bookName, setBookName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [bookService, setBookService] = useState('yoga');
  const [bookSubService, setBookSubService] = useState('');
  const [bookSelectedSalonServices, setBookSelectedSalonServices] = useState<string[]>(['Haircut + Hairwash + Blowdry (Men)']);
  const [bookDate, setBookDate] = useState(getLocalDateString());
  const [bookTime, setBookTime] = useState('10:00 AM - 11:00 AM');
  const [bookTherapist, setBookTherapist] = useState('');
  const [bookSaunaType, setBookSaunaType] = useState<'sauna' | 'steam' | 'none'>('none');
  const [bookExtendMassage, setBookExtendMassage] = useState(false);
  const [bookTrainer, setBookTrainer] = useState('');
  const [bookPilatesLevel, setBookPilatesLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

  // Custom Time Picker Modal State
  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'create' | 'edit'>('create');
  const [tempHour, setTempHour] = useState('09');
  const [tempMinute, setTempMinute] = useState('00');
  const [tempAmPm, setTempAmPm] = useState<'AM' | 'PM'>('AM');

  // Live pricing loaded from Firestore
  const [livePricing, setLivePricing] = useState<LivePricing>({
    salon: SALON_SERVICES,
    spa: SPA_SERVICES,
    physio: PHYSIO_SERVICES,
    wellnessPrice: getWellnessPrice,
  });

  useEffect(() => {
    fetchLivePricing().then(setLivePricing).catch(() => {});
  }, []);

  useEffect(() => {
    if (bookService === 'salon') {
      const defaultSalon = ['Haircut + Hairwash + Blowdry (Men)'];
      setBookSelectedSalonServices(defaultSalon);
      setBookSubService(defaultSalon.join(', '));
    } else if (bookService === 'physio') {
      setBookSubService('Ultrasound');
    } else if (bookService === 'general-massage') {
      setBookSubService('Head Massage (20 Mins)');
    } else {
      setBookSubService('');
    }
  }, [bookService]);

  // Edit Booking Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedBookingToEdit, setSelectedBookingToEdit] = useState<Booking | null>(null);
  const [editTherapistName, setEditTherapistName] = useState('');
  const [editTrainerName, setEditTrainerName] = useState('');
  const [editPilatesLevel, setEditPilatesLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced' | null>(null);
  const [editTime, setEditTime] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editSaunaType, setEditSaunaType] = useState<'sauna' | 'steam' | 'none'>('none');
  const [editExtendMassage, setEditExtendMassage] = useState(false);

  // Configurations (Sync with Settings)
  const [classSettings, setClassSettings] = useState({
    yogaCapacity: '10',
    yogaTrainer: 'Sarah',
    yogaTrainerDayOff: 'None',
    pilatesCapacity: '3',
    pilatesTrainer: 'Elena',
    pilatesTrainerDayOff: 'None',
    kickboxingCapacity: '5',
    kickboxingTrainer: 'Coach Marcus',
    kickboxingTrainerDayOff: 'None',
    physioTherapist: 'Dr. Shawn (Physio)',
    physioTherapistDayOff: 'None',
    massageMale1: 'Vikram',
    massageMale1DayOff: 'None',
    massageMale2: 'Ragesh',
    massageMale2DayOff: 'None',
    massageFemale1: 'Ananya',
    massageFemale1DayOff: 'None',
    massageFemale2: 'Priya',
    massageFemale2DayOff: 'None',
    salonProfessionals: 'Salon Professional',
    salonProfessionalsDayOff: 'None',
  });

  const [serviceTimings, setServiceTimings] = useState<any>(null);

  const therapists = [
    { name: classSettings.massageMale1, gender: 'Male' },
    { name: classSettings.massageMale2, gender: 'Male' },
    { name: classSettings.massageFemale1, gender: 'Female' },
    { name: classSettings.massageFemale2, gender: 'Female' },
  ];

  const cleanInputPhone = bookPhone.replace(/\D/g, '');
  const matchedUserForBooking = users.find(u => {
    const cleanId = u.id.replace(/\D/g, '');
    const cleanPhone = (u.phoneNumber || '').replace(/\D/g, '');
    if (cleanInputPhone.length === 10) {
      return cleanId.endsWith(cleanInputPhone) || cleanPhone.endsWith(cleanInputPhone);
    }
    return u.id === bookPhone.trim() || u.phoneNumber === bookPhone.trim() || cleanId === cleanInputPhone;
  });

  const nameSuggestions = bookName.trim().length > 0
    ? users.filter(u => !u.isAdmin && u.name.toLowerCase().includes(bookName.toLowerCase()))
    : [];

  useEffect(() => {
    if (matchedUserForBooking) {
      setBookName(matchedUserForBooking.name);
    }
  }, [bookPhone]);

  useEffect(() => {
    if (bookService === 'yoga') setBookTrainer(classSettings.yogaTrainer);
    else if (bookService === 'pilates') setBookTrainer(classSettings.pilatesTrainer);
    else if (bookService === 'kickboxing') setBookTrainer(classSettings.kickboxingTrainer);
    else if (bookService === 'physio') setBookTrainer(classSettings.physioTherapist);
    else if (bookService === 'salon') setBookTrainer(classSettings.salonProfessionals);
    else if (bookService === 'general-massage') {
      setBookTherapist(therapists[0]?.name || '');
    }
  }, [bookService, classSettings, matchedUserForBooking]);

  // Read Global, Staff and Services Settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setClassSettings(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to load global settings', err);
      }
      try {
        const docRef = doc(db, 'settings', 'staff');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setClassSettings(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to load staff settings', err);
      }
      try {
        const docRef = doc(db, 'settings', 'services');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setServiceTimings(docSnap.data());
        }
      } catch (err) {
        console.error('Failed to load services settings', err);
      }
    };
    fetchSettings();
  }, []);

  // Synchronize Salon bookTime duration when bookService or bookSubService updates
  useEffect(() => {
    if (bookService === 'salon' && bookSubService) {
      const start = bookTime.split(' - ')[0] || '10:00 AM';
      const duration = getSalonServiceDuration(bookSubService);
      setBookTime(`${start} - ${calculateCustomEndTime(start, duration)}`);
    }
  }, [bookService, bookSubService]);

  // Listeners directly from Firestore
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
          isSubAdmin: data.isSubAdmin || false,
          trialStartDate: data.trialStartDate,
          trialEndDate: data.trialEndDate,
        });
      });
      setUsers(dbList);
    }, (err) => {
      console.error('Users sub failed:', err);
    });

    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snap) => {
      const dbList: Booking[] = [];
      snap.forEach((doc) => {
        dbList.push({ id: doc.id, ...doc.data() } as Booking);
      });
      dbList.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        const timeA = parseTimeToMinutes(a.time.split(' - ')[0]);
        const timeB = parseTimeToMinutes(b.time.split(' - ')[0]);
        return timeA - timeB;
      });
      setBookings(dbList);
      setLoading(false);
    }, (err) => {
      console.error('Bookings sub failed:', err);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubBookings();
    };
  }, []);

  // Actions
  const handleSaveTimePicker = () => {
    const selectedStartTime = `${tempHour}:${tempMinute} ${tempAmPm}`;
    const selectedStartMinutes = parseTimeToMinutes(selectedStartTime);

    // Validate against service-specific allowed hours — close silently if out of range
    const targetService = pickerTarget === 'create' ? bookService : (selectedBookingToEdit?.serviceId || '');
    const allowedWindow = SERVICE_ALLOWED_HOURS[targetService];
    if (allowedWindow && (selectedStartMinutes < allowedWindow.min || selectedStartMinutes >= allowedWindow.max)) {
      setShowTimePickerModal(false);
      showAlert(
        'Invalid Time',
        `${targetService === 'general-massage' ? 'Massages' : targetService.charAt(0).toUpperCase() + targetService.slice(1)} can only be booked between ${allowedWindow.label}.`
      );
      return;
    }

    // Calculate duration — prefer live Firestore service timings, fall back to per-service logic
    let duration = serviceTimings?.[targetService]?.duration ?? 60;
    const targetSubService = pickerTarget === 'create' ? bookSubService : (selectedBookingToEdit?.subService || '');

    if (targetService === 'salon') {
      // Salon duration is dynamic (sum of selected sub-services), not a flat slot setting
      duration = getSalonServiceDuration(targetSubService);
    } else if (targetService === 'general-massage') {
      // Massage duration depends on the extend toggle, not the base slot duration
      const isExtended = pickerTarget === 'create' ? bookExtendMassage : editExtendMassage;
      duration = isExtended ? 90 : 60;
    }
    // All other services (sauna, cryo, red-light, hbot, physio, yoga, pilates, kickboxing)
    // use serviceTimings[service].duration from Firestore — the same value admin sets in Settings.


    const calculatedSlotTime = `${selectedStartTime} - ${calculateCustomEndTime(selectedStartTime, duration)}`;
    
    if (pickerTarget === 'create') {
      setBookTime(calculatedSlotTime);
    } else {
      setEditTime(calculatedSlotTime);
    }
    setShowTimePickerModal(false);
  };

  const handleCreateBooking = async () => {
    if (!bookPhone.trim() || !bookName.trim()) {
      showAlert('Missing Info', 'Please enter Client Phone Number and Client Name.');
      return;
    }
    let targetPhone = bookPhone.trim().replace(/\s+/g, '');
    if (!targetPhone.startsWith('+')) {
      if (targetPhone.length === 10) {
        targetPhone = '+91' + targetPhone;
      } else {
        targetPhone = '+' + targetPhone;
      }
    }

    setIsBookingSubmitting(true);

    try {
      const clientProfile = matchedUserForBooking || users.find(u => u.phoneNumber === targetPhone || u.id === targetPhone);
      const clientMembership = clientProfile?.membershipType || 'Basic';
      const clientGender = clientProfile?.gender || 'Female';

      const proposedStart = parseTimeToMinutes(bookTime.split(' - ')[0]);
      let proposedEnd = proposedStart + 60;
      if (bookService === 'salon') {
        const dur = getSalonServiceDuration(bookSubService);
        proposedEnd = proposedStart + dur;
      } else if (bookService === 'general-massage') {
        proposedEnd = proposedStart + (bookExtendMassage ? 90 : 60);
      }

      // Day Off check
      const dayOfWeek = getDayOfWeek(bookDate);
      if (bookService === 'general-massage') {
        const matchingTh = therapists.find(t => t.name === bookTherapist);
        if (matchingTh) {
          const therapistDayOffKey = matchingTh.name === classSettings.massageMale1 ? 'massageMale1DayOff' :
                                     matchingTh.name === classSettings.massageMale2 ? 'massageMale2DayOff' :
                                     matchingTh.name === classSettings.massageFemale1 ? 'massageFemale1DayOff' :
                                     matchingTh.name === classSettings.massageFemale2 ? 'massageFemale2DayOff' : '';
          const therapistDayOff = therapistDayOffKey ? (classSettings as any)[therapistDayOffKey] : 'None';
          if (therapistDayOff !== 'None' && therapistDayOff === dayOfWeek) {
            showAlert('Therapist Day Off', `${matchingTh.name} is on a day off on this date.`);
            setIsBookingSubmitting(false);
            return;
          }
        }
      } else if (['yoga', 'pilates', 'kickboxing', 'physio', 'salon'].includes(bookService)) {
        const trainerDayOffKey = bookService === 'yoga' ? 'yogaTrainerDayOff' :
                                 bookService === 'pilates' ? 'pilatesTrainerDayOff' :
                                 bookService === 'kickboxing' ? 'kickboxingTrainerDayOff' :
                                 bookService === 'physio' ? 'physioTherapistDayOff' :
                                 bookService === 'salon' ? 'salonProfessionalsDayOff' : '';
        const trainerDayOff = trainerDayOffKey ? (classSettings as any)[trainerDayOffKey] : 'None';
        if (trainerDayOff !== 'None' && trainerDayOff === dayOfWeek) {
          showAlert('Trainer Day Off', `${bookTrainer} is on a day off on this date.`);
          setIsBookingSubmitting(false);
          return;
        }
      }

      // 1. User overlap check
      const userBookings = bookings.filter(b => last10(b.userId) === last10(targetPhone) && b.date === bookDate && b.status === 'confirmed');
      const userOverlap = userBookings.some(b => {
        const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
        let bEnd = parseTimeToMinutes(b.time.split(' - ')[1] || '') || (bStart + 60);
        if (b.serviceId === 'salon') {
          const subSvc = b.subService || '';
          const subSvcList = subSvc.split(', ');
          const dur = subSvcList.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
          bEnd = bStart + dur;
        }
        return Math.max(proposedStart, bStart) < Math.min(proposedEnd, bEnd);
      });

      if (userOverlap) {
        showAlert('Schedule Conflict', 'This user already has another active booking overlapping with this slot.');
        setIsBookingSubmitting(false);
        return;
      }

      // 2. Massage rooms checks
      if (bookService === 'general-massage') {
        const allMassages = bookings.filter(b => b.date === bookDate && b.status === 'confirmed' && b.serviceId === 'general-massage');
        const mappedMassages = allMassages.map(b => {
          const clientObj = users.find(u => u.phoneNumber === b.userId || u.id === b.userId);
          return {
            ...b,
            userGender: b.userGender || clientObj?.gender || 'Female'
          };
        });
        const isExtended = bookExtendMassage;
        const roomOK = checkMassageRoomAvailability(proposedStart, isExtended ? 180 : 120, clientGender, mappedMassages);
        if (!roomOK) {
          showAlert('Massage Rooms Occupied', 'All massage rooms are occupied or conflict with gender rules at this slot.');
          setIsBookingSubmitting(false);
          return;
        }

        if (bookSaunaType !== 'none') {
          const saunaStart = proposedStart + (bookExtendMassage ? 90 : 60);
          const saunaEnd = saunaStart + 30;
          const saunaOverlaps = bookings.some(b => {
            if (b.date !== bookDate || !['confirmed', 'pending_group_fill', 'pending_join_request'].includes(b.status)) return false;
            
            const isSaunaBooking = b.serviceId === 'sauna';
            const isMassageWithSteam = b.serviceId === 'general-massage' && b.steamSaunaIncluded === true;
            if (!isSaunaBooking && !isMassageWithSteam) return false;
            
            const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
            let bEnd = bStart;
            if (isSaunaBooking) {
              let bBase = 15;
              bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
            } else if (isMassageWithSteam) {
              bEnd = bStart + 30;
            }
            
            return Math.max(saunaStart, bStart) < Math.min(saunaEnd, bEnd);
          });
          
          if (saunaOverlaps) {
            showAlert('Sauna Occupied', 'The Steam/Sauna option is unavailable because the Sauna is occupied at this time.');
            setIsBookingSubmitting(false);
            return;
          }
        }
      }

      // 3. Cryo startup checks
      if (bookService === 'cryo') {
        const dayCryos = bookings.filter(b => b.date === bookDate && b.status === 'confirmed' && b.serviceId === 'cryo');
        const cryoOK = isCryoSlotSelectable(proposedStart, dayCryos, false, 0);
        if (!cryoOK) {
          showAlert('Cryo Cooling Restriction', 'This slot is unavailable due to startup cooling requirements or shutdown buffer.');
          setIsBookingSubmitting(false);
          return;
        }
      }

      // 4. HBOT daily checks
      if (bookService === 'hbot') {
        const dailyHbot = bookings.filter(b => last10(b.userId) === last10(targetPhone) && b.serviceId === 'hbot' && b.date === bookDate && b.status !== 'cancelled');
        if (dailyHbot.length > 0) {
          showAlert('Daily Limit Reached', 'This user already has an HBOT booking today.');
          setIsBookingSubmitting(false);
          return;
        }
        const dayHbots = bookings.filter(b => b.serviceId === 'hbot' && b.date === bookDate && b.status === 'confirmed');
        const overlaps = dayHbots.some(b => {
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          const bEnd = bStart + (b.hbotConsecutive ? 60 : 30);
          return Math.max(proposedStart, bStart) < Math.min(proposedStart + 30, bEnd);
        });
        if (overlaps) {
          showAlert('Slot Occupied', 'The HBOT Chamber slot is already booked.');
          setIsBookingSubmitting(false);
          return;
        }
      }

      // 5. Sauna checks
      if (bookService === 'sauna') {
        const saunaOverlaps = bookings.some(b => {
          if (b.date !== bookDate || !['confirmed', 'pending_group_fill', 'pending_join_request'].includes(b.status)) return false;
          
          const isSaunaBooking = b.serviceId === 'sauna';
          const isMassageWithSteam = b.serviceId === 'general-massage' && b.steamSaunaIncluded === true;
          if (!isSaunaBooking && !isMassageWithSteam) return false;
          
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          let bEnd = bStart;
          if (isSaunaBooking) {
            let bBase = 15;
            bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
          } else if (isMassageWithSteam) {
            bEnd = bStart + 30;
          }
          
          return Math.max(proposedStart, bStart) < Math.min(proposedStart + 15, bEnd);
        });
        
        if (saunaOverlaps) {
          showAlert('Sauna Occupied', 'The Sauna is already booked at this time.');
          setIsBookingSubmitting(false);
          return;
        }
      }

      // Check Salon Capacity
      if (bookService === 'salon') {
        const salonBookings = bookings.filter(b => b.date === bookDate && b.status === 'confirmed' && b.serviceId === 'salon');
        const count = salonBookings.filter(b => {
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          let bEnd = parseTimeToMinutes(b.time.split(' - ')[1] || '') || (bStart + 60);
          if (b.serviceId === 'salon') {
            const subSvc = b.subService || '';
            const subSvcList = subSvc.split(', ');
            const dur = subSvcList.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
            bEnd = bStart + dur;
          }
          return Math.max(proposedStart, bStart) < Math.min(proposedEnd, bEnd);
        }).length;
        if (count >= 2) {
          showAlert('Salon Capacity Reached', 'There are already 2 active bookings for the salon during this window.');
          setIsBookingSubmitting(false);
          return;
        }
      }

      const selectedSvc = SERVICES_LIST.find(s => s.id === bookService);
      const serviceName = selectedSvc ? selectedSvc.name : bookService;
      const floor = selectedSvc ? selectedSvc.floor : '2nd Floor';
      
      let chargeAmount = 0;
      if (bookService === 'salon') {
        chargeAmount = bookSelectedSalonServices.reduce((acc: number, sName: string) => {
          const item = livePricing.salon.find(s => s.name === sName);
          return acc + (item ? item.price : 0);
        }, 0);
      } else if (bookService === 'physio') {
        const item = livePricing.physio.find(s => s.name === bookSubService);
        chargeAmount = item ? item.price : 0;
      } else if (bookService === 'general-massage') {
        const item = livePricing.spa.find(s => s.name === bookSubService);
        const basePrice = item ? item.price : 0;

        const isBasicTrialOrWellness = ['Basic', 'Trial', 'Wellness'].includes(clientMembership);
        const isBodyMassage60 = [
          'Body Massage - Fusion (60 Mins)',
          'Body Massage - Deep Tissue (60 Mins)'
        ].includes(bookSubService);

        chargeAmount = (isBodyMassage60 && isBasicTrialOrWellness && bookExtendMassage)
          ? Math.round(basePrice * 1.5)
          : basePrice;

        if (bookSaunaType === 'sauna') {
          chargeAmount += 500;
        }
      } else {
        chargeAmount = livePricing.wellnessPrice(bookService);
      }

      let finalBookedTime = bookTime.trim();
      if (bookService === 'salon') {
        const startPart = bookTime.split(' - ')[0];
        const dur = getSalonServiceDuration(bookSubService);
        finalBookedTime = `${startPart} - ${calculateCustomEndTime(startPart, dur)}`;
      } else if (bookService === 'general-massage') {
        const startPart = bookTime.split(' - ')[0];
        const dur = bookExtendMassage ? 90 : 60;
        finalBookedTime = `${startPart} - ${calculateCustomEndTime(startPart, dur)}`;
      }
      
      const newBookingId = 'booking_' + Math.random().toString(36).substr(2, 9);
      const bookingData: any = {
        userId: targetPhone,
        userName: bookName.trim(),
        userGender: clientGender,
        membershipType: clientMembership,
        serviceId: bookService,
        serviceName: serviceName,
        date: bookDate.trim(),
        time: finalBookedTime,
        status: 'confirmed',
        floor: floor,
        createdAt: new Date().toISOString()
      };

      if (bookSubService) {
        bookingData.subService = bookSubService;
      }

      if (bookService === 'pilates') {
        bookingData.pilatesLevel = bookPilatesLevel;
        bookingData.trainerName = bookTrainer || classSettings.pilatesTrainer;
      } else if (bookService === 'general-massage') {
        bookingData.therapistName = bookTherapist;
        const matchingTh = therapists.find(t => t.name === bookTherapist);
        if (matchingTh) {
          bookingData.therapistGender = matchingTh.gender;
        }
        bookingData.saunaType = bookSaunaType === 'none' ? null : bookSaunaType;
        bookingData.steamSaunaIncluded = bookSaunaType !== 'none';
        bookingData.extended = bookExtendMassage;
      } else if (['yoga', 'kickboxing', 'physio', 'salon'].includes(bookService)) {
        bookingData.trainerName = bookTrainer;
      }

      // 1. Save to Firestore
      await setDoc(doc(db, 'bookings', newBookingId), bookingData);

      if (chargeAmount > 0 && (clientMembership === 'Basic' || clientMembership === 'Trial' || clientMembership === 'Wellness')) {
        const dueId = 'due_' + Math.random().toString(36).substr(2, 9);
        const dueData = {
          userId: targetPhone,
          userName: bookName.trim(),
          amount: chargeAmount,
          serviceName: bookSubService || serviceName,
          date: bookDate.trim(),
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'dues', dueId), dueData);
      }

      setBookPhone('');
      setBookName('');
      setBookService('yoga');
      setBookDate(getLocalDateString());
      setBookTime('10:00 AM - 11:00 AM');
      setBookTherapist('');
      setBookSaunaType('none');
      setBookExtendMassage(false);
      setBookTrainer('');
      setBookPilatesLevel('Beginner');

      setSuccessModalMessage(`Booking for "${serviceName}" successfully created for client ${bookName.trim()}!`);
      setShowSuccessModal(true);

    } catch (e: any) {
      console.error(e);
      showAlert('Error', 'Failed to create booking: ' + (e.message || String(e)));
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  const handleCancelBooking = (bookingId: string, userName: string) => {
    const performCancel = async () => {
      try {
        const bookingToCancel = bookings.find(b => b.id === bookingId);

        await updateDoc(doc(db, 'bookings', bookingId), {
          status: 'cancelled',
          cancelledByAdmin: true,
          cancelledAt: new Date().toISOString()
        });

        // Notify Waitlist
        if (bookingToCancel) {
          const waitlistQ = query(
            collection(db, 'waitlists'),
            where('serviceId', '==', bookingToCancel.serviceId),
            where('date', '==', bookingToCancel.date),
            where('time', '==', bookingToCancel.time)
          );
          const waitlistSnap = await getDocs(waitlistQ);
          
          const notifyPromises = waitlistSnap.docs.map(wDoc => {
            const wData = wDoc.data();
            return addDoc(collection(db, 'in_app_notifications'), {
              userId: wData.userId,
              title: 'Spot Available!',
              body: `A spot opened up for ${wData.serviceName || 'your selected class'} on ${bookingToCancel.date} at ${bookingToCancel.time}. Book it now!`,
              read: false,
              createdAt: new Date().toISOString()
            });
          });
          await Promise.all(notifyPromises);
          
          const deleteWaitlistPromises = waitlistSnap.docs.map(wDoc => deleteDoc(doc(db, 'waitlists', wDoc.id)));
          await Promise.all(deleteWaitlistPromises);
        }

        // Remove pending dues
        if (bookingToCancel) {
          const duesQuery = query(
            collection(db, 'dues'),
            where('userId', '==', bookingToCancel.userId),
            where('status', '==', 'pending')
          );
          const duesSnap = await getDocs(duesQuery);
          const matchingDues = duesSnap.docs.filter(d => {
            const data = d.data();
            return data.date === bookingToCancel.date &&
              data.serviceName === bookingToCancel.serviceName;
          });
          const deletePromises = matchingDues.map(d => deleteDoc(doc(db, 'dues', d.id)));
          await Promise.all(deletePromises);
        }

        showAlert('Success', `Booking for ${userName} has been cancelled.`);
      } catch (e: any) {
        console.error('Failed to cancel booking:', e);
        showAlert('Error', 'Failed to cancel booking.');
      }
    };

    showAlert(
      'Cancel Booking',
      `Cancel the booking for ${userName}? This removes associated pending payment dues.`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: performCancel }
      ]
    );
  };

  const handleNoShow = (bookingId: string, userName: string) => {
    setNoShowTarget({ id: bookingId, name: userName });
    setShowNoShowModal(true);
  };

  const confirmNoShow = async () => {
    if (!noShowTarget) return;
    const { id: bookingId, name: userName } = noShowTarget;
    setShowNoShowModal(false);

    try {
      const booking = bookings.find(b => b.id === bookingId);
      if (!booking) return;

      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'no_show',
        noShowReportedAt: new Date().toISOString()
      });

      const userRef = doc(db, 'users', booking.userId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const newCount = (userData.noShowCount || 0) + 1;
        const isBlocked = newCount >= 3;
        
        await updateDoc(userRef, {
          noShowCount: newCount,
          isBlocked: isBlocked
        });

        if (isBlocked) {
          const bookingDetails = `${booking.serviceName || booking.serviceId} on ${booking.date} at ${booking.time}`;
          setSuccessModalMessage(`User Blocked: ${userName} has reached 3 no-shows and is now automatically blocked. They were booking ${bookingDetails} when this happened.`);
          
          // Notify all admins
          const adminUsers = users.filter(u => u.isAdmin || u.isSubAdmin);
          const notifyPromises = adminUsers.map(admin => {
            return addDoc(collection(db, 'in_app_notifications'), {
              userId: admin.id,
              title: 'Athlete Blocked Automatically',
              body: `Athlete ${userName} has been automatically blocked due to 3 no-shows. They were booking ${bookingDetails} when this happened.`,
              read: false,
              createdAt: new Date().toISOString()
            });
          });
          await Promise.all(notifyPromises);
        } else {
          setSuccessModalMessage(`${userName} marked as a no-show. Total: ${newCount}/3.`);
        }
        setShowSuccessModal(true);
      }
    } catch (err) {
      console.error('No show failed:', err);
      showAlert('Error', 'Failed to mark no-show.');
    }
  };

  const handleCompleteBooking = async (bookingId: string, userName: string) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      setSuccessModalMessage(`Session for ${userName} has been marked as completed.`);
      setShowSuccessModal(true);
    } catch (e: any) {
      console.error('Failed to complete booking:', e);
      showAlert('Error', 'Failed to complete session.');
    }
  };

  const handleEditBookingPress = (booking: Booking) => {
    setSelectedBookingToEdit(booking);
    setEditTherapistName(booking.therapistName || '');
    setEditTrainerName(booking.trainerName || '');
    setEditPilatesLevel((booking.pilatesLevel as any) || null);
    setEditTime(booking.time || '');
    setEditDate(booking.date || '');
    setEditSaunaType(booking.saunaType || (booking.steamSaunaIncluded ? 'steam' : 'none'));
    setEditExtendMassage(booking.extended || false);
    setEditModalVisible(true);
  };

  const handleSaveBookingEdit = async () => {
    if (!selectedBookingToEdit) return;
    try {
      const bookingId = selectedBookingToEdit.id;
      const updatedData: any = { time: editTime, date: editDate };

      const isMassage = selectedBookingToEdit.serviceId === 'general-massage' || selectedBookingToEdit.therapistName !== undefined;
      const hasTrainer = ['yoga', 'pilates', 'kickboxing', 'physio', 'salon'].includes(selectedBookingToEdit.serviceId) || selectedBookingToEdit.trainerName !== undefined;
      const isPilates = selectedBookingToEdit.serviceId === 'pilates' || selectedBookingToEdit.pilatesLevel !== undefined;

      // Day Off Check for Edit Booking
      const dayOfWeek = getDayOfWeek(editDate);
      if (isMassage && editTherapistName) {
        const matchingTh = therapists.find(t => t.name === editTherapistName);
        if (matchingTh) {
          const therapistDayOffKey = matchingTh.name === classSettings.massageMale1 ? 'massageMale1DayOff' :
                                     matchingTh.name === classSettings.massageMale2 ? 'massageMale2DayOff' :
                                     matchingTh.name === classSettings.massageFemale1 ? 'massageFemale1DayOff' :
                                     matchingTh.name === classSettings.massageFemale2 ? 'massageFemale2DayOff' : '';
          const therapistDayOff = therapistDayOffKey ? (classSettings as any)[therapistDayOffKey] : 'None';
          if (therapistDayOff !== 'None' && therapistDayOff === dayOfWeek) {
            showAlert('Therapist Day Off', `${matchingTh.name} is on a day off on this date.`);
            return;
          }
        }
      } else if (hasTrainer && editTrainerName) {
        const serviceId = selectedBookingToEdit.serviceId;
        const trainerDayOffKey = serviceId === 'yoga' ? 'yogaTrainerDayOff' :
                                 serviceId === 'pilates' ? 'pilatesTrainerDayOff' :
                                 serviceId === 'kickboxing' ? 'kickboxingTrainerDayOff' :
                                 serviceId === 'physio' ? 'physioTherapistDayOff' :
                                 serviceId === 'salon' ? 'salonProfessionalsDayOff' : '';
        const trainerDayOff = trainerDayOffKey ? (classSettings as any)[trainerDayOffKey] : 'None';
        if (trainerDayOff !== 'None' && trainerDayOff === dayOfWeek) {
          showAlert('Trainer Day Off', `${editTrainerName} is on a day off on this date.`);
          return;
        }
      }

      if (isMassage && editSaunaType !== 'none') {
        const proposedStart = parseTimeToMinutes(editTime.split(' - ')[0]);
        const saunaStart = proposedStart + (editExtendMassage ? 90 : 60);
        const saunaEnd = saunaStart + 30;
        const saunaOverlaps = bookings.some(b => {
          if (b.id === bookingId) return false;
          if (b.date !== editDate || !['confirmed', 'pending_group_fill', 'pending_join_request'].includes(b.status)) return false;
          
          const isSaunaBooking = b.serviceId === 'sauna';
          const isMassageWithSteam = b.serviceId === 'general-massage' && b.steamSaunaIncluded === true;
          if (!isSaunaBooking && !isMassageWithSteam) return false;
          
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          let bEnd = bStart;
          if (isSaunaBooking) {
            let bBase = 15;
            bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
          } else if (isMassageWithSteam) {
            bEnd = bStart + 30;
          }
          
          return Math.max(saunaStart, bStart) < Math.min(saunaEnd, bEnd);
        });
        
        if (saunaOverlaps) {
          showAlert('Sauna Occupied', 'The Steam/Sauna option is unavailable because the Sauna is occupied at this time.');
          return;
        }
      }

      if (isMassage) {
        updatedData.therapistName = editTherapistName;
        const matchingTh = therapists.find(t => t.name === editTherapistName);
        if (matchingTh) updatedData.therapistGender = matchingTh.gender;
        updatedData.saunaType = editSaunaType === 'none' ? null : editSaunaType;
        updatedData.steamSaunaIncluded = editSaunaType !== 'none';
        updatedData.extended = editExtendMassage;
      }
      if (hasTrainer) updatedData.trainerName = editTrainerName;
      if (isPilates) updatedData.pilatesLevel = editPilatesLevel;

      const changes: string[] = [];
      if (editDate !== selectedBookingToEdit.date) changes.push(`Date: ${editDate}`);
      if (editTime !== selectedBookingToEdit.time) changes.push(`Time: ${editTime}`);
      if (isMassage && editTherapistName !== selectedBookingToEdit.therapistName) changes.push(`Therapist: ${editTherapistName}`);
      if (hasTrainer && editTrainerName !== selectedBookingToEdit.trainerName) changes.push(`Trainer: ${editTrainerName}`);
      if (isPilates && editPilatesLevel !== selectedBookingToEdit.pilatesLevel) changes.push(`Level: ${editPilatesLevel}`);
      if (isMassage && editSaunaType !== (selectedBookingToEdit.saunaType || (selectedBookingToEdit.steamSaunaIncluded ? 'steam' : 'none'))) {
        changes.push(`Sauna Type: ${editSaunaType}`);
      }
      if (isMassage && editExtendMassage !== (selectedBookingToEdit.extended || false)) {
        changes.push(editExtendMassage ? 'Extended 30 min' : 'Extension removed');
      }

      if (changes.length > 0) {
        updatedData.updatedByAdmin = true;
        updatedData.updatedAt = new Date().toISOString();
        updatedData.lastChangeSummary = changes.join(' • ');
      }

      await updateDoc(doc(db, 'bookings', bookingId), updatedData);

      setEditModalVisible(false);
      setSelectedBookingToEdit(null);
      setSuccessModalMessage('Booking updated successfully!');
      setShowSuccessModal(true);
    } catch (e: any) {
      showAlert('Error', 'Failed to save edits: ' + (e.message || String(e)));
    }
  };

  const getSlotsForServiceAndDate = (serviceId: string, date: string, currentBookingId: string) => {
    let baseTimes: string[] = [];
    if (serviceTimings && serviceTimings[serviceId]?.baseTimes) {
      baseTimes = serviceTimings[serviceId].baseTimes;
    } else if (serviceId === 'physio') {
      baseTimes = [
        '07:30 AM - 08:15 AM', '08:15 AM - 09:00 AM', '09:00 AM - 09:45 AM',
        '09:45 AM - 10:30 AM', '10:30 AM - 11:15 AM', '11:15 AM - 12:00 PM'
      ];
    } else if (serviceId === 'yoga') {
      baseTimes = ['07:00 AM - 08:00 AM'];
    } else if (serviceId === 'pilates') {
      baseTimes = [
        '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM',
        '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM'
      ];
    } else if (serviceId === 'kickboxing') {
      baseTimes = [
        '06:00 AM - 07:00 AM', '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM',
        '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM'
      ];
    } else if (serviceId === 'general-massage') {
      baseTimes = [
        '08:00 AM - 10:00 AM', '10:00 AM - 12:00 PM', '12:00 PM - 02:00 PM',
        '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM', '06:00 PM - 08:00 PM',
        '08:00 PM - 10:00 PM'
      ];
    } else if (serviceId === 'cryo') {
      baseTimes = [
        '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM',
        '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM', '01:00 PM - 02:00 PM',
        '02:00 PM - 03:00 PM', '03:00 PM - 04:00 PM', '04:00 PM - 05:00 PM',
        '05:00 PM - 06:00 PM', '06:00 PM - 07:00 PM', '07:00 PM - 08:00 PM',
        '08:00 PM - 09:00 PM', '09:00 PM - 10:00 PM', '10:00 PM - 11:00 PM'
      ];
    } else if (serviceId === 'sauna' || serviceId === 'red-light') {
      baseTimes = [
        '08:00 AM - 08:15 AM', '08:30 AM - 08:45 AM', '09:00 AM - 09:15 AM', '09:30 AM - 09:45 AM',
        '10:00 AM - 10:15 AM', '10:30 AM - 10:45 AM', '11:00 AM - 11:15 AM', '11:30 AM - 11:45 AM',
        '02:00 PM - 02:15 PM', '02:30 PM - 02:45 PM', '03:00 PM - 03:15 PM', '03:30 PM - 03:45 PM',
        '04:00 PM - 04:15 PM', '04:30 PM - 04:45 PM', '05:00 PM - 05:15 PM', '05:30 PM - 05:45 PM',
        '06:00 PM - 06:15 PM', '06:30 PM - 06:45 PM'
      ];
    } else if (serviceId === 'hbot') {
      baseTimes = [
        '08:00 AM - 08:30 AM', '08:30 AM - 09:00 AM', '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM',
        '10:00 AM - 10:30 AM', '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
        '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '01:00 PM - 01:30 PM', '01:30 PM - 02:00 PM',
        '02:00 PM - 02:30 PM', '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
        '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM', '05:30 PM - 06:00 PM',
        '06:00 PM - 06:30 PM', '06:30 PM - 07:00 PM'
      ];
    } else {
      baseTimes = [
        '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM',
        '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM', '02:00 PM - 03:00 PM',
        '03:00 PM - 04:00 PM', '04:00 PM - 05:00 PM', '05:00 PM - 06:00 PM',
        '06:00 PM - 07:00 PM'
      ];
    }

    const rawDayBookings = bookings.filter(b => b.date === date && b.status === 'confirmed' && b.id !== currentBookingId);
    const dayBookings = rawDayBookings.map(b => {
      const clientObj = users.find(u => u.phoneNumber === b.userId || u.id === b.userId);
      return {
        ...b,
        userGender: b.userGender || clientObj?.gender || 'Female'
      };
    });

    const maxCapacityMap: Record<string, number> = {
      yoga: parseInt(classSettings.yogaCapacity) || 10,
      pilates: parseInt(classSettings.pilatesCapacity) || 3,
      kickboxing: parseInt(classSettings.kickboxingCapacity) || 5,
      'general-massage': 2,
      'salon': 2,
      physio: 1,
      cryo: 1,
      'red-light': 1,
      hbot: 1
    };

    const maxCapacity = maxCapacityMap[serviceId] || 1;

    let userGender: 'Male' | 'Female' = 'Female';
    if (currentBookingId) {
      const bEdited = bookings.find(b => b.id === currentBookingId);
      const clientObj = users.find(u => u.phoneNumber === bEdited?.userId || u.id === bEdited?.userId);
      if (clientObj?.gender) userGender = clientObj.gender;
    } else if (matchedUserForBooking?.gender) {
      userGender = matchedUserForBooking.gender;
    }

    return baseTimes.map((time) => {
      let isAvailable = true;
      let count = 0;
      let slotTime = time;

      if (serviceId === 'salon') {
        const startPart = time.split(' - ')[0];
        let duration = 30;
        if (currentBookingId) {
          const editingBooking = bookings.find(b => b.id === currentBookingId);
          if (editingBooking && editingBooking.subService) {
            const subServices = editingBooking.subService.split(', ');
            duration = subServices.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
          } else {
            duration = getSalonServiceDuration(bookSubService);
          }
        } else {
          duration = getSalonServiceDuration(bookSubService);
        }
        slotTime = `${startPart} - ${calculateCustomEndTime(startPart, duration)}`;
      }

      if (['yoga', 'pilates', 'kickboxing'].includes(serviceId)) {
        count = dayBookings.filter(b => b.serviceId === serviceId && b.time === time).length;
        isAvailable = count < maxCapacity;
      } else if (serviceId === 'general-massage') {
        const proposedStart = parseTimeToMinutes(time.split(' - ')[0]);
        const allMassages = dayBookings.filter(b => b.serviceId === 'general-massage');
        const roomOK = checkMassageRoomAvailability(proposedStart, 120, userGender, allMassages);
        if (!roomOK) isAvailable = false;
      } else if (serviceId === 'cryo') {
        const proposedStart = parseTimeToMinutes(time.split(' - ')[0]);
        const cryoOK = isCryoSlotSelectable(proposedStart, dayBookings, false, 0);
        if (!cryoOK) isAvailable = false;
      } else if (serviceId === 'hbot') {
        const proposedStart = parseTimeToMinutes(time.split(' - ')[0]);
        const hbotBookings = dayBookings.filter(b => b.serviceId === 'hbot');
        const isOccupied = hbotBookings.some(b => {
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          const bEnd = bStart + (b.hbotConsecutive ? 60 : 30);
          return Math.max(proposedStart, bStart) < Math.min(proposedStart + 30, bEnd);
        });
        isAvailable = !isOccupied;
      } else if (serviceId === 'salon') {
        const startPart = time.split(' - ')[0];
        let duration = 30;
        if (currentBookingId) {
          const editingBooking = bookings.find(b => b.id === currentBookingId);
          if (editingBooking && editingBooking.subService) {
            const subServices = editingBooking.subService.split(', ');
            duration = subServices.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
          } else {
            duration = getSalonServiceDuration(bookSubService);
          }
        } else {
          duration = getSalonServiceDuration(bookSubService);
        }
        const proposedStart = parseTimeToMinutes(startPart);
        const proposedEnd = proposedStart + duration;
        const salonBookings = dayBookings.filter(b => b.serviceId === 'salon');
        count = salonBookings.filter(b => {
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          let bEnd = parseTimeToMinutes(b.time.split(' - ')[1] || '') || (bStart + 60);
          if (b.serviceId === 'salon') {
            const subSvc = b.subService || '';
            const subSvcList = subSvc.split(', ');
            const dur = subSvcList.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
            bEnd = bStart + dur;
          }
          return Math.max(proposedStart, bStart) < Math.min(proposedEnd, bEnd);
        }).length;
        isAvailable = count < maxCapacity;
      } else if (serviceId === 'sauna') {
        const proposedStart = parseTimeToMinutes(time.split(' - ')[0]);
        const overlaps = dayBookings.filter(b => {
          const isSaunaBooking = b.serviceId === 'sauna';
          const isMassageWithSteam = b.serviceId === 'general-massage' && b.steamSaunaIncluded === true;
          if (!isSaunaBooking && !isMassageWithSteam) return false;
          
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          let bEnd = bStart;
          if (isSaunaBooking) {
            let bBase = 15;
            bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
          } else if (isMassageWithSteam) {
            bEnd = bStart + 30;
          }
          return Math.max(proposedStart, bStart) < Math.min(proposedStart + 15, bEnd);
        });
        isAvailable = overlaps.length < 1;
      } else {
        count = dayBookings.filter(b => b.serviceId === serviceId && b.time === time).length;
        isAvailable = count < maxCapacity;
      }
 
      return { time: slotTime, isAvailable, count, maxCapacity };
    });
  };

  const filteredBookings = bookingFilter === 'all'
    ? bookings
    : bookings.filter(b => b.serviceId === bookingFilter);

  const activeBookings = filteredBookings.filter(b => 
    b.status === 'confirmed' && 
    (!searchQuery.trim() || b.userName.toLowerCase().includes(searchQuery.toLowerCase().trim()) || b.userId.includes(searchQuery.trim()))
  );

  const completedBookings = filteredBookings.filter(b => 
    b.status === 'completed' && 
    (!searchQuery.trim() || b.userName.toLowerCase().includes(searchQuery.toLowerCase().trim()) || b.userId.includes(searchQuery.trim()))
  );

  const cancelledBookings = filteredBookings.filter(b => 
    b.status === 'cancelled' && 
    (!searchQuery.trim() || b.userName.toLowerCase().includes(searchQuery.toLowerCase().trim()) || b.userId.includes(searchQuery.trim()))
  );

  const serviceTypes = [
    { label: 'All Services', value: 'all' },
    { label: 'Yoga', value: 'yoga' },
    { label: 'Pilates', value: 'pilates' },
    { label: 'Kickboxing', value: 'kickboxing' },
    { label: 'Massage', value: 'general-massage' },
    { label: 'Cryo', value: 'cryo' },
    { label: 'Physio', value: 'physio' },
    { label: 'Salon', value: 'salon' },
  ];

  const generateUpcomingDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
    return dates;
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: Platform.OS === 'ios' ? 0 : 10 }}>
              <PressSpring
                onPress={() => {
                  setScannerVisible(true);
                  setScanned(false);
                }}
                contentStyle={styles.headerScannerBtn}
                scaleTo={0.92}
                hapticStyle="selection"
                fullWidth={false}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <FontAwesome name="qrcode" size={14} color="#0B0B0B" style={{ marginRight: 6 }} />
                  <Text style={styles.headerScannerBtnText}>Scan QR</Text>
                </View>
              </PressSpring>
              <PressSpring 
                onPress={async () => {
                  await logout();
                  router.replace('/login');
                }}
                contentStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
                scaleTo={0.88}
                hapticStyle="heavy"
                fullWidth={false}
              >
                <FontAwesome name="sign-out" size={18} color="#B84600" />
              </PressSpring>
            </View>
          )
        }}
      />
      
      {/* Top Navigation Header */}
      <View style={styles.topNav}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
          <Link href={"/(admin)" as any} asChild>
            <PressSpring 
              contentStyle={styles.navBtn}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="users" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Members</Text>
              </View>
            </PressSpring>
          </Link>
          <PressSpring
            style={[styles.navBtn, styles.navBtnActive]}
            scaleTo={0.96}
            hapticStyle="selection"
            fullWidth={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <FontAwesome name="calendar" size={13} color="#B84600" style={{ marginRight: 6 }} />
              <Text style={styles.navBtnTextActive}>Bookings</Text>
            </View>
          </PressSpring>
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

      {/* Create Client Booking Form */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}><FontAwesome name="calendar-plus-o" size={14} color={colors.tint} />  Create Client Booking</Text>
        
        <View style={styles.formRow}>
          <View style={styles.formCol}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Client Name</Text>
            <TextInput
              style={[styles.formInput, { borderBottomColor: colors.border, color: colors.text }]}
              placeholder="Client Name"
              placeholderTextColor="#5C5040"
              value={bookName}
              onChangeText={(text) => {
                setBookName(text);
                setShowSuggestions(true);
              }}
            />
          </View>
          <View style={styles.formCol}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Client Phone</Text>
            <TextInput
              style={[styles.formInput, { borderBottomColor: colors.border, color: colors.text }]}
              placeholder="e.g. 9876543210"
              placeholderTextColor="#5C5040"
              value={bookPhone}
              onChangeText={(text) => {
                const digits = text.replace(/\D/g, '').slice(0, 10);
                setBookPhone(digits);
              }}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {showSuggestions && nameSuggestions.length > 0 && (
          <View style={[styles.suggestionsContainer, { borderColor: colors.border, marginBottom: 18 }]}>
            {nameSuggestions.slice(0, 5).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setBookName(item.name);
                  const cleanPhone = (item.phoneNumber || item.id || '').replace(/\D/g, '').slice(-10);
                  setBookPhone(cleanPhone);
                  setShowSuggestions(false);
                }}
              >
                <FontAwesome name="user" size={12} color={colors.secondaryText} style={{ marginRight: 8 }} />
                <Text style={[styles.suggestionText, { color: colors.text }]}>
                  {item.name} <Text style={{ color: colors.secondaryText, fontSize: 11 }}>({item.id})</Text>
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {matchedUserForBooking && (
          <View style={styles.memberLookupBadge}>
            <FontAwesome name="check-circle" size={12} color="#6B9E76" style={{ marginRight: 6 }} />
            <Text style={styles.memberLookupText}>
              Member Found: {matchedUserForBooking.name} ({matchedUserForBooking.membershipType})
            </Text>
          </View>
        )}

        <View style={styles.formRow}>
          <View style={[styles.formCol, { width: '100%' }]}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Select Service / Equipment</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.serviceChipsRow}>
              {SERVICES_LIST.map((svc) => {
                const isSelected = bookService === svc.id;
                return (
                  <PressSpring
                    key={svc.id}
                    contentStyle={[
                      styles.serviceChip,
                      { borderColor: colors.border },
                      isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }
                    ]}
                    onPress={() => setBookService(svc.id)}
                    scaleTo={0.92}
                    hapticStyle="selection"
                    fullWidth={false}
                  >
                    <Text style={[styles.serviceChipText, isSelected ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                      {svc.name}
                    </Text>
                  </PressSpring>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={[styles.formCol, { width: '100%' }]}>
            <Text style={[styles.formLabel, { color: colors.secondaryText, marginBottom: 8 }]}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
              {generateUpcomingDates().map(dStr => {
                const dObj = new Date(dStr);
                const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = dObj.getDate();
                const isSelected = bookDate === dStr;
                return (
                  <PressSpring
                    key={dStr}
                    contentStyle={[
                      { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginRight: 8, alignItems: 'center' },
                      isSelected ? { backgroundColor: colors.tint, borderColor: colors.tint } : { borderColor: colors.border }
                    ]}
                    onPress={() => setBookDate(dStr)}
                    scaleTo={0.92}
                    hapticStyle="selection"
                    fullWidth={false}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, color: isSelected ? '#0B0B0B' : colors.secondaryText, marginBottom: 2, textTransform: 'uppercase' }}>{dayName}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', fontFamily: TheOneTypography.bodyFamily, color: isSelected ? '#0B0B0B' : colors.text }}>{dayNum}</Text>
                    </View>
                  </PressSpring>
                );
              })}
            </ScrollView>
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={[styles.formCol, { width: '100%' }]}>
            <Text style={[styles.formLabel, { color: colors.secondaryText, marginTop: 12, marginBottom: 8 }]}>Time Slot</Text>
            {['yoga', 'pilates', 'kickboxing', 'physio'].includes(bookService) ? (
              <View style={styles.editModalChipRow}>
                {getSlotsForServiceAndDate(bookService, bookDate, '').map((slot) => {
                  const isSelected = bookTime === slot.time;
                  return (
                    <PressSpring
                      key={slot.time}
                      contentStyle={[
                        styles.editModalChip,
                        { borderColor: colors.border },
                        !slot.isAvailable && { opacity: 0.3 },
                        isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }
                      ]}
                      onPress={() => {
                        if (slot.isAvailable || isSelected) {
                          setBookTime(slot.time);
                        } else {
                          showAlert('Slot Occupied', 'This slot conflicts with active bookings or spacing policies.');
                        }
                      }}
                      scaleTo={0.92}
                      hapticStyle="selection"
                      fullWidth={false}
                    >
                      <Text style={[styles.editModalChipText, isSelected ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                        {slot.time} {['yoga', 'pilates', 'kickboxing'].includes(bookService) ? `(${Math.max(0, slot.maxCapacity - slot.count)} left)` : ''} {!slot.isAvailable && '(Full)'}
                      </Text>
                    </PressSpring>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  playClickSound();
                  setPickerTarget('create');
                  const startPart = bookTime.split(' - ')[0] || '09:00 AM';
                  const match = startPart.trim().match(/^(\d+):(\d+)\s*(AM|PM)/i);
                  if (match) {
                    setTempHour(match[1]);
                    setTempMinute(match[2]);
                    setTempAmPm(match[3].toUpperCase() as any);
                  } else {
                    setTempHour('09');
                    setTempMinute('00');
                    setTempAmPm('AM');
                  }
                  setShowTimePickerModal(true);
                }}
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 14,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <FontAwesome name="clock-o" size={18} color={colors.tint} />
                  <View style={{ backgroundColor: 'transparent' }}>
                    <Text style={{ color: colors.secondaryText, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }}>BOOKED SLOT TIME</Text>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2, fontFamily: TheOneTypography.headlineFamily }}>
                      {bookTime || 'Select Time Slot'}
                    </Text>
                  </View>
                </View>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 8 }}>
                  <FontAwesome name="pencil" size={14} color={colors.tint} />
                </View>
              </TouchableOpacity>
            )}

            {/* Custom Time Helper block for non-fixed services */}
            {!['yoga', 'pilates', 'kickboxing', 'physio'].includes(bookService) && (() => {
              const slots = getSlotsForServiceAndDate(bookService, bookDate, '');
              const firstStart = slots[0]?.time.split(' - ')[0] || '08:00 AM';
              const lastEnd = slots[slots.length - 1]?.time.split(' - ')[1] || '10:00 PM';
              
              const dayBookings = bookings.filter(b => b.date === bookDate && b.serviceId === bookService && b.status === 'confirmed');
              
              return (
                <View style={{
                  marginTop: 12,
                  padding: 14,
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border
                }}>
                  {/* Operating Hours Info */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: dayBookings.length > 0 ? 12 : 0 }}>
                    <FontAwesome name="info-circle" size={14} color={colors.tint} />
                    <Text style={{ fontSize: 11, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText }}>
                      Operating Hours: <Text style={{ fontWeight: '700', color: colors.text }}>{firstStart} - {lastEnd}</Text>
                    </Text>
                  </View>

                  {/* Booked Slots List */}
                  {dayBookings.length > 0 && (
                    <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 10 }}>
                      <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, fontWeight: '700', color: colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                        🚫 Booked / Occupied Slots
                      </Text>
                      {dayBookings.map((b, idx) => (
                        <View key={idx} style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: 5,
                          borderBottomWidth: idx === dayBookings.length - 1 ? 0 : 1,
                          borderBottomColor: 'rgba(255,255,255,0.03)'
                        }}>
                          <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, color: colors.text, fontWeight: '600' }}>
                            {b.userName}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText }}>{b.time}</Text>
                            <View style={{ backgroundColor: 'rgba(255, 69, 58, 0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, color: '#FF453A', fontWeight: '700' }}>OCCUPIED</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        </View>

        {/* Dynamic Fields */}
        {bookService === 'general-massage' && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Assigned Therapist</Text>
            <View style={styles.editModalChipRow}>
              {therapists.map((th) => {
                const isSelected = bookTherapist === th.name;
                return (
                  <PressSpring
                    key={th.name}
                    contentStyle={[
                      styles.editModalChip,
                      { borderColor: colors.border },
                      isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }
                    ]}
                    onPress={() => setBookTherapist(th.name)}
                    scaleTo={0.92}
                    hapticStyle="selection"
                    fullWidth={false}
                  >
                    <Text style={[styles.editModalChipText, isSelected ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                      {th.name} ({th.gender.charAt(0)})
                    </Text>
                  </PressSpring>
                );
              })}
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formCol, { width: '52%' }]}>
                <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Add-on After Massage</Text>
                <View style={styles.adminSegmentedRow}>
                  {([
                    { label: 'None', value: 'none' as const },
                    { label: 'Steam', value: 'steam' as const },
                    { label: 'Sauna', value: 'sauna' as const }
                  ]).map((t) => (
                    <PressSpring
                      key={t.value}
                      contentStyle={[
                        styles.adminSegmentBtn,
                        bookSaunaType === t.value ? { backgroundColor: colors.tint } : { backgroundColor: 'transparent' }
                      ]}
                      onPress={() => setBookSaunaType(t.value)}
                      scaleTo={0.92}
                      hapticStyle="selection"
                      fullWidth={true}
                      style={{ flex: 1 }}
                    >
                      <Text style={[styles.adminSegmentText, bookSaunaType === t.value ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                        {t.label}
                      </Text>
                    </PressSpring>
                  ))}
                </View>
              </View>

              <View style={[styles.formCol, { width: '44%', justifyContent: 'flex-end' }]}>
                <PressSpring
                  contentStyle={[styles.editModalCheckRow, { borderColor: colors.border, marginTop: 0, paddingVertical: 10, borderRadius: 12 }]}
                  onPress={() => setBookExtendMassage(!bookExtendMassage)}
                  scaleTo={0.96}
                  hapticStyle="selection"
                  fullWidth={true}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[
                      styles.editModalCheckbox,
                      { borderColor: bookExtendMassage ? colors.tint : colors.border, borderRadius: 12 },
                      bookExtendMassage && { backgroundColor: colors.tint }
                    ]}>
                      {bookExtendMassage && <FontAwesome name="check" size={10} color="#0B0B0B" />}
                    </View>
                    <Text style={[styles.editModalCheckLabel, { color: colors.text, fontSize: 12, fontFamily: TheOneTypography.bodyFamily }]}>Extend 30 min</Text>
                  </View>
                </PressSpring>
              </View>
            </View>
          </View>
        )}

        {['salon', 'physio', 'general-massage'].includes(bookService) && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Select Sub-Service</Text>
            {bookService === 'salon' ? (
              // Multi-select chips for salon
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 6 }}>
                {livePricing.salon.map((item) => {
                  const isSelected = bookSelectedSalonServices.includes(item.name);
                  return (
                    <PressSpring
                      key={item.name}
                      contentStyle={[
                        { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
                        isSelected ? { backgroundColor: colors.tint, borderColor: colors.tint } : { borderColor: colors.border }
                      ]}
                      onPress={() => {
                        setBookSelectedSalonServices(prev => {
                          const next = isSelected ? prev.filter(n => n !== item.name) : [...prev, item.name];
                          setBookSubService(next.join(', '));
                          return next;
                        });
                      }}
                      scaleTo={0.92}
                      hapticStyle="selection"
                      fullWidth={false}
                    >
                      <Text style={[{ fontSize: 12, fontFamily: TheOneTypography.bodyFamily }, isSelected ? { color: '#0B0B0B', fontWeight: '600' } : { color: colors.text }]}>
                        {item.name} (₹{item.price})
                      </Text>
                    </PressSpring>
                  );
                })}
              </View>
            ) : (
              // Single-select chips for physio / massage
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 6 }}>
                {(bookService === 'physio' ? livePricing.physio : livePricing.spa).map((item) => {
                  const isSelected = bookSubService === item.name;
                  const isClientPremium = matchedUserForBooking
                    ? ['Basic', 'Trial', 'Wellness'].includes(matchedUserForBooking.membershipType)
                    : true;
                  return (
                    <PressSpring
                      key={item.name}
                      contentStyle={[
                        { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginRight: 8, alignItems: 'center' },
                        isSelected ? { backgroundColor: colors.tint, borderColor: colors.tint } : { borderColor: colors.border }
                      ]}
                      onPress={() => setBookSubService(item.name)}
                      scaleTo={0.92}
                      hapticStyle="selection"
                      fullWidth={false}
                    >
                      <Text style={[{ fontSize: 12, fontFamily: TheOneTypography.bodyFamily }, isSelected ? { color: '#0B0B0B', fontWeight: '600' } : { color: colors.text }]}>
                        {item.name} {isClientPremium ? `(₹${item.price})` : ''}
                      </Text>
                    </PressSpring>
                  );
                })}
              </ScrollView>
            )}
            {bookService === 'salon' && bookSelectedSalonServices.length > 0 && (
              <Text style={{ fontSize: 11, color: colors.secondaryText, marginTop: 6 }}>
                {bookSelectedSalonServices.length} selected · Total: {getSalonServiceDuration(bookSubService)} mins
              </Text>
            )}
          </View>
        )}

        {bookService === 'pilates' && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Pilates Level</Text>
            <View style={styles.adminSegmentedRow}>
              {(['Beginner', 'Intermediate', 'Advanced'] as const).map((level) => (
                <PressSpring
                  key={level}
                  contentStyle={[
                    styles.adminSegmentBtn,
                    bookPilatesLevel === level ? { backgroundColor: colors.tint } : { backgroundColor: 'transparent' }
                  ]}
                  onPress={() => setBookPilatesLevel(level)}
                  scaleTo={0.92}
                  hapticStyle="selection"
                  fullWidth={true}
                  style={{ flex: 1 }}
                >
                  <Text style={[styles.adminSegmentText, bookPilatesLevel === level ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                    {level}
                  </Text>
                </PressSpring>
              ))}
            </View>
          </View>
        )}

        {['yoga', 'pilates', 'kickboxing', 'physio', 'salon'].includes(bookService) && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.formLabel, { color: colors.secondaryText }]}>Assigned Trainer / Staff Name</Text>
            <TextInput
              style={[styles.formInput, { borderBottomColor: colors.border, color: colors.text }]}
              placeholder="Trainer / Staff name"
              placeholderTextColor="#5C5040"
              value={bookTrainer}
              onChangeText={setBookTrainer}
            />
          </View>
        )}

        <PressSpring
          contentStyle={styles.submitBtn}
          onPress={handleCreateBooking}
          disabled={isBookingSubmitting}
          scaleTo={0.94}
          hapticStyle="heavy"
          fullWidth={true}
        >
          {isBookingSubmitting ? (
            <ActivityIndicator size="small" color="#0B0B0B" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome name="plus" size={13} color="#0B0B0B" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>Create Booking</Text>
            </View>
          )}
        </PressSpring>
      </View>

      <View style={{ marginVertical: 12 }} />

      {/* Bookings Management List */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Filter by Service</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {serviceTypes.map((type) => {
          const isSelected = bookingFilter === type.value;
          return (
            <PressSpring
              key={type.value}
              contentStyle={[
                styles.filterPill,
                isSelected ? { backgroundColor: colors.tint } : { borderColor: colors.border, borderWidth: 1 }
              ]}
              onPress={() => {
                playSlideSound();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setBookingFilter(type.value);
              }}
              scaleTo={0.92}
              hapticStyle="selection"
              fullWidth={false}
            >
              <Text style={[styles.filterPillText, isSelected ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                {type.label}
              </Text>
            </PressSpring>
          );
        })}
      </ScrollView>

      {/* Search Bookings */}
      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text, marginTop: 10 }]}
        placeholder="Search bookings by client name or phone..."
        placeholderTextColor="#5C5040"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {/* Active Bookings Section */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Active Bookings ({activeBookings.length})</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 20 }} />
      ) : activeBookings.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FontAwesome name="calendar" size={28} color={colors.secondaryText} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.secondaryText, fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>No active bookings found</Text>
        </View>
      ) : (
        <View>
          {activeBookings.map((item) => (
            <View key={item.id} style={[
              styles.bookingItemCard, 
              { backgroundColor: colors.card, borderColor: colors.border }, 
              item.seen && { borderLeftWidth: 4, borderLeftColor: '#6B9E76' },
              !item.seen && { borderLeftWidth: 4, borderLeftColor: '#B84600' }
            ]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <PressSpring 
                  onPress={async () => {
                    try {
                      await updateDoc(doc(db, 'bookings', item.id), {
                        seen: !item.seen
                      });
                    } catch (err) {
                      console.error('Failed to toggle seen status:', err);
                    }
                  }}
                  contentStyle={styles.seenCheckboxContainer}
                  scaleTo={0.88}
                  hapticStyle="selection"
                  fullWidth={false}
                >
                  <FontAwesome 
                    name={item.seen ? "check-square" : "square-o"} 
                    size={18} 
                    color={item.seen ? "#6B9E76" : colors.secondaryText} 
                  />
                </PressSpring>

                <View style={styles.bookingItemLeft}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                    <Text style={[styles.bookingItemTitle, { color: colors.text, marginBottom: 0 }]}>
                      {item.serviceName}{item.subService ? ` · ${item.subService}` : ''}
                    </Text>
                    {item.saunaCategory && (item.saunaCategory === 'Couple' || item.saunaCategory === 'Group (2-8)') && !item.isJoiner && (
                      <View style={{ backgroundColor: 'rgba(107, 158, 118, 0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, marginLeft: 8 }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#6B9E76', letterSpacing: 0.5 }}>HOST</Text>
                      </View>
                    )}
                    {item.saunaCategory && (item.saunaCategory === 'Couple' || item.saunaCategory === 'Group (2-8)') && item.isJoiner && (
                      <View style={{ backgroundColor: 'rgba(107, 158, 118, 0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, marginLeft: 8 }}>
                        <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#6B9E76', letterSpacing: 0.5 }}>MEMBER</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.bookingItemUser, { color: colors.secondaryText }]}>Client: {item.userName} ({item.userId})</Text>
                  {item.isJoiner && item.primaryBookingId && (
                    <Text style={[styles.bookingItemUser, { color: colors.secondaryText, fontSize: 11, marginTop: 2 }]}>
                      ↳ Joined Host: {bookings.find(b => b.id === item.primaryBookingId)?.userName || 'Unknown'}
                    </Text>
                  )}
                  <Text style={[styles.bookingItemTime, { color: colors.text }]}>
                    <FontAwesome name="clock-o" size={11} color={colors.tint} /> {formatDateDMY(item.date)} @ {item.time}
                  </Text>

                  <View style={styles.metaRow}>
                    {item.floor && <Text style={styles.metaBadge}>{item.floor}</Text>}
                    {item.therapistName && <Text style={styles.metaBadge}>Therapist: {item.therapistName}</Text>}
                    {item.trainerName && <Text style={styles.metaBadge}>Trainer: {item.trainerName}</Text>}
                    {item.pilatesLevel && <Text style={styles.metaBadge}>{item.pilatesLevel}</Text>}
                    {item.steamSaunaIncluded && <Text style={styles.metaBadge}>Steam/Sauna Included</Text>}
                    {item.hbotConsecutive && <Text style={styles.metaBadge}>Double Session (60m)</Text>}
                  </View>
                </View>

                <View style={styles.bookingItemRight}>
                  <PressSpring 
                    contentStyle={[styles.doneBookingBtn, { marginBottom: 6 }]}
                    onPress={() => handleCompleteBooking(item.id, item.userName)}
                    scaleTo={0.94}
                    hapticStyle="medium"
                    fullWidth={true}
                  >
                    <Text style={styles.doneBookingText}>Complete</Text>
                  </PressSpring>
                  <PressSpring 
                    contentStyle={[styles.editBookingBtn, { marginBottom: 6 }]}
                    onPress={() => handleEditBookingPress(item)}
                    scaleTo={0.94}
                    hapticStyle="selection"
                    fullWidth={true}
                  >
                    <Text style={styles.editBookingText}>Edit</Text>
                  </PressSpring>
                  <PressSpring 
                    contentStyle={[styles.cancelBookingBtn, { marginBottom: 6 }]}
                    onPress={() => handleCancelBooking(item.id, item.userName)}
                    scaleTo={0.94}
                    hapticStyle="heavy"
                    fullWidth={true}
                  >
                    <Text style={styles.cancelBookingText}>Cancel</Text>
                  </PressSpring>
                  <PressSpring 
                    contentStyle={[styles.cancelBookingBtn, { backgroundColor: 'rgba(196, 96, 87, 0.08)' }]}
                    onPress={() => handleNoShow(item.id, item.userName)}
                    scaleTo={0.94}
                    hapticStyle="heavy"
                    fullWidth={true}
                  >
                    <Text style={[styles.cancelBookingText, { color: '#C46057' }]}>No-Show</Text>
                  </PressSpring>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Completed Bookings Section */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Completed History ({completedBookings.length})</Text>
      {completedBookings.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.secondaryText, fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>No completed history found</Text>
        </View>
      ) : (
        <View>
          {completedBookings.slice(0, 15).map((item) => (
            <View key={item.id} style={[styles.bookingItemCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: '#6B9E76', opacity: 0.7 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bookingItemTitle, { color: colors.text }]}>{item.serviceName}</Text>
                  <Text style={[styles.bookingItemUser, { color: colors.secondaryText }]}>Client: {item.userName}</Text>
                  <Text style={[styles.bookingItemTime, { color: colors.text }]}>{formatDateDMY(item.date)} @ {item.time}</Text>
                </View>
                <Text style={{ color: '#6B9E76', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>COMPLETED</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Cancelled Bookings Section */}
      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Cancelled History ({cancelledBookings.length})</Text>
      {cancelledBookings.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.secondaryText, fontSize: 13, fontFamily: TheOneTypography.bodyFamily }}>No cancelled history found</Text>
        </View>
      ) : (
        <View>
          {cancelledBookings.slice(0, 15).map((item) => (
            <View key={item.id} style={[styles.bookingItemCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftWidth: 4, borderLeftColor: '#C46057', opacity: 0.6 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bookingItemTitle, { color: colors.text }]}>{item.serviceName}</Text>
                  <Text style={[styles.bookingItemUser, { color: colors.secondaryText }]}>Client: {item.userName}</Text>
                  <Text style={[styles.bookingItemTime, { color: colors.text }]}>{formatDateDMY(item.date)} @ {item.time}</Text>
                </View>
                <Text style={{ color: '#C46057', fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>CANCELLED</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* No Show Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showNoShowModal}
        onRequestClose={() => setShowNoShowModal(false)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setShowNoShowModal(false)}>
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { backgroundColor: 'rgba(196, 96, 87, 0.12)', borderColor: '#C46057', borderWidth: 1 }]}>
              <FontAwesome name="exclamation-circle" size={24} color="#C46057" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Report No-Show</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>
              Are you sure you want to mark "{noShowTarget?.name}" as a no-show? 
              This increases their strike count. Reaching 3 strikes will automatically block the member.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 12 }}>
              <PressSpring
                contentStyle={[styles.popupButton, { backgroundColor: '#C46057' }]}
                onPress={confirmNoShow}
                scaleTo={0.94}
                hapticStyle="heavy"
                fullWidth={true}
                style={{ flex: 0.48 }}
              >
                <Text style={[styles.popupButtonText, { color: '#0B0B0B' }]}>Mark</Text>
              </PressSpring>
              <PressSpring
                contentStyle={[styles.popupButton, { backgroundColor: '#1E1E22' }]}
                onPress={() => setShowNoShowModal(false)}
                scaleTo={0.96}
                hapticStyle="light"
                fullWidth={true}
                style={{ flex: 0.48 }}
              >
                <Text style={[styles.popupButtonText, { color: colors.text }]}>Cancel</Text>
              </PressSpring>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Success Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={() => setShowSuccessModal(false)}
      >
        <Pressable style={styles.popupOverlay} onPress={() => setShowSuccessModal(false)}>
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { backgroundColor: 'rgba(107, 158, 118, 0.12)', borderColor: '#6B9E76', borderWidth: 1 }]}>
              <FontAwesome name="check" size={24} color="#6B9E76" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Success</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>{successModalMessage}</Text>
            <PressSpring 
              contentStyle={[styles.popupButton, { backgroundColor: colors.tint }]} 
              onPress={() => setShowSuccessModal(false)}
              scaleTo={0.94}
              hapticStyle="medium"
              fullWidth={true}
            >
              <Text style={[styles.popupButtonText, { color: '#0B0B0B' }]}>Done</Text>
            </PressSpring>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Booking Sheet Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => {
          setEditModalVisible(false);
          setSelectedBookingToEdit(null);
        }}
      >
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.editModalHeader}>
              <View>
                <Text style={[styles.editModalTitle, { color: colors.text }]}>Edit Booking</Text>
                <Text style={[styles.editModalSubtitle, { color: colors.secondaryText }]}>
                  Client: {selectedBookingToEdit?.userName}
                </Text>
              </View>
              <PressSpring 
                onPress={() => {
                  setEditModalVisible(false);
                  setSelectedBookingToEdit(null);
                }}
                contentStyle={styles.editModalCloseBtn}
                scaleTo={0.88}
                hapticStyle="selection"
                fullWidth={false}
              >
                <FontAwesome name="times" size={20} color={colors.text} />
              </PressSpring>
            </View>

            <View style={[styles.editModalDivider, { backgroundColor: colors.border }]} />

            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
              {selectedBookingToEdit && (
                <View>
                  <Text style={[styles.editModalLabel, { color: colors.secondaryText }]}>Date</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 4 }}>
                    {generateUpcomingDates().map(dStr => {
                      const dObj = new Date(dStr);
                      const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
                      const dayNum = dObj.getDate();
                      const isSelected = editDate === dStr;
                      return (
                        <PressSpring
                          key={dStr}
                          contentStyle={[
                            { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, marginRight: 8, alignItems: 'center' },
                            isSelected ? { backgroundColor: colors.tint, borderColor: colors.tint } : { borderColor: colors.border }
                          ]}
                          onPress={() => setEditDate(dStr)}
                          scaleTo={0.92}
                          hapticStyle="selection"
                          fullWidth={false}
                        >
                          <View style={{ alignItems: 'center' }}>
                            <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, color: isSelected ? '#0B0B0B' : colors.secondaryText, marginBottom: 2 }}>{dayName}</Text>
                            <Text style={{ fontSize: 15, fontWeight: '700', fontFamily: TheOneTypography.bodyFamily, color: isSelected ? '#0B0B0B' : colors.text }}>{dayNum}</Text>
                          </View>
                        </PressSpring>
                      );
                    })}
                  </ScrollView>

                  <Text style={[styles.editModalLabel, { color: colors.secondaryText }]}>Time Slot</Text>
                  {['yoga', 'pilates', 'kickboxing', 'physio'].includes(selectedBookingToEdit.serviceId) ? (
                    <View style={styles.editModalChipRow}>
                      {getSlotsForServiceAndDate(selectedBookingToEdit.serviceId, editDate, selectedBookingToEdit.id).map((slot) => {
                        const isSelected = editTime === slot.time;
                        return (
                          <PressSpring
                            key={slot.time}
                            contentStyle={[
                              styles.editModalChip,
                              { borderColor: colors.border },
                              !slot.isAvailable && { opacity: 0.3 },
                              isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }
                            ]}
                            onPress={() => {
                              if (slot.isAvailable || isSelected) {
                                setEditTime(slot.time);
                              } else {
                                showAlert('Slot Occupied', 'This slot conflicts with active bookings or spacing policies.');
                              }
                            }}
                            scaleTo={0.92}
                            hapticStyle="selection"
                            fullWidth={false}
                          >
                            <Text style={[styles.editModalChipText, isSelected ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                              {slot.time} {['yoga', 'pilates', 'kickboxing'].includes(selectedBookingToEdit.serviceId) ? `(${Math.max(0, slot.maxCapacity - slot.count)} left)` : ''}
                            </Text>
                          </PressSpring>
                        );
                      })}
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        playClickSound();
                        setPickerTarget('edit');
                        const startPart = editTime.split(' - ')[0] || '09:00 AM';
                        const match = startPart.trim().match(/^(\d+):(\d+)\s*(AM|PM)/i);
                        if (match) {
                          setTempHour(match[1]);
                          setTempMinute(match[2]);
                          setTempAmPm(match[3].toUpperCase() as any);
                        } else {
                          setTempHour('09');
                          setTempMinute('00');
                          setTempAmPm('AM');
                        }
                        setShowTimePickerModal(true);
                      }}
                      style={{
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderWidth: 1,
                        borderRadius: 14,
                        padding: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 4,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <FontAwesome name="clock-o" size={18} color={colors.tint} />
                        <View style={{ backgroundColor: 'transparent' }}>
                          <Text style={{ color: colors.secondaryText, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }}>BOOKED SLOT TIME</Text>
                          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2, fontFamily: TheOneTypography.headlineFamily }}>
                            {editTime || 'Select Time Slot'}
                          </Text>
                        </View>
                      </View>
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 8 }}>
                        <FontAwesome name="pencil" size={14} color={colors.tint} />
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Custom Time Helper block for non-fixed services */}
                  {!['yoga', 'pilates', 'kickboxing', 'physio'].includes(selectedBookingToEdit.serviceId) && (() => {
                    const slots = getSlotsForServiceAndDate(selectedBookingToEdit.serviceId, editDate, selectedBookingToEdit.id);
                    const firstStart = slots[0]?.time.split(' - ')[0] || '08:00 AM';
                    const lastEnd = slots[slots.length - 1]?.time.split(' - ')[1] || '10:00 PM';
                    
                    const dayBookings = bookings.filter(b => b.date === editDate && b.serviceId === selectedBookingToEdit.serviceId && b.status === 'confirmed');
                    
                    return (
                      <View style={{
                        marginTop: 12,
                        padding: 14,
                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border
                      }}>
                        {/* Operating Hours Info */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: dayBookings.length > 0 ? 12 : 0 }}>
                          <FontAwesome name="info-circle" size={14} color={colors.tint} />
                          <Text style={{ fontSize: 11, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText }}>
                            Operating Hours: <Text style={{ fontWeight: '700', color: colors.text }}>{firstStart} - {lastEnd}</Text>
                          </Text>
                        </View>

                        {/* Booked Slots List */}
                        {dayBookings.length > 0 && (
                          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 10 }}>
                            <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, fontWeight: '700', color: colors.secondaryText, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                              🚫 Booked / Occupied Slots
                            </Text>
                            {dayBookings.map((b, idx) => (
                              <View key={idx} style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingVertical: 5,
                                borderBottomWidth: idx === dayBookings.length - 1 ? 0 : 1,
                                borderBottomColor: 'rgba(255,255,255,0.03)'
                              }}>
                                <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, color: colors.text, fontWeight: '600' }}>
                                  {b.userName} {b.id === selectedBookingToEdit.id && '(Current)'}
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ fontSize: 10, fontFamily: TheOneTypography.bodyFamily, color: colors.secondaryText }}>{b.time}</Text>
                                  <View style={{ backgroundColor: 'rgba(255, 69, 58, 0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 9, color: '#FF453A', fontWeight: '700' }}>{b.id === selectedBookingToEdit.id ? 'CURRENT' : 'OCCUPIED'}</Text>
                                  </View>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Edit Pilates Level */}
                  {selectedBookingToEdit.serviceId === 'pilates' && (
                    <View>
                      <Text style={[styles.editModalLabel, { color: colors.secondaryText }]}>Pilates Level</Text>
                      <View style={styles.adminSegmentedRow}>
                        {(['Beginner', 'Intermediate', 'Advanced'] as const).map((level) => (
                          <PressSpring
                            key={level}
                            contentStyle={[
                              styles.adminSegmentBtn,
                              editPilatesLevel === level ? { backgroundColor: colors.tint } : { backgroundColor: 'transparent' }
                            ]}
                            onPress={() => setEditPilatesLevel(level)}
                            scaleTo={0.92}
                            hapticStyle="selection"
                            fullWidth={true}
                            style={{ flex: 1 }}
                          >
                            <Text style={[styles.adminSegmentText, editPilatesLevel === level ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                              {level}
                            </Text>
                          </PressSpring>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Edit Massage Therapist & Steam */}
                  {selectedBookingToEdit.serviceId === 'general-massage' && (
                    <View>
                      <Text style={[styles.editModalLabel, { color: colors.secondaryText }]}>Assigned Therapist</Text>
                      <View style={styles.editModalChipRow}>
                        {therapists.map((th) => {
                          const isSelected = editTherapistName === th.name;
                          return (
                            <PressSpring
                              key={th.name}
                              contentStyle={[
                                styles.editModalChip,
                                { borderColor: colors.border },
                                isSelected && { backgroundColor: colors.tint, borderColor: colors.tint }
                              ]}
                              onPress={() => setEditTherapistName(th.name)}
                              scaleTo={0.92}
                              hapticStyle="selection"
                              fullWidth={false}
                            >
                              <Text style={[styles.editModalChipText, isSelected ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                                {th.name} ({th.gender.charAt(0)})
                              </Text>
                            </PressSpring>
                          );
                        })}
                      </View>

                      <Text style={[styles.editModalLabel, { color: colors.secondaryText, marginTop: 12 }]}>Add-on After Massage</Text>
                      <View style={[styles.adminSegmentedRow, { marginBottom: 12 }]}>
                        {([
                          { label: 'None', value: 'none' as const },
                          { label: 'Steam', value: 'steam' as const },
                          { label: 'Sauna', value: 'sauna' as const }
                        ]).map((t) => (
                          <PressSpring
                            key={t.value}
                            contentStyle={[
                              styles.adminSegmentBtn,
                              editSaunaType === t.value ? { backgroundColor: colors.tint } : { backgroundColor: 'transparent' }
                            ]}
                            onPress={() => setEditSaunaType(t.value)}
                            scaleTo={0.92}
                            hapticStyle="selection"
                            fullWidth={true}
                            style={{ flex: 1 }}
                          >
                            <Text style={[styles.adminSegmentText, editSaunaType === t.value ? { color: '#0B0B0B', fontWeight: '700' } : { color: colors.text }]}>
                              {t.label}
                            </Text>
                          </PressSpring>
                        ))}
                      </View>

                      <PressSpring
                        contentStyle={[styles.editModalCheckRow, { borderColor: colors.border, borderRadius: 12 }]}
                        onPress={() => setEditExtendMassage(!editExtendMassage)}
                        scaleTo={0.96}
                        hapticStyle="selection"
                        fullWidth={true}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={[
                            styles.editModalCheckbox,
                            { borderColor: editExtendMassage ? colors.tint : colors.border, borderRadius: 12 },
                            editExtendMassage && { backgroundColor: colors.tint }
                          ]}>
                            {editExtendMassage && <FontAwesome name="check" size={10} color="#0B0B0B" />}
                          </View>
                          <Text style={[styles.editModalCheckLabel, { color: colors.text }]}>Extend massage by 30 mins</Text>
                        </View>
                      </PressSpring>
                    </View>
                  )}

                  {/* Edit Trainer */}
                  {['yoga', 'pilates', 'kickboxing', 'physio', 'salon'].includes(selectedBookingToEdit.serviceId) && (
                    <View>
                      <Text style={[styles.editModalLabel, { color: colors.secondaryText }]}>Trainer / Professional Name</Text>
                      <TextInput
                        style={[styles.formInput, { borderBottomColor: colors.border, color: colors.text }]}
                        placeholder="Trainer Name"
                        placeholderTextColor="#5C5040"
                        value={editTrainerName}
                        onChangeText={setEditTrainerName}
                      />
                    </View>
                  )}

                  <PressSpring
                    contentStyle={[styles.submitBtn, { marginTop: 24 }]}
                    onPress={handleSaveBookingEdit}
                    scaleTo={0.94}
                    hapticStyle="heavy"
                    fullWidth={true}
                  >
                    <Text style={styles.submitBtnText}>Save Changes</Text>
                  </PressSpring>

                  <PressSpring
                    contentStyle={[styles.submitBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
                    onPress={() => {
                      setEditModalVisible(false);
                      setSelectedBookingToEdit(null);
                    }}
                    scaleTo={0.96}
                    hapticStyle="light"
                    fullWidth={true}
                  >
                    <Text style={[styles.submitBtnText, { color: colors.text }]}>Cancel</Text>
                  </PressSpring>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={scannerVisible}
        onRequestClose={() => setScannerVisible(false)}
      >
        <View style={styles.scannerModalOverlay}>
          <View style={[styles.scannerModalContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.scannerModalHeader}>
              <View>
                <Text style={[styles.scannerModalTitle, { color: colors.text }]}>Scan Session QR</Text>
                <Text style={[styles.scannerModalSubtitle, { color: colors.secondaryText }]}>
                  Scan the client's session code to check them in.
                </Text>
              </View>
              <PressSpring onPress={() => setScannerVisible(false)} contentStyle={styles.scannerModalCloseBtn} scaleTo={0.88} hapticStyle="selection" fullWidth={false}>
                <FontAwesome name="times" size={20} color={colors.text} />
              </PressSpring>
            </View>

            <View style={[styles.scannerModalDivider, { backgroundColor: colors.border }]} />

            {/* Camera View */}
            <View style={styles.cameraContainer}>
              {Platform.OS === 'web' ? (
                <View style={styles.webFallbackContainer}>
                  <FontAwesome name="laptop" size={36} color={colors.secondaryText} style={{ marginBottom: 10 }} />
                  <Text style={[styles.webFallbackText, { color: colors.text }]}>Web Preview Scanner</Text>
                  <Text style={[styles.webFallbackSubtext, { color: colors.secondaryText }]}>
                    Camera scanner is active on iOS/Android devices only. Use the manual check-in field below.
                  </Text>
                </View>
              ) : !cameraPermission ? (
                <View style={styles.permissionLoadingContainer}>
                  <ActivityIndicator size="small" color={colors.tint} />
                </View>
              ) : !cameraPermission.granted ? (
                <View style={styles.permissionDeniedContainer}>
                  <Text style={[styles.permissionText, { color: colors.text }]}>Camera permission is required to scan QR codes.</Text>
                  <PressSpring contentStyle={[styles.permissionBtn, { backgroundColor: colors.tint }]} onPress={requestCameraPermission} scaleTo={0.94} hapticStyle="heavy" fullWidth={false}>
                    <Text style={styles.permissionBtnText}>Grant Permission</Text>
                  </PressSpring>
                </View>
              ) : (
                <View style={styles.cameraWrapper}>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
                    barcodeScannerSettings={{
                      barcodeTypes: ['qr'],
                    }}
                  />
                  <View style={styles.scannerOverlay}>
                    <View style={styles.scannerTargetFrame} />
                  </View>
                  {scanned && (
                    <View style={styles.scannedOverlay}>
                      <Text style={styles.scannedText}>Processing Check-in...</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Manual Check-in ID Input */}
            <View style={styles.manualInputContainer}>
              <Text style={[styles.manualInputLabel, { color: colors.secondaryText }]}>Or Enter ID Manually</Text>
              <View style={styles.manualInputRow}>
                <TextInput
                  style={[styles.manualTextInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  placeholder="e.g. booking_xxxxxxxxx"
                  placeholderTextColor="#5C5040"
                  value={manualBookingId}
                  onChangeText={setManualBookingId}
                />
                <PressSpring
                  contentStyle={[styles.manualSubmitBtn, { backgroundColor: colors.tint }]}
                  onPress={() => processBookingCheckin(manualBookingId)}
                  disabled={isScanningSubmitting}
                  scaleTo={0.94}
                  hapticStyle="heavy"
                  fullWidth={false}
                >
                  {isScanningSubmitting ? (
                    <ActivityIndicator size="small" color="#0B0B0B" />
                  ) : (
                    <Text style={styles.manualSubmitBtnText}>Check In</Text>
                  )}
                </PressSpring>
              </View>
            </View>

            <PressSpring
              contentStyle={[styles.submitBtn, { backgroundColor: '#1E1E22', borderWidth: 1, borderColor: colors.border, marginTop: 20 }]}
              onPress={() => setScannerVisible(false)}
              scaleTo={0.96}
              hapticStyle="light"
              fullWidth={true}
            >
              <Text style={[styles.submitBtnText, { color: colors.text }]}>Cancel</Text>
            </PressSpring>
          </View>
        </View>
      </Modal>

      <CustomAlertModal
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={hideAlert}
      />

      {/* Alarm-style Time Selection Modal Popup */}
      <Modal
        visible={showTimePickerModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTimePickerModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#1C1C1E', borderRadius: 24, width: '90%', maxWidth: 360, overflow: 'hidden', paddingBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2C2C2E', backgroundColor: '#1C1C1E' }}>
              <TouchableOpacity onPress={() => { playClickSound(); setShowTimePickerModal(false); }}>
                <Text style={{ color: '#FF9500', fontSize: 17, fontWeight: '500' }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>Select Time</Text>
              <TouchableOpacity onPress={() => { playClickSound(); handleSaveTimePicker(); }}>
                <Text style={{ color: '#FF9500', fontSize: 17, fontWeight: '700' }}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>

            {/* Real-time Time Picker Live Preview Banner */}
            <View style={{ paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', backgroundColor: '#2C2C2E', borderBottomWidth: 1, borderBottomColor: '#3A3A3C' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '800' }}>
                Selected Start: {tempHour}:{tempMinute} {tempAmPm}
              </Text>
            </View>

            {/* Selector Columns Container */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', height: 220, paddingHorizontal: 10, marginVertical: 15, position: 'relative', backgroundColor: 'transparent' }}>
              {/* Selector indicator horizontal lines */}
              <View style={{
                position: 'absolute',
                top: 88,
                left: 20,
                right: 20,
                height: 44,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: '#3A3A3C',
                pointerEvents: 'none',
                zIndex: 1,
                backgroundColor: 'transparent'
              }} />

              {/* Hours Column */}
              <View style={{ flex: 1, height: '100%', zIndex: 2, backgroundColor: 'transparent' }}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 88 }}
                  snapToInterval={44}
                  decelerationRate="fast"
                  onMomentumScrollEnd={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    const index = Math.round(y / 44);
                    const hrs = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
                    if (index >= 0 && index < hrs.length) setTempHour(hrs[index]);
                  }}
                  onScrollEndDrag={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    const index = Math.round(y / 44);
                    const hrs = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
                    if (index >= 0 && index < hrs.length) setTempHour(hrs[index]);
                  }}
                >
                  {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((hr) => {
                    const isSelected = tempHour === hr;
                    return (
                      <TouchableOpacity
                        key={hr}
                        onPress={() => setTempHour(hr)}
                        style={{ height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' }}
                      >
                        <Text style={{
                          fontSize: isSelected ? 23 : 19,
                          fontWeight: isSelected ? '700' : '400',
                          color: isSelected ? '#FFFFFF' : '#8E8E93',
                        }}>
                          {hr}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Minutes Column */}
              <View style={{ flex: 1, height: '100%', zIndex: 2, backgroundColor: 'transparent' }}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 88 }}
                  snapToInterval={44}
                  decelerationRate="fast"
                  onMomentumScrollEnd={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    const index = Math.round(y / 44);
                    const mins = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
                    if (index >= 0 && index < mins.length) setTempMinute(mins[index]);
                  }}
                  onScrollEndDrag={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    const index = Math.round(y / 44);
                    const mins = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
                    if (index >= 0 && index < mins.length) setTempMinute(mins[index]);
                  }}
                >
                  {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((min) => {
                    const isSelected = tempMinute === min;
                    return (
                      <TouchableOpacity
                        key={min}
                        onPress={() => setTempMinute(min)}
                        style={{ height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' }}
                      >
                        <Text style={{
                          fontSize: isSelected ? 23 : 19,
                          fontWeight: isSelected ? '700' : '400',
                          color: isSelected ? '#FFFFFF' : '#8E8E93',
                        }}>
                          {min}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* AM/PM Column */}
              <View style={{ flex: 1, height: '100%', zIndex: 2, backgroundColor: 'transparent' }}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 88 }}
                  snapToInterval={44}
                  decelerationRate="fast"
                  onMomentumScrollEnd={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    const index = Math.round(y / 44);
                    const periods = ['AM', 'PM'];
                    if (index >= 0 && index < periods.length) setTempAmPm(periods[index] as any);
                  }}
                  onScrollEndDrag={(e) => {
                    const y = e.nativeEvent.contentOffset.y;
                    const index = Math.round(y / 44);
                    const periods = ['AM', 'PM'];
                    if (index >= 0 && index < periods.length) setTempAmPm(periods[index] as any);
                  }}
                >
                  {['AM', 'PM'].map((p) => {
                    const isSelected = tempAmPm === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setTempAmPm(p as any)}
                        style={{ height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' }}
                      >
                        <Text style={{
                          fontSize: isSelected ? 23 : 19,
                          fontWeight: isSelected ? '700' : '400',
                          color: isSelected ? '#FFFFFF' : '#8E8E93',
                        }}>
                          {p}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
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
  headerScannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B84600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 12,
  },
  headerScannerBtnText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
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
  createBookingCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  createBookingTitle: {
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
  memberLookupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(107, 158, 118, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(107, 158, 118, 0.2)',
    marginTop: -8,
    marginBottom: 18,
  },
  memberLookupText: {
    color: '#6B9E76',
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  serviceChipsRow: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 10,
  },
  serviceChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
  },
  serviceChipText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  createBookingSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  createBookingSubmitBtnText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    color: '#F5F0EB',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginRight: 8,
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    marginBottom: 20,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingItemCard: {
    flexDirection: 'column',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  bookingItemLeft: {
    flex: 1,
  },
  bookingItemTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  bookingItemUser: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 4,
  },
  bookingItemTime: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 6,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  metaBadge: {
    backgroundColor: '#1E1E22',
    color: '#8C7B6B',
    borderColor: '#2A2520',
    borderWidth: 1,
    fontSize: 9,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bookingItemRight: {
    marginLeft: 16,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    width: 90,
  },
  cancelBookingBtn: {
    backgroundColor: 'rgba(196, 96, 87, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 96, 87, 0.2)',
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 12,
  },
  cancelBookingText: {
    color: '#C46057',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  editBookingBtn: {
    backgroundColor: 'rgba(184, 70, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.2)',
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 12,
  },
  editBookingText: {
    color: '#B84600',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  doneBookingBtn: {
    backgroundColor: 'rgba(107, 158, 118, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(107, 158, 118, 0.2)',
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 12,
  },
  doneBookingText: {
    color: '#6B9E76',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: TheOneTypography.bodyFamily,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  seenCheckboxContainer: {
    paddingRight: 8,
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 2,
  },
  adminSegmentedRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  adminSegmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  adminSegmentText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  editModalContainer: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '92%',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  editModalTitle: {
    fontSize: 22,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  editModalSubtitle: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 2,
  },
  editModalCloseBtn: {
    padding: 6,
  },
  editModalDivider: {
    height: 1,
    backgroundColor: 'rgba(245, 240, 235, 0.06)',
    marginBottom: 16,
  },
  editModalDivider2: {
    height: 1,
    backgroundColor: 'rgba(245, 240, 235, 0.06)',
    marginVertical: 20,
  },
  editModalLabel: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  editModalChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    gap: 6,
  },
  editModalChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  editModalChipText: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  editModalCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  editModalCheckbox: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  editModalCheckLabel: {
    fontSize: 13,
    fontWeight: '600',
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
  scannerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scannerModalContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'stretch',
  },
  scannerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  scannerModalTitle: {
    fontSize: 20,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  scannerModalSubtitle: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 2,
    lineHeight: 16,
  },
  scannerModalCloseBtn: {
    padding: 6,
  },
  scannerModalDivider: {
    height: 1,
    backgroundColor: 'rgba(245, 240, 235, 0.06)',
    marginVertical: 12,
  },
  cameraContainer: {
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  cameraWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scannerTargetFrame: {
    width: 150,
    height: 150,
    borderWidth: 2,
    borderColor: '#B84600',
    backgroundColor: 'transparent',
    borderRadius: 12,
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannedText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
  },
  permissionLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  permissionDeniedContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  permissionText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 16,
    lineHeight: 18,
  },
  permissionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
  },
  webFallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  webFallbackText: {
    fontSize: 14,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  webFallbackSubtext: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    textAlign: 'center',
    lineHeight: 18,
  },
  manualInputContainer: {
    marginTop: 8,
  },
  manualInputLabel: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  manualTextInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    marginRight: 8,
  },
  manualSubmitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualSubmitBtnText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
  },
  suggestionsContainer: {
    backgroundColor: '#1E1E22',
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  suggestionText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
  },
});
