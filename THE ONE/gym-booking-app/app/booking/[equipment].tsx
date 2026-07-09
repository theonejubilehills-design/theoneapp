import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, Pressable, Platform, View, Animated } from 'react-native';
import PressSpring from '@/components/PressSpring';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/Themed';
import { playClickSound, preloadSound, playSuccessSound, playCancelSound } from '../../utils/SoundManager';
import { SlotButton } from '@/components/SlotButton';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SALON_SERVICES, SPA_SERVICES, PHYSIO_SERVICES, getWellnessPrice, fetchLivePricing, LivePricing } from '../../constants/Pricing';

// Helper: get YYYY-MM-DD in local timezone
const getLocalDateString = (date: Date = new Date()) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

// Safe YYYY-MM-DD parser for cross-platform consistency (JSC / Hermes)
const parseYYYYMMDD = (str: string): Date => {
  const parts = str.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return new Date();
};

// Default therapists seeded
const DEFAULT_THERAPISTS = [
  { name: 'Vikram', gender: 'Male', dayOff: 'None' },
  { name: 'Ragesh', gender: 'Male', dayOff: 'None' },
  { name: 'Ananya', gender: 'Female', dayOff: 'None' },
  { name: 'Priya', gender: 'Female', dayOff: 'None' }
];

// Helper: parse time like "10:00 AM" to minutes from midnight
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

// Helper: get working hours range from configured base times
const getWorkingHoursForService = (baseTimes: string[]) => {
  if (!baseTimes || baseTimes.length === 0) {
    return { start: '08:00 AM', end: '10:00 PM', startMin: 480, endMin: 1320 };
  }
  try {
    const sorted = [...baseTimes].sort((a, b) => {
      const aStart = a.split(' - ')[0];
      const bStart = b.split(' - ')[0];
      return parseTimeToMinutes(aStart) - parseTimeToMinutes(bStart);
    });
    const firstSlotStart = sorted[0].split(' - ')[0];
    const lastSlot = sorted[sorted.length - 1];
    const lastSlotEnd = lastSlot.split(' - ')[1] || lastSlot.split(' - ')[0];
    return {
      start: firstSlotStart,
      end: lastSlotEnd,
      startMin: parseTimeToMinutes(firstSlotStart),
      endMin: parseTimeToMinutes(lastSlotEnd)
    };
  } catch (err) {
    return { start: '08:00 AM', end: '10:00 PM', startMin: 480, endMin: 1320 };
  }
};

const THERAPY_BENEFITS: Record<string, { Male: string[]; Female: string[] }> = {
  cryo: {
    Male: [
      'Boosts metabolic recovery and accelerates post-workout healing.',
      'Helps reduce localized muscle tissue inflammation and soreness.',
      'Enhances joint mobility, alertness, and overall physical performance.'
    ],
    Female: [
      'Promotes skin rejuvenation, collagen synthesis, and anti-aging.',
      'Supports healthy sleep cycles and deeply relaxes the nervous system.',
      'Aids in metabolic stimulation, calorie burning, and tissue tightening.'
    ]
  },
  sauna: {
    Male: [
      'Provides deep muscle heating and relieves severe joint tension.',
      'Enhances cardiovascular endurance and overall heart health.',
      'Promotes deep relaxation, heavy metal detoxification, and stress relief.'
    ],
    Female: [
      'Accelerates cellular repair, deep skin detox, and complexion clearing.',
      'Stimulates blood circulation and assists with bloating/fluid retention.',
      'Boosts immune system response, mood elevation, and sleep quality.'
    ]
  },
  'red-light': {
    Male: [
      'Stimulates mitochondrial energy production and muscle recovery.',
      'Reduces joint pain, inflammation, and speeds up tissue repair.',
      'Improves cellular health, energy levels, and hormonal balance.'
    ],
    Female: [
      'Promotes skin health, decreases fine lines/wrinkles, and boosts glow.',
      'Enhances lymphatic drainage, cell regeneration, and scar healing.',
      'Boosts mood, optimizes thyroid function, and balances sleep hygiene.'
    ]
  },
  hbot: {
    Male: [
      'Speeds up athletic recovery, tissue regeneration, and wound healing.',
      'Enhances cognitive clarity, focus, and mental performance.',
      'Reduces systemic inflammation and boosts mitochondrial cellular repair.'
    ],
    Female: [
      'Promotes skin vitality, accelerates collagen production, and brightens complexion.',
      'Combats daily fatigue, brain fog, and chronic stress.',
      'Supports deep cellular detoxification, immune function, and anti-aging.'
    ]
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
    yoga: 'Yoga',
    pilates: 'Pilates',
    kickboxing: 'Kickboxing',
    'salon': 'Hair Salon (Unisex)',
    'red-light': 'Infrared Chamber',
  };
  return map[id] || id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

// Helper: check massage room availability minute by minute based on gender
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
      const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
      const isExtended = b.extended === true;
      const bDuration = isExtended ? 120 : 120; // always 2 hours max
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
      return false; // Constraint violated
    }
  }
  return true;
};


// Helper: calculate boardroom end time based on start time and duration in hours
const calculateEndTime = (startTimeStr: string, hours: number): string => {
  const startMin = parseTimeToMinutes(startTimeStr);
  const endMin = startMin + hours * 60;
  
  let endHour = Math.floor(endMin / 60);
  const endMinute = endMin % 60;
  let ampm = 'AM';
  
  if (endHour >= 12) {
    ampm = 'PM';
    if (endHour > 12) {
      endHour -= 12;
    }
  }
  if (endHour === 0) {
    endHour = 12;
  }
  
  const minStr = String(endMinute).padStart(2, '0');
  const hourStr = String(endHour).padStart(2, '0');
  
  return `${hourStr}:${minStr} ${ampm}`;
};

const BOARD_ROOM_START_TIMES = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
  '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM'
];

