import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, Modal, TouchableOpacity, Pressable, Image, Animated } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';
import PressSpring from './PressSpring';

// Format YYYY-MM-DD → DD-MM-YYYY
const formatDateDMY = (dateStr?: string): string => {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
};

interface BookingCardProps {
  bookingId?: string;
  equipment: string;
  subService?: string;
  time: string;
  date: string;
  status?: 'confirmed' | 'cancelled' | 'completed' | 'pending_group_fill' | 'pending_join_request' | 'pending' | 'no_show';
  updatedByAdmin?: boolean;
  lastChangeSummary?: string;
  therapistName?: string;
  trainerName?: string;
  pilatesLevel?: string;
  steamSaunaIncluded?: boolean;
  saunaCategory?: string;
  isJoiner?: boolean;
  hostName?: string;
  onCancel?: () => void;
}

export function BookingCard({ 
  bookingId, equipment, subService, time, date, status = 'confirmed',
  updatedByAdmin, lastChangeSummary,
  therapistName, trainerName, pilatesLevel, steamSaunaIncluded,
  saunaCategory, isJoiner, hostName,
  onCancel
}: BookingCardProps) {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    tint: TheOneColors.accent,
  };

  const isCancelled = status === 'cancelled';
  const isNoShow = status === 'no_show';
  const isCompleted = status === 'completed';
  const isPending = status === 'pending_group_fill' || status === 'pending_join_request' || status === 'pending';
  const accentColor = isCancelled || isNoShow 
    ? TheOneColors.error 
    : isCompleted 
      ? TheOneColors.success 
      : TheOneColors.accent;

  const [showQrModal, setShowQrModal] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Member Dropdown State
  const [members, setMembers] = useState<any[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const isHost = !isJoiner && saunaCategory && (saunaCategory === 'Couple' || saunaCategory === 'Group (2-8)');

  useEffect(() => {
    if (isHost && bookingId) {
      const q = query(collection(db, 'bookings'), where('primaryBookingId', '==', bookingId));
      const unsub = onSnapshot(q, (snap) => {
        const mList: any[] = [];
        snap.forEach(doc => {
          const d = doc.data();
          if (d.status === 'confirmed') {
            mList.push({ id: doc.id, name: d.userName || 'Member', gender: d.userGender || '' });
          }
        });
        setMembers(mList);
      });
      return () => unsub();
    }
  }, [isHost, bookingId]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 40,
    }).start();
  };

  return (
    <>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
          <View style={StyleSheet.flatten([
            styles.card,
            { backgroundColor: colors.card, borderColor: isCancelled || isNoShow ? 'rgba(196, 96, 87, 0.2)' : isCompleted ? 'rgba(107, 158, 118, 0.2)' : colors.border },
            (isCancelled || isNoShow) && { opacity: 0.75 }
          ])}>
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={[styles.iconContainer, { backgroundColor: isCancelled || isNoShow ? 'rgba(196, 96, 87, 0.08)' : isCompleted ? 'rgba(107, 158, 118, 0.08)' : isPending ? 'rgba(184, 70, 0, 0.08)' : 'rgba(184, 70, 0, 0.08)' }]}>
        <FontAwesome 
          name={(isCancelled || isNoShow) ? 'times-circle' : isCompleted ? 'check-circle' : isPending ? 'hourglass-half' : 'calendar-check-o'} 
          size={20} 
          color={accentColor} 
        />
      </View>
      <View style={styles.detailsContainer}>
        {/* Title row with cancelled/completed badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.title, { color: colors.text, fontFamily: TheOneTypography.headlineFamily }]}>{equipment}{subService ? ` - ${subService}` : ''}</Text>
          {(isCancelled || isNoShow) && (
            <View style={styles.cancelledBadge}>
              <Text style={styles.cancelledBadgeText}>CANCELLED</Text>
            </View>
          )}
          {isCompleted && (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>COMPLETED</Text>
            </View>
          )}
          {isPending && (
            <View style={[styles.cancelledBadge, { backgroundColor: 'rgba(184, 70, 0, 0.12)' }]}>
              <Text style={[styles.cancelledBadgeText, { color: TheOneColors.accent }]}>PENDING</Text>
            </View>
          )}
          {saunaCategory && (saunaCategory === 'Couple' || saunaCategory === 'Group (2-8)') && !isJoiner && (
            <View style={[styles.cancelledBadge, { backgroundColor: 'rgba(107, 158, 118, 0.12)' }]}>
              <Text style={[styles.cancelledBadgeText, { color: TheOneColors.success }]}>HOST</Text>
            </View>
          )}
          {saunaCategory && (saunaCategory === 'Couple' || saunaCategory === 'Group (2-8)') && isJoiner && (
            <View style={[styles.cancelledBadge, { backgroundColor: 'rgba(107, 158, 118, 0.12)' }]}>
              <Text style={[styles.cancelledBadgeText, { color: TheOneColors.success }]}>MEMBER</Text>
            </View>
          )}
        </View>

        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {formatDateDMY(date)} • {time}
        </Text>

        {/* Display Host Name if Joiner */}
        {isJoiner && hostName && (
          <Text style={[styles.subtitle, { color: TheOneColors.success, marginTop: 4, fontWeight: '600' }]}>
            ↳ You are a Member of: {hostName}
          </Text>
        )}

        {/* Display You are the Host if Host */}
        {isHost && (
          <View>
            <Text style={[styles.subtitle, { color: TheOneColors.success, marginTop: 4, fontWeight: '600' }]}>
              ↳ You are the Host
            </Text>
            
            <PressSpring 
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}
              onPress={() => setShowMembers(!showMembers)}
              fullWidth={false}
              scaleTo={0.95}
              hapticStyle="selection"
            >
              <Text style={{ color: colors.tint, fontSize: 13, fontWeight: '600', marginRight: 6 }}>
                {showMembers ? 'Hide Members' : `Show Members (${members.length})`}
              </Text>
              <FontAwesome name={showMembers ? 'angle-up' : 'angle-down'} size={14} color={colors.tint} />
            </PressSpring>

            {showMembers && (
              <View style={{ marginTop: 8, padding: 10, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 8 }}>
                {members.length === 0 ? (
                  <Text style={{ color: colors.secondaryText, fontSize: 12, fontStyle: 'italic' }}>No members have joined yet.</Text>
                ) : (
                  members.map(m => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
                      <FontAwesome name="user" size={12} color={colors.secondaryText} style={{ marginRight: 8 }} />
                      <Text style={{ color: colors.text, fontSize: 13 }}>{m.name} {m.gender ? `(${m.gender})` : ''}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* Cancelled note */}
        {isCancelled && (
          <Text style={styles.cancelledNote}>
            This booking was cancelled by admin.
          </Text>
        )}

        {/* Admin update notification banner */}
        {!isCancelled && !isCompleted && updatedByAdmin && lastChangeSummary && (
          <View style={styles.updateBanner}>
            <FontAwesome name="info-circle" size={12} color="#FF9A62" style={{ marginRight: 6 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.updateBannerTitle}>Updated by Admin</Text>
              <Text style={styles.updateBannerDesc}>{lastChangeSummary}</Text>
            </View>
          </View>
        )}

        {/* Extra details if confirmed */}
        {!isCancelled && (therapistName || trainerName || pilatesLevel || steamSaunaIncluded) && (
          <View style={[styles.extraContainer, { borderTopColor: colors.border }]}>
            {trainerName && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <FontAwesome name="user" size={12} color={colors.tint} style={{ marginRight: 6 }} />
                <Text style={[styles.extraText, { color: colors.secondaryText, marginTop: 0 }]}>
                  Trainer: {trainerName}
                </Text>
              </View>
            )}
            {therapistName && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <FontAwesome name="user-md" size={12} color={colors.tint} style={{ marginRight: 6 }} />
                <Text style={[styles.extraText, { color: colors.secondaryText, marginTop: 0 }]}>
                  Therapist: {therapistName} {steamSaunaIncluded ? '(includes Steam/Sauna)' : ''}
                </Text>
              </View>
            )}
            {pilatesLevel && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <FontAwesome name="signal" size={10} color={colors.tint} style={{ marginRight: 6 }} />
                <Text style={[styles.extraText, { color: colors.secondaryText, marginTop: 0 }]}>
                  Level: {pilatesLevel}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* QR Code and Cancel buttons for active bookings */}
        {!isCancelled && !isCompleted && bookingId && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {onCancel && (
              <PressSpring
                style={{ flex: 1 }}
                contentStyle={[styles.qrButton, { borderColor: TheOneColors.error, backgroundColor: 'rgba(196, 96, 87, 0.08)', marginTop: 12 }]}
                onPress={onCancel}
                fullWidth={false}
                scaleTo={0.94}
                hapticStyle="medium"
              >
                <FontAwesome name="times" size={16} color={TheOneColors.error} />
                <Text style={[styles.qrButtonText, { color: TheOneColors.error }]}>Cancel</Text>
              </PressSpring>
            )}
            {!isPending && (
              <PressSpring
                style={{ flex: 2 }}
                contentStyle={[styles.qrButton, { borderColor: colors.border, marginTop: 12 }]}
                onPress={() => setShowQrModal(true)}
                fullWidth={false}
                scaleTo={0.95}
                hapticStyle="light"
              >
                <FontAwesome name="qrcode" size={16} color={colors.tint} />
                <Text style={[styles.qrButtonText, { color: colors.tint }]}>Show Check-in QR</Text>
              </PressSpring>
            )}
          </View>
        )}
      </View>
          </View>
        </Pressable>
      </Animated.View>

      {/* QR Code Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showQrModal}
        onRequestClose={() => setShowQrModal(false)}
      >
        <Pressable style={styles.qrModalOverlay} onPress={() => setShowQrModal(false)}>
          <Pressable style={[styles.qrModalContent, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.qrModalTitle, { color: colors.text }]}>Check-in QR Code</Text>
            <Text style={[styles.qrModalSubtitle, { color: colors.secondaryText }]}>
              Show this QR to the admin to mark your session as done
            </Text>
            
            <View style={styles.qrImageContainer}>
              <Image 
                source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${bookingId}` }}
                style={styles.qrImage}
              />
            </View>

            <Text style={[styles.qrBookingId, { color: colors.secondaryText }]}>
              Booking ID: {bookingId}
            </Text>

            <PressSpring 
              contentStyle={[styles.qrCloseButton, { backgroundColor: colors.tint }]} 
              onPress={() => setShowQrModal(false)}
              scaleTo={0.94}
              hapticStyle="medium"
            >
              <Text style={styles.qrCloseButtonText}>Close</Text>
            </PressSpring>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 20,
    marginVertical: 8,
    alignItems: 'flex-start',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  iconContainer: {
    marginRight: 16,
    marginTop: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailsContainer: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.2,
    flex: 1,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
  },
  cancelledBadge: {
    backgroundColor: 'rgba(196, 96, 87, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    marginLeft: 8,
  },
  cancelledBadgeText: {
    color: '#C46057',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  completedBadge: {
    backgroundColor: 'rgba(107, 158, 118, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    marginLeft: 8,
  },
  completedBadgeText: {
    color: '#6B9E76',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  cancelledNote: {
    color: '#C46057',
    fontSize: 12,
    fontFamily: TheOneTypography.bodyFamily,
    marginTop: 4,
  },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(184, 70, 0, 0.08)',
    borderColor: 'rgba(184, 70, 0, 0.20)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  updateBannerTitle: {
    color: '#B84600',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: 1,
  },
  updateBannerDesc: {
    color: '#F5F0EB',
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
  },
  extraContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  extraText: {
    fontSize: 12,
    marginTop: 2,
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  qrButtonText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 6,
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrModalContent: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.2)',
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  qrModalTitle: {
    fontSize: 20,
    fontFamily: TheOneTypography.headlineFamily,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  qrModalSubtitle: {
    fontSize: 13,
    fontFamily: TheOneTypography.bodyFamily,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  qrImageContainer: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 20,
    marginBottom: 16,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrBookingId: {
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 20,
    textAlign: 'center',
  },
  qrCloseButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
  },
  qrCloseButtonText: {
    color: '#0B0B0B',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1.5,
  },
});
