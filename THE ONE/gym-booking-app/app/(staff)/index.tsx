import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, SectionList, ActivityIndicator, TouchableOpacity, TextInput } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { FontAwesome } from '@expo/vector-icons';
import PressSpring from '@/components/PressSpring';

export default function StaffDashboard() {
  const { userProfile } = useAuth();
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});

  const isMassageTherapist = useMemo(() => {
    const name = (userProfile?.staffName || '').trim().toLowerCase();
    return ['vikram', 'ragesh', 'ananya', 'priya'].includes(name);
  }, [userProfile?.staffName]);

  useEffect(() => {
    if (!userProfile?.staffName) {
      setLoading(false);
      return;
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    const q = query(
      collection(db, 'bookings'),
      where('date', '>=', todayStr)
    );

    const unsub = onSnapshot(q, (snap) => {
      const myBookings: any[] = [];
      snap.forEach(doc => {
        const data = doc.data();
        const trainerLower = (data.trainerName || '').trim().toLowerCase();
        const therapistLower = (data.therapistName || '').trim().toLowerCase();
        const staffLower = (userProfile?.staffName || '').trim().toLowerCase();
        if (staffLower && (trainerLower === staffLower || therapistLower === staffLower)) {
          myBookings.push({ id: doc.id, ...data });
        }
      });

      myBookings.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || '').localeCompare(b.time || '');
      });

      setBookings(myBookings);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching staff bookings:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [userProfile?.staffName]);

  const sections = useMemo(() => {
    let filtered = bookings;
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      filtered = filtered.filter(b => 
        (b.userName || '').toLowerCase().includes(lowerQ) ||
        (b.serviceName || '').toLowerCase().includes(lowerQ)
      );
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('en-CA');

    const grouped = filtered.reduce((acc, curr) => {
      let groupTitle = curr.date;
      if (curr.date === todayStr) groupTitle = 'Today';
      else if (curr.date === tomorrowStr) groupTitle = 'Tomorrow';
      else {
        groupTitle = new Date(curr.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      }

      if (!acc[curr.date]) {
        acc[curr.date] = { title: groupTitle, data: [] };
      }
      acc[curr.date].data.push(curr);
      return acc;
    }, {} as Record<string, { title: string, data: any[] }>);

    const sortedKeys = Object.keys(grouped).sort();
    return sortedKeys.map(k => grouped[k]);
  }, [bookings, searchQuery]);

  const markAsDone = async (id: string) => {
    try {
      await updateDoc(doc(db, 'bookings', id), {
        status: 'completed',
        completedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Error marking as done:', e);
    }
  };

  const renderBooking = ({ item }: { item: any }) => {
    const isMassage = item.serviceId === 'general-massage';
    
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{item.serviceName}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.time}</Text>
          </View>
        </View>
        
        <View style={styles.cardBody}>
          <View style={styles.detailRow}>
            <FontAwesome name="calendar" size={13} color={colors.secondaryText} style={{ width: 20 }} />
            <Text style={[styles.detailText, { color: colors.secondaryText }]}>
              {new Date(item.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <FontAwesome name="user" size={13} color={colors.secondaryText} style={{ width: 20 }} />
            <Text style={[styles.detailText, { color: colors.text, fontWeight: '600' }]}>
              {item.userName} <Text style={{ color: colors.secondaryText, fontWeight: '400' }}>({item.userGender})</Text>
            </Text>
          </View>

          {isMassage && item.massageTechnique && (
            <View style={styles.detailRow}>
              <FontAwesome name="hand-paper-o" size={13} color={colors.secondaryText} style={{ width: 20 }} />
              <Text style={[styles.detailText, { color: colors.secondaryText }]}>
                {item.massageTechnique}
                {item.steamSaunaIncluded ? ' + Steam & Sauna' : ''}
              </Text>
            </View>
          )}

          {item.serviceId === 'pilates' && item.pilatesLevel && (
            <View style={styles.detailRow}>
              <FontAwesome name="signal" size={13} color={colors.secondaryText} style={{ width: 20 }} />
              <Text style={[styles.detailText, { color: colors.secondaryText }]}>
                Level: {item.pilatesLevel}
              </Text>
            </View>
          )}
          
          <View style={{ marginTop: 12 }}>
            {isMassageTherapist ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.secondaryText, textTransform: 'uppercase', letterSpacing: 1, fontFamily: TheOneTypography.bodyFamily }}>Session Status</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['Not Started', 'Started', 'Completed'] as const).map((statusVal) => {
                    const currentStatus = item.staffStatus || 'Not Started';
                    const isSelected = currentStatus === statusVal;
                    let btnBg = 'transparent';
                    let borderCol = colors.border;
                    let textCol = colors.secondaryText;

                    if (isSelected) {
                      if (statusVal === 'Started') {
                        btnBg = 'rgba(184, 70, 0, 0.12)';
                        borderCol = '#B84600';
                        textCol = '#B84600';
                      } else if (statusVal === 'Completed') {
                        btnBg = 'rgba(107, 158, 118, 0.12)';
                        borderCol = '#6B9E76';
                        textCol = '#6B9E76';
                      } else {
                        btnBg = 'rgba(196, 96, 87, 0.12)';
                        borderCol = '#C46057';
                        textCol = '#C46057';
                      }
                    }

                    return (
                      <PressSpring
                        key={statusVal}
                        style={{
                          flex: 1,
                          marginHorizontal: 4,
                        }}
                        contentStyle={{
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingVertical: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: borderCol,
                          backgroundColor: btnBg,
                          width: '100%'
                        }}
                        onPress={async () => {
                          try {
                            await updateDoc(doc(db, 'bookings', item.id), {
                              staffStatus: statusVal
                            });
                          } catch (err) {
                            console.error('Failed to update staffStatus:', err);
                          }
                        }}
                        scaleTo={0.93}
                        hapticStyle="selection"
                        fullWidth={true}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: textCol, fontFamily: TheOneTypography.bodyFamily, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' }}>{statusVal}</Text>
                      </PressSpring>
                    );
                  })}
                </View>

                {/* Therapist Notes */}
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.secondaryText, textTransform: 'uppercase', letterSpacing: 1, fontFamily: TheOneTypography.bodyFamily, marginTop: 4 }}>Therapist Notes (Admin Only)</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <TextInput
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.text,
                      borderRadius: 12,
                      padding: 10,
                      fontSize: 13,
                      minHeight: 60,
                      textAlignVertical: 'top',
                      fontFamily: TheOneTypography.bodyFamily
                    }}
                    multiline={true}
                    numberOfLines={3}
                    placeholder="Enter session notes..."
                    placeholderTextColor="#5C5040"
                    value={localNotes[item.id] !== undefined ? localNotes[item.id] : (item.staffNotes || '')}
                    onChangeText={(text) => {
                      setLocalNotes(prev => ({ ...prev, [item.id]: text }));
                    }}
                  />
                  <PressSpring
                    style={{
                      height: 60,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                    contentStyle={{
                      backgroundColor: '#B84600',
                      borderRadius: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      height: 60,
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%'
                    }}
                    onPress={async () => {
                      try {
                        const noteText = localNotes[item.id] !== undefined ? localNotes[item.id] : (item.staffNotes || '');
                        await updateDoc(doc(db, 'bookings', item.id), {
                          staffNotes: noteText
                        });
                        alert('Note saved successfully!');
                      } catch (err) {
                        console.error('Failed to save Notes:', err);
                      }
                    }}
                    scaleTo={0.92}
                    hapticStyle="medium"
                    fullWidth={false}
                  >
                    <FontAwesome name="save" size={14} color="#0B0B0B" />
                  </PressSpring>
                </View>
              </View>
            ) : (
              item.status === 'completed' ? (
                <View style={[styles.actionBtn, { backgroundColor: 'rgba(107, 158, 118, 0.12)', borderWidth: 1, borderColor: '#6B9E76' }]}>
                  <FontAwesome name="check-circle" size={13} color="#6B9E76" style={{ marginRight: 8 }} />
                  <Text style={[styles.actionBtnText, { color: '#6B9E76' }]}>Completed</Text>
                </View>
              ) : (
                <PressSpring 
                  contentStyle={[styles.actionBtn, { backgroundColor: '#B84600' }]}
                  onPress={() => markAsDone(item.id)}
                  scaleTo={0.94}
                  hapticStyle="medium"
                  fullWidth={true}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                    <FontAwesome name="check" size={13} color="#0B0B0B" style={{ marginRight: 8 }} />
                    <Text style={[styles.actionBtnText, { color: '#0B0B0B' }]}>Mark as Done</Text>
                  </View>
                </PressSpring>
              )
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: colors.text }]}>Welcome, {userProfile?.staffName}!</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>Concierge assigned session logs.</Text>
        
        <View style={[styles.searchContainer, { borderBottomColor: colors.border }]}>
          <FontAwesome name="search" size={14} color={colors.secondaryText} style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by client or service..."
            placeholderTextColor="#5C5040"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#B84600" style={{ marginTop: 40 }} />
      ) : sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <FontAwesome name="calendar-check-o" size={36} color={colors.border} style={{ marginBottom: 16 }} />
          <Text style={[styles.emptyText, { color: colors.text }]}>No upcoming appointments.</Text>
          <Text style={[styles.emptySub, { color: colors.secondaryText }]}>
            {searchQuery ? "No matches found." : "No scheduled slots."}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderBooking}
          renderSectionHeader={({ section: { title } }) => (
            <Text style={[styles.sectionHeader, { backgroundColor: colors.background, color: colors.text }]}>
              {title.toUpperCase()}
            </Text>
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  greeting: {
    fontSize: 22,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
  },
  listContent: {
    padding: 20,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: 'rgba(184, 70, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#B84600',
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
  },
  cardBody: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 0,
    height: 48,
    marginTop: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 12,
    letterSpacing: 1.5,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 11,
    fontFamily: TheOneTypography.bodyFamily,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
