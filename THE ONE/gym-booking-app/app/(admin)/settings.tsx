import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, LayoutAnimation,
  PanResponder
} from 'react-native';
import { db } from '../../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import CustomAlertModal from '@/components/CustomAlertModal';
import { Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import PressSpring from '@/components/PressSpring';
import { playSlideSound } from '../../utils/SoundManager';

export default function AdminSettings() {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    yogaCapacity: '10',
    yogaTrainer: 'Sarah',
    yogaTrainerPhone: '',
    pilatesCapacity: '3',
    pilatesTrainer: 'Elena',
    pilatesTrainerPhone: '',
    kickboxingCapacity: '5',
    kickboxingTrainer: 'Coach Marcus',
    kickboxingTrainerPhone: '',
    physioTherapist: 'Dr. Shawn (Physio)',
    physioTherapistPhone: '',
    massageMale1: 'Vikram',
    massageMale1Phone: '',
    massageMale1DayOff: 'None',
    massageMale2: 'Ragesh',
    massageMale2Phone: '',
    massageMale2DayOff: 'None',
    massageFemale1: 'Ananya',
    massageFemale1Phone: '',
    massageFemale1DayOff: 'None',
    massageFemale2: 'Priya',
    massageFemale2Phone: '',
    massageFemale2DayOff: 'None',
    salonProfessionals: 'Salon Professionals',
    salonProfessionalsPhone: '',
    salonProfessionalsDayOff: 'None',
    yogaTrainerDayOff: 'None',
    pilatesTrainerDayOff: 'None',
    kickboxingTrainerDayOff: 'None',
    physioTherapistDayOff: 'None'
  });

  const [focusedField, setFocusedField] = useState<string | null>(null);
  
  // --- Timings Tab State ---
  const SERVICE_KEYS = ['sauna','cryo','red-light','hbot','salon','general-massage','physio','yoga','pilates','kickboxing'];
  const SERVICE_META: Record<string, { label: string; icon: string; color: string; defaultDur: number }> = {
    'sauna':           { label: 'Sauna',           icon: '🔥', color: '#e07b39', defaultDur: 15 },
    'cryo':            { label: 'Cryo Chamber',    icon: '❄️', color: '#5bb8f5', defaultDur: 60 },
    'red-light':       { label: 'Red Light',       icon: '🔴', color: '#e05252', defaultDur: 30 },
    'hbot':            { label: 'HBOT',            icon: '🫧', color: '#9e7cf7', defaultDur: 45 },
    'salon':           { label: 'Salon',           icon: '✂️', color: '#C97A46', defaultDur: 60 },
    'general-massage': { label: 'Massages',        icon: '💆', color: '#78b89e', defaultDur: 120 },
    'physio':          { label: 'Physio',          icon: '🩺', color: '#6aa4c0', defaultDur: 45 },
    'yoga':            { label: 'Yoga',            icon: '🧘', color: '#a0c87a', defaultDur: 60 },
    'pilates':         { label: 'Pilates',         icon: '🏋️', color: '#c8a07a', defaultDur: 60 },
    'kickboxing':      { label: 'Kickboxing',      icon: '🥊', color: '#e07070', defaultDur: 60 },
  };

  const parseToMinutes = (h: string, m: string, ap: string): number => {
    let hour = parseInt(h);
    const min = parseInt(m);
    if (ap === 'PM' && hour !== 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    return hour * 60 + min;
  };
  const minutesToDisplay = (total: number): string => {
    let h = Math.floor(total / 60) % 24;
    const m = total % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12; if (h === 0) h = 12;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`;
  };

  const [activeTab, setActiveTab] = useState<'staff' | 'timings'>('staff');
  const [selectedServiceKey, setSelectedServiceKey] = useState<string>('sauna');
  // slotsByService: serviceKey -> string[]
  const [slotsByService, setSlotsByService] = useState<Record<string, string[]>>({});
  const [durationByService, setDurationByService] = useState<Record<string, number>>({});
  const [savingTimings, setSavingTimings] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(0);
  // Add-slot picker state
  const HOURS_LIST = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const MINS_LIST  = ['00','05','10','15','20','25','30','35','40','45','50','55'];
  
  const [bulkStartHour,   setBulkStartHour]   = useState('06');
  const [bulkStartMinute, setBulkStartMinute] = useState('00');
  const [bulkStartAmPm,   setBulkStartAmPm]   = useState<'AM'|'PM'>('AM');

  const [bulkEndHour,   setBulkEndHour]   = useState('12');
  const [bulkEndMinute, setBulkEndMinute] = useState('00');
  const [bulkEndAmPm,   setBulkEndAmPm]   = useState<'AM'|'PM'>('PM');

  const handleBulkGenerate = () => {
    const startMins = parseToMinutes(bulkStartHour, bulkStartMinute, bulkStartAmPm);
    let endMins = parseToMinutes(bulkEndHour, bulkEndMinute, bulkEndAmPm);
    if (endMins <= startMins) {
      endMins += 24 * 60; // next day fallback
    }

    const generated: string[] = [];
    let currentMins = startMins;

    while (currentMins + currentDuration <= endMins) {
      const startStr = minutesToDisplay(currentMins);
      const nextMins = currentMins + currentDuration;
      const endStr = minutesToDisplay(nextMins);
      generated.push(`${startStr} - ${endStr}`);
      currentMins = nextMins;
    }

    if (generated.length === 0) {
      showAlert('Error', 'Duration is larger than the specified time range, or invalid start/end times.');
      return;
    }

    setSlotsByService(p => ({ ...p, [selectedServiceKey]: generated }));
  };

  const currentSlots    = slotsByService[selectedServiceKey] ?? [];
  const currentDuration = durationByService[selectedServiceKey] ?? SERVICE_META[selectedServiceKey]?.defaultDur ?? 60;
  
  const handleRemoveSlot = (slot: string) => {
    setSlotsByService(p=>({...p,[selectedServiceKey]:currentSlots.filter(s=>s!==slot)}));
  };

  // Custom Alert Modal State
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '' });
  const showAlert = (title: string, message: string) => setAlertConfig({ visible: true, title, message });
  const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  // Success Modal
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchTimings();
  }, []);

  const fetchTimings = async () => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'services'));
      const data = snap.exists() ? snap.data() : {};
      const slotsMap: Record<string,string[]> = {};
      const durMap: Record<string,number> = {};
      SERVICE_KEYS.forEach(key => {
        slotsMap[key] = data[key]?.baseTimes ?? [];
        durMap[key]   = data[key]?.duration  ?? SERVICE_META[key]?.defaultDur ?? 60;
      });
      setSlotsByService(slotsMap);
      setDurationByService(durMap);
    } catch (e: any) { console.error('Error fetching timings:', e); }
  };

  const handleSaveTimings = async () => {
    setSavingTimings(true);
    try {
      const dataToSave: Record<string,{baseTimes:string[];duration:number}> = {};
      SERVICE_KEYS.forEach(key => {
        dataToSave[key] = {
          baseTimes: slotsByService[key] ?? [],
          duration:  durationByService[key] ?? SERVICE_META[key]?.defaultDur ?? 60,
        };
      });
      await setDoc(doc(db, 'settings', 'services'), dataToSave);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2200);
      showAlert('Success', 'Slot timings have been saved successfully to the database!');
    } catch (e: any) {
      showAlert('Save Error', 'Failed to save timings: ' + (e.message || String(e)));
    } finally { setSavingTimings(false); }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'settings', 'global');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prev => ({ ...prev, ...data }));
      } else {
        console.log("No global settings found, using defaults");
      }
    } catch (e: any) {
      console.error('Error fetching settings:', e);
      showAlert('Error', 'Could not load settings from database.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });

      // Automatically register/update staff members
      const staffPairs = [
        { name: settings.yogaTrainer, phone: settings.yogaTrainerPhone },
        { name: settings.pilatesTrainer, phone: settings.pilatesTrainerPhone },
        { name: settings.kickboxingTrainer, phone: settings.kickboxingTrainerPhone },
        { name: settings.physioTherapist, phone: settings.physioTherapistPhone },
        { name: settings.massageMale1, phone: settings.massageMale1Phone },
        { name: settings.massageMale2, phone: settings.massageMale2Phone },
        { name: settings.massageFemale1, phone: settings.massageFemale1Phone },
        { name: settings.massageFemale2, phone: settings.massageFemale2Phone },
        { name: settings.salonProfessionals, phone: settings.salonProfessionalsPhone },
      ];

      for (const pair of staffPairs) {
        if (pair.name?.trim() && pair.phone?.trim()) {
          let targetPhone = pair.phone.trim().replace(/\s+/g, '');
          if (!targetPhone.startsWith('+')) {
            targetPhone = (targetPhone.length === 10) ? '+91' + targetPhone : '+' + targetPhone;
          }

          await setDoc(doc(db, 'allowed_users', targetPhone), {
            phoneNumber: targetPhone,
            isStaff: true,
            addedAt: new Date().toISOString()
          }, { merge: true });

          await setDoc(doc(db, 'users', targetPhone), {
            name: pair.name.trim(),
            phoneNumber: targetPhone,
            isStaff: true,
            staffName: pair.name.trim(),
          }, { merge: true });
        }
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2200);
      showAlert('Success', 'Settings and staff configurations have been saved successfully to the database!');
    } catch (e: any) {
      console.error('Error saving settings:', e);
      showAlert('Save Error', 'Failed to save settings: ' + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof typeof settings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const renderInput = (label: string, field: keyof typeof settings, keyboardType: 'default' | 'number-pad' | 'phone-pad' = 'default') => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.secondaryText }]}>{label}</Text>
      <TextInput
        style={[
          styles.textInput,
          { color: colors.text, borderBottomColor: focusedField === field ? '#B84600' : colors.border },
          Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}
        ]}
        value={String(settings[field])}
        placeholderTextColor="#5C5040"
        onChangeText={(val) => {
          if (keyboardType === 'phone-pad') {
            val = val.replace(/\D/g, '');
          }
          updateField(field, val);
        }}
        onFocus={() => setFocusedField(field)}
        onBlur={() => setFocusedField(null)}
        keyboardType={keyboardType}
        maxLength={keyboardType === 'phone-pad' ? 10 : undefined}
      />
    </View>
  );

  const renderDayOffSelect = (label: string, field: keyof typeof settings) => {
    const currentVal = settings[field] || 'None';
    const DAYS_OF_WEEK = ['None', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.inputLabel, { color: colors.secondaryText, marginBottom: 6, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }]}>{label}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
          {DAYS_OF_WEEK.map(d => {
            const isSelected = currentVal === d;
            return (
              <TouchableOpacity
                key={d}
                onPress={() => updateField(field, d)}
                style={[
                  styles.timeChip, 
                  { paddingHorizontal: 10, paddingVertical: 6, height: 32, justifyContent: 'center' }, 
                  isSelected && { backgroundColor: '#B84600', borderColor: '#B84600' }
                ]}
              >
                <Text style={[styles.timeChipText, { fontSize: 10, color: isSelected ? '#0B0B0B' : colors.secondaryText }]}>
                  {d === 'None' ? 'None' : d.slice(0,3)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.contentContainer}>
        <CustomAlertModal
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          onClose={hideAlert}
        />

        {/* Success Popup */}
        {showSuccess && (
          <View style={styles.successToast}>
            <FontAwesome name="check-circle" size={14} color="#6B9E76" style={{ marginRight: 8 }} />
            <Text style={styles.successToastText}>SETTINGS COMMITTED SUCCESSFULLY</Text>
          </View>
        )}

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
            <PressSpring
              style={[styles.navBtn, styles.navBtnActive]}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="cog" size={13} color="#B84600" style={{ marginRight: 6 }} />
                <Text style={styles.navBtnTextActive}>Settings</Text>
              </View>
            </PressSpring>
          </ScrollView>
        </View>

        <Text style={[styles.pageTitle, { color: colors.text }]}>Global Club Settings</Text>
        <Text style={[styles.pageSubtitle, { color: colors.secondaryText }]}>Set standard slot limits and assign personnel accounts.</Text>

        {/* Inner tab switcher: Staff | Timings */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={() => {
              playSlideSound();
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActiveTab('staff');
            }}
            style={[styles.innerTab, activeTab === 'staff' && styles.innerTabActive]}
          >
            <Text style={[styles.innerTabText, { color: activeTab === 'staff' ? '#B84600' : colors.secondaryText }]}>Staff & Capacity</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              playSlideSound();
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActiveTab('timings');
            }}
            style={[styles.innerTab, activeTab === 'timings' && styles.innerTabActive]}
          >
            <Text style={[styles.innerTabText, { color: activeTab === 'timings' ? '#B84600' : colors.secondaryText }]}>Timings & Slots</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#B84600" style={{ marginTop: 50 }} />
        ) : activeTab === 'staff' ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Fitness Class Capacity</Text>
            <View style={styles.row}>
              <View style={styles.colThird}>{renderInput('Yoga Limit', 'yogaCapacity', 'number-pad')}</View>
              <View style={styles.colThird}>{renderInput('Yoga Lead', 'yogaTrainer')}</View>
              <View style={styles.colThird}>{renderInput('Lead Phone', 'yogaTrainerPhone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Yoga Lead Day Off', 'yogaTrainerDayOff')}
            <View style={styles.row}>
              <View style={styles.colThird}>{renderInput('Pilates Limit', 'pilatesCapacity', 'number-pad')}</View>
              <View style={styles.colThird}>{renderInput('Pilates Lead', 'pilatesTrainer')}</View>
              <View style={styles.colThird}>{renderInput('Lead Phone', 'pilatesTrainerPhone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Pilates Lead Day Off', 'pilatesTrainerDayOff')}
            <View style={styles.row}>
              <View style={styles.colThird}>{renderInput('Kickbox Limit', 'kickboxingCapacity', 'number-pad')}</View>
              <View style={styles.colThird}>{renderInput('Kickbox Lead', 'kickboxingTrainer')}</View>
              <View style={styles.colThird}>{renderInput('Lead Phone', 'kickboxingTrainerPhone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Kickbox Lead Day Off', 'kickboxingTrainerDayOff')}

            <View style={styles.divider} />

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Massage Therapists</Text>
            <View style={styles.row}>
              <View style={styles.colHalf}>{renderInput('Male Therapist 1', 'massageMale1')}</View>
              <View style={styles.colHalf}>{renderInput('Therapist Phone', 'massageMale1Phone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Male Therapist 1 Day Off', 'massageMale1DayOff')}
            <View style={styles.row}>
              <View style={styles.colHalf}>{renderInput('Male Therapist 2', 'massageMale2')}</View>
              <View style={styles.colHalf}>{renderInput('Therapist Phone', 'massageMale2Phone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Male Therapist 2 Day Off', 'massageMale2DayOff')}
            <View style={styles.row}>
              <View style={styles.colHalf}>{renderInput('Female Therapist 1', 'massageFemale1')}</View>
              <View style={styles.colHalf}>{renderInput('Therapist Phone', 'massageFemale1Phone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Female Therapist 1 Day Off', 'massageFemale1DayOff')}
            <View style={styles.row}>
              <View style={styles.colHalf}>{renderInput('Female Therapist 2', 'massageFemale2')}</View>
              <View style={styles.colHalf}>{renderInput('Therapist Phone', 'massageFemale2Phone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Female Therapist 2 Day Off', 'massageFemale2DayOff')}

            <View style={styles.divider} />

            <Text style={[styles.sectionTitle, { color: colors.text }]}>Service Leads</Text>
            <View style={styles.row}>
              <View style={styles.colHalf}>{renderInput('Physiotherapist', 'physioTherapist')}</View>
              <View style={styles.colHalf}>{renderInput('Physio Phone', 'physioTherapistPhone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Physiotherapist Day Off', 'physioTherapistDayOff')}
            <View style={styles.row}>
              <View style={styles.colHalf}>{renderInput('Salon Stylist', 'salonProfessionals')}</View>
              <View style={styles.colHalf}>{renderInput('Stylist Phone', 'salonProfessionalsPhone', 'phone-pad')}</View>
            </View>
            {renderDayOffSelect('Salon Stylist Day Off', 'salonProfessionalsDayOff')}

            <PressSpring 
              contentStyle={[styles.saveBtn, saving && { opacity: 0.7 }]} 
              onPress={handleSaveSettings}
              disabled={saving}
              scaleTo={0.94}
              hapticStyle="heavy"
              fullWidth={true}
            >
              {saving ? (
                <ActivityIndicator color="#0B0B0B" size="small" style={{ alignSelf: 'center' }} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <FontAwesome name="save" size={14} color="#0B0B0B" style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnText}>Save Settings</Text>
                </View>
              )}
            </PressSpring>
          </View>
        ) : (
          // Timings & Slots Tab — Visual Slot Builder
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Slot Timings</Text>
            <Text style={{ color: colors.secondaryText, fontSize: 12, marginBottom: 16 }}>
              Pick a service, then use the time selector to add or remove available booking slots.
            </Text>

            {/* Service Picker Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
              {SERVICE_KEYS.map(key => {
                const meta = SERVICE_META[key];
                const isSelected = selectedServiceKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setSelectedServiceKey(key)}
                    style={[
                      styles.servicePill,
                      isSelected
                        ? { backgroundColor: meta.color + '25', borderColor: meta.color }
                        : { borderColor: colors.border }
                    ]}
                  >
                    <Text style={{ fontSize: 13, marginRight: 5 }}>{meta.icon}</Text>
                    <Text style={[styles.servicePillText, { color: isSelected ? meta.color : colors.secondaryText }]}>
                      {meta.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Current service label */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
              <Text style={{ fontSize: 18 }}>{SERVICE_META[selectedServiceKey]?.icon}</Text>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, fontFamily: TheOneTypography.headlineFamily }}>
                {SERVICE_META[selectedServiceKey]?.label}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ color: colors.secondaryText, fontSize: 11 }}>{currentSlots.length} slot{currentSlots.length !== 1 ? 's' : ''}</Text>
            </View>

            {/* Slot Duration Selector */}
            {selectedServiceKey !== 'salon' && (() => {
              const minVal = 5;
              const maxVal = 180;
              const range = maxVal - minVal;
              const pct = (currentDuration - minVal) / range;

              const handleSliderTouch = (evtX: number) => {
                if (sliderWidth <= 0) return;
                let touchedPct = evtX / sliderWidth;
                if (touchedPct < 0) touchedPct = 0;
                if (touchedPct > 1) touchedPct = 1;
                // Round to nearest 5 minutes
                const rawVal = minVal + touchedPct * range;
                const roundedVal = Math.max(minVal, Math.min(maxVal, Math.round(rawVal / 5) * 5));
                
                setDurationByService(p => ({ ...p, [selectedServiceKey]: roundedVal }));

                // Auto adjust durations of existing slots
                const updatedSlots = currentSlots.map(slot => {
                  try {
                    const [startPart] = slot.split(' - ');
                    const startMins = parseToMinutes(startPart.slice(0,2), startPart.slice(3,5), startPart.slice(6));
                    return `${minutesToDisplay(startMins)} - ${minutesToDisplay(startMins + roundedVal)}`;
                  } catch (err) {
                    return slot;
                  }
                });
                setSlotsByService(p => ({ ...p, [selectedServiceKey]: updatedSlots }));
              };

              const responder = PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,
                onPanResponderGrant: (evt) => handleSliderTouch(evt.nativeEvent.locationX),
                onPanResponderMove: (evt) => handleSliderTouch(evt.nativeEvent.locationX),
              });

              return (
                <View style={{ backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                    <FontAwesome name="clock-o" size={16} color={SERVICE_META[selectedServiceKey]?.color || '#C97A46'} />
                    <Text style={{ color: colors.secondaryText, fontSize: 13, fontWeight: '600', flex: 1 }}>Slot Duration</Text>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                      {currentDuration >= 60 ? `${Math.floor(currentDuration / 60)}h${currentDuration % 60 ? ` ${currentDuration % 60}m` : ''}` : `${currentDuration} min`}
                    </Text>
                  </View>

                  <View 
                    {...responder.panHandlers}
                    onLayout={e => setSliderWidth(e.nativeEvent.layout.width)}
                    style={{ height: 30, justifyContent: 'center', position: 'relative', width: '100%' }}
                  >
                    {/* Track Background */}
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', width: '100%' }} />
                    {/* Active Track */}
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: '#C97A46', position: 'absolute', left: 0, width: `${pct * 100}%` }} />
                    {/* Thumb */}
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: '#C97A46',
                      borderWidth: 2,
                      borderColor: '#FFFFFF',
                      position: 'absolute',
                      left: `${pct * 100}%`,
                      marginLeft: -10,
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.3,
                      shadowRadius: 2,
                      elevation: 3,
                    }} />
                    {/* Tick Marks along the track */}
                    <View style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 6, pointerEvents: 'none' }}>
                      {[30, 60, 90, 120].map(val => {
                        const tickPct = (val - 5) / 175;
                        return (
                          <View key={val} style={{
                            position: 'absolute',
                            left: `${tickPct * 100}%`,
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: 'rgba(255,255,255,0.3)',
                            marginLeft: -2,
                            top: 1
                          }} />
                        );
                      })}
                    </View>
                  </View>
                  <View style={{ height: 16, position: 'relative', marginTop: 4, width: '100%' }}>
                    {[
                      { val: 5, label: '5m' },
                      { val: 30, label: '30m' },
                      { val: 60, label: '1h' },
                      { val: 90, label: '1.5h' },
                      { val: 120, label: '2h' },
                      { val: 180, label: '3h' },
                    ].map(tick => {
                      const tickPct = (tick.val - 5) / 175;
                      let alignStyle: any = {};
                      if (tick.val === 5) {
                        alignStyle = { position: 'absolute', left: 0 };
                      } else if (tick.val === 180) {
                        alignStyle = { position: 'absolute', right: 0 };
                      } else {
                        alignStyle = { position: 'absolute', left: `${tickPct * 100}%`, marginLeft: -15, width: 30, textAlign: 'center' };
                      }
                      return (
                        <Text key={tick.val} style={{
                          ...alignStyle,
                          color: colors.secondaryText,
                          fontSize: 9,
                          fontWeight: '500',
                        }}>
                          {tick.label}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            {/* ── Bulk Generator Row ── */}
            {selectedServiceKey !== 'salon' && (
              <View style={{ backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(201,122,70,0.2)', borderStyle: 'dashed', padding: 14, marginBottom: 16 }}>
                <Text style={{ color: '#C97A46', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
                  ⚡ BULK TIME RANGE SLOT DIVIDER
                </Text>

                {/* Bulk Start Hour */}
                <Text style={{ color: colors.secondaryText, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>Start Range Hour</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
                  {HOURS_LIST.map(h => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setBulkStartHour(h)}
                      style={[styles.timeChip, bulkStartHour === h && { backgroundColor: '#C97A46', borderColor: '#C97A46' }]}
                    >
                      <Text style={[styles.timeChipText, { color: bulkStartHour === h ? '#0B0B0B' : colors.secondaryText }]}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Bulk Start Minute */}
                <Text style={{ color: colors.secondaryText, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>Start Range Minute</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
                  {MINS_LIST.map(m => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setBulkStartMinute(m)}
                      style={[styles.timeChip, bulkStartMinute === m && { backgroundColor: '#C97A46', borderColor: '#C97A46' }]}
                    >
                      <Text style={[styles.timeChipText, { color: bulkStartMinute === m ? '#0B0B0B' : colors.secondaryText }]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Bulk Start AM/PM */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  {(['AM', 'PM'] as const).map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setBulkStartAmPm(p)}
                      style={[styles.timeChip, { flex: 1 }, bulkStartAmPm === p && { backgroundColor: '#C97A46', borderColor: '#C97A46' }]}
                    >
                      <Text style={[styles.timeChipText, { color: bulkStartAmPm === p ? '#0B0B0B' : colors.secondaryText }]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />

                {/* Bulk End Hour */}
                <Text style={{ color: colors.secondaryText, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>End Range Hour</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
                  {HOURS_LIST.map(h => (
                    <TouchableOpacity
                      key={h}
                      onPress={() => setBulkEndHour(h)}
                      style={[styles.timeChip, bulkEndHour === h && { backgroundColor: '#C97A46', borderColor: '#C97A46' }]}
                    >
                      <Text style={[styles.timeChipText, { color: bulkEndHour === h ? '#0B0B0B' : colors.secondaryText }]}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Bulk End Minute */}
                <Text style={{ color: colors.secondaryText, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 }}>End Range Minute</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
                  {MINS_LIST.map(m => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setBulkEndMinute(m)}
                      style={[styles.timeChip, bulkEndMinute === m && { backgroundColor: '#C97A46', borderColor: '#C97A46' }]}
                    >
                      <Text style={[styles.timeChipText, { color: bulkEndMinute === m ? '#0B0B0B' : colors.secondaryText }]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Bulk End AM/PM */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  {(['AM', 'PM'] as const).map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setBulkEndAmPm(p)}
                      style={[styles.timeChip, { flex: 1 }, bulkEndAmPm === p && { backgroundColor: '#C97A46', borderColor: '#C97A46' }]}
                    >
                      <Text style={[styles.timeChipText, { color: bulkEndAmPm === p ? '#0B0B0B' : colors.secondaryText }]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Action button */}
                <PressSpring
                  contentStyle={[styles.addSlotBtn, { backgroundColor: '#C97A46' }]}
                  onPress={handleBulkGenerate}
                  scaleTo={0.95}
                  hapticStyle="selection"
                  fullWidth={true}
                >
                  <FontAwesome name="bolt" size={12} color="#0B0B0B" style={{ marginRight: 6 }} />
                  <Text style={styles.addSlotBtnText}>Generate & Replace slots</Text>
                </PressSpring>

                <Text style={{ color: colors.secondaryText, fontSize: 10, marginTop: 8, fontStyle: 'italic', textAlign: 'center' }}>
                  * Divides {bulkStartHour}:{bulkStartMinute} {bulkStartAmPm} to {bulkEndHour}:{bulkEndMinute} {bulkEndAmPm} into contiguous {currentDuration >= 60 ? `${currentDuration/60}h` : `${currentDuration}m`} slots.
                </Text>
              </View>
            )}

            {/* Existing Slots Chips */}
            {currentSlots.length === 0 ? (
              <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 10, padding: 20, alignItems: 'center' }}>
                <Text style={{ color: colors.secondaryText, fontSize: 13 }}>No slots yet. Use the divider above to generate them.</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {currentSlots.map(slot => (
                  <View
                    key={slot}
                    style={[styles.slotChip, { borderColor: (SERVICE_META[selectedServiceKey]?.color || '#C97A46') + '50', flexDirection: 'row', alignItems: 'center' }]}
                  >
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{slot}</Text>
                    <TouchableOpacity onPress={() => handleRemoveSlot(slot)} style={{ marginLeft: 8, padding: 2 }}>
                      <FontAwesome name="times" size={10} color={colors.secondaryText} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 16 }} />
            <PressSpring
              contentStyle={[styles.saveBtn, savingTimings && { opacity: 0.7 }]}
              onPress={handleSaveTimings}
              disabled={savingTimings}
              scaleTo={0.94}
              hapticStyle="heavy"
              fullWidth={true}
            >
              {savingTimings ? (
                <ActivityIndicator color="#0B0B0B" size="small" style={{ alignSelf: 'center' }} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <FontAwesome name="clock-o" size={14} color="#0B0B0B" style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnText}>Save Slot Timings</Text>
                </View>
              )}
            </PressSpring>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  pageTitle: {
    fontSize: 22,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    marginBottom: 24,
    lineHeight: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 16,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  colHalf: {
    flex: 1,
  },
  colThird: {
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'column',
  },
  inputLabel: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  textInput: {
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 0,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    backgroundColor: 'transparent',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(245, 240, 235, 0.06)',
    marginVertical: 20,
  },
  saveBtn: {
    backgroundColor: '#B84600',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  saveBtnText: {
    color: '#0B0B0B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
    letterSpacing: 1.5,
  },
  successToast: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#6B9E76',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    zIndex: 100,
    elevation: 8,
  },
  successToastText: {
    color: '#6B9E76',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: TheOneTypography.bodyFamily,
    letterSpacing: 1,
  },
  innerTab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  innerTabActive: {
    borderBottomColor: '#B84600',
  },
  innerTabText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  servicePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TheOneColors.charcoal,
  },
  servicePillText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    backgroundColor: TheOneColors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  timeChipText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  addSlotBtn: {
    backgroundColor: '#B84600',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addSlotBtnText: {
    color: '#0B0B0B',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: TheOneTypography.bodyFamily,
  },
});