// Helper: Cryo chamber startup & auto-shutdown timeline validation
const isCryoSlotSelectable = (proposedStart: number, dayBookings: any[], isToday: boolean, currentTime: number) => {
  if (proposedStart < 300 + 180) {
    return false; // Cannot be before 08:00 AM on any day (gym opens at 05:00 AM)
  }

  const sortedBookings = dayBookings
    .filter(b => b.serviceId === 'cryo' && b.status === 'confirmed')
    .map(b => {
      const start = parseTimeToMinutes(b.time.split(' - ')[0]);
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

// Helper: Convert total minutes from midnight to a 12-hour AM/PM string
const minutesToTimeString = (totalMinutes: number): string => {
  let minutes = totalMinutes % (24 * 60);
  let hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  let ampm = 'AM';
  
  if (hour >= 12) {
    ampm = 'PM';
    if (hour > 12) {
      hour -= 12;
    }
  } else if (hour === 0) {
    hour = 12;
  }
  
  const minStr = String(minute).padStart(2, '0');
  const hourStr = String(hour).padStart(2, '0');
  
  return `${hourStr}:${minStr} ${ampm}`;
};

// Helper: Calculate end time based on start time string and duration in minutes
const calculateCustomEndTime = (startTimeStr: string, durationMins: number): string => {
  const startMin = parseTimeToMinutes(startTimeStr);
  return minutesToTimeString(startMin + durationMins);
};

// Helper: Check if a time slot is fully booked/filled at a specific minute
const isTimeSlotFilledAtMinute = (m: number, serviceId: string, dayBookings: any[], userGender: string) => {
  if (serviceId === 'yoga' || serviceId === 'pilates' || serviceId === 'kickboxing' || serviceId === 'physio') {
    return false; // fixed services are handled separately
  }
  
  if (serviceId === 'general-massage') {
    const allMassages = dayBookings.filter(b => b.serviceId === 'general-massage');
    return !checkMassageRoomAvailability(m, 5, userGender as any, allMassages);
  }
  
  if (serviceId === 'cryo') {
    const active = dayBookings.filter(b => b.serviceId === 'cryo' && b.status === 'confirmed');
    return active.some(b => {
      const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
      const bEnd = bStart + 60;
      return m >= bStart && m < bEnd;
    });
  }
  
  if (serviceId === 'red-light') {
    const active = dayBookings.filter(b => b.serviceId === 'red-light' && b.status === 'confirmed');
    return active.some(b => {
      const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
      const bEnd = bStart + (b.extendedTherapy ? 60 : 30);
      return m >= bStart && m < bEnd;
    });
  }
  
  if (serviceId === 'hbot') {
    const active = dayBookings.filter(b => b.serviceId === 'hbot' && b.status === 'confirmed');
    return active.some(b => {
      const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
      const bEnd = bStart + (b.hbotConsecutive ? 90 : 45);
      return m >= bStart && m < bEnd;
    });
  }
  
  if (serviceId === 'salon') {
    const active = dayBookings.filter(b => b.serviceId === 'salon' && b.status === 'confirmed');
    let count = 0;
    for (const b of active) {
      const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
      const bEnd = parseTimeToMinutes(b.time.split(' - ')[1]);
      if (m >= bStart && m < bEnd) {
        count++;
      }
    }
    return count >= 2; // salon capacity is 2
  }
  
  if (serviceId === 'board-room') {
    const active = dayBookings.filter(b => b.serviceId === 'board-room' && b.status === 'confirmed');
    return active.some(b => {
      const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
      const bEnd = parseTimeToMinutes(b.time.split(' - ')[1]);
      return m >= bStart && m < bEnd;
    });
  }
  
  if (serviceId === 'sauna') {
    const active = dayBookings.filter(b => {
      if (!['confirmed', 'pending_group_fill', 'pending_join_request'].includes(b.status)) return false;
      const isSauna = b.serviceId === 'sauna';
      const isMassageWithSteam = b.serviceId === 'general-massage' && b.steamSaunaIncluded === true;
      return isSauna || isMassageWithSteam;
    });
    
    let occupied = false;
    for (const b of active) {
      const isSauna = b.serviceId === 'sauna';
      const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
      let bEnd = bStart;
      if (isSauna) {
        bEnd = bStart + (b.extendedTherapy ? 45 : 15);
      } else {
        const massageDur = b.extended ? 90 : 60;
        const saunaStart = bStart + massageDur;
        bEnd = saunaStart + 30;
      }
      
      if (m >= bStart && m < bEnd) {
        if (!isSauna || b.saunaCategory === 'Solo' || !b.saunaCategory) {
          occupied = true;
          break;
        }
        const limit = b.saunaCategory === 'Couple' ? 2 : (b.saunaGroupSize || 2);
        const currentCount = dayBookings.filter(x => x.serviceId === 'sauna' && (x.id === b.id || x.primaryBookingId === b.id) && ['confirmed', 'pending_join_request', 'pending_group_fill'].includes(x.status)).length;
        if (currentCount >= limit) {
          occupied = true;
          break;
        }
        if (b.saunaCategory === 'Couple') {
          const partnerGender = b.userGender === 'Male' ? 'Female' : 'Male';
          if (userGender !== partnerGender) {
            occupied = true;
            break;
          }
        } else if (b.saunaCategory === 'Group (2-8)') {
          if (userGender !== b.userGender) {
            occupied = true;
            break;
          }
        }
      }
    }
    return occupied;
  }
  
  return false;
};

// Helper: Get continuous occupied time blocks for a service
const getOccupiedTimeBlocks = (serviceId: string, dayBookings: any[], userGender: string) => {
  const blocks: { start: number; end: number }[] = [];
  let currentBlock: { start: number; end: number } | null = null;
  
  for (let m = 300; m < 1380; m += 5) {
    const isFilled = isTimeSlotFilledAtMinute(m, serviceId, dayBookings, userGender);
    if (isFilled) {
      if (!currentBlock) {
        currentBlock = { start: m, end: m + 5 };
      } else {
        currentBlock.end = m + 5;
      }
    } else {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
    }
  }
  if (currentBlock) {
    blocks.push(currentBlock);
  }
  return blocks.map(b => `${minutesToTimeString(b.start)} - ${minutesToTimeString(b.end)}`);
};

const getSalonServiceDuration = (name: string): number => {
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
  return 30; // default fallback duration
};

export default function ServiceBookingScreen() {
  const { equipment: serviceId } = useLocalSearchParams();
  const { user, userProfile } = useAuth();
  const isBasicTrialOrWellness = userProfile?.membershipType === 'Basic' || userProfile?.membershipType === 'Trial' || userProfile?.membershipType === 'Wellness';
  const router = useRouter();
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };

  const formattedServiceId = typeof serviceId === 'string' ? serviceId : '';

  // Dates
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Slots State
  const [slots, setSlots] = useState<{
    id: string;
    time: string;
    isAvailable: boolean;
    isFull?: boolean;
    isPending?: boolean;
    subtitle?: string;
    subtitleColor?: string;
    joinTarget?: any;
  }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [dayBookings, setDayBookings] = useState<any[]>([]);

  // Custom Time Selection State (for non-fixed services)
  const [customHour, setCustomHour] = useState<string>('09');
  const [customMinute, setCustomMinute] = useState<string>('00');
  const [customAmPm, setCustomAmPm] = useState<'AM' | 'PM'>('AM');
  const [tempHour, setTempHour] = useState<string>('09');
  const [tempMinute, setTempMinute] = useState<string>('00');
  const [tempAmPm, setTempAmPm] = useState<'AM' | 'PM'>('AM');
  const [showTimePickerModal, setShowTimePickerModal] = useState<boolean>(false);
  const [workingHours, setWorkingHours] = useState({ start: '08:00 AM', end: '10:00 PM', startMin: 480, endMin: 1320 });
  const [selectedJoinTarget, setSelectedJoinTarget] = useState<any>(null);

  // Load States
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pilates Level Filter — user picks which level they want to see dates for
  const [pilatesLevelFilter, setPilatesLevelFilter] = useState<'Basic' | 'Stretching' | 'Advanced' | null>(null);

  const getPilatesLevelForDate = (dateStr: string): 'Basic' | 'Stretching' | 'Advanced' => {
    if (!dateStr) return 'Basic';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 'Basic';
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 3) return 'Stretching';
    if ([2, 4, 6].includes(dayOfWeek)) return 'Advanced';
    return 'Basic';
  };

  // Compute which pilates levels have at least one upcoming available date (within 3-slot window)
  const getPilatesLevelAvailability = (): Record<'Basic' | 'Stretching' | 'Advanced', boolean> => {
    const today = new Date();
    const allPilatesDays: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(dayName)) {
        allPilatesDays.push(getLocalDateString(d));
      }
    }
    const maxSlots = allPilatesDays.slice(0, 3);
    const hasBasic = maxSlots.some(d => getPilatesLevelForDate(d) === 'Basic');
    const hasStretching = maxSlots.some(d => getPilatesLevelForDate(d) === 'Stretching');
    const hasAdvanced = maxSlots.some(d => getPilatesLevelForDate(d) === 'Advanced');
    return { Basic: hasBasic, Stretching: hasStretching, Advanced: hasAdvanced };
  };

  // Board Room states
  const [boardRoomHours, setBoardRoomHours] = useState<number>(1);
  const boardRoomStartTime = `${customHour}:${customMinute} ${customAmPm}`;
  const [showBoardRoomConfirmModal, setShowBoardRoomConfirmModal] = useState(false);

  const getServiceDuration = () => {
    if (firestoreServiceSettings?.[formattedServiceId]?.duration) {
      const customDur = firestoreServiceSettings[formattedServiceId].duration;
      if (formattedServiceId === 'salon') {
        return selectedSalonServices.reduce((acc, s) => acc + getSalonServiceDuration(s), 0);
      }
      if (formattedServiceId === 'general-massage') {
        return includeMassageExtension ? customDur + 30 : customDur;
      }
      if (formattedServiceId === 'hbot') {
        return hbotConsecutive ? customDur * 2 : customDur;
      }
      if (formattedServiceId === 'red-light') {
        return extendTherapy ? customDur * 2 : customDur;
      }
      return customDur;
    }

    if (formattedServiceId === 'general-massage') {
      return includeMassageExtension ? 150 : 120;
    }
    if (formattedServiceId === 'cryo') {
      return 60;
    }
    if (formattedServiceId === 'hbot') {
      return hbotConsecutive ? 90 : 45;
    }
    if (formattedServiceId === 'sauna') {
      return 15;
    }
    if (formattedServiceId === 'red-light') {
      return extendTherapy ? 60 : 30;
    }
    if (formattedServiceId === 'salon') {
      return selectedSalonServices.reduce((acc, s) => acc + getSalonServiceDuration(s), 0);
    }
    if (formattedServiceId === 'board-room') {
      return boardRoomHours * 60;
    }
    return 60;
  };

  const getJoinableSaunaSessions = () => {
    if (formattedServiceId !== 'sauna') return [];
    
    const hosts = dayBookings.filter(b => b.serviceId === 'sauna' && !b.isJoiner && b.status === 'confirmed');
    
    return hosts.map(host => {
      const joiners = dayBookings.filter(b => b.serviceId === 'sauna' && b.isJoiner && b.primaryBookingId === host.id && b.status === 'confirmed');
      const totalBookedCount = 1 + joiners.length;
      
      let isJoinable = false;
      let message = '';
      
      if (host.saunaCategory === 'Couple') {
        if (totalBookedCount < 2) {
          const partnerGender = host.userGender === 'Male' ? 'Female' : 'Male';
          if (userProfile?.gender === partnerGender) {
            isJoinable = true;
            message = `Join ${host.userName}'s Couple Session (1/2)`;
          } else {
            message = `Couple Session - Waiting for ${partnerGender}`;
          }
        } else {
          message = `Couple Session - Full`;
        }
      } else if (host.saunaCategory === 'Group (2-8)') {
        const maxGroupSize = host.saunaGroupSize || 2;
        if (totalBookedCount < maxGroupSize) {
          if (userProfile?.gender === host.userGender) {
            isJoinable = true;
            message = `Join ${host.userName}'s Group Session (${totalBookedCount}/${maxGroupSize})`;
          } else {
            message = `Group Session - ${host.userGender} Only`;
          }
        } else {
          message = `Group Session - Full`;
        }
      }
      
      return {
        host,
        isJoinable,
        message,
        time: host.time
      };
    }).filter(item => item.isJoinable || item.host.saunaCategory !== 'Solo');
  };

  // Success Confirmation Popup Modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');

  // Cancel Confirmation Popup Modal
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  // Custom Alert Modal State
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertModalTitle, setAlertModalTitle] = useState('');
  const [alertModalMessage, setAlertModalMessage] = useState('');

  const showCustomAlert = (title: string, message: string) => {
    setAlertModalTitle(title);
    setAlertModalMessage(message);
    setShowAlertModal(true);
  };

  const handleCloseAlertModal = () => {
    setShowAlertModal(false);
    if (alertModalTitle === 'There is an issue') {
      router.push({
        pathname: '/(tabs)/support',
        params: { prefilled: 'Facing an issue booking slot.' }
      });
    }
  };

  // Waitlist Popup Modal
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistTargetSlot, setWaitlistTargetSlot] = useState<any>(null);

  // Massage settings
  const [therapists, setTherapists] = useState<{ name: string; gender: string; dayOff: string }[]>(DEFAULT_THERAPISTS);
  const [selectedTherapist, setSelectedTherapist] = useState<{ name: string; gender: string; dayOff: string } | null>(null);
  const [massageTechnique, setMassageTechnique] = useState<'Swedish' | 'Deep Tissue'>('Swedish');
  const [includeSteamSauna, setIncludeSteamSauna] = useState<'sauna' | 'steam' | false>(false);
  const [includeMassageExtension, setIncludeMassageExtension] = useState(false);

  // Sub-service selected state
  const [selectedSubService, setSelectedSubService] = useState<string | null>(null);
  const [selectedSalonServices, setSelectedSalonServices] = useState<string[]>(['Haircut + Hairwash + Blowdry (Men)']);

  const toggleSalonService = (name: string) => {
    setSelectedSalonServices(prev => {
      if (prev.includes(name)) {
        if (prev.length === 1) return prev;
        return prev.filter(x => x !== name);
      } else {
        return [...prev, name];
      }
    });
  };

  // Live pricing from Firestore (falls back to hardcoded defaults)
  const [livePricing, setLivePricing] = useState<LivePricing>({
    salon: SALON_SERVICES,
    spa: SPA_SERVICES,
    physio: PHYSIO_SERVICES,
    wellnessPrice: getWellnessPrice,
  });

  useEffect(() => {
    preloadSound();
    fetchLivePricing().then(setLivePricing).catch(() => {});
  }, []);

  useEffect(() => {
    if (userProfile && userProfile.membershipType === 'Wellness' && ['yoga', 'pilates', 'kickboxing', 'gym'].includes(formattedServiceId)) {
      Alert.alert(
        'Access Restricted',
        'Wellness members do not have access to fitness sessions (Yoga, Pilates, Kickboxing) or the gym floor. Upgrade your membership.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, [userProfile, formattedServiceId]);

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(15)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(15);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 45,
        useNativeDriver: true,
      })
    ]).start();
  }, [selectedDate, selectedSubService]);

  // Therapy specific extension (for Gold users)
  const [extendTherapy, setExtendTherapy] = useState(false);

  // HBOT settings
  const [hbotConsecutive, setHbotConsecutive] = useState(false);

  // Sauna settings
  const [saunaCategory, setSaunaCategory] = useState<'Solo' | 'Couple' | 'Group (2-8)'>('Solo');
  const [saunaGroupSize, setSaunaGroupSize] = useState(2);

  // Service configuration
  const [serviceConfig, setServiceConfig] = useState({
    name: '',
    floor: '',
    duration: '',
    maxCapacity: 1,
    trainerName: '',
    trainerDayOff: ''
  });

  const bookingDayName = React.useMemo(() => {
    try {
      if (!selectedDate) return '';
      const parts = selectedDate.split('-');
      if (parts.length !== 3) return '';
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString('en-US', { weekday: 'long' });
    } catch {
      return '';
    }
  }, [selectedDate]);

  const isTrainerDayOff = React.useMemo(() => {
    return serviceConfig.trainerDayOff && serviceConfig.trainerDayOff === bookingDayName;
  }, [serviceConfig.trainerDayOff, bookingDayName]);

  const [firestoreServiceSettings, setFirestoreServiceSettings] = useState<any>(null);

  // Default sub-service when formattedServiceId loads
  useEffect(() => {
    if (formattedServiceId === 'salon') {
      setSelectedSubService('Haircut + Hairwash + Blowdry (Men)');
    } else if (formattedServiceId === 'general-massage') {
      setSelectedSubService('Head Massage (20 Mins)');
    } else {
      setSelectedSubService(null);
    }
  }, [formattedServiceId]);

  // Default therapist matching user gender
  useEffect(() => {
    if (userProfile && formattedServiceId === 'general-massage') {
      const filtered = therapists.filter(th => th.gender === userProfile.gender);
      const isStillAvailable = selectedTherapist && filtered.some(t => t.name === selectedTherapist.name);
      if (!isStillAvailable && filtered.length > 0) {
        setSelectedTherapist(filtered[0]);
      }
    }
  }, [userProfile, formattedServiceId, therapists, selectedTherapist]);

  // Calculate booking dates dynamically based on schedule (and pilates level filter)
  useEffect(() => {
    if (!formattedServiceId) return;
    const today = new Date();
    const todayDateStr = getLocalDateString();
    const list: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      let isValidDay = true;
      if (formattedServiceId === 'yoga') {
        isValidDay = ['Mon', 'Wed', 'Fri'].includes(dayName);
      } else if (['pilates', 'kickboxing'].includes(formattedServiceId)) {
        isValidDay = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(dayName);
      }
      
      if (isValidDay) {
        const dateStr = getLocalDateString(d);
        const diffTime = parseYYYYMMDD(dateStr).getTime() - parseYYYYMMDD(todayDateStr).getTime();
        const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
        if (diffDays <= 2) {
          list.push(dateStr);
        }
      }
    }
    let finalList = list;

    // If pilates and a level filter is set, further filter to only dates matching that level
    if (formattedServiceId === 'pilates' && pilatesLevelFilter !== null) {
      finalList = finalList.filter(d => getPilatesLevelForDate(d) === pilatesLevelFilter);
    }

    setDates(finalList);
    if (finalList.length > 0) {
      setSelectedDate(finalList[0]);
    } else {
      setSelectedDate('');
    }
  }, [formattedServiceId, pilatesLevelFilter]);

  const isBoardRoomTimeAvailable = (startTimeStr: string, hours: number) => {
    const startMin = parseTimeToMinutes(startTimeStr);
    const endMin = startMin + hours * 60;

    // Boardroom closing time is 10:00 PM (22:00 / 1320 minutes)
    if (endMin > 22 * 60) return false;

    // 1. Past slot check for today
    const todayDateStr = getLocalDateString();
    if (selectedDate === todayDateStr) {
      const currentHour = new Date().getHours();
      const currentMinute = new Date().getMinutes();
      const nowMinutes = currentHour * 60 + currentMinute;
      if (startMin - nowMinutes < 10) {
        return false;
      }
    }

    // 2. Overlap check with existing bookings on the selected date
    const hasOverlap = dayBookings.some(b => {
      if (b.serviceId !== 'board-room' || b.status !== 'confirmed') return false;
      const parts = b.time.split(' - ');
      if (parts.length < 2) return false;
      const bStart = parseTimeToMinutes(parts[0]);
      const bEnd = parseTimeToMinutes(parts[1]);
      return Math.max(startMin, bStart) < Math.min(endMin, bEnd);
    });

    return !hasOverlap;
  };

  // Fetch settings & bookings to build available slots
  useEffect(() => {
    if (!formattedServiceId || !selectedDate) {
      // If no date selected (e.g. pilates level filter yields no dates), stop loading
      if (!selectedDate) setLoading(false);
      return;
    }
    fetchServiceDetailsAndBookings();
  }, [formattedServiceId, selectedDate, selectedTherapist, massageTechnique, extendTherapy, hbotConsecutive, includeMassageExtension, selectedSalonServices]);

  const fetchServiceDetailsAndBookings = async () => {
    setLoading(true);
    setSelectedSlot(null);

    let name = '';
    let floor = '';
    let duration = '';
    let maxCapacity = 1;
    let trainerName = '';

    // Load staff settings directly from Firestore
    let staffList = [...DEFAULT_THERAPISTS];
    let staffData: any = null;
    try {
      const staffSnap = await getDoc(doc(db, 'settings', 'staff'));
      staffData = staffSnap.exists() ? staffSnap.data() : null;
      if (staffData) {
        staffList = [
          { name: staffData.massageMale1 || 'Vikram', gender: 'Male', dayOff: staffData.massageMale1DayOff || 'None' },
          { name: staffData.massageMale2 || 'Ragesh', gender: 'Male', dayOff: staffData.massageMale2DayOff || 'None' },
          { name: staffData.massageFemale1 || 'Ananya', gender: 'Female', dayOff: staffData.massageFemale1DayOff || 'None' },
          { name: staffData.massageFemale2 || 'Priya', gender: 'Female', dayOff: staffData.massageFemale2DayOff || 'None' }
        ];
      }
    } catch (staffErr) {
      console.error('Failed to load staff settings from Firestore:', staffErr);
    }
    setTherapists(staffList);

    // Load class details / limits directly from Firestore
    let settingsData: any = null;
    try {
      const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
      settingsData = settingsSnap.exists() ? settingsSnap.data() : null;
    } catch (classSettingsErr) {
      console.error('Failed to fetch global settings from Firestore:', classSettingsErr);
    }

    // Load slot timings from Firestore settings/services (admin-configured)
    let firestoreServiceData: any = null;
    try {
      const servicesSnap = await getDoc(doc(db, 'settings', 'services'));
      if (servicesSnap.exists()) {
        firestoreServiceData = servicesSnap.data();
      }
    } catch (svcErr) {
      console.error('Failed to load service timings from Firestore:', svcErr);
    }
    setFirestoreServiceSettings(firestoreServiceData);

    const customDur = firestoreServiceData?.[formattedServiceId]?.duration;

    let trainerDayOff = 'None';
    if (formattedServiceId === 'yoga') {
      name = 'Yoga';
      floor = '4th Floor';
      duration = customDur ? `${customDur} mins` : '60 mins';
      maxCapacity = settingsData?.yogaCapacity ? parseInt(settingsData.yogaCapacity) : 10;
      trainerName = settingsData?.yogaTrainer || 'Sarah';
      trainerDayOff = settingsData?.yogaTrainerDayOff || 'None';
    } else if (formattedServiceId === 'pilates') {
      name = 'Pilates';
      floor = '4th Floor';
      duration = customDur ? `${customDur} mins` : '60 mins';
      maxCapacity = settingsData?.pilatesCapacity ? parseInt(settingsData.pilatesCapacity) : 3;
      trainerName = settingsData?.pilatesTrainer || 'Elena';
      trainerDayOff = settingsData?.pilatesTrainerDayOff || 'None';
    } else if (formattedServiceId === 'kickboxing') {
      name = 'Kickboxing';
      floor = '4th Floor';
      duration = customDur ? `${customDur} mins` : '60 mins';
      maxCapacity = settingsData?.kickboxingCapacity ? parseInt(settingsData.kickboxingCapacity) : 5;
      trainerName = settingsData?.kickboxingTrainer || 'Coach Marcus';
      trainerDayOff = settingsData?.kickboxingTrainerDayOff || 'None';
    } else if (formattedServiceId === 'general-massage') {
      name = 'Massages';
      floor = '1st Floor';
      const baseDur = customDur ?? 120;
      duration = includeMassageExtension ? `${baseDur + 30} mins` : `${baseDur} mins`;
      maxCapacity = 2; 
    } else if (formattedServiceId === 'cryo') {
      name = 'Cryo Chamber';
      floor = '1st Floor';
      duration = customDur ? `${customDur} mins` : '60 mins';
      maxCapacity = 1;
    } else if (formattedServiceId === 'hbot') {
      name = 'HBOT Chamber';
      floor = '2nd Floor';
      const baseDur = customDur ?? 45;
      duration = hbotConsecutive ? `${baseDur * 2} mins` : `${baseDur} mins`;
      maxCapacity = 1;
    } else if (formattedServiceId === 'sauna') {
      name = 'Sauna';
      floor = '1st Floor';
      duration = customDur ? `${customDur} mins` : '15 mins';
    } else if (formattedServiceId === 'red-light') {
      name = 'Infrared Chamber';
      floor = '1st Floor';
      const baseDur = customDur ?? 30;
      duration = extendTherapy ? `${baseDur * 2} mins` : `${baseDur} mins`;
    } else if (formattedServiceId === 'physio') {
      name = 'Physiotherapy';
      floor = '2nd Floor';
      duration = customDur ? `${customDur} mins` : '30 mins';
      trainerName = settingsData?.physioTherapist || 'Dr. Shawn (Physio)';
      trainerDayOff = settingsData?.physioTherapistDayOff || 'None';
    } else if (formattedServiceId === 'salon') {
      name = 'Hair Salon (Unisex)';
      floor = '2nd Floor';
      const calculatedDuration = selectedSalonServices.reduce((acc, s) => acc + getSalonServiceDuration(s), 0);
      duration = `${calculatedDuration} mins`;
      trainerName = settingsData?.salonProfessionals || 'Salon Professional';
      trainerDayOff = settingsData?.salonProfessionalsDayOff || 'None';
      maxCapacity = 2;
    } else if (formattedServiceId === 'board-room') {
      name = 'Board Room';
      floor = 'Ground Floor';
      duration = 'Flexible';
      maxCapacity = 1;
    }

    setServiceConfig({ name, floor, duration, maxCapacity, trainerName, trainerDayOff });

    const bookingDateObj = parseYYYYMMDD(selectedDate);
    const bookingDayNameLocal = bookingDateObj.toLocaleDateString('en-US', { weekday: 'long' });

    // Build time slots
    let baseTimes: string[] = [];
    if (trainerDayOff && trainerDayOff === bookingDayNameLocal) {
      baseTimes = [];
    } else if (formattedServiceId === 'physio') {
      baseTimes = firestoreServiceData?.physio?.baseTimes ?? [
        '07:30 AM - 08:15 AM', '08:15 AM - 09:00 AM', '09:00 AM - 09:45 AM',
        '09:45 AM - 10:30 AM', '10:30 AM - 11:15 AM', '11:15 AM - 12:00 PM'
      ];
    } else if (formattedServiceId === 'yoga') {
      baseTimes = firestoreServiceData?.yoga?.baseTimes ?? ['07:00 AM - 08:00 AM'];
    } else if (formattedServiceId === 'pilates') {
      baseTimes = firestoreServiceData?.pilates?.baseTimes ?? [
        '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM',
        '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM'
      ];
    } else if (formattedServiceId === 'kickboxing') {
      baseTimes = firestoreServiceData?.kickboxing?.baseTimes ?? [
        '06:00 AM - 07:00 AM', '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM',
        '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM'
      ];
    } else if (formattedServiceId === 'general-massage') {
      baseTimes = firestoreServiceData?.['general-massage']?.baseTimes ?? [
        '08:00 AM - 10:00 AM', '10:00 AM - 12:00 PM', '12:00 PM - 02:00 PM',
        '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM', '06:00 PM - 08:00 PM',
        '08:00 PM - 10:00 PM'
      ];
    } else if (formattedServiceId === 'cryo') {
      baseTimes = firestoreServiceData?.cryo?.baseTimes ?? [
        '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM',
        '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM', '01:00 PM - 02:00 PM',
        '02:00 PM - 03:00 PM', '03:00 PM - 04:00 PM', '04:00 PM - 05:00 PM',
        '05:00 PM - 06:00 PM', '06:00 PM - 07:00 PM', '07:00 PM - 08:00 PM',
        '08:00 PM - 09:00 PM', '09:00 PM - 10:00 PM', '10:00 PM - 11:00 PM'
      ];
    } else if (formattedServiceId === 'sauna') {
      baseTimes = firestoreServiceData?.sauna?.baseTimes ?? [
        '08:00 AM - 08:15 AM', '08:30 AM - 08:45 AM', '09:00 AM - 09:15 AM', '09:30 AM - 09:45 AM',
        '10:00 AM - 10:15 AM', '10:30 AM - 10:45 AM', '11:00 AM - 11:15 AM', '11:30 AM - 11:45 AM',
        '02:00 PM - 02:15 PM', '02:30 PM - 02:45 PM', '03:00 PM - 03:15 PM', '03:30 PM - 03:45 PM',
        '04:00 PM - 04:15 PM', '04:30 PM - 04:45 PM', '05:00 PM - 05:15 PM', '05:30 PM - 05:45 PM',
        '06:00 PM - 06:15 PM', '06:30 PM - 06:45 PM'
      ];
    } else if (formattedServiceId === 'hbot') {
      baseTimes = firestoreServiceData?.hbot?.baseTimes ?? [
        '08:00 AM - 08:45 AM', '08:45 AM - 09:30 AM', '09:30 AM - 10:15 AM', '10:15 AM - 11:00 AM',
        '11:00 AM - 11:45 AM', '11:45 AM - 12:30 PM', '12:30 PM - 01:15 PM', '01:15 PM - 02:00 PM',
        '02:00 PM - 02:45 PM', '02:45 PM - 03:30 PM', '03:30 PM - 04:15 PM', '04:15 PM - 05:00 PM',
        '05:00 PM - 05:45 PM', '05:45 PM - 06:30 PM'
      ];
    } else if (formattedServiceId === 'red-light') {
      baseTimes = firestoreServiceData?.['red-light']?.baseTimes ?? [
        '08:00 AM - 08:30 AM', '08:30 AM - 09:00 AM', '09:00 AM - 09:30 AM', '09:30 AM - 10:00 AM',
        '10:00 AM - 10:30 AM', '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM', '11:30 AM - 12:00 PM',
        '12:00 PM - 12:30 PM', '12:30 PM - 01:00 PM', '01:00 PM - 01:30 PM', '01:30 PM - 02:00 PM',
        '02:00 PM - 02:30 PM', '02:30 PM - 03:00 PM', '03:00 PM - 03:30 PM', '03:30 PM - 04:00 PM',
        '04:00 PM - 04:30 PM', '04:30 PM - 05:00 PM', '05:00 PM - 05:30 PM', '05:30 PM - 06:00 PM',
        '06:00 PM - 06:30 PM', '06:30 PM - 07:00 PM'
      ];
    } else {
      baseTimes = firestoreServiceData?.salon?.baseTimes ?? [
        '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM',
        '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM', '02:00 PM - 03:00 PM',
        '03:00 PM - 04:00 PM', '04:00 PM - 05:00 PM', '05:00 PM - 06:00 PM',
        '06:00 PM - 07:00 PM'
      ];
    }

    // Ensure baseTimes has at least one slot fallback if empty database array was set
    if (!baseTimes || baseTimes.length === 0) {
      if (formattedServiceId === 'physio') {
        baseTimes = [
          '07:30 AM - 08:15 AM', '08:15 AM - 09:00 AM', '09:00 AM - 09:45 AM',
          '09:45 AM - 10:30 AM', '10:30 AM - 11:15 AM', '11:15 AM - 12:00 PM'
        ];
      } else if (formattedServiceId === 'yoga') {
        baseTimes = ['07:00 AM - 08:00 AM'];
      } else if (formattedServiceId === 'pilates') {
        baseTimes = [
          '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM',
          '10:00 AM - 11:00 AM', '11:00 AM - 12:00 PM'
        ];
      } else if (formattedServiceId === 'kickboxing') {
        baseTimes = [
          '06:00 AM - 07:00 AM', '07:00 AM - 08:00 AM', '08:00 AM - 09:00 AM',
          '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM'
        ];
      } else if (formattedServiceId === 'general-massage') {
        baseTimes = [
          '08:00 AM - 10:00 AM', '10:00 AM - 12:00 PM', '12:00 PM - 02:00 PM',
          '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM', '06:00 PM - 08:00 PM',
          '08:00 PM - 10:00 PM'
        ];
      } else if (formattedServiceId === 'cryo') {
        baseTimes = [
          '08:00 AM - 09:00 AM', '09:00 AM - 10:00 AM', '10:00 AM - 11:00 AM',
          '11:00 AM - 12:00 PM', '12:00 PM - 01:00 PM', '01:00 PM - 02:00 PM',
          '02:00 PM - 03:00 PM', '03:00 PM - 04:00 PM', '04:00 PM - 05:00 PM',
          '05:00 PM - 06:00 PM', '06:00 PM - 07:00 PM', '07:00 PM - 08:00 PM',
          '08:00 PM - 09:00 PM', '09:00 PM - 10:00 PM', '10:00 PM - 11:00 PM'
        ];
      } else if (formattedServiceId === 'sauna') {
        baseTimes = [
          '08:00 AM - 08:15 AM', '08:30 AM - 08:45 AM', '09:00 AM - 09:15 AM', '09:30 AM - 09:45 AM',
          '10:00 AM - 10:15 AM', '10:30 AM - 10:45 AM', '11:00 AM - 11:15 AM', '11:30 AM - 11:45 AM',
          '02:00 PM - 02:15 PM', '02:30 PM - 02:45 PM', '03:00 PM - 03:15 PM', '03:30 PM - 03:45 PM',
          '04:00 PM - 04:15 PM', '04:30 PM - 04:45 PM', '05:00 PM - 05:15 PM', '05:30 PM - 05:45 PM',
          '06:00 PM - 06:15 PM', '06:30 PM - 06:45 PM'
        ];
      } else if (formattedServiceId === 'hbot') {
        baseTimes = [
          '08:00 AM - 08:45 AM', '08:45 AM - 09:30 AM', '09:30 AM - 10:15 AM', '10:15 AM - 11:00 AM',
          '11:00 AM - 11:45 AM', '11:45 AM - 12:30 PM', '12:30 PM - 01:15 PM', '01:15 PM - 02:00 PM',
          '02:00 PM - 02:45 PM', '02:45 PM - 03:30 PM', '03:30 PM - 04:15 PM', '04:15 PM - 05:00 PM',
          '05:00 PM - 05:45 PM', '05:45 PM - 06:30 PM'
        ];
      } else if (formattedServiceId === 'red-light') {
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
    }

    const wh = getWorkingHoursForService(baseTimes);
    setWorkingHours(wh);

    // Load bookings for this day directly from Firestore
    const dayBookings: any[] = [];
    try {
      const q = query(
        collection(db, 'bookings'),
        where('date', '==', selectedDate),
        where('status', 'in', ['confirmed', 'pending_group_fill', 'pending_join_request'])
      );
      const querySnapshot = await getDocs(q);
      for (const d of querySnapshot.docs) {
        const data = d.data();
        let uGender = data.userGender;
        if (!uGender && data.userId) {
          const userSnap = await getDoc(doc(db, 'users', data.userId));
          if (userSnap.exists()) {
            uGender = userSnap.data().gender;
          }
        }
        dayBookings.push({ id: d.id, ...data, userGender: uGender || 'Female' });
      }
    } catch (e) {
      console.error('Error reading booking slots from Firestore:', e);
    }

    setDayBookings(dayBookings);

    const updatedSlots = baseTimes.map((time, idx) => {
      let isAvailable = true;
      let isFull = false;
      const startPart = time.split(' - ')[0];
      const proposedStart = parseTimeToMinutes(startPart);

      // 1. Past slot filter for today (and minimum advance time)
      const todayDateStr = getLocalDateString();
      const currentHour = new Date().getHours();
      const currentMinute = new Date().getMinutes();
      const nowMinutes = currentHour * 60 + currentMinute;

      let slotSubtitle: string | undefined;
      let slotSubtitleColor: string | undefined;
      let slotJoinTarget: any;
      let isPending = false;

      // 1. Same-day / 10-minute cutoff business rules (sauna requires 30 mins)
      if (selectedDate === todayDateStr) {
        if (formattedServiceId === 'cryo') {
          if (proposedStart < nowMinutes) {
            isAvailable = false;
          }
        } else if (formattedServiceId === 'sauna') {
          if (proposedStart - nowMinutes < 30) {
            isAvailable = false;
          }
        } else {
          if (proposedStart - nowMinutes < 10) {
            isAvailable = false;
          }
        }
      }

      // 1.05 48-hour advance booking window for all services
      const diffTime = parseYYYYMMDD(selectedDate).getTime() - parseYYYYMMDD(todayDateStr).getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      
      // All services can only be booked up to 48 hours in advance
      // For day 2 (48 hrs boundary): only allow slots up to current time
      if (diffDays === 2) {
        if (proposedStart > nowMinutes) {
          isAvailable = false;
        }
      } else if (diffDays > 2) {
        // Beyond 48 hours — not bookable
        isAvailable = false;
      }

      // Same-day booking is allowed for all services now

      if (!isAvailable) {
        return { id: idx.toString(), time, isAvailable, isFull };
      }

      // 2. Service specific overlap checks
      if (['yoga', 'pilates', 'kickboxing'].includes(formattedServiceId)) {
        const activeClassBookings = dayBookings.filter(b => b.serviceId === formattedServiceId && b.time === time);
        if (activeClassBookings.length >= maxCapacity) {
          isAvailable = false;
          isFull = true;
        }
      } else if (formattedServiceId === 'general-massage') {
        const allMassages = dayBookings.filter(b => b.serviceId === 'general-massage');
        
        // Massage room checker (minute-by-minute with gender assignment)
        const currentUserGender = userProfile?.gender || 'Female';
        const proposedDuration = 120;
        const roomOK = checkMassageRoomAvailability(proposedStart, proposedDuration, currentUserGender as any, allMassages);
        if (!roomOK) {
          isAvailable = false;
          // Check if it's full or just overlapping genders
          const roomCount = allMassages.filter(m => {
            const mStart = parseTimeToMinutes(m.time.split(' - ')[0]);
            const mDur = 120; // always 2hr block
            return Math.max(proposedStart, mStart) < Math.min(proposedStart + proposedDuration, mStart + mDur);
          }).length;
          if (roomCount >= 2) isFull = true;
        }
      } else if (['cryo', 'sauna', 'red-light'].includes(formattedServiceId)) {
        if (formattedServiceId === 'cryo') {
          const isToday = selectedDate === todayDateStr;
          const currentTime = new Date().getHours() * 60 + new Date().getMinutes();
          const cryoOK = isCryoSlotSelectable(proposedStart, dayBookings, isToday, currentTime);
          if (!cryoOK) isAvailable = false;
        }

        let baseDur = 60;
        if (formattedServiceId === 'sauna') baseDur = 15;
        if (formattedServiceId === 'red-light') baseDur = 30;
        
        const proposedEnd = proposedStart + (extendTherapy ? baseDur + 30 : baseDur);

        const overlaps = dayBookings.filter(b => {
          if (!['confirmed', 'pending_group_fill', 'pending_join_request'].includes(b.status)) return false;
          
          const isSaunaBooking = b.serviceId === 'sauna';
          const isMassageWithSteam = b.serviceId === 'general-massage' && b.steamSaunaIncluded === true;
          
          if (formattedServiceId === 'sauna') {
            if (!isSaunaBooking && !isMassageWithSteam) return false;
          } else {
            if (b.serviceId !== formattedServiceId) return false;
          }
          
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          let bActualStart = bStart;
          let bEnd = bStart;
          if (isSaunaBooking) {
            let bBase = 15;
            bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
          } else if (isMassageWithSteam) {
            const massageDur = b.extended ? 90 : 60;
            bActualStart = bStart + massageDur;
            bEnd = bActualStart + 30; // 30 mins
          } else {
            let bBase = 60;
            if (b.serviceId === 'cryo') bBase = 60;
            if (b.serviceId === 'red-light') bBase = 30;
            bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
          }
          
          return Math.max(proposedStart, bActualStart) < Math.min(proposedEnd, bEnd);
        });

        if (overlaps.length > 0) {
          if (formattedServiceId === 'sauna') {
            const mainBooking = overlaps.find(b => !b.isJoiner) || overlaps[0];
            
            if (mainBooking.saunaCategory === 'Couple') {
              if (overlaps.length >= 2) {
                isAvailable = false;
                const anyPending = overlaps.some(o => o.status === 'pending_join_request');
                if (anyPending) {
                  isPending = true;
                  isFull = false;
                  slotSubtitle = 'Couple - Awaiting Approval';
                } else {
                  isFull = true;
                  slotSubtitle = 'Couple - Full';
                }
              } else {
                const partnerGender = mainBooking.userGender === 'Male' ? 'Female' : 'Male';
                if (userProfile?.gender === partnerGender) {
                  isAvailable = true;
                  slotSubtitle = `Couple (1/2) - In Queue`;
                  slotSubtitleColor = TheOneColors.success;
                  slotJoinTarget = mainBooking;
                } else {
                  isAvailable = false;
                  isFull = true;
                  slotSubtitle = `Couple - Waiting for ${partnerGender}`;
                }
              }
            } else if (mainBooking.saunaCategory === 'Group (2-8)') {
              const groupSize = mainBooking.saunaGroupSize || 2;
              if (overlaps.length >= groupSize) {
                isAvailable = false;
                const anyPending = overlaps.some(o => o.status === 'pending_group_fill');
                if (anyPending) {
                  isPending = true;
                  isFull = false;
                  slotSubtitle = `Group (${groupSize}/${groupSize}) - Awaiting Confirmation`;
                } else {
                  isFull = true;
                  slotSubtitle = `Group (${groupSize}/${groupSize}) - Full`;
                }
              } else {
                if (userProfile?.gender === mainBooking.userGender) {
                  isAvailable = true;
                  slotSubtitle = `Group (${overlaps.filter(b => b.status === 'confirmed').length}/${groupSize}) - In Queue`;
                  slotSubtitleColor = TheOneColors.success;
                  slotJoinTarget = mainBooking;
                } else {
                  isAvailable = false;
                  isFull = true;
                  slotSubtitle = `Group (${overlaps.length}/${groupSize}) - ${mainBooking.userGender} Only`;
                }
              }
            } else {
              isAvailable = false;
              isFull = true;
            }
          } else {
            if (overlaps.length >= maxCapacity) {
              isAvailable = false;
              isFull = true;
            }
          }
        }
      } else if (formattedServiceId === 'hbot') {
        const hbotBookings = dayBookings.filter(b => b.serviceId === 'hbot' && b.status === 'confirmed');
        // Check if this slot overlaps with any booking
        const isOccupied1 = hbotBookings.some(b => {
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          const bEnd = bStart + (b.hbotConsecutive ? 90 : 45);
          return Math.max(proposedStart, bStart) < Math.min(proposedStart + 45, bEnd);
        });
        let isOccupied2 = false;
        if (hbotConsecutive) {
          const nextStart = proposedStart + 45;
          isOccupied2 = hbotBookings.some(b => {
            const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
            const bEnd = bStart + (b.hbotConsecutive ? 90 : 45);
            return Math.max(nextStart, bStart) < Math.min(nextStart + 45, bEnd);
          });
        }
        if (isOccupied1 || isOccupied2) {
          isAvailable = false;
          isFull = true;
        }
      } else {
        const activeBookings = dayBookings.filter(b => b.serviceId === formattedServiceId && b.time === time);
        if (activeBookings.length >= maxCapacity) {
          isAvailable = false;
          isFull = true;
        }
      }

      return {
        id: idx.toString(),
        time,
        isAvailable,
        isFull,
        isPending,
        subtitle: slotSubtitle,
        subtitleColor: slotSubtitleColor,
        joinTarget: slotJoinTarget
      };
    });

    setSlots(updatedSlots);
    setLoading(false);
  };

  const handleSlotPress = (slot: any) => {
    if (slot.isAvailable) {
      setSelectedSlot(slot.id);
      if (slot.joinTarget) {
        showCustomAlert('Joining Session', `You are requesting to join ${slot.joinTarget.userName}'s session. You will be asked to confirm this when you book.`);
      }
    } else if (slot.isFull) {
      setWaitlistTargetSlot(slot);
      setShowWaitlistModal(true);
    } else if (slot.isPending) {
      showCustomAlert('Slot Pending', 'This slot is currently awaiting approval or confirmation by the primary user. You cannot join the waitlist until it is fully confirmed.');
    } else {
      // Slot is disabled for another reason (time passed, business rule, startup buffer, etc)
      showCustomAlert('Slot Unavailable', 'This slot cannot be booked due to scheduling rules (e.g. past time, same-day policy, or machine constraints).');
    }
  };

  const joinWaitlist = async (slot: any) => {
    if (!userProfile?.phoneNumber) return;
    try {
      await addDoc(collection(db, 'waitlists'), {
        userId: userProfile.phoneNumber,
        userName: userProfile.name,
        serviceId: formattedServiceId,
        serviceName: serviceConfig.name,
        date: selectedDate,
        time: slot.time,
        createdAt: new Date().toISOString()
      });
      showCustomAlert('Waitlist Joined', 'You will be notified immediately if someone cancels their booking for this slot.');
    } catch (err) {
      console.error('Failed to join waitlist:', err);
      showCustomAlert('Error', 'Failed to join the waitlist. Please try again.');
    }
  };

  const handleBookPress = () => {
    if (userProfile?.isBlocked) {
      showCustomAlert('There is an issue', 'There is an issue. Contact THE ONE.');
      return;
    }

    const bookingDateObj = parseYYYYMMDD(selectedDate);
    const bookingDayNameLocal = bookingDateObj.toLocaleDateString('en-US', { weekday: 'long' });

    if (serviceConfig.trainerDayOff && serviceConfig.trainerDayOff === bookingDayNameLocal) {
      showCustomAlert('Trainer Day Off', `${serviceConfig.trainerName} is on a day off today. Please select another date.`);
      return;
    }

    const nowTime = Date.now();
    const isExpired = (userProfile?.membershipEndDate ? new Date(userProfile.membershipEndDate).getTime() < nowTime : false) ||
                      ((userProfile?.membershipType === 'Trial' && userProfile?.trialEndDate) ? new Date(userProfile.trialEndDate).getTime() < nowTime : false);

    if (isExpired) {
      showCustomAlert('Membership Expired', 'Your membership has expired. Please contact the administrator to renew.');
      return;
    }

    const startDateStr = userProfile?.membershipStartDate;
    const isNotStarted = startDateStr ? new Date(startDateStr).getTime() > nowTime : false;
    if (isNotStarted && startDateStr) {
      showCustomAlert('Membership Not Active', `Your membership is not active yet. It starts on ${startDateStr.split('T')[0]}.`);
      return;
    }

    const isFixedService = ['yoga', 'pilates', 'kickboxing', 'physio'].includes(formattedServiceId);
    if (isFixedService) {
      if (!selectedSlot) {
        showCustomAlert('Selection Required', 'Please select a time slot.');
        return;
      }
    } else {
      const startTime = `${customHour}:${customMinute} ${customAmPm}`;
      const startMin = parseTimeToMinutes(startTime);
      if (startMin < workingHours.startMin || startMin > workingHours.endMin) {
        showCustomAlert(
          'Outside Operating Hours',
          `${serviceConfig.name || 'Service'} is only open from ${workingHours.start} to ${workingHours.end} daily. Please select a time within working hours.`
        );
        return;
      }
    }

    if (formattedServiceId === 'board-room') {
      setShowBoardRoomConfirmModal(true);
      return;
    }

    // Massage conditions: therapist required
    if (formattedServiceId === 'general-massage') {
      const activeTherapists = therapists.filter(th => th.dayOff !== bookingDayName);
      const targetTherapist = selectedTherapist || activeTherapists.find(t => t.gender === (userProfile?.gender || 'Female')) || activeTherapists[0];
      if (!targetTherapist) {
        showCustomAlert('No Therapists Available', 'All therapists of your gender are on their day off today. Please select another date.');
        return;
      }
      if (!selectedTherapist) {
        setSelectedTherapist(targetTherapist);
      }
    }

    confirmBookingTransaction();
  };

  const confirmBookingTransaction = async () => {
    if (!userProfile?.phoneNumber) return;
    const isFixedService = ['yoga', 'pilates', 'kickboxing', 'physio'].includes(formattedServiceId);
    if (isFixedService && !selectedSlot) return;

    let bookedSlotTime = '';
    if (isFixedService) {
      const selectedSlotObj = slots.find(s => s.id === selectedSlot);
      if (!selectedSlotObj) return;
      bookedSlotTime = selectedSlotObj.time;
    } else {
      const startTime = `${customHour}:${customMinute} ${customAmPm}`;
      const duration = getServiceDuration();
      bookedSlotTime = `${startTime} - ${calculateCustomEndTime(startTime, duration)}`;
    }

    setIsSubmitting(true);
    const isPremiumCharged = userProfile.membershipType === 'Basic' || userProfile.membershipType === 'Trial' || userProfile.membershipType === 'Wellness';

    try {
      // 1. Advance constraints check
      const todayDateStr = getLocalDateString();
      
      // All services: up to 48 hrs advance limit
      const diffTime = parseYYYYMMDD(selectedDate).getTime() - parseYYYYMMDD(todayDateStr).getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 2) {
        showCustomAlert('Booking Restricted', `${serviceConfig.name} sessions can only be booked up to 48 hours in advance.`);
        setIsSubmitting(false);
        return;
      }

      // Advance constraints check complete.

      // 2. Fetch all user bookings to run overlap & limits checks
      let userBookings: any[] = [];
      try {
        const qUser = query(
          collection(db, 'bookings'),
          where('userId', '==', userProfile.phoneNumber),
          where('status', 'in', ['confirmed', 'completed', 'no-show'])
        );
        const userBookingsSnap = await getDocs(qUser);
        userBookingsSnap.forEach((doc) => {
          userBookings.push({ id: doc.id, ...doc.data() });
        });
      } catch (err) {
        console.warn('Failed to fetch user bookings from db, using local fallback:', err);
        try {
          const stored = await AsyncStorage.getItem('offline_bookings');
          const localList = stored ? JSON.parse(stored) : [];
          userBookings = localList.filter((b: any) => b.userId === userProfile.phoneNumber && b.status !== 'cancelled');
        } catch (localErr) {
          console.warn('Failed to fetch local user bookings:', localErr);
        }
      }

      // Helper: Get booking time ranges for overlap
      const getBookingTimeRange = (timeSlot: string, svcId: string, itemData?: any) => {
        const startStr = timeSlot.split(' - ')[0];
        const startMin = parseTimeToMinutes(startStr);
        let duration = 60;
        if (svcId === 'board-room') {
          const parts = timeSlot.split(' - ');
          if (parts.length >= 2) {
            const startM = parseTimeToMinutes(parts[0]);
            const endM = parseTimeToMinutes(parts[1]);
            return { start: startM, end: endM };
          }
          duration = 60;
        } else if (svcId === 'general-massage') {
          const isExtended = itemData?.extended === true;
          duration = 120; // always 2hr block
        } else if (svcId === 'cryo') {
          duration = 60;
        } else if (['sauna', 'red-light'].includes(svcId)) {
          duration = 15;
        } else if (svcId === 'physio') {
          duration = 30;
        } else if (svcId === 'salon') {
          if (itemData?.selectedSalonServices) {
            duration = itemData.selectedSalonServices.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
          } else if (itemData?.subService) {
            const subServices = itemData.subService.split(', ');
            duration = subServices.reduce((acc: number, s: string) => acc + getSalonServiceDuration(s), 0);
          } else {
            duration = 60;
          }
        } else if (svcId === 'hbot') {
          const isConsecutive = itemData?.hbotConsecutive === true;
          duration = isConsecutive ? 60 : 30;
        }

        if (['cryo', 'sauna', 'red-light'].includes(svcId) && itemData?.extendedTherapy === true) {
          duration += 30;
        }
        
        return { start: startMin, end: startMin + duration };
      };

      const proposedRange = getBookingTimeRange(bookedSlotTime, formattedServiceId, {
        extended: includeMassageExtension,
        hbotConsecutive: hbotConsecutive,
        extendedTherapy: extendTherapy && (formattedServiceId === 'red-light' && isPremiumCharged),
        selectedSalonServices: selectedSalonServices
      });

      // OVERLAP CHECK: Cannot book overlapping sessions in same slot
      const userOverlap = userBookings.some(b => {
        if (b.date !== selectedDate) return false;
        const existingRange = getBookingTimeRange(b.time, b.serviceId, b);
        return Math.max(proposedRange.start, existingRange.start) < Math.min(proposedRange.end, existingRange.end);
      });

      if (userOverlap) {
        showCustomAlert('Schedule Conflict', 'You already have another active booking scheduled that overlaps with this time window.');
        setIsSubmitting(false);
        return;
      }

      // WEEKLY LIMIT CHECK: Basic/Trial users max 3 classes/week (Yoga + Pilates + Kickboxing combined)
      if (['yoga', 'pilates', 'kickboxing'].includes(formattedServiceId) && isPremiumCharged) {
        // Calculate week bounds (Monday - Sunday) for chosen date using local parts
        const dateParts = selectedDate.split('-');
        const targetDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const dayOfWeek = targetDate.getDay();
        const diffToMon = targetDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        
        const monDate = new Date(targetDate);
        monDate.setDate(diffToMon);
        
        const sunDate = new Date(monDate);
        sunDate.setDate(monDate.getDate() + 6);

        const formatLocal = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const monStr = formatLocal(monDate);
        const sunStr = formatLocal(sunDate);

        const weeklyClasses = userBookings.filter(b => 
          ['yoga', 'pilates', 'kickboxing'].includes(b.serviceId) &&
          b.status !== 'cancelled' &&
          b.date >= monStr && b.date <= sunStr
        );

        if (weeklyClasses.length >= 3) {
          showCustomAlert(
            'Max Bookings Reached',
            'Max bookings reached. Contact admin to book more sessions.'
          );
          setIsSubmitting(false);
          return;
        }
      }

      // HBOT DAILY LIMITS CHECK
      if (formattedServiceId === 'hbot') {
        const dailyHbot = userBookings.filter(b => b.serviceId === 'hbot' && b.date === selectedDate && b.status !== 'cancelled');
        if (dailyHbot.length > 0) {
          showCustomAlert('Daily Limit Reached', 'You can only book HBOT once per day.');
          setIsSubmitting(false);
          return;
        }

        // Gold Hbot 30 min daily check
        if (userProfile.membershipType === 'Gold' && hbotConsecutive) {
          showCustomAlert('Gold Chamber Limit', 'Gold members can only book HBOT for 30 minutes a day.');
          setIsSubmitting(false);
          return;
        }
      }

      // THERAPY DAILY LIMIT CHECK
      if (['cryo', 'sauna', 'red-light'].includes(formattedServiceId)) {
        let currentTherapyMins = 0;
        const dailyTherapies = userBookings.filter(b => 
          b.date === selectedDate && 
          ['cryo', 'sauna', 'red-light'].includes(b.serviceId) && 
          b.status !== 'cancelled'
        );

        dailyTherapies.forEach(b => {
          if (b.serviceId === 'cryo') currentTherapyMins += 60;
          if (b.serviceId === 'sauna') currentTherapyMins += 15;
          if (b.serviceId === 'red-light') currentTherapyMins += 30;
          if (b.extendedTherapy) currentTherapyMins += 30;
        });

        let proposedDuration = 0;
        if (formattedServiceId === 'cryo') proposedDuration = 60;
        if (formattedServiceId === 'sauna') proposedDuration = 15;
        if (formattedServiceId === 'red-light') proposedDuration = 30;
        
        if (extendTherapy && (formattedServiceId === 'red-light' && isPremiumCharged)) {
          proposedDuration += 30;
        }

        const maxLimit = userProfile.membershipType === 'Gold' ? 120 : 60;

        if (currentTherapyMins + proposedDuration > maxLimit) {
          showCustomAlert('Daily Limit Exceeded', `Your membership allows ${maxLimit} mins of therapy per day. Booking this will exceed your daily limit.`);
          setIsSubmitting(false);
          return;
        }
      }

      // 3. Query all day bookings again for detailed Massage/Cryo rule enforcement
      let dayBookings: any[] = [];
      try {
        const qDay = query(
          collection(db, 'bookings'),
          where('date', '==', selectedDate),
          where('status', '==', 'confirmed')
        );
        const dayBookingsSnap = await getDocs(qDay);
        for (const d of dayBookingsSnap.docs) {
          const data = d.data();
          let uGender = data.userGender;
          if (!uGender && data.userId) {
            const userSnap = await getDoc(doc(db, 'users', data.userId));
            if (userSnap.exists()) {
              uGender = userSnap.data().gender;
            }
          }
          dayBookings.push({ id: d.id, ...data, userGender: uGender || 'Female' });
        }
      } catch (err) {
        console.warn('Failed to fetch day bookings from db, using local fallback:', err);
        try {
          const stored = await AsyncStorage.getItem('offline_bookings');
          const localList = stored ? JSON.parse(stored) : [];
          dayBookings = localList.filter((b: any) => b.date === selectedDate && b.status !== 'cancelled');
        } catch (localErr) {
          console.warn('Failed to fetch local day bookings:', localErr);
        }
      }

      // Same-day booking check has been removed.

      // MASSAGE RULES Check
      if (formattedServiceId === 'general-massage') {
        const currentUserGender = userProfile?.gender || 'Female';
        const proposedStart = parseTimeToMinutes(bookedSlotTime.split(' - ')[0]);
        const proposedDuration = 120; // always 2-hour room block

        const allMassages = dayBookings.filter(b => 
          b.serviceId === 'general-massage'
        );

        // Room capacity and gender check
        const roomOK = checkMassageRoomAvailability(proposedStart, proposedDuration, currentUserGender as any, allMassages);
        if (!roomOK) {
          showCustomAlert('Slot Filled', 'Sorry, all massage rooms are occupied or conflict with scheduling policies. Please choose another slot.');
          setIsSubmitting(false);
          return;
        }


        // Check Sauna Availability for massage with Sauna add-on
        if (includeSteamSauna) {
          // Massage duration in minutes (base 60 mins, +30 if extended)
          const massageDurationMins = includeMassageExtension ? 90 : 60;
          // Sauna slot = starts exactly when massage ends, lasts 30 mins
          const saunaSlotStart = proposedStart + massageDurationMins;
          const saunaSlotEnd   = saunaSlotStart + 30;

          const saunaOverlaps = dayBookings.some(b => {
            if (!['confirmed', 'pending_group_fill', 'pending_join_request'].includes(b.status)) return false;

            const isSaunaBooking   = b.serviceId === 'sauna';
            const isMassageWithSauna = ['general-massage'].includes(b.serviceId) && b.steamSaunaIncluded === true;
            if (!isSaunaBooking && !isMassageWithSauna) return false;

            const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
            let bEnd = bStart;
            if (isSaunaBooking) {
              bEnd = bStart + (b.extendedTherapy ? 45 : 15);
            } else if (isMassageWithSauna) {
              // Other massage+sauna: their sauna runs at their massage end
              const otherMassageDur = b.extended ? 90 : 60;
              const otherSaunaStart = bStart + otherMassageDur;
              bEnd = otherSaunaStart + 30;
              return Math.max(saunaSlotStart, otherSaunaStart) < Math.min(saunaSlotEnd, bEnd);
            }

            return Math.max(saunaSlotStart, bStart) < Math.min(saunaSlotEnd, bEnd);
          });

          if (saunaOverlaps) {
            showCustomAlert(
              'Sauna Unavailable',
              `The sauna is already booked during your add-on slot (${Math.floor(saunaSlotStart / 60)}:${String(saunaSlotStart % 60).padStart(2, '0')} – ${Math.floor(saunaSlotEnd / 60)}:${String(saunaSlotEnd % 60).padStart(2, '0')}). Please choose a different massage time or uncheck the Sauna add-on.`
            );
            setIsSubmitting(false);
            return;
          }
        }
      }

      // CRYO BUFFER Check: 3 hours startup / 4 hours auto shutdown timeline
      if (formattedServiceId === 'cryo') {
        const proposedStart = parseTimeToMinutes(bookedSlotTime.split(' - ')[0]);
        const isToday = selectedDate === todayDateStr;
        const currentTime = new Date().getHours() * 60 + new Date().getMinutes();
        const cryoOK = isCryoSlotSelectable(proposedStart, dayBookings, isToday, currentTime);
        if (!cryoOK) {
          showCustomAlert(
            'Cryo Chamber Buffer',
            'This slot is unavailable due to startup cooling requirements or the chamber turning off after 4 hours of inactivity.'
          );
          setIsSubmitting(false);
          return;
        }
      }

      // Sauna 30-minute advance booking check on Submit
      if (formattedServiceId === 'sauna') {
        const proposedStart = parseTimeToMinutes(bookedSlotTime.split(' - ')[0]);
        const isToday = selectedDate === todayDateStr;
        const currentTime = new Date().getHours() * 60 + new Date().getMinutes();
        if (isToday && (proposedStart - currentTime < 30)) {
          showCustomAlert(
            'Sauna Booking Cutoff',
            'Sauna sessions must be booked at least 30 minutes in advance.'
          );
          setIsSubmitting(false);
          return;
        }
      }

      // Therapy Session Overlap Check on Submit
      if (['cryo', 'sauna', 'red-light'].includes(formattedServiceId)) {
        const isFixedService = ['yoga', 'pilates', 'kickboxing', 'physio'].includes(formattedServiceId);
        const isJoining = isFixedService 
          ? (slots.find(s => s.id === selectedSlot)?.joinTarget)
          : selectedJoinTarget;

        if (!isJoining) {
          const proposedStart = parseTimeToMinutes(bookedSlotTime.split(' - ')[0]);
          let baseDur = 60;
          if (formattedServiceId === 'sauna') baseDur = 15;
          if (formattedServiceId === 'red-light') baseDur = 30;
          const proposedEnd = proposedStart + (extendTherapy ? baseDur + 30 : baseDur);

          const overlaps = dayBookings.some(b => {
            if (!['confirmed', 'pending_group_fill', 'pending_join_request'].includes(b.status)) return false;
            
            const isSaunaBooking = b.serviceId === 'sauna';
            const isMassageWithSteam = b.serviceId === 'general-massage' && b.steamSaunaIncluded === true;
            
            if (formattedServiceId === 'sauna') {
              if (!isSaunaBooking && !isMassageWithSteam) return false;
            } else {
              if (b.serviceId !== formattedServiceId) return false;
            }
            
            const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
            let bActualStart = bStart;
            let bEnd = bStart;
            if (isSaunaBooking) {
              let bBase = 15;
              bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
            } else if (isMassageWithSteam) {
              const massageDur = b.extended ? 90 : 60;
              bActualStart = bStart + massageDur;
              bEnd = bActualStart + 30; // 30 min block
            } else {
              let bBase = 60;
              if (b.serviceId === 'cryo') bBase = 60;
              if (b.serviceId === 'red-light') bBase = 30;
              bEnd = bStart + (b.extendedTherapy ? bBase + 30 : bBase);
            }
            
            return Math.max(proposedStart, bActualStart) < Math.min(proposedEnd, bEnd);
          });

          if (overlaps) {
            setIsSubmitting(false);
            setWaitlistTargetSlot({ time: bookedSlotTime });
            setShowWaitlistModal(true);
            return;
          }
        }
      }

      // HBOT Consecutive sessions check
      if (formattedServiceId === 'hbot' && hbotConsecutive) {
        const proposedStart = parseTimeToMinutes(bookedSlotTime.split(' - ')[0]);
        const nextStart = proposedStart + 45;
        const nextEnd = proposedStart + 90;
        const hasNextBooking = dayBookings.some(b => {
          if (b.serviceId !== 'hbot' || b.status !== 'confirmed') return false;
          const bStart = parseTimeToMinutes(b.time.split(' - ')[0]);
          const bEnd = bStart + (b.hbotConsecutive ? 90 : 45);
          return Math.max(nextStart, bStart) < Math.min(nextEnd, bEnd);
        });
        if (hasNextBooking) {
          showCustomAlert('HBOT Slot Conflicted', 'The consecutive 45-min session slot is already booked. Please choose another start slot or uncheck consecutive booking.');
          setIsSubmitting(false);
          return;
        }
      }

      // BOARD ROOM OVERLAP Check
      if (formattedServiceId === 'board-room') {
        const proposedStart = parseTimeToMinutes(boardRoomStartTime!);
        const proposedEnd = proposedStart + boardRoomHours * 60;
        const hasOverlap = dayBookings.some(b => {
          if (b.serviceId !== 'board-room' || b.status !== 'confirmed') return false;
          const parts = b.time.split(' - ');
          if (parts.length < 2) return false;
          const bStart = parseTimeToMinutes(parts[0]);
          const bEnd = parseTimeToMinutes(parts[1]);
          return Math.max(proposedStart, bStart) < Math.min(proposedEnd, bEnd);
        });

        if (hasOverlap) {
          showCustomAlert('Slot Conflicted', 'Sorry, the boardroom is already booked during your selected time slot. Please choose another slot.');
          setIsSubmitting(false);
          return;
        }
      }

      // 4. Save Booking Data
      const bookingData: any = {
        userId: userProfile.phoneNumber,
        userName: userProfile.name,
        userGender: userProfile.gender || 'Female',
        membershipType: userProfile.membershipType || 'Basic',
        serviceId: formattedServiceId,
        serviceName: serviceConfig.name,
        date: selectedDate,
        time: bookedSlotTime,
        status: 'confirmed',
        floor: serviceConfig.floor,
        createdAt: new Date().toISOString()
      };

      // Add details based on service type
      if (formattedServiceId === 'pilates') {
        bookingData.pilatesLevel = getPilatesLevelForDate(selectedDate);
      } else if (formattedServiceId === 'board-room') {
        bookingData.hours = boardRoomHours;
        bookingData.startTime = boardRoomStartTime;
        bookingData.endTime = calculateEndTime(boardRoomStartTime!, boardRoomHours);
      } else if (formattedServiceId === 'general-massage') {
        bookingData.therapistName = selectedTherapist?.name || 'Ananya';
        bookingData.therapistGender = selectedTherapist?.gender || 'Female';
        bookingData.massageTechnique = massageTechnique;
        bookingData.steamSaunaIncluded = !!includeSteamSauna;
        bookingData.saunaType = includeSteamSauna || null; // 'sauna' | 'steam' | null
        bookingData.extended = includeMassageExtension;
      } else if (formattedServiceId === 'hbot') {
        bookingData.hbotConsecutive = hbotConsecutive;
      } else if (['cryo', 'sauna', 'red-light'].includes(formattedServiceId)) {
        if (extendTherapy && (formattedServiceId === 'red-light' && isPremiumCharged)) {
          bookingData.extendedTherapy = true;
        }
        if (formattedServiceId === 'sauna') {
          bookingData.saunaCategory = saunaCategory;
          if (saunaCategory === 'Group (2-8)') {
            bookingData.saunaGroupSize = saunaGroupSize;
            // Group host is confirmed immediately
            bookingData.status = 'confirmed';
          }
          const isFixedService = ['yoga', 'pilates', 'kickboxing', 'physio'].includes(formattedServiceId);
          const joinTargetObj = isFixedService 
            ? (slots.find(s => s.id === selectedSlot)?.joinTarget)
            : selectedJoinTarget;

          if (joinTargetObj) {
            bookingData.isJoiner = true;
            bookingData.primaryBookingId = joinTargetObj.id;
            bookingData.hostName = joinTargetObj.userName || 'Unknown Host';
            bookingData.saunaCategory = joinTargetObj.saunaCategory; // Inherit host's category
            bookingData.status = 'pending_join_request';
            
            // create join request for Couple & Group
            await addDoc(collection(db, 'join_requests'), {
              primaryBookingId: joinTargetObj.id,
              primaryUserId: joinTargetObj.userId,
              requesterId: userProfile.phoneNumber,
              requesterName: userProfile.name,
              requesterGender: userProfile.gender,
              serviceName: serviceConfig.name,
              saunaCategory: joinTargetObj.saunaCategory,
              date: selectedDate,
              time: bookedSlotTime,
              status: 'pending',
              createdAt: new Date().toISOString()
            });
          }
        }
      }

      if (serviceConfig.trainerName) {
        bookingData.trainerName = serviceConfig.trainerName;
      }

      if (formattedServiceId === 'salon') {
        bookingData.subService = selectedSalonServices.join(', ');
      } else if (selectedSubService) {
        bookingData.subService = selectedSubService;
      }

      // Save to Firestore directly
      await addDoc(collection(db, 'bookings'), bookingData);

      // Trigger user side dues logging — use live Firestore prices
      let chargeAmount = 0;
      if (formattedServiceId === 'board-room') {
        chargeAmount = boardRoomHours * 5000;
      } else if (formattedServiceId === 'salon') {
        chargeAmount = selectedSalonServices.reduce((acc, sName) => {
          const item = livePricing.salon.find(s => s.name === sName);
          return acc + (item ? item.price : 0);
        }, 0);
      } else if (formattedServiceId === 'physio') {
        chargeAmount = livePricing.wellnessPrice(formattedServiceId);
      } else if (formattedServiceId === 'general-massage') {
        const item = livePricing.spa.find(s => s.name === selectedSubService);
        const basePrice = item ? item.price : 0;
        // Basic/Trial/Wellness: Body Massage (30 Mins) treatments double in price when extended
        const isBodyMassage60 = [
          'Body Massage - Fusion (60 Mins)',
          'Body Massage - Deep Tissue (60 Mins)',
        ].includes(selectedSubService || '');
        // Extension = 1.5x base price
        chargeAmount = (isBodyMassage60 && isBasicTrialOrWellness && includeMassageExtension)
          ? Math.round(basePrice * 1.5)
          : basePrice;
        // Only sauna add-on costs ₹500; steam is free
        if (includeSteamSauna === 'sauna') chargeAmount += 500;
      } else {
        chargeAmount = livePricing.wellnessPrice(formattedServiceId);
      }

      // Gold members pay $0 for all therapies, Basic/Trial/Wellness members log dues.
      // But BOARD ROOM is chargeable for EVERYONE (including Gold).
      const isBoardRoom = formattedServiceId === 'board-room';
      if (chargeAmount > 0 && (isPremiumCharged || isBoardRoom)) {
        await addDoc(collection(db, 'dues'), {
          userId: userProfile.phoneNumber,
          userName: userProfile.name,
          amount: chargeAmount,
          serviceName: isBoardRoom ? `Board Room (${boardRoomHours} hrs)` : (selectedSubService || serviceConfig.name),
          date: selectedDate,
          status: 'pending',
          createdAt: new Date().toISOString()
        });
      }

      setIsSubmitting(false);
      setSelectedSlot(null);
      setSelectedJoinTarget(null);
      setIncludeMassageExtension(false);
      setHbotConsecutive(false);

      if (bookingData.isJoiner) {
        setSuccessModalMessage(`Your request to join the session has been sent to the primary user for approval. It will be confirmed once they accept.`);
      } else if (bookingData.saunaCategory === 'Group (2-8)') {
        setSuccessModalMessage(`You have created a Group session for ${selectedDate} at ${bookedSlotTime}. You can confirm it on your Dashboard once enough people join!`);
      } else if (isBoardRoom) {
        setSuccessModalMessage(`You have successfully booked the Board Room for ${selectedDate} from ${boardRoomStartTime} to ${calculateEndTime(boardRoomStartTime!, boardRoomHours)} (${boardRoomHours} Hour(s)). A charge of ₹${chargeAmount} has been added to your profile dues.`);
      } else {
        setSuccessModalMessage(`You have successfully booked "${serviceConfig.name}" for ${selectedDate} at ${bookedSlotTime}.`);
      }
      playSuccessSound();
      setShowSuccessModal(true);

    } catch (e) {
      console.error('Error creating booking:', e);
      setIsSubmitting(false);
      playCancelSound();
      showCustomAlert('Booking Error', 'We could not write your booking. Please try again.');
    }
  };

  const handleCancelAdminBooking = async (bookingId: string) => {
    try {
      const bookingToCancel = dayBookings.find(b => b.id === bookingId);

      // Update Firestore directly
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'cancelled',
        cancelledByAdmin: true,
        cancelledAt: new Date().toISOString()
      });
      
      // Notify waitlisted users
      if (bookingToCancel) {
        const waitlistQ = query(
          collection(db, 'waitlists'), 
          where('serviceId', '==', formattedServiceId),
          where('date', '==', bookingToCancel.date),
          where('time', '==', bookingToCancel.time)
        );
        const waitlistSnap = await getDocs(waitlistQ);
        
        const notifyPromises = waitlistSnap.docs.map(wDoc => {
          const wData = wDoc.data();
          return addDoc(collection(db, 'in_app_notifications'), {
            userId: wData.userId,
            title: 'Spot Available!',
            body: `A spot just opened up for ${wData.serviceName || 'your selected class'} on ${bookingToCancel.date} at ${bookingToCancel.time}. Book it now before it's gone!`,
            read: false,
            createdAt: new Date().toISOString()
          });
        });
        await Promise.all(notifyPromises);
        
        const deleteWaitlistPromises = waitlistSnap.docs.map(wDoc => deleteDoc(doc(db, 'waitlists', wDoc.id)));
        await Promise.all(deleteWaitlistPromises);
      }

      showCustomAlert('Cancelled', 'Booking cancelled successfully.');
      fetchServiceDetailsAndBookings();
    } catch (e: any) {
      console.error(e);
      showCustomAlert('Cancellation Error', e.message || String(e));
    }
  };


  const isTherapy = ['cryo', 'sauna', 'red-light', 'hbot'].includes(formattedServiceId);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: serviceConfig.name || formatEquipmentName(formattedServiceId) || 'Booking' }} />
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContainerStyle}>
          {/* Header Title */}
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: TheOneTypography.headlineFamily }]}>{serviceConfig.name}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.secondaryText, fontFamily: TheOneTypography.bodyFamily }]}>
            {serviceConfig.floor} • {serviceConfig.duration}
          </Text>

          {/* Trainer Info */}
          {serviceConfig.trainerName ? (
            formattedServiceId === 'pilates' ? (
              <View style={[styles.trainerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <FontAwesome name="user" size={16} color={colors.tint} style={{ marginRight: 10 }} />
                <Text style={[styles.trainerText, { color: colors.text }]}>Trainer: {serviceConfig.trainerName}</Text>
              </View>
            ) : (
              <View style={[styles.trainerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <FontAwesome name="user" size={16} color={colors.tint} style={{ marginRight: 10 }} />
                <Text style={[styles.trainerText, { color: colors.text }]}>Trainer: {serviceConfig.trainerName}</Text>
              </View>
            )
          ) : null}

          {/* Pilates Level Selector */}
          {formattedServiceId === 'pilates' && (() => {
            const availability = getPilatesLevelAvailability();
            const levels: { key: 'Basic' | 'Stretching' | 'Advanced'; label: string; icon: string; days: string }[] = [
              { key: 'Basic', label: 'Beginner Session (Low Intensity)', icon: '⚡', days: 'Mon & Fri' },
              { key: 'Stretching', label: 'Focused on Stretching', icon: '🧘', days: 'Wednesday' },
              { key: 'Advanced', label: 'Advanced Session (High Intensity)', icon: '🔥', days: 'Tue, Thu & Sat' },
            ];
            return (
              <View style={{ marginTop: 4, marginBottom: 4 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Level</Text>
                <Text style={{ color: colors.secondaryText, fontSize: 12, marginBottom: 14, marginTop: -8 }}>
                  Choose your session type — dates update automatically
                </Text>
                <View style={{ flexDirection: 'column', gap: 10 }}>
                  {levels.map((lvl) => {
                    const isAvailable = availability[lvl.key];
                    const isSelected = pilatesLevelFilter === lvl.key;
                    return (
                      <PressSpring
                        key={lvl.key}
                        style={[
                          {
                            borderRadius: 16,
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? colors.tint : colors.border,
                            backgroundColor: isSelected ? colors.tint + '1A' : colors.card,
                            opacity: isAvailable ? 1 : 0.5,
                            gap: 12,
                          }
                        ]}
                        onPress={() => {
                          if (!isAvailable) {
                            showCustomAlert('Not Available', `No upcoming ${lvl.label} sessions in the next 48 hours.`);
                            return;
                          }
                          setPilatesLevelFilter(isSelected ? null : lvl.key);
                        }}
                        scaleTo={0.97}
                        hapticStyle="selection"
                        fullWidth={true}
                      >
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isSelected ? colors.tint + '22' : 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 22 }}>{lvl.icon}</Text>
                        </View>
                        
                        <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: isSelected ? colors.tint : colors.text }}>
                            {lvl.label}
                          </Text>
                          <Text style={{ fontSize: 13, color: colors.secondaryText, marginTop: 2, fontWeight: '600' }}>
                            {lvl.days}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end', backgroundColor: 'transparent' }}>
                          {!isAvailable && (
                            <View style={{ backgroundColor: TheOneColors.error + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 9, color: TheOneColors.error, fontWeight: '700', letterSpacing: 0.5 }}>NOT AVAILABLE</Text>
                            </View>
                          )}
                          {isSelected && isAvailable && (
                            <View style={{ backgroundColor: colors.tint + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                              <Text style={{ fontSize: 9, color: colors.tint, fontWeight: '700', letterSpacing: 0.5 }}>SELECTED ✓</Text>
                            </View>
                          )}
                        </View>
                      </PressSpring>
                    );
                  })}
                </View>
                {pilatesLevelFilter && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 5, backgroundColor: colors.tint + '10', borderRadius: 8, padding: 8 }}>
                    <FontAwesome name="info-circle" size={12} color={colors.tint} />
                    <Text style={{ color: colors.secondaryText, fontSize: 11, flex: 1 }}>
                      Showing <Text style={{ color: colors.tint, fontWeight: '700' }}>
                        {pilatesLevelFilter === 'Basic' ? 'Beginner Session (Low Intensity)' : pilatesLevelFilter === 'Advanced' ? 'Advanced Session (High Intensity)' : 'Focused on Stretching'}
                      </Text> sessions only
                    </Text>
                    <PressSpring
                      style={{}}
                      onPress={() => setPilatesLevelFilter(null)}
                      scaleTo={0.9}
                      hapticStyle="light"
                      fullWidth={false}
                    >
                      <FontAwesome name="times-circle" size={14} color={colors.secondaryText} />
                    </PressSpring>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Date Selector */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Select Date</Text>
          {formattedServiceId === 'pilates' && dates.length === 0 && pilatesLevelFilter !== null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: TheOneColors.error + '12', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <FontAwesome name="ban" size={14} color={TheOneColors.error} />
              <Text style={{ color: TheOneColors.error, fontSize: 12, flex: 1 }}>
                No {pilatesLevelFilter} sessions available in the next 48 hours
              </Text>
            </View>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
            {dates.map((dateStr) => {
              const dateObj = parseYYYYMMDD(dateStr);
              const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
              const dayNum = dateObj.getDate();
              const isSelected = selectedDate === dateStr;
              return (
                <PressSpring
                  key={dateStr}
                  style={[
                    styles.datePill,
                    isSelected ? { backgroundColor: colors.tint } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
                  ]}
                  onPress={() => {
                    playClickSound();
                    setSelectedDate(dateStr);
                  }}
                  scaleTo={0.93}
                  hapticStyle="selection"
                  fullWidth={false}
                >
                  <Text style={[styles.dateDay, isSelected ? { color: '#FFFFFF' } : { color: colors.secondaryText }]}>
                    {dayName}
                  </Text>
                  <Text style={[styles.dateNum, isSelected ? { color: '#FFFFFF' } : { color: colors.text }]}>
                    {dayNum}
                  </Text>
                </PressSpring>
              );
            })}
          </ScrollView>

          <View style={{ width: '100%', backgroundColor: 'transparent' }}>

          {/* Sub-Service Option Picker */}
          {['salon', 'general-massage'].includes(formattedServiceId) && (
            <View style={styles.subServiceSection}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>
                Select {formattedServiceId === 'salon' ? 'Salon Service' : formattedServiceId === 'physio' ? 'Physiotherapy Option' : 'Treatment'}
              </Text>
              <View style={styles.subServicesList}>
                {(formattedServiceId === 'salon'
                  ? livePricing.salon
                  : formattedServiceId === 'physio'
                    ? livePricing.physio
                    : livePricing.spa
                ).map((item) => {
                  const isSelected = formattedServiceId === 'salon'
                    ? selectedSalonServices.includes(item.name)
                    : selectedSubService === item.name;
                  return (
                    <PressSpring
                      key={item.name}
                      style={[
                        styles.subServiceCard,
                        { backgroundColor: colors.card, borderColor: isSelected ? colors.tint : colors.border },
                        isSelected && { borderWidth: 2 }
                      ]}
                      onPress={() => {
                        playClickSound();
                        if (formattedServiceId === 'salon') {
                          toggleSalonService(item.name);
                        } else {
                          setSelectedSubService(item.name);
                        }
                      }}
                      scaleTo={0.96}
                      hapticStyle="light"
                      fullWidth={true}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: 'transparent' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, backgroundColor: 'transparent', gap: 10 }}>
                          {formattedServiceId === 'salon' && (
                            <FontAwesome
                              name={isSelected ? 'check-square' : 'square-o'}
                              size={18}
                              color={isSelected ? colors.tint : colors.secondaryText}
                            />
                          )}
                          <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                            <Text style={[styles.subServiceName, { color: colors.text }, isSelected && { fontWeight: '700' }]}>
                              {item.name}
                            </Text>
                            {formattedServiceId === 'salon' && (
                              <Text style={{ fontSize: 11, color: colors.secondaryText, marginTop: 2 }}>
                                ⏱ Duration: {getSalonServiceDuration(item.name)} mins
                              </Text>
                            )}
                          </View>
                        </View>
                        {isBasicTrialOrWellness && (
                          <Text style={[styles.subServicePrice, { color: isSelected ? colors.tint : colors.secondaryText }]}>
                            ₹{item.price}
                          </Text>
                        )}
                      </View>
                    </PressSpring>
                  );
                })}
              </View>
            </View>
          )}

          {/* Wellness pricing info card */}
          {['sauna', 'hbot', 'cryo', 'red-light'].includes(formattedServiceId) && isBasicTrialOrWellness && (
            <View style={[styles.wellnessPriceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <FontAwesome name="tag" size={16} color={colors.tint} style={{ marginRight: 10 }} />
              <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                <Text style={[styles.wellnessPriceLabel, { color: colors.secondaryText }]}>Session Cost</Text>
                <Text style={[styles.wellnessPriceValue, { color: colors.text }]}>₹{livePricing.wellnessPrice(formattedServiceId)}</Text>
              </View>
            </View>
          )}

          {/* Therapy Benefits section */}
          {isTherapy && (
            <View style={[styles.benefitsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.benefitsTitle, { color: colors.text }]}>🌿 Premium Recovery Benefits</Text>
              {(!userProfile?.gender || userProfile.gender.toLowerCase() === 'male') && (
                <View style={{ backgroundColor: 'transparent', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: 'transparent' }}>
                    <Text style={styles.benefitGenderBadge}>M</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Male Recovery Benefits</Text>
                  </View>
                  {THERAPY_BENEFITS[formattedServiceId]?.Male.map((benefit, idx) => (
                    <View key={idx} style={styles.disclaimerRow}>
                      <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                      <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>{benefit}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(!userProfile?.gender || userProfile.gender.toLowerCase() === 'female') && (
                <View style={{ backgroundColor: 'transparent', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, backgroundColor: 'transparent' }}>
                    <Text style={[styles.benefitGenderBadge, { backgroundColor: '#FF69B4' }]}>F</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Female Recovery Benefits</Text>
                  </View>
                  {THERAPY_BENEFITS[formattedServiceId]?.Female.map((benefit, idx) => (
                    <View key={idx} style={styles.disclaimerRow}>
                      <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                      <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>{benefit}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Safety Disclaimer Box */}
          {['sauna', 'hbot', 'cryo', 'red-light'].includes(formattedServiceId) && (
            <View style={[styles.disclaimerCard, { backgroundColor: TheOneColors.accentFaint, borderColor: TheOneColors.accentBorder }]}>
              <View style={styles.disclaimerHeader}>
                <FontAwesome name="exclamation-triangle" size={14} color={colors.tint} style={{ marginRight: 8 }} />
                <Text style={[styles.disclaimerTitle, { color: colors.text }]}>Safety Disclaimer</Text>
              </View>
              {formattedServiceId === 'sauna' && (
                <View style={{ backgroundColor: 'transparent' }}>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Wear minimal clothing.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Hydrate before using sauna .</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Do not use if unwell.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Exit if dizzy or uncomfortable.</Text>
                  </View>
                </View>
              )}
              {formattedServiceId === 'hbot' && (
                <View style={{ backgroundColor: 'transparent' }}>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Stay hydrated.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Chew gum for ear pressure equalization.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Report any discomfort before the session.</Text>
                  </View>
                </View>
              )}
              {formattedServiceId === 'cryo' && (
                <View style={{ backgroundColor: 'transparent' }}>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Wear minimal cotton clothing and all required protective gear.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Maintain a 6-hour gap after weight training.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Keep moving slowly during the session.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Inform staff immediately if you feel dizzy, numb, or uncomfortable.</Text>
                  </View>
                </View>
              )}
              {formattedServiceId === 'red-light' && (
                <View style={{ backgroundColor: 'transparent' }}>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Wear minimal clothing.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Remove all metal items and electronic devices.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Wear the provided eye protection.</Text>
                  </View>
                  <View style={styles.disclaimerRow}>
                    <Text style={[styles.disclaimerBullet, { color: colors.tint }]}>•</Text>
                    <Text style={[styles.disclaimerText, { color: colors.secondaryText }]}>Notify staff immediately if you feel dizzy, nauseous, overheated, or uncomfortable.</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Therapy Extension Option for Red Light */}
          {(formattedServiceId === 'red-light' && isBasicTrialOrWellness) && (
            <PressSpring
              style={[styles.checkboxContainer, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}
              onPress={() => setExtendTherapy(!extendTherapy)}
              scaleTo={0.98}
              hapticStyle="selection"
              fullWidth={true}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                <FontAwesome
                  name={extendTherapy ? 'check-square' : 'square-o'}
                  size={20}
                  color={colors.tint}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                  <Text style={[styles.checkboxLabel, { color: colors.text }]}>Extend session by 30 mins</Text>
                  <Text style={[styles.checkboxDesc, { color: colors.secondaryText }]}>Extend therapy duration by an extra 30 mins.</Text>
                </View>
              </View>
            </PressSpring>
          )}

          {/* Massage Therapists & Custom Settings */}
          {formattedServiceId === 'general-massage' && (
            <View style={styles.massageConfigBlock}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Therapist</Text>
              <View style={styles.therapistGrid}>
                {therapists.filter(th => {
                  const matchesGender = !userProfile || th.gender === userProfile.gender;
                  const isOff = th.dayOff === bookingDayName;
                  return matchesGender && !isOff;
                }).map((th) => {
                  const isSelected = selectedTherapist?.name === th.name;
                  return (
                    <PressSpring
                      key={th.name}
                      style={[
                        styles.therapistCard,
                        isSelected ? { backgroundColor: colors.tint } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
                      ]}
                      onPress={() => setSelectedTherapist(th)}
                      scaleTo={0.93}
                      hapticStyle="selection"
                      fullWidth={false}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <FontAwesome name="user-circle" size={16} color={isSelected ? '#FFFFFF' : colors.secondaryText} style={{ marginRight: 6 }} />
                        <Text style={[styles.therapistNameText, isSelected ? { color: '#FFFFFF' } : { color: colors.text }]}>
                          {th.name} ({th.gender.charAt(0)})
                        </Text>
                      </View>
                    </PressSpring>
                  );
                })}
              </View>
              {therapists.filter(th => {
                const matchesGender = !userProfile || th.gender === userProfile.gender;
                const isOff = th.dayOff === bookingDayName;
                return matchesGender && !isOff;
              }).length === 0 && (
                <Text style={{ color: TheOneColors.error, fontSize: 13, fontWeight: '700', marginTop: 4, textAlign: 'center' }}>
                  ⚠ No therapists of your gender are available today.
                </Text>
              )}

              {/* Sauna / Steam Add-on — pill selector like therapist */}
              <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Add-on After Massage</Text>
              <View style={styles.therapistGrid}>
                {[
                  { label: 'Sauna  +₹500', icon: 'fire',  value: 'sauna' as const },
                  { label: 'Steam  (Free)',  icon: 'cloud', value: 'steam' as const },
                ].map((opt) => {
                  const isSelected = includeSteamSauna === opt.value;
                  return (
                    <PressSpring
                      key={opt.value}
                      style={[
                        styles.therapistCard,
                        isSelected
                          ? { backgroundColor: colors.tint }
                          : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
                      ]}
                      onPress={() => setIncludeSteamSauna(isSelected ? false : opt.value)}
                      scaleTo={0.93}
                      hapticStyle="selection"
                      fullWidth={false}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <FontAwesome
                          name={opt.icon as any}
                          size={14}
                          color={isSelected ? '#FFFFFF' : colors.secondaryText}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.therapistNameText, isSelected ? { color: '#FFFFFF' } : { color: colors.text }]}>
                          {opt.label}
                        </Text>
                      </View>
                    </PressSpring>
                  );
                })}
              </View>
              {includeSteamSauna === 'sauna' && (
                <Text style={[styles.checkboxDesc, { color: colors.secondaryText, marginTop: 6, marginLeft: 4 }]}>
                  <FontAwesome name="info-circle" size={11} color={colors.tint} /> 30 min sauna slot auto-blocked after your massage ends
                </Text>
              )}
              {includeSteamSauna === 'steam' && (
                <Text style={[styles.checkboxDesc, { color: colors.secondaryText, marginTop: 6, marginLeft: 4 }]}>
                  <FontAwesome name="info-circle" size={11} color={colors.tint} /> 30 min steam session auto-blocked after your massage ends
                </Text>
              )}

              {/* Basic User Massage Extension Option */}
              {isBasicTrialOrWellness && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity
                      style={[styles.checkboxContainer, { backgroundColor: colors.card, borderColor: colors.border }]}
                      onPress={() => setIncludeMassageExtension(!includeMassageExtension)}
                    >
                      <FontAwesome
                        name={includeMassageExtension ? 'check-square' : 'square-o'}
                        size={20}
                        color={colors.tint}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                        <Text style={[styles.checkboxLabel, { color: colors.text }]}>Extend massage by 30 mins</Text>
                        <Text style={[styles.checkboxDesc, { color: colors.secondaryText }]}>
                          {`Adds 30 mins to massage session • ₹${Math.round((livePricing.spa.find(s => s.name === selectedSubService)?.price ?? 3000) * 1.5).toLocaleString()}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
              )}
            </View>
          )}

          {/* Time Slot Picker */}
          {(() => {
            const isFixedService = ['yoga', 'pilates', 'kickboxing', 'physio'].includes(formattedServiceId);
            if (isFixedService) {
              return (
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>Select Slot</Text>

                  <View style={styles.slotsGrid}>
                    {isTrainerDayOff ? (
                      <View style={{ flex: 1, padding: 20, alignItems: 'center', backgroundColor: 'rgba(184,70,0,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(184,70,0,0.25)', marginVertical: 10 }}>
                        <FontAwesome name="calendar-times-o" size={24} color="#B84600" style={{ marginBottom: 8 }} />
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Trainer Day Off</Text>
                        <Text style={{ color: colors.secondaryText, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                          {serviceConfig.trainerName} is on a day off today. Bookings are unavailable on this date.
                        </Text>
                      </View>
                    ) : (
                      slots.map((slot) => (
                        <SlotButton
                          key={slot.id}
                          time={slot.time}
                          available={slot.isAvailable}
                          selected={selectedSlot === slot.id}
                          onPress={() => handleSlotPress(slot)}
                        />
                      ))
                    )}
                  </View>

                  {/* Booked Slots Summary for Fixed Services */}
                  {(() => {
                    const bookedSlots = slots.filter(s => !s.isAvailable);
                    if (bookedSlots.length === 0) return null;
                    return (
                      <View style={[styles.bookedSlotsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                          <FontAwesome name="calendar-times-o" size={14} color={colors.secondaryText} style={{ marginRight: 8 }} />
                          <Text style={[styles.bookedSlotsTitle, { color: colors.secondaryText }]}>
                            Booked Slots on {selectedDate.split('-').reverse().join('-')}
                          </Text>
                        </View>
                        {bookedSlots.map((slot) => (
                          <View key={slot.id} style={[styles.bookedSlotRow, { borderBottomColor: colors.border }]}>
                            <FontAwesome
                              name={slot.isFull ? 'times-circle' : slot.isPending ? 'clock-o' : 'ban'}
                              size={13}
                              color={slot.isFull ? TheOneColors.error : slot.isPending ? '#F5A623' : colors.secondaryText}
                              style={{ marginRight: 8, marginTop: 1 }}
                            />
                            <Text style={[styles.bookedSlotTime, { color: colors.text }]}>{slot.time}</Text>
                            <View
                              style={[
                                styles.bookedSlotBadge,
                                {
                                  backgroundColor: slot.isFull
                                    ? TheOneColors.error + '22'
                                    : slot.isPending
                                    ? '#F5A62322'
                                    : colors.border,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.bookedSlotBadgeText,
                                  {
                                    color: slot.isFull
                                      ? TheOneColors.error
                                      : slot.isPending
                                      ? '#F5A623'
                                      : colors.secondaryText,
                                  },
                                ]}
                              >
                                {slot.isFull ? 'FULL' : slot.isPending ? 'PENDING' : 'UNAVAIL'}
                              </Text>
                            </View>
                            {slot.subtitle ? (
                              <Text style={[styles.bookedSlotSubtitle, { color: slot.subtitleColor || colors.secondaryText }]}>
                                {slot.subtitle}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </View>
              );
            }

            // Custom Time Picker for Non-Fixed Services
            const joinableSessions = getJoinableSaunaSessions();
            return (
              <View style={{ marginTop: 20 }}>
                {formattedServiceId === 'board-room' && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Duration (Hours)</Text>
                    <View style={styles.pickerPillsRow}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((hrs) => {
                        const isSelected = boardRoomHours === hrs;
                        return (
                          <TouchableOpacity
                            key={hrs}
                            style={[
                              styles.pickerPill,
                              isSelected ? { backgroundColor: colors.tint } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }
                            ]}
                            onPress={() => setBoardRoomHours(hrs)}
                          >
                            <Text style={[styles.pickerPillText, isSelected ? { color: '#FFFFFF' } : { color: colors.text }]}>
                              {hrs}h
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Start Time</Text>
                
                {selectedJoinTarget && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.tint + '15', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.tint + '30' }}>
                    <FontAwesome name="handshake-o" size={14} color={colors.tint} />
                    <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                      Joining <Text style={{ fontWeight: '700' }}>{selectedJoinTarget.userName}</Text>'s session at {selectedJoinTarget.time.split(' - ')[0]}
                    </Text>
                    <TouchableOpacity onPress={() => { playClickSound(); setSelectedJoinTarget(null); }}>
                      <Text style={{ color: TheOneColors.error, fontSize: 12, fontWeight: '700' }}>CANCEL</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Styled Picker Card Trigger Button */}
                {isTrainerDayOff ? (
                  <View style={{ padding: 20, alignItems: 'center', backgroundColor: 'rgba(184,70,0,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(184,70,0,0.25)', marginVertical: 10 }}>
                    <FontAwesome name="calendar-times-o" size={24} color="#B84600" style={{ marginBottom: 8 }} />
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>Staff Day Off</Text>
                    <Text style={{ color: colors.secondaryText, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                      {serviceConfig.trainerName || serviceConfig.name || 'Staff'} is on a day off today. Bookings are unavailable on this date.
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      playClickSound();
                      setTempHour(customHour);
                      setTempMinute(customMinute);
                      setTempAmPm(customAmPm);
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
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <FontAwesome name="clock-o" size={18} color={colors.tint} />
                      <View style={{ backgroundColor: 'transparent' }}>
                        <Text style={{ color: colors.secondaryText, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }}>START TIME</Text>
                        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2, fontFamily: TheOneTypography.headlineFamily }}>
                          {customHour}:{customMinute} {customAmPm}
                        </Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 8 }}>
                      <FontAwesome name="pencil" size={14} color={colors.tint} />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Operating Hours Informational Note */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 20, paddingHorizontal: 4 }}>
                  <FontAwesome name="info-circle" size={13} color={colors.secondaryText} />
                  <Text style={{ color: colors.secondaryText, fontSize: 12, fontFamily: TheOneTypography.bodyFamily }}>
                    {serviceConfig.name || 'Service'} is open from <Text style={{ fontWeight: '700', color: colors.text }}>{workingHours.start} to {workingHours.end}</Text> daily.
                  </Text>
                </View>

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
                        {(() => {
                          const currentSelectMins = parseTimeToMinutes(`${tempHour}:${tempMinute} ${tempAmPm}`);
                          const startLimit = workingHours?.startMin ?? 480;
                          const endLimit = workingHours?.endMin ?? 1320;
                          const isInvalid = currentSelectMins < startLimit || currentSelectMins > endLimit;
                          return (
                            <TouchableOpacity
                              disabled={isInvalid}
                              onPress={() => {
                                playClickSound();
                                setCustomHour(tempHour);
                                setCustomMinute(tempMinute);
                                setCustomAmPm(tempAmPm);
                                setSelectedJoinTarget(null);
                                setShowTimePickerModal(false);
                              }}
                            >
                              <Text style={{ color: isInvalid ? '#555555' : '#FF9500', fontSize: 17, fontWeight: '700' }}>
                                Save
                              </Text>
                            </TouchableOpacity>
                          );
                        })()}
                      </View>

                      {/* Real-time Time Picker Live Preview Banner */}
                      <View style={{ paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', backgroundColor: '#2C2C2E', borderBottomWidth: 1, borderBottomColor: '#3A3A3C' }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 19, fontWeight: '800' }}>
                          Selected Time: {tempHour}:{tempMinute} {tempAmPm}
                        </Text>
                        {(() => {
                          const currentSelectMins = parseTimeToMinutes(`${tempHour}:${tempMinute} ${tempAmPm}`);
                          const startLimit = workingHours?.startMin ?? 480;
                          const endLimit = workingHours?.endMin ?? 1320;
                          const displayStart = workingHours?.start ?? '08:00 AM';
                          const displayEnd = workingHours?.end ?? '10:00 PM';
                          
                          if (currentSelectMins < startLimit || currentSelectMins > endLimit) {
                            return (
                              <Text style={{ color: '#FF453A', fontSize: 12, marginTop: 4, fontWeight: '700', textAlign: 'center' }}>
                                ⚠ Outside operating hours ({displayStart} - {displayEnd})
                              </Text>
                            );
                          }
                          return (
                            <Text style={{ color: '#30D158', fontSize: 12, marginTop: 4, fontWeight: '700', textAlign: 'center' }}>
                              ✓ Within operating hours ({displayStart} - {displayEnd})
                            </Text>
                          );
                        })()}
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
                              const options = ['AM', 'PM'];
                              if (index >= 0 && index < options.length) setTempAmPm(options[index] as 'AM' | 'PM');
                            }}
                            onScrollEndDrag={(e) => {
                              const y = e.nativeEvent.contentOffset.y;
                              const index = Math.round(y / 44);
                              const options = ['AM', 'PM'];
                              if (index >= 0 && index < options.length) setTempAmPm(options[index] as 'AM' | 'PM');
                            }}
                          >
                            {['AM', 'PM'].map((ampm) => {
                              const isSelected = tempAmPm === ampm;
                              return (
                                <TouchableOpacity
                                  key={ampm}
                                  onPress={() => setTempAmPm(ampm as 'AM' | 'PM')}
                                  style={{ height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' }}
                                >
                                  <Text style={{
                                    fontSize: isSelected ? 23 : 19,
                                    fontWeight: isSelected ? '700' : '400',
                                    color: isSelected ? '#FFFFFF' : '#8E8E93',
                                  }}>
                                    {ampm}
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

                {/* Sauna Joinable Sessions (Couple / Group) */}
                {formattedServiceId === 'sauna' && joinableSessions.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Join Sauna Session</Text>
                    {joinableSessions.map((item, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 12,
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          borderWidth: 1,
                          borderRadius: 12,
                          marginBottom: 8,
                          justifyContent: 'space-between'
                        }}
                        onPress={() => {
                          const startPart = item.time.split(' - ')[0];
                          const [timeVal, modifier] = startPart.split(' ');
                          const [h, m] = timeVal.split(':');
                          setCustomHour(h);
                          setCustomMinute(m);
                          setCustomAmPm(modifier as 'AM' | 'PM');
                          setSelectedJoinTarget(item.host);
                          showCustomAlert('Joining Session', `You are requesting to join ${item.host.userName}'s session. Confirm booking to send request.`);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{item.message}</Text>
                          <Text style={{ color: colors.secondaryText, fontSize: 11, marginTop: 2 }}>Time: {item.time}</Text>
                        </View>
                        <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '700' }}>JOIN</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Already Booked List */}
                <View style={[styles.bookedSlotsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <FontAwesome name="calendar" size={14} color={colors.secondaryText} style={{ marginRight: 8 }} />
                    <Text style={[styles.bookedSlotsTitle, { color: colors.secondaryText }]}>
                      Fully Booked Slots on {selectedDate.split('-').reverse().join('-')}
                    </Text>
                  </View>
                  {(() => {
                    const currentUserGender = userProfile?.gender || 'Female';
                    const occupiedBlocks = getOccupiedTimeBlocks(formattedServiceId, dayBookings, currentUserGender);
                    if (occupiedBlocks.length === 0) {
                      return (
                        <Text style={{ color: colors.secondaryText, fontSize: 13, paddingVertical: 4 }}>
                          All time slots are currently available.
                        </Text>
                      );
                    }
                    return occupiedBlocks.map((block, idx) => (
                      <View key={idx} style={[styles.bookedSlotRow, { borderBottomColor: colors.border }]}>
                        <FontAwesome name="times-circle" size={13} color={TheOneColors.error} style={{ marginRight: 10, marginTop: 1 }} />
                        <Text style={[styles.bookedSlotTime, { color: colors.text, fontWeight: '600' }]}>{block}</Text>
                        <View style={[styles.bookedSlotBadge, { backgroundColor: TheOneColors.error + '22' }]}>
                          <Text style={[styles.bookedSlotBadgeText, { color: TheOneColors.error }]}>FULLY BOOKED</Text>
                        </View>
                      </View>
                    ));
                  })()}
                </View>
              </View>
            );
          })()}



          {/* Active Bookings Breakdown (Admin View) */}
          {userProfile?.isAdmin && (
            <View style={[styles.adminBookingsInfoCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 24 }]}>
              <Text style={[styles.adminBookingsInfoTitle, { color: colors.text }]}>
                👥 Bookings Breakdown (Admin View)
              </Text>
              {dayBookings.filter(b => b.serviceId === formattedServiceId).length === 0 ? (
                <Text style={{ color: colors.secondaryText, fontSize: 13, marginTop: 8 }}>
                  No active bookings for this service on this date.
                </Text>
              ) : (
                dayBookings
                  .filter(b => b.serviceId === formattedServiceId)
                  .map((b) => (
                    <View key={b.id} style={[styles.adminBookingDetailRow, { borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                          {b.userName || 'Athlete'} ({b.userId})
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.secondaryText, marginTop: 2 }}>
                          Slot: {b.time}
                        </Text>
                        {(b.trainerName || b.therapistName || b.pilatesLevel || b.steamSaunaIncluded || b.saunaCategory) && (
                          <Text style={{ fontSize: 11, color: colors.tint, marginTop: 2 }}>
                            {b.trainerName ? `Trainer: ${b.trainerName} ` : ''}
                            {b.therapistName ? `Therapist: ${b.therapistName} ` : ''}
                            {b.pilatesLevel ? `Level: ${b.pilatesLevel} ` : ''}
                            {b.saunaCategory ? `Category: ${b.saunaCategory} ` : ''}
                            {b.steamSaunaIncluded ? `• Steam room` : ''}
                          </Text>
                        )}
                      </View>
                      <PressSpring
                        style={{ alignSelf: 'center' }}
                        contentStyle={styles.adminCancelSlotBtn}
                        onPress={() => {
                          setCancelTargetId(b.id);
                          setShowCancelConfirmModal(true);
                        }}
                        scaleTo={0.88}
                        hapticStyle="heavy"
                        fullWidth={false}
                      >
                        <FontAwesome name="times" size={14} color={TheOneColors.error} />
                      </PressSpring>
                    </View>
                  ))
              )}
            </View>
          )}
          </View>
        </ScrollView>
      )}



      {/* Success Confirmation Popup Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccessModal}
        onRequestClose={() => {
          setShowSuccessModal(false);
          router.push('/(tabs)');
        }}
      >
        <Pressable 
          style={styles.popupOverlay} 
          onPress={() => {
            setShowSuccessModal(false);
            router.push('/(tabs)');
          }}
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.popupIconCircle}>
              <FontAwesome name="check" size={28} color="#FFFFFF" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Booking Confirmed!</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>{successModalMessage}</Text>
            <PressSpring 
              contentStyle={[styles.popupButton, { backgroundColor: colors.tint }]} 
              onPress={() => {
                setShowSuccessModal(false);
                router.push('/(tabs)');
              }}
              scaleTo={0.94}
              hapticStyle="medium"
            >
              <Text style={styles.popupButtonText}>Done</Text>
            </PressSpring>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Custom Alert/Warning Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showAlertModal}
        onRequestClose={handleCloseAlertModal}
      >
        <Pressable 
          style={styles.popupOverlay} 
          onPress={handleCloseAlertModal}
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { backgroundColor: '#E74C3C' }]}>
              <FontAwesome name="exclamation" size={28} color="#FFFFFF" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>{alertModalTitle}</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>{alertModalMessage}</Text>
            <PressSpring 
              contentStyle={[styles.popupButton, { backgroundColor: '#E74C3C' }]} 
              onPress={handleCloseAlertModal}
              scaleTo={0.94}
              hapticStyle="medium"
            >
              <Text style={styles.popupButtonText}>OK</Text>
            </PressSpring>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Waitlist Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showWaitlistModal}
        onRequestClose={() => setShowWaitlistModal(false)}
      >
        <Pressable 
          style={styles.popupOverlay} 
          onPress={() => setShowWaitlistModal(false)}
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { backgroundColor: colors.tint }]}>
              <FontAwesome name="bell" size={26} color="#FFFFFF" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Slot Taken</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>
              This slot has reached maximum capacity. Would you like to join the waitlist to be notified if a spot opens up?
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <PressSpring 
                style={{ flex: 1 }}
                contentStyle={[styles.popupButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} 
                onPress={() => setShowWaitlistModal(false)}
                scaleTo={0.96}
                hapticStyle="light"
                fullWidth={false}
              >
                <Text style={[styles.popupButtonText, { color: colors.text, textAlign: 'center' }]}>Cancel</Text>
              </PressSpring>
              <PressSpring 
                style={{ flex: 1 }}
                contentStyle={[styles.popupButton, { backgroundColor: colors.tint }]} 
                onPress={() => {
                  setShowWaitlistModal(false);
                  joinWaitlist(waitlistTargetSlot);
                }}
                scaleTo={0.94}
                hapticStyle="medium"
                fullWidth={false}
              >
                <Text style={[styles.popupButtonText, { color: '#FFFFFF', textAlign: 'center' }]}>Join Waitlist</Text>
              </PressSpring>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Cancel Confirmation Popup Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showCancelConfirmModal}
        onRequestClose={() => setShowCancelConfirmModal(false)}
      >
        <Pressable 
          style={styles.popupOverlay} 
          onPress={() => setShowCancelConfirmModal(false)}
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { backgroundColor: '#FF3B30' }]}>
              <FontAwesome name="trash" size={26} color="#FFFFFF" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Cancel Booking</Text>
            <Text style={[styles.popupMessage, { color: colors.secondaryText }]}>Are you sure you want to cancel this booking?</Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <PressSpring 
                style={{ flex: 1 }}
                contentStyle={[styles.popupButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} 
                onPress={() => setShowCancelConfirmModal(false)}
                scaleTo={0.96}
                hapticStyle="light"
                fullWidth={false}
              >
                <Text style={[styles.popupButtonText, { color: colors.text, textAlign: 'center' }]}>No</Text>
              </PressSpring>
              <PressSpring 
                style={{ flex: 1 }}
                contentStyle={[styles.popupButton, { backgroundColor: '#FF3B30' }]} 
                onPress={() => {
                  setShowCancelConfirmModal(false);
                  if (cancelTargetId) {
                    handleCancelAdminBooking(cancelTargetId);
                  }
                }}
                scaleTo={0.94}
                hapticStyle="heavy"
                fullWidth={false}
              >
                <Text style={[styles.popupButtonText, { textAlign: 'center' }]}>Yes, Cancel</Text>
              </PressSpring>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Board Room Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showBoardRoomConfirmModal}
        onRequestClose={() => setShowBoardRoomConfirmModal(false)}
      >
        <Pressable 
          style={styles.popupOverlay} 
          onPress={() => setShowBoardRoomConfirmModal(false)}
        >
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={[styles.popupContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.popupIconCircle, { backgroundColor: colors.tint }]}>
              <FontAwesome name="briefcase" size={26} color="#FFFFFF" />
            </View>
            <Text style={[styles.popupTitle, { color: colors.text }]}>Confirm Board Room</Text>
            
            <View style={{ width: '100%', marginBottom: 20, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.secondaryText, fontSize: 13 }}>Date:</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{selectedDate}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.secondaryText, fontSize: 13 }}>Duration:</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{boardRoomHours} Hour(s)</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.secondaryText, fontSize: 13 }}>Time:</Text>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                  {boardRoomStartTime} - {boardRoomStartTime ? calculateEndTime(boardRoomStartTime, boardRoomHours) : ''}
                </Text>
              </View>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.secondaryText, fontSize: 13, fontWeight: '700' }}>Total Cost:</Text>
                <Text style={{ color: colors.tint, fontSize: 15, fontWeight: '700' }}>₹{boardRoomHours * 5000}</Text>
              </View>
            </View>

            <Text style={{ color: colors.secondaryText, fontSize: 11, textAlign: 'center', marginBottom: 20 }}>
              ⚠️ Note: This booking is chargeable for all membership tiers (Gold, Trial, Basic, Wellness) and will be added to your profile dues.
            </Text>

            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <PressSpring 
                style={{ flex: 1 }}
                contentStyle={[styles.popupButton, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]} 
                onPress={() => setShowBoardRoomConfirmModal(false)}
                scaleTo={0.96}
                hapticStyle="light"
                fullWidth={false}
              >
                <Text style={[styles.popupButtonText, { color: colors.text, textAlign: 'center' }]}>Cancel</Text>
              </PressSpring>
              <PressSpring 
                style={{ flex: 1 }}
                contentStyle={[styles.popupButton, { backgroundColor: colors.tint }]} 
                onPress={() => {
                  setShowBoardRoomConfirmModal(false);
                  confirmBookingTransaction();
                }}
                scaleTo={0.94}
                hapticStyle="medium"
                fullWidth={false}
              >
                <Text style={[styles.popupButtonText, { color: '#FFFFFF', textAlign: 'center' }]}>Confirm</Text>
              </PressSpring>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sticky Confirm Booking footer */}
      {!loading && (() => {
        const isFixedService = ['yoga', 'pilates', 'kickboxing', 'physio'].includes(formattedServiceId);
        const isBookable = isFixedService ? !!selectedSlot : true;
        const buttonText = formattedServiceId === 'board-room' ? 'Book Board Room' : 'Book Facility Session';
        return (
          <View style={[styles.footerContainer, { borderColor: colors.border }]}>
            <BlurView intensity={80} style={styles.footer} tint="dark">
              <PressSpring
                 contentStyle={[
                   styles.confirmButton,
                   { backgroundColor: isBookable ? TheOneColors.accent : 'rgba(184, 70, 0, 0.25)' }
                 ]}
                  disabled={!isBookable || isSubmitting}
                  onPress={() => {
                    playClickSound();
                    handleBookPress();
                  }}
                 scaleTo={0.94}
                 hapticStyle="heavy"
                 fullWidth={true}
               >
                 {isSubmitting ? (
                   <ActivityIndicator color="#FFFFFF" />
                 ) : (
                   <Text style={[
                     styles.confirmText,
                     { color: isBookable ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)', textAlign: 'center' }
                   ]}>
                     {buttonText}
                   </Text>
                 )}
               </PressSpring>
            </BlurView>
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainerStyle: {
    padding: 24,
    paddingBottom: 120,
  },
  headerTitle: {
    fontSize: 28,
    letterSpacing: 0.5,
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  trainerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
  },
  trainerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  dateRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  datePill: {
    width: 72,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    marginBottom: 4,
  },
  dateNum: {
    fontSize: 18,
    fontFamily: TheOneTypography.numberFamily,
    fontWeight: '700',
  },
  benefitsCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  benefitsTitle: {
    fontSize: 14,
    fontFamily: TheOneTypography.headlineFamily,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  benefitDescRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitGenderBadge: {
    backgroundColor: TheOneColors.accent,
    color: '#0B0B0B',
    fontSize: 10,
    fontWeight: '700',
    width: 20,
    height: 20,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 20,
    marginRight: 10,
  },
  benefitGenderText: {
    flex: 1,
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 16,
  },
  disclaimerCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  disclaimerTitle: {
    fontSize: 14,
    fontFamily: TheOneTypography.headlineFamily,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  disclaimerBullet: {
    fontSize: 14,
    marginRight: 8,
    lineHeight: 18,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    lineHeight: 18,
  },
  massageConfigBlock: {
    marginBottom: 16,
  },
  therapistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  therapistCard: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  therapistNameText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  techniqueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  techniqueBtn: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  techniqueBtnText: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginTop: 10,
  },
  checkboxLabel: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  checkboxDesc: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 2,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  footer: {
    padding: 24,
    paddingBottom: 36,
  },
  confirmButton: {
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    padding: 24,
    width: '100%',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: TheOneTypography.headlineFamily,
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    marginBottom: 20,
    textAlign: 'center',
  },
  levelSelectBtn: {
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  levelBtnText: {
    fontSize: 15,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  levelModalActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  levelModalCancel: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: TheOneColors.charcoal,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
  },
  levelModalConfirm: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  adminBookingsInfoCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
  },
  adminBookingsInfoTitle: {
    fontSize: 15,
    fontFamily: TheOneTypography.headlineFamily,
    marginBottom: 12,
  },
  adminBookingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  adminCancelSlotBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(196, 96, 87, 0.08)',
  },
  pickerPillsRow: {
    flexDirection: 'row',
    marginTop: 6,
    marginBottom: 6,
  },
  pickerPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerPillText: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
  },
  pickerLabel: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupContainer: {
    borderRadius: 20,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TheOneColors.accentBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'transparent',
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
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
  },
  popupButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 1.5,
  },
  subServiceSection: {
    marginBottom: 20,
  },
  subServicesList: {
    marginTop: 8,
  },
  subServiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  subServiceName: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '500',
  },
  subServicePrice: {
    fontSize: 14,
    fontFamily: TheOneTypography.numberFamily,
    fontWeight: '700',
    marginLeft: 12,
  },
  wellnessPriceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    marginBottom: 14,
  },
  wellnessPriceLabel: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wellnessPriceValue: {
    fontSize: 16,
    fontFamily: TheOneTypography.numberFamily,
    fontWeight: '700',
    marginTop: 2,
  },
  bookedSlotsCard: {
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  bookedSlotsTitle: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    flex: 1,
  },
  bookedSlotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
    gap: 4,
  },
  bookedSlotTime: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    flex: 1,
  },
  bookedSlotBadge: {
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  bookedSlotBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  bookedSlotSubtitle: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    width: '100%',
    marginLeft: 21,
    marginTop: -2,
    marginBottom: 2,
  },
});
