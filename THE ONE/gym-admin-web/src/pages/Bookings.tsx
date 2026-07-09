import React, { useState, useEffect, useMemo } from 'react';
import { useAdminData } from '../context/AdminDataContext';
import GlassCard from '../components/GlassCard';
import { db } from '../firebase';
import { 
  collection, getDocs, doc, setDoc, deleteDoc, updateDoc, addDoc, query, where, getDoc 
} from 'firebase/firestore';
import { fetchLivePricing, SALON_SERVICES, SPA_SERVICES, PHYSIO_SERVICES, getWellnessPrice } from '../constants/Pricing';
import { FaCalendarPlus, FaFilter, FaTimes, FaTrash, FaCheck, FaExclamationCircle } from 'react-icons/fa';

const SERVICES_LIST = [
  { id: 'yoga', name: 'Yoga', floor: '4th Floor' },
  { id: 'pilates', name: 'Pilates', floor: '4th Floor' },
  { id: 'kickboxing', name: 'Kickboxing', floor: '4th Floor' },
  { id: 'general-massage', name: 'Massages', floor: '1st Floor' },
  { id: 'cryo', name: 'Cryo Chamber', floor: '1st Floor' },
  { id: 'sauna', name: 'Sauna', floor: '1st Floor' },
  { id: 'red-light', name: 'Infrared Chamber', floor: '1st Floor' },
  { id: 'hbot', name: 'HBOT Chamber', floor: '2nd Floor' },
  { id: 'salon', name: 'Hair Salon (Unisex)', floor: '2nd Floor' },
  { id: 'physio', name: 'Physiotherapy', floor: '2nd Floor' }
];

const TIME_SLOTS = [
  '08:00 AM - 09:00 AM',
  '09:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '12:00 PM - 01:00 PM',
  '01:00 PM - 02:00 PM',
  '02:00 PM - 03:00 PM',
  '03:00 PM - 04:00 PM',
  '04:00 PM - 05:00 PM',
  '05:00 PM - 06:00 PM',
  '06:00 PM - 07:00 PM',
  '07:00 PM - 08:00 PM',
  '08:00 PM - 09:00 PM'
];

// Default restricted slots per service — used as fallback before Firestore loads
const DEFAULT_SERVICE_SLOTS: Record<string, string[]> = {
  'general-massage': [
    '08:00 AM - 09:00 AM',
    '09:00 AM - 10:00 AM',
    '10:00 AM - 11:00 AM',
    '11:00 AM - 12:00 PM',
    '12:00 PM - 01:00 PM',
    '01:00 PM - 02:00 PM',
    '02:00 PM - 03:00 PM',
    '03:00 PM - 04:00 PM',
    '04:00 PM - 05:00 PM',
    '05:00 PM - 06:00 PM',
    '06:00 PM - 07:00 PM',
    '07:00 PM - 08:00 PM',
  ],
  physio: [
    '07:30 AM - 08:15 AM',
    '08:15 AM - 09:00 AM',
    '09:00 AM - 09:45 AM',
    '09:45 AM - 10:30 AM',
    '10:30 AM - 11:15 AM',
    '11:15 AM - 12:00 PM',
  ],
  yoga: ['07:00 AM - 08:00 AM'],
  pilates: [
    '07:00 AM - 08:00 AM',
    '08:00 AM - 09:00 AM',
    '09:00 AM - 10:00 AM',
    '10:00 AM - 11:00 AM',
    '11:00 AM - 12:00 PM',
  ],
  kickboxing: [
    '06:00 AM - 07:00 AM',
    '07:00 AM - 08:00 AM',
    '08:00 AM - 09:00 AM',
    '09:00 AM - 10:00 AM',
    '10:00 AM - 11:00 AM',
  ],
};

const last10 = (p?: string): string => {
  if (!p) return '';
  return p.replace(/\D/g, '').slice(-10);
};

const getDayOfWeek = (dateStr: string): string => {
  if (!dateStr) return '';
  // Avoid time-zone shifting issues by parsing YYYY-MM-DD cleanly
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
  if (name.includes(',')) {
    const list = name.split(',').map(s => s.trim());
    return list.reduce((acc, s) => acc + getSalonServiceDuration(s), 0);
  }
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

const isCryoSlotSelectable = (proposedStart: number, dayBookings: any[]) => {
  if (proposedStart < 480) return false; // 8:00 AM

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
      if (requiredTurnOn < 300) return false;
      lastEnd = b.end;
    } else {
      const gap = b.start - lastEnd;
      if (gap < 240) {
        lastEnd = b.end;
      } else {
        const requiredTurnOn = b.start - 180;
        if (requiredTurnOn < lastEnd) return false;
        lastEnd = b.end;
      }
    }
  }
  return true;
};

