import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, ScrollView,
  ActivityIndicator, Platform, TouchableOpacity, Modal
} from 'react-native';
import { Link } from 'expo-router';
import { db } from '../../firebaseConfig';
import {
  collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy
} from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { TheOneColors, TheOneTypography } from '@/constants/TheOneTheme';
import PressSpring from '@/components/PressSpring';
import { useAuth } from '../../context/AuthContext';

interface UserProfile {
  id: string;
  name: string;
  phoneNumber?: string;
  membershipType?: string;
  birthday?: string; // MM-DD
  gender?: string;
}

interface CustomEvent {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  createdBy?: string;
  color?: string;
}

const EVENT_COLORS = [
  '#B84600', '#6B9E76', '#5B8DB8', '#9B59B6', '#E67E22', '#C46057',
];

export default function AdminEvents() {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Add event modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newColor, setNewColor] = useState(EVENT_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  // Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');

  const showAlert = (msg: string) => { setAlertMsg(msg); setAlertVisible(true); };

  const getLocalDateString = (date: Date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const todayStr = getLocalDateString();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrowDate);

  // Load users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
      setUsers(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Load custom events
  useEffect(() => {
    const q = query(collection(db, 'admin_events'), orderBy('date', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: CustomEvent[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomEvent));
      setCustomEvents(list);
    });
    return () => unsub();
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);

  const generateUpcomingDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${day}`);
    }
    return dates;
  };

  const selectedMMDD = selectedDate.slice(5); // MM-DD
  const selectedBirthdays = users.filter(u => u.birthday === selectedMMDD);
  const selectedEvents = customEvents.filter(e => e.date === selectedDate);

  // Custom events for today + upcoming 30 days
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const thirtyDaysStr = getLocalDateString(in30Days);
  const upcomingEvents = customEvents.filter(e => e.date >= todayStr && e.date <= thirtyDaysStr);

  const handleAddEvent = async () => {
    if (!newTitle.trim()) { showAlert('Please enter an event title.'); return; }
    if (!newDate.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(newDate.trim())) {
      showAlert('Please enter a valid date in YYYY-MM-DD format.'); return;
    }
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'admin_events'), {
        title: newTitle.trim(),
        description: newDesc.trim(),
        date: newDate.trim(),
        color: newColor,
        createdBy: userProfile?.name || 'Admin',
        createdAt: new Date().toISOString(),
      });
      setNewTitle(''); setNewDesc(''); setNewDate(''); setNewColor(EVENT_COLORS[0]);
      setShowAddModal(false);
    } catch (e) {
      showAlert('Failed to save event. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    try { await deleteDoc(doc(db, 'admin_events', id)); } catch {}
  };

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };



  const membershipColor = (type?: string) => {
    if (type === 'Gold') return '#F0B429';
    if (type === 'Basic') return '#8E8E93';
    if (type === 'Trial') return '#5B8DB8';
    return '#6B9E76';
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>

      {/* ── Top Navigation Bar ── */}
      <View style={[styles.navBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navScroll}>
          <Link href="/(admin)" asChild>
            <PressSpring contentStyle={styles.navBtn} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
              <FontAwesome name="users" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
              <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Members</Text>
            </PressSpring>
          </Link>
          <Link href="/(admin)/bookings" asChild>
            <PressSpring contentStyle={styles.navBtn} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
              <FontAwesome name="calendar" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
              <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Bookings</Text>
            </PressSpring>
          </Link>
          <Link href="/(admin)/payments" asChild>
            <PressSpring contentStyle={styles.navBtn} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
              <FontAwesome name="money" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
              <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Payments</Text>
            </PressSpring>
          </Link>
          <Link href="/(admin)/pricing" asChild>
            <PressSpring contentStyle={styles.navBtn} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
              <FontAwesome name="tag" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
              <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Pricing</Text>
            </PressSpring>
          </Link>
          {!userProfile?.isSubAdmin && (
            <>
              <Link href="/(admin)/support" asChild>
                <PressSpring contentStyle={styles.navBtn} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
                  <FontAwesome name="comments" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                  <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Support</Text>
                </PressSpring>
              </Link>
              <Link href="/(admin)/feedback" asChild>
                <PressSpring contentStyle={styles.navBtn} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
                  <FontAwesome name="star" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
                  <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Feedback</Text>
                </PressSpring>
              </Link>
            </>
          )}
          {/* Active: Events */}
          <PressSpring contentStyle={[styles.navBtn, styles.navBtnActive]} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
            <FontAwesome name="birthday-cake" size={13} color={colors.tint} style={{ marginRight: 6 }} />
            <Text style={styles.navBtnTextActive}>Events</Text>
          </PressSpring>
          <Link href="/(admin)/settings" asChild>
            <PressSpring contentStyle={styles.navBtn} scaleTo={0.96} hapticStyle="selection" fullWidth={false}>
              <FontAwesome name="cog" size={13} color={colors.secondaryText} style={{ marginRight: 6 }} />
              <Text style={[styles.navBtnText, { color: colors.secondaryText }]}>Settings</Text>
            </PressSpring>
          </Link>
        </ScrollView>
      </View>

      {/* Horizontal Date Picker Carousel */}
      <View style={{ marginTop: 12 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          {generateUpcomingDates().map(dStr => {
            const dObj = new Date(dStr);
            const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = dObj.getDate();
            const isSelected = selectedDate === dStr;
            const hasEvent = customEvents.some(e => e.date === dStr);
            const hasBirthday = users.some(u => u.birthday === dStr.slice(5));

            return (
              <PressSpring
                key={dStr}
                contentStyle={[
                  styles.dateCard,
                  isSelected ? { backgroundColor: colors.tint, borderColor: colors.tint } : { borderColor: colors.border }
                ]}
                onPress={() => setSelectedDate(dStr)}
                scaleTo={0.92}
                hapticStyle="selection"
                fullWidth={false}
              >
                <View style={{ alignItems: 'center', position: 'relative' }}>
                  <Text style={{ fontSize: 9, fontFamily: TheOneTypography.bodyFamily, color: isSelected ? '#0B0B0B' : colors.secondaryText, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>{dayName}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '700', fontFamily: TheOneTypography.bodyFamily, color: isSelected ? '#0B0B0B' : colors.text }}>{dayNum}</Text>
                  
                  {/* Indicator dot */}
                  {(hasEvent || hasBirthday) && (
                    <View style={[
                      styles.indicatorDot,
                      { backgroundColor: isSelected ? '#0B0B0B' : (hasBirthday ? '#E2C282' : colors.tint) }
                    ]} />
                  )}
                </View>
              </PressSpring>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── SELECTED DATE DETAILS ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>📅</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Selected Date Events</Text>
            </View>
            <Text style={[styles.sectionSubtitle, { color: colors.secondaryText }]}>{formatDate(selectedDate)}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.tint} style={{ marginTop: 16 }} />
          ) : (selectedBirthdays.length === 0 && selectedEvents.length === 0) ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text style={[styles.emptyText, { color: colors.secondaryText, marginBottom: 12 }]}>No events or birthdays planned for this date 🎈</Text>
              <PressSpring
                contentStyle={[styles.addEventBtn, { backgroundColor: colors.tint, paddingHorizontal: 24, alignSelf: 'center' }]}
                onPress={() => {
                  setNewDate(selectedDate);
                  setShowAddModal(true);
                }}
                scaleTo={0.95}
                hapticStyle="medium"
                fullWidth={false}
              >
                <FontAwesome name="plus" size={13} color="#0B0B0B" style={{ marginRight: 8 }} />
                <Text style={styles.addEventBtnText}>Add Event</Text>
              </PressSpring>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {/* Birthdays on this date */}
              {selectedBirthdays.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#E2C282', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>🎂 Birthdays on this day</Text>
                  {selectedBirthdays.map(u => (
                    <BirthdayCard key={u.id} user={u} membershipColor={membershipColor} colors={colors} highlight />
                  ))}
                </View>
              )}

              {/* Custom Events on this date */}
              {selectedEvents.length > 0 && (
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.tint, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>📌 Events on this day</Text>
                  {selectedEvents.map(evt => (
                    <View key={evt.id} style={[styles.eventCard, { borderLeftColor: evt.color || colors.tint }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventTitle, { color: colors.text }]}>{evt.title}</Text>
                        <Text style={[styles.eventDate, { color: colors.secondaryText }]}>{formatDate(evt.date)}</Text>
                        {evt.description ? (
                          <Text style={[styles.eventDesc, { color: colors.secondaryText }]}>{evt.description}</Text>
                        ) : null}
                        {evt.createdBy ? (
                          <Text style={[styles.eventBy, { color: colors.secondaryText }]}>Added by {evt.createdBy}</Text>
                        ) : null}
                      </View>
                      <PressSpring
                        style={{ alignSelf: 'center' }}
                        contentStyle={styles.deleteBtn}
                        onPress={() => handleDeleteEvent(evt.id)}
                        scaleTo={0.85}
                        hapticStyle="heavy"
                        fullWidth={false}
                      >
                        <FontAwesome name="trash" size={13} color={TheOneColors.error} />
                      </PressSpring>
                    </View>
                  ))}
                </View>
              )}

              <PressSpring
                style={{ marginTop: 8 }}
                contentStyle={[styles.addEventBtn, { backgroundColor: colors.tint }]}
                onPress={() => {
                  setNewDate(selectedDate);
                  setShowAddModal(true);
                }}
                scaleTo={0.95}
                hapticStyle="medium"
                fullWidth={true}
              >
                <FontAwesome name="plus" size={13} color="#0B0B0B" style={{ marginRight: 8 }} />
                <Text style={styles.addEventBtnText}>Add Event</Text>
              </PressSpring>
            </View>
          )}
        </View>

        {/* ── UPCOMING OVERVIEW (Next 30 Days) ── */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>📅</Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Overview</Text>
              <View style={[styles.badge, { backgroundColor: 'transparent', borderColor: colors.border }]}>
                <Text style={[styles.badgeText, { color: colors.secondaryText }]}>{upcomingEvents.length}</Text>
              </View>
            </View>
            <Text style={[styles.sectionSubtitle, { color: colors.secondaryText }]}>Next 30 Days</Text>
          </View>

          {upcomingEvents.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No events planned yet</Text>
          ) : (
            upcomingEvents.map(evt => (
              <PressSpring
                key={evt.id}
                onPress={() => setSelectedDate(evt.date)}
                scaleTo={0.98}
                hapticStyle="light"
                fullWidth={true}
              >
                <View style={[styles.eventCard, { borderLeftColor: evt.color || colors.tint, opacity: selectedDate === evt.date ? 1 : 0.8 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.eventTitle, { color: colors.text }]}>{evt.title}</Text>
                      {evt.date === todayStr && (
                        <View style={[styles.todayChip, { backgroundColor: colors.tint + '22' }]}>
                          <Text style={{ fontSize: 9, color: colors.tint, fontWeight: '700' }}>TODAY</Text>
                        </View>
                      )}
                      {evt.date === tomorrowStr && (
                        <View style={[styles.todayChip, { backgroundColor: '#5B8DB822' }]}>
                          <Text style={{ fontSize: 9, color: '#5B8DB8', fontWeight: '700' }}>TOMORROW</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.eventDate, { color: colors.secondaryText }]}>{formatDate(evt.date)}</Text>
                  </View>
                  <FontAwesome name="chevron-right" size={10} color={colors.secondaryText} style={{ alignSelf: 'center', marginRight: 4 }} />
                </View>
              </PressSpring>
            ))
          )}
        </View>

      </ScrollView>

      {/* ── ADD EVENT MODAL ── */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>➕ Add New Event</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <FontAwesome name="times" size={18} color={colors.secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.secondaryText }]}>EVENT TITLE *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }, Platform.select({ web: { outlineStyle: 'none' } }) as any]}
              placeholder="e.g. Member Appreciation Night"
              placeholderTextColor="#5C5040"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: 14 }]}>DATE (YYYY-MM-DD) *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border }, Platform.select({ web: { outlineStyle: 'none' } }) as any]}
              placeholder="e.g. 2026-07-04"
              placeholderTextColor="#5C5040"
              value={newDate}
              onChangeText={setNewDate}
            />

            <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: 14 }]}>DESCRIPTION (optional)</Text>
            <TextInput
              style={[styles.inputMulti, { color: colors.text, borderColor: colors.border }, Platform.select({ web: { outlineStyle: 'none' } }) as any]}
              placeholder="Add notes, plans, or reminders..."
              placeholderTextColor="#5C5040"
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.fieldLabel, { color: colors.secondaryText, marginTop: 14 }]}>COLOR TAG</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {EVENT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c, borderWidth: newColor === c ? 3 : 0, borderColor: '#FFFFFF' }]}
                  onPress={() => setNewColor(c)}
                />
              ))}
            </View>

            <PressSpring
              style={{ marginTop: 24 }}
              contentStyle={[styles.addEventBtn, { backgroundColor: isSaving ? colors.tint + '88' : colors.tint }]}
              onPress={handleAddEvent}
              disabled={isSaving}
              scaleTo={0.95}
              hapticStyle="medium"
              fullWidth={true}
            >
              {isSaving ? (
                <ActivityIndicator color="#0B0B0B" size="small" />
              ) : (
                <>
                  <FontAwesome name="check" size={13} color="#0B0B0B" style={{ marginRight: 8 }} />
                  <Text style={styles.addEventBtnText}>Save Event</Text>
                </>
              )}
            </PressSpring>
          </View>
        </View>
      </Modal>

      {/* ── Simple Alert ── */}
      <Modal visible={alertVisible} animationType="fade" transparent onRequestClose={() => setAlertVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.alertCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text, textAlign: 'center', marginBottom: 10 }]}>Notice</Text>
            <Text style={{ color: colors.secondaryText, fontSize: 14, textAlign: 'center', marginBottom: 20 }}>{alertMsg}</Text>
            <PressSpring
              contentStyle={[styles.addEventBtn, { backgroundColor: colors.tint }]}
              onPress={() => setAlertVisible(false)}
              scaleTo={0.95}
              hapticStyle="medium"
              fullWidth={true}
            >
              <Text style={styles.addEventBtnText}>OK</Text>
            </PressSpring>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Birthday Card Sub-Component ──
function BirthdayCard({ user, membershipColor, colors, highlight }: any) {
  return (
    <View style={[
      styles.birthdayCard,
      { borderColor: highlight ? TheOneColors.accent + '55' : TheOneColors.charcoalBorder },
      highlight && { backgroundColor: TheOneColors.accent + '08' }
    ]}>
      <View style={[styles.avatarCircle, { backgroundColor: highlight ? TheOneColors.accent + '22' : TheOneColors.charcoal }]}>
        <Text style={styles.avatarEmoji}>{highlight ? '🎂' : '🎁'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[styles.birthdayName, { color: colors.text }]}>{user.name}</Text>
          <View style={[styles.memberBadge, { backgroundColor: membershipColor(user.membershipType) + '22' }]}>
            <Text style={[styles.memberBadgeText, { color: membershipColor(user.membershipType) }]}>
              {user.membershipType || 'Member'}
            </Text>
          </View>
        </View>
        {user.phoneNumber && (
          <Text style={[styles.birthdayPhone, { color: colors.secondaryText }]}>{user.phoneNumber}</Text>
        )}
        <Text style={[styles.birthdayAge, { color: highlight ? TheOneColors.accent : colors.secondaryText }]}>
          {highlight ? `Birthday is today! 🎉` : `Birthday is tomorrow! 🎁`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navBar: {
    borderBottomWidth: 1,
    paddingTop: 4,
  },
  navScroll: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 4,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  navBtnActive: {
    backgroundColor: TheOneColors.accent + '18',
  },
  navBtnText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '500',
  },
  navBtnTextActive: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    color: TheOneColors.accent,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60, gap: 16 },

  section: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  sectionHeader: { marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionEmoji: { fontSize: 20 },
  sectionTitle: {
    fontSize: 17,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '700',
    flex: 1,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 3,
    marginLeft: 28,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },

  birthdayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },
  birthdayName: {
    fontSize: 15,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
  },
  birthdayPhone: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 2,
  },
  birthdayAge: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '600',
    marginTop: 3,
  },
  memberBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  memberBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    borderLeftWidth: 4,
    backgroundColor: TheOneColors.charcoal,
    marginBottom: 10,
  },
  eventTitle: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
  },
  eventDate: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 3,
  },
  eventDesc: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 4,
    lineHeight: 17,
  },
  eventBy: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 4,
    fontStyle: 'italic',
  },
  todayChip: {
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: TheOneColors.error + '14',
  },

  addEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
  },
  addEventBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B0B0B',
    letterSpacing: 0.5,
  },

  emptyText: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    paddingBottom: 36,
  },
  alertCard: {
    margin: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '700',
  },

  fieldLabel: {
    fontSize: 10,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
  },
  inputMulti: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  dateCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 46,
  },
  indicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: -6,
  },
});