// Format YYYY-MM-DD → DD-MM-YYYY (or any ISO date string)
const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  // Handle both YYYY-MM-DD and full ISO strings
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

export const Bookings: React.FC = () => {
  const { users, bookings } = useAdminData();

  // Filters
  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [filterService, setFilterService] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // Interactive Book Modal
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [bookPhone, setBookPhone] = useState('');
  const [bookName, setBookName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [bookService, setBookService] = useState('yoga');
  const [bookSubService, setBookSubService] = useState('');
  const [bookSelectedSalonServices, setBookSelectedSalonServices] = useState<string[]>(['Haircut + Hairwash + Blowdry (Men)']);
  const [bookDate, setBookDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [bookTime, setBookTime] = useState('10:00 AM - 11:00 AM');
  const [bookTherapist, setBookTherapist] = useState('');
  const [bookSaunaType, setBookSaunaType] = useState<'sauna' | 'steam' | 'none'>('none');
  const [bookExtendMassage, setBookExtendMassage] = useState(false);
  const [bookTrainer, setBookTrainer] = useState('');
  const [bookPilatesLevel, setBookPilatesLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Cancel confirmation state
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Live Pricing
  const [livePricing, setLivePricing] = useState<any>({
    salon: SALON_SERVICES,
    spa: SPA_SERVICES,
    physio: PHYSIO_SERVICES,
    wellnessPrice: getWellnessPrice,
  });

  // Global Settings for staff/capacities
  const [globalSettings, setGlobalSettings] = useState({
    yogaTrainer: 'Sarah',
    yogaTrainerDayOff: 'None',
    pilatesTrainer: 'Elena',
    pilatesTrainerDayOff: 'None',
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

  useEffect(() => {
    fetchLivePricing().then(setLivePricing).catch(() => {});
    
    // Load trainers/global settings
    getDoc(doc(db, 'settings', 'global')).then(snap => {
      if (snap.exists()) {
        setGlobalSettings(prev => ({ ...prev, ...snap.data() }));
      }
    });

    // Load therapist/staff settings
    getDoc(doc(db, 'settings', 'staff')).then(snap => {
      if (snap.exists()) {
        setGlobalSettings(prev => ({ ...prev, ...snap.data() }));
      }
    });

    // Load dynamic service timings/slots settings
    getDoc(doc(db, 'settings', 'services')).then(snap => {
      if (snap.exists()) {
        setServiceTimings(snap.data());
      }
    });
  }, []);

  const availableSlots = useMemo(() => {
    // Prefer live Firestore timings
    if (serviceTimings && serviceTimings[bookService]?.baseTimes?.length) {
      return serviceTimings[bookService].baseTimes;
    }
    // Fall back to hard-coded restricted defaults for services that have them
    if (DEFAULT_SERVICE_SLOTS[bookService]) {
      return DEFAULT_SERVICE_SLOTS[bookService];
    }
    // Generic fallback for services with no restriction (sauna, cryo, red-light, hbot, salon)
    return TIME_SLOTS;
  }, [bookService, serviceTimings]);

  // Update bookTime to the first available slot when service or available slots change
  useEffect(() => {
    if (availableSlots && availableSlots.length > 0) {
      let defaultSlot = availableSlots[0];
      if (bookService === 'salon') {
        const start = defaultSlot.split(' - ')[0];
        const duration = getSalonServiceDuration(bookSubService);
        defaultSlot = `${start} - ${calculateCustomEndTime(start, duration)}`;
      }
      setBookTime(defaultSlot);
    }
  }, [bookService, bookSubService, availableSlots]);

  // Update default staff & subservices when service ID updates
  useEffect(() => {
    if (bookService === 'salon') {
      setBookSelectedSalonServices(['Haircut + Hairwash + Blowdry (Men)']);
      setBookSubService('Haircut + Hairwash + Blowdry (Men)');
      setBookTrainer(globalSettings.salonProfessionals);
    } else if (bookService === 'physio') {
      setBookSubService('Ultrasound');
      setBookTrainer(globalSettings.physioTherapist);
    } else if (bookService === 'yoga') {
      setBookTrainer(globalSettings.yogaTrainer);
      setBookSubService('');
    } else if (bookService === 'pilates') {
      setBookTrainer(globalSettings.pilatesTrainer);
      setBookSubService('');
    } else if (bookService === 'kickboxing') {
      setBookTrainer(globalSettings.kickboxingTrainer);
      setBookSubService('');
    } else if (bookService === 'general-massage') {
      setBookSubService('Head Massage (20 Mins)');
      setBookTherapist(globalSettings.massageMale1);
    } else {
      setBookSubService('');
      setBookTrainer('');
      setBookTherapist('');
    }
  }, [bookService, globalSettings]);

  // Synchronize Salon bookTime duration when bookService or bookSubService updates
  useEffect(() => {
    if (bookService === 'salon' && bookSubService) {
      const start = bookTime.split(' - ')[0] || '10:00 AM';
      const duration = getSalonServiceDuration(bookSubService);
      setBookTime(`${start} - ${calculateCustomEndTime(start, duration)}`);
    }
  }, [bookService, bookSubService]);

  // Lookup client by phone input
  const matchedUser = useMemo(() => {
    const cleanInput = bookPhone.replace(/\D/g, '');
    if (cleanInput.length < 10) return null;
    return users.find(u => {
      const cleanId = u.id.replace(/\D/g, '');
      const cleanPhone = (u.phoneNumber || '').replace(/\D/g, '');
      return cleanId.endsWith(cleanInput) || cleanPhone.endsWith(cleanInput);
    });
  }, [bookPhone, users]);

  const nameSuggestions = useMemo(() => {
    if (!bookName.trim()) return [];
    return users.filter(u => !u.isAdmin && u.name.toLowerCase().includes(bookName.toLowerCase()));
  }, [bookName, users]);

  useEffect(() => {
    if (matchedUser) {
      setBookName(matchedUser.name);
    }
  }, [matchedUser]);

  // Filter Bookings List
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const dateMatch = !filterDate || b.date === filterDate;
      const svcMatch = filterService === 'All' || b.serviceId === filterService;
      const statusMatch = filterStatus === 'All' || b.status === filterStatus;
      return dateMatch && svcMatch && statusMatch;
    });
  }, [bookings, filterDate, filterService, filterStatus]);

  // Create Booking Action
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookPhone.trim() || !bookName.trim()) {
      setError('Please provide user phone and name.');
      return;
    }

    setLoading(true);
    setError('');

    let targetPhone = bookPhone.trim().replace(/\s+/g, '');
    if (!targetPhone.startsWith('+')) {
      targetPhone = targetPhone.length === 10 ? `+91${targetPhone}` : `+${targetPhone}`;
    }

    try {
      const clientProfile = matchedUser || users.find(u => {
        const cleanId = u.id.replace(/\D/g, '');
        const cleanPhone = (u.phoneNumber || '').replace(/\D/g, '');
        return cleanId.endsWith(last10(targetPhone)) || cleanPhone.endsWith(last10(targetPhone));
      });
      const clientMembership = clientProfile?.membershipType || 'Basic';
      const clientGender = clientProfile?.gender || 'Female';
      const clientUserId = clientProfile ? clientProfile.id : targetPhone;

      const proposedStart = parseTimeToMinutes(bookTime.split(' - ')[0]);
      let proposedEnd = proposedStart + 60;
      if (bookService === 'salon') {
        const dur = getSalonServiceDuration(bookSubService);
        proposedEnd = proposedStart + dur;
      } else if (bookService === 'general-massage') {
        proposedEnd = proposedStart + (bookExtendMassage ? 90 : 60);
      }

      // Check Therapist/Trainer Day Off
      const bookingDayOfWeek = getDayOfWeek(bookDate);
      if (bookService === 'general-massage') {
        let isTherapistOff = false;
        if (bookTherapist === globalSettings.massageMale1 && globalSettings.massageMale1DayOff === bookingDayOfWeek) isTherapistOff = true;
        if (bookTherapist === globalSettings.massageMale2 && globalSettings.massageMale2DayOff === bookingDayOfWeek) isTherapistOff = true;
        if (bookTherapist === globalSettings.massageFemale1 && globalSettings.massageFemale1DayOff === bookingDayOfWeek) isTherapistOff = true;
        if (bookTherapist === globalSettings.massageFemale2 && globalSettings.massageFemale2DayOff === bookingDayOfWeek) isTherapistOff = true;

        if (isTherapistOff) {
          setError(`Schedule Conflict: Therapist ${bookTherapist} has a weekly Day Off on ${bookingDayOfWeek}.`);
          setLoading(false);
          return;
        }
      }

      if (['yoga', 'pilates', 'kickboxing', 'physio', 'salon'].includes(bookService)) {
        let isTrainerOff = false;
        if (bookService === 'yoga' && bookTrainer === globalSettings.yogaTrainer && globalSettings.yogaTrainerDayOff === bookingDayOfWeek) isTrainerOff = true;
        if (bookService === 'pilates' && bookTrainer === globalSettings.pilatesTrainer && globalSettings.pilatesTrainerDayOff === bookingDayOfWeek) isTrainerOff = true;
        if (bookService === 'kickboxing' && bookTrainer === globalSettings.kickboxingTrainer && globalSettings.kickboxingTrainerDayOff === bookingDayOfWeek) isTrainerOff = true;
        if (bookService === 'physio' && bookTrainer === globalSettings.physioTherapist && globalSettings.physioTherapistDayOff === bookingDayOfWeek) isTrainerOff = true;
        if (bookService === 'salon' && bookTrainer === globalSettings.salonProfessionals && globalSettings.salonProfessionalsDayOff === bookingDayOfWeek) isTrainerOff = true;

        if (isTrainerOff) {
          setError(`Schedule Conflict: Instructor/Professional ${bookTrainer} has a weekly Day Off on ${bookingDayOfWeek}.`);
          setLoading(false);
          return;
        }
      }

      // Check user overlap (compare using last 10 digits for absolute robustness)
      const userBookings = bookings.filter(b => 
        (last10(b.userId) === last10(clientUserId)) && 
        b.date === bookDate && 
        b.status === 'confirmed'
      );
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
        setError('Schedule Conflict: This client already has an active session overlapping with this slot.');
        setLoading(false);
        return;
      }

      // Check massage room capacity
      if (bookService === 'general-massage') {
        const allMassages = bookings.filter(b => b.date === bookDate && b.status === 'confirmed' && b.serviceId === 'general-massage');
        const mappedMassages = allMassages.map(b => {
          const clientObj = users.find(u => last10(u.phoneNumber) === last10(b.userId) || last10(u.id) === last10(b.userId));
          return {
            ...b,
            userGender: b.userGender || clientObj?.gender || 'Female'
          };
        });
        const isExtended = bookExtendMassage;
        const roomOK = checkMassageRoomAvailability(proposedStart, isExtended ? 180 : 120, clientGender, mappedMassages);
        if (!roomOK) {
          setError('Massage Rooms Full: All massage rooms are occupied or conflict with gender rules at this time.');
          setLoading(false);
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
            let bActualStart = bStart;
            let bEnd = bStart;
            if (isSaunaBooking) {
              let bBase = 15;
              bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
            } else if (isMassageWithSteam) {
              const massageDur = b.extended ? 90 : 60;
              bActualStart = bStart + massageDur;
              bEnd = bActualStart + 30;
            }
            
            return Math.max(saunaStart, bActualStart) < Math.min(saunaEnd, bEnd);
          });
          
          if (saunaOverlaps) {
            setError('Sauna Occupied: The Steam/Sauna option is unavailable because the Sauna is occupied at this time.');
            setLoading(false);
            return;
          }
        }
      }

      // Check cryo buffer
      if (bookService === 'cryo') {
        const dayCryos = bookings.filter(b => b.date === bookDate && b.status === 'confirmed' && b.serviceId === 'cryo');
        const cryoOK = isCryoSlotSelectable(proposedStart, dayCryos);
        if (!cryoOK) {
          setError('Cryo Chamber Startup: This slot conflicts with cooling cycle or startup buffer constraints.');
          setLoading(false);
          return;
        }
      }

      // Check HBOT daily limits
      if (bookService === 'hbot') {
        const dailyHbot = bookings.filter(b => last10(b.userId) === last10(clientUserId) && b.serviceId === 'hbot' && b.date === bookDate && b.status !== 'cancelled');
        if (dailyHbot.length > 0) {
          setError('HBOT Limit Reached: Athlete has already booked an HBOT chamber session today.');
          setLoading(false);
          return;
        }
        const dayHbots = bookings.filter(b => b.serviceId === 'hbot' && b.date === bookDate && b.status === 'confirmed');
        const overlaps = dayHbots.some(b => {
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          const bEnd = bStart + (b.hbotConsecutive ? 60 : 30);
          return Math.max(proposedStart, bStart) < Math.min(proposedStart + 30, bEnd);
        });
        if (overlaps) {
          setError('HBOT Chamber Occupied: The chamber is occupied during this time window.');
          setLoading(false);
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
          setError('Salon Capacity Reached: There are already 2 active bookings for the salon during this window.');
          setLoading(false);
          return;
        }
      }

      // Charge computation
      const selectedSvc = SERVICES_LIST.find(s => s.id === bookService);
      const serviceName = selectedSvc ? selectedSvc.name : bookService;
      
      let chargeAmount = 0;
      if (bookService === 'salon') {
        chargeAmount = bookSelectedSalonServices.reduce((acc: number, sName: string) => {
          const item = livePricing.salon.find((s: any) => s.name === sName);
          return acc + (item ? item.price : 0);
        }, 0);
      } else if (bookService === 'physio') {
        const item = livePricing.physio.find((s: any) => s.name === bookSubService);
        chargeAmount = item ? item.price : 0;
      } else if (bookService === 'general-massage') {
        const item = livePricing.spa.find((s: any) => s.name === bookSubService);
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

      let finalTime = bookTime.trim();
      if (bookService === 'salon') {
        const startPart = bookTime.split(' - ')[0];
        const dur = getSalonServiceDuration(bookSubService);
        finalTime = `${startPart} - ${calculateCustomEndTime(startPart, dur)}`;
      } else if (bookService === 'general-massage') {
        const startPart = bookTime.split(' - ')[0];
        const dur = bookExtendMassage ? 90 : 60;
        finalTime = `${startPart} - ${calculateCustomEndTime(startPart, dur)}`;
      }

      const bookingId = 'booking_' + Math.random().toString(36).substr(2, 9);
      const bookingData: any = {
        userId: clientUserId,
        userName: bookName.trim(),
        userGender: clientGender,
        membershipType: clientMembership,
        serviceId: bookService,
        serviceName: serviceName,
        date: bookDate.trim(),
        time: finalTime,
        status: 'confirmed',
        floor: selectedSvc?.floor || '2nd Floor',
        createdAt: new Date().toISOString()
      };

      if (bookSubService) {
        bookingData.subService = bookSubService;
      }

      if (bookService === 'pilates') {
        bookingData.pilatesLevel = bookPilatesLevel;
        bookingData.trainerName = bookTrainer;
      } else if (bookService === 'general-massage') {
        bookingData.therapistName = bookTherapist;
        bookingData.saunaType = bookSaunaType === 'none' ? null : bookSaunaType;
        bookingData.steamSaunaIncluded = bookSaunaType !== 'none';
        bookingData.extended = bookExtendMassage;
      } else if (['yoga', 'kickboxing', 'physio', 'salon'].includes(bookService)) {
        bookingData.trainerName = bookTrainer;
      }

      // 1. Save Booking
      await setDoc(doc(db, 'bookings', bookingId), bookingData);

      // 2. Generate dues if charge exists and user is non-Gold
      if (chargeAmount > 0 && ['Basic', 'Trial', 'Wellness'].includes(clientMembership)) {
        const dueId = 'due_' + Math.random().toString(36).substr(2, 9);
        await setDoc(doc(db, 'dues', dueId), {
          userId: clientUserId,
          userName: bookName.trim(),
          amount: chargeAmount,
          serviceName: bookSubService || serviceName,
          date: bookDate.trim(),
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }

      alert('Booking created successfully!');
      setIsBookOpen(false);
      
      // Reset values
      setBookPhone('');
      setBookName('');
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Cancel Booking
  const handleCancelBooking = async (bookingId: string) => {
    setConfirmCancelId(null);
    try {
      const bObj = bookings.find(b => b.id === bookingId);
      
      // Update status
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'cancelled',
        cancelledByAdmin: true,
        cancelledAt: new Date().toISOString()
      });

      // Clear matching waitlists & notify them
      if (bObj) {
        const waitQ = query(
          collection(db, 'waitlists'),
          where('serviceId', '==', bObj.serviceId),
          where('date', '==', bObj.date),
          where('time', '==', bObj.time)
        );
        const wSnap = await getDocs(waitQ);
        const notifyPromises = wSnap.docs.map(wDoc => {
          return addDoc(collection(db, 'in_app_notifications'), {
            userId: wDoc.data().userId,
            title: 'Spot Available!',
            body: `A spot opened up for ${wDoc.data().serviceName || 'your selected class'} on ${formatDateDMY(bObj.date)} at ${bObj.time}. Book it now!`,
            read: false,
            createdAt: new Date().toISOString()
          });
        });
        await Promise.all(notifyPromises);
        const deleteWaitlistPromises = wSnap.docs.map(wDoc => deleteDoc(doc(db, 'waitlists', wDoc.id)));
        await Promise.all(deleteWaitlistPromises);
      }

      // Delete pending dues
      if (bObj) {
        const duesQ = query(
          collection(db, 'dues'),
          where('userId', '==', bObj.userId),
          where('status', '==', 'pending')
        );
        const duesSnap = await getDocs(duesQ);
        const matchingDues = duesSnap.docs.filter(d => d.data().date === bObj.date && d.data().serviceName === bObj.serviceName);
        const deletePromises = matchingDues.map(d => deleteDoc(doc(db, 'dues', d.id)));
        await Promise.all(deletePromises);
      }
    } catch (err: any) {
      alert(`Error cancelling booking: ${err.message}`);
    }
  };

  // Complete Booking (Check-in)
  const handleCheckIn = async (bookingId: string) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      alert('Member checked-in / session completed.');
    } catch (err: any) {
      alert(`Error completing session: ${err.message}`);
    }
  };

  // Mark No Show
  const handleNoShow = async (bookingId: string, userId: string, userName: string) => {
    if (!window.confirm(`Mark ${userName} as No Show? This increments their counter. At 3 no-shows they are blocked.`)) {
      return;
    }

    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'no_show',
        noShowReportedAt: new Date().toISOString()
      });

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const newCount = (userSnap.data().noShowCount || 0) + 1;
        const block = newCount >= 3;
        await updateDoc(userRef, {
          noShowCount: newCount,
          isBlocked: block
        });
        
        const booking = bookings.find(b => b.id === bookingId);
        const bookingDetails = booking ? `${booking.serviceName || booking.serviceId} on ${booking.date} at ${booking.time}` : 'Unknown booking';

        if (block) {
          // Notify all admins/sub-admins
          const adminUsers = users.filter(u => u.isAdmin || u.isSubAdmin);
          const notifyPromises = adminUsers.map(admin => {
            return addDoc(collection(db, 'in_app_notifications'), {
              userId: admin.id || admin.phoneNumber,
              title: 'Athlete Blocked Automatically',
              body: `Athlete ${userName} has been automatically blocked due to 3 no-shows. They were booking ${bookingDetails} when this happened.`,
              read: false,
              createdAt: new Date().toISOString()
            });
          });
          await Promise.all(notifyPromises);
          
          alert(`No-Show recorded. Total count: ${newCount}/3. Athlete is now blocked. They were booking ${bookingDetails} when this happened.`);
        } else {
          alert(`No-Show recorded. Total count: ${newCount}/3.`);
        }
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <span className="label-spaced">APPOINTMENT LOGS</span>
          <h1 className="title-section" style={{ fontSize: '2.8rem', marginTop: '0.25rem' }}>Bookings</h1>
          <p className="text-muted">Monitor room capacities, check-in guests, and schedule services.</p>
        </div>
        <button className="btn-hero" onClick={() => setIsBookOpen(true)}>
          <FaCalendarPlus /> Create Booking
        </button>
      </div>

      {/* Filters Bar */}
      <GlassCard style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={styles.filterRow}>
          <div style={styles.filterControl}>
            <span className="label-spaced" style={{ fontSize: '8px', marginRight: '8px' }}>Date</span>
            <input
              type="date"
              style={styles.dateInputLuxury}
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          <div style={styles.filtersGroup}>
            <div style={styles.filterControl}>
              <span className="label-spaced" style={{ fontSize: '8px', marginRight: '8px' }}>Service</span>
              <select 
                style={styles.selectLuxury}
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
              >
                <option value="All">All Services</option>
                {SERVICES_LIST.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.filterControl}>
              <span className="label-spaced" style={{ fontSize: '8px', marginRight: '8px' }}>Status</span>
              <select 
                style={styles.selectLuxury}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
              </select>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Bookings Table */}
      <GlassCard style={{ padding: 0 }}>
        <div className="table-container">
          <table className="luxury-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Athlete</th>
                <th>Service Details</th>
                <th>Staff Assignments</th>
                <th>Floor</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                    <p className="text-muted">No appointments scheduled for this date / filter.</p>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((b) => (
                  <React.Fragment key={b.id}>
                    <tr>
                      <td style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{formatDateDMY(b.date)}</td>
                      <td style={{ fontWeight: 600 }}>{b.time}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{b.userName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                          {b.userId} — {b.membershipType}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>
                          {b.serviceName}
                        </span>
                        {b.subService && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            {b.subService}
                          </div>
                        )}
                        {b.steamSaunaIncluded && (
                          <span style={{ fontSize: '10px', color: 'var(--color-gold)', display: 'block', marginTop: '2px' }}>
                            + Steam &amp; Sauna
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {b.therapistName || b.trainerName || 'Unassigned'}
                        {b.pilatesLevel && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                            Level: {b.pilatesLevel}
                          </div>
                        )}
                      </td>
                      <td>{b.floor}</td>
                      <td>
                        <span className={`badge-status ${b.status}`}>
                          {b.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {b.status === 'confirmed' && confirmCancelId !== b.id && (
                          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '0.4rem 0.75rem', fontSize: '11px', borderRadius: '4px', borderColor: 'var(--color-success)', color: 'var(--color-success)' }}
                              onClick={() => handleCheckIn(b.id)}
                            >
                              Check In
                            </button>
                            <button 
                              className="btn-secondary" 
                              style={{ padding: '0.4rem 0.75rem', fontSize: '11px', borderRadius: '4px', borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
                              onClick={() => handleNoShow(b.id, b.userId, b.userName)}
                            >
                              No Show
                            </button>
                            <button 
                              className="btn-outline" 
                              style={{ padding: '0.4rem 0.75rem', fontSize: '11px', borderRadius: '4px', borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                              onClick={() => setConfirmCancelId(b.id)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {b.status === 'confirmed' && confirmCancelId === b.id && (
                          <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-error)', fontWeight: 600 }}>Confirm cancel?</span>
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '11px', borderRadius: '4px', borderColor: 'var(--color-error)', color: 'var(--color-error)', background: 'rgba(255,80,80,0.1)' }}
                              onClick={() => handleCancelBooking(b.id)}
                            >
                              Yes, Cancel
                            </button>
                            <button
                              className="btn-secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '11px', borderRadius: '4px' }}
                              onClick={() => setConfirmCancelId(null)}
                            >
                              Keep
                            </button>
                          </div>
                        )}
                        {b.status !== 'confirmed' && (
                          <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                            {b.status === 'cancelled' ? 'Cancelled' : b.status === 'completed' ? 'Completed' : 'Locked'}
                          </span>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ───────────────────────────────────────────────────────────────────
          CREATE BOOKING DRAWER
          ─────────────────────────────────────────────────────────────────── */}
      {isBookOpen && (
        <>
          <div className="modal-overlay" onClick={() => setIsBookOpen(false)}></div>
          <div className="drawer" style={{ width: '500px' }}>
            <div style={styles.drawerHeader}>
              <h2 className="title-card" style={{ fontStyle: 'italic' }}>Create Club Booking</h2>
              <button className="btn-icon" onClick={() => setIsBookOpen(false)}>
                <FaTimes />
              </button>
            </div>

            {error && <div style={styles.drawerError}>{error}</div>}

            <form onSubmit={handleCreateBooking}>
              <h3 className="label-spaced" style={{ fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '1.25rem' }}>
                Client Details
              </h3>
              
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="label-spaced">Client Name</label>
                <input
                  type="text"
                  required
                  placeholder="Client full name"
                  className="input-luxury"
                  value={bookName}
                  onChange={(e) => {
                    setBookName(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {showSuggestions && nameSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#151518',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    zIndex: 1000,
                    maxHeight: '180px',
                    overflowY: 'auto',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                  }}>
                    {nameSuggestions.slice(0, 5).map(u => (
                      <div
                        key={u.id}
                        onClick={() => {
                          setBookName(u.name);
                          const cleanPhone = (u.phoneNumber || u.id || '').replace(/\D/g, '').slice(-10);
                          setBookPhone(cleanPhone);
                          setShowSuggestions(false);
                        }}
                        style={{
                          padding: '0.6rem 0.8rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid rgba(255,255,255,0.05)',
                          fontSize: '13px',
                          color: '#fff',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <span>{u.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{u.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginTop: '1.5rem' }}>
                <label className="label-spaced">Client Phone Number</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 8341664756"
                  className="input-luxury"
                  value={bookPhone}
                  onChange={(e) => setBookPhone(e.target.value)}
                />
                {matchedUser ? (
                  <div style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FaCheck /> Identified Profile: {matchedUser.name} ({matchedUser.membershipType})
                  </div>
                ) : bookPhone.length >= 10 ? (
                  <div style={{ marginTop: '0.5rem', fontSize: '12px', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FaExclamationCircle /> No matching profile found. Type name manually to register as non-member guest.
                  </div>
                ) : null}
              </div>

              <h3 className="label-spaced" style={{ fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem', marginBottom: '1.25rem', marginTop: '2.0rem' }}>
                Schedule Configuration
              </h3>

              <div className="form-group">
                <label className="label-spaced">Service Category</label>
                <select
                  style={styles.selectFormLuxury}
                  value={bookService}
                  onChange={(e) => setBookService(e.target.value)}
                >
                  {SERVICES_LIST.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Subservice Selectors */}
              {bookService === 'salon' && (
                <div className="form-group">
                  <label className="label-spaced">Salon Services (select multiple)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px', maxHeight: '200px', overflowY: 'auto', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                    {livePricing.salon.map((s: any) => {
                      const isChecked = bookSelectedSalonServices.includes(s.name);
                      return (
                        <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 6px', borderRadius: '6px', background: isChecked ? 'rgba(201,122,70,0.15)' : 'transparent', transition: 'background 0.2s' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setBookSelectedSalonServices(prev => {
                                const next = isChecked ? prev.filter(n => n !== s.name) : [...prev, s.name];
                                const joined = next.join(', ');
                                setBookSubService(joined);
                                return next;
                              });
                            }}
                            style={{ cursor: 'pointer', accentColor: '#C97A46', transform: 'scale(1.15)' }}
                          />
                          <span style={{ fontSize: '13px', color: isChecked ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                            {s.name} — ₹{s.price}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {bookSelectedSalonServices.length > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      Selected: {bookSelectedSalonServices.length} service{bookSelectedSalonServices.length > 1 ? 's' : ''} · Total duration: {getSalonServiceDuration(bookSelectedSalonServices.join(', '))} mins
                    </div>
                  )}
                </div>
              )}

              {bookService === 'physio' && (
                <div className="form-group">
                  <label className="label-spaced">Physiotherapy Program</label>
                  <select
                    style={styles.selectFormLuxury}
                    value={bookSubService}
                    onChange={(e) => setBookSubService(e.target.value)}
                  >
                    {livePricing.physio.map((s: any) => (
                      <option key={s.name} value={s.name}>{s.name} - ₹{s.price}</option>
                    ))}
                  </select>
                </div>
              )}

              {bookService === 'general-massage' && (
                <div className="form-group">
                  <label className="label-spaced">Spa Treatment</label>
                  <select
                    style={styles.selectFormLuxury}
                    value={bookSubService}
                    onChange={(e) => setBookSubService(e.target.value)}
                  >
                    {livePricing.spa.map((s: any) => (
                      <option key={s.name} value={s.name}>{s.name} - ₹{s.price}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="label-spaced">Appointment Date</label>
                <input
                  type="date"
                  className="input-luxury"
                  style={{ colorScheme: 'dark' }}
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="label-spaced">Time Slot</label>
                <select
                  style={styles.selectFormLuxury}
                  value={bookTime}
                  onChange={(e) => setBookTime(e.target.value)}
                >
                  {(bookService === 'salon'
                    ? availableSlots.map(t => {
                        const start = t.split(' - ')[0];
                        const duration = getSalonServiceDuration(bookSubService);
                        const end = calculateCustomEndTime(start, duration);
                        return `${start} - ${end}`;
                      })
                    : availableSlots
                  ).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Conditional Inputs based on service */}
              {bookService === 'pilates' && (
                <>
                  <div className="form-group">
                    <label className="label-spaced">Pilates Trainer</label>
                    <input
                      type="text"
                      className="input-luxury"
                      value={bookTrainer}
                      onChange={(e) => setBookTrainer(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="label-spaced">Difficulty Level</label>
                    <select
                      style={styles.selectFormLuxury}
                      value={bookPilatesLevel}
                      onChange={(e: any) => setBookPilatesLevel(e.target.value)}
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </div>
                </>
              )}

              {bookService === 'general-massage' && (
                <>
                  <div className="form-group">
                    <label className="label-spaced">Assigned Therapist</label>
                    <select
                      style={styles.selectFormLuxury}
                      value={bookTherapist}
                      onChange={(e) => setBookTherapist(e.target.value)}
                    >
                      <option value={globalSettings.massageMale1}>{globalSettings.massageMale1} (Male)</option>
                      <option value={globalSettings.massageMale2}>{globalSettings.massageMale2} (Male)</option>
                      <option value={globalSettings.massageFemale1}>{globalSettings.massageFemale1} (Female)</option>
                      <option value={globalSettings.massageFemale2}>{globalSettings.massageFemale2} (Female)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label-spaced">Add-on After Massage</label>
                    <select
                      style={styles.selectFormLuxury}
                      value={bookSaunaType}
                      onChange={(e: any) => setBookSaunaType(e.target.value)}
                    >
                      <option value="none">None</option>
                      <option value="steam">Steam (Free)</option>
                      <option value="sauna">Sauna (+₹500)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 0' }}>
                    <input
                      type="checkbox"
                      id="extendCheck"
                      checked={bookExtendMassage}
                      onChange={(e) => setBookExtendMassage(e.target.checked)}
                      style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                    />
                    <label htmlFor="extendCheck" style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      Extend massage by 30 mins
                    </label>
                  </div>
                </>
              )}

              {['yoga', 'kickboxing', 'physio', 'salon'].includes(bookService) && (
                <div className="form-group">
                  <label className="label-spaced">Instructor / Professional</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={bookTrainer}
                    onChange={(e) => setBookTrainer(e.target.value)}
                  />
                </div>
              )}

              <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1.0rem' }}>
                <button type="submit" className="btn-hero" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Creating Booking...' : 'Create Booking'}
                </button>
                <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsBookOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

const styles = {
  filterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1.5rem',
    flexWrap: 'wrap' as const,
  },
  dateInputLuxury: {
    backgroundColor: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
    padding: '0.4rem 0.75rem',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'Inter, sans-serif',
    outline: 'none',
    cursor: 'pointer',
    colorScheme: 'dark',
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
    alignItems: 'center',
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
};

export default Bookings;
