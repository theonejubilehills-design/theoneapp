import React, { useState, useEffect } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { db } from '../../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { FontAwesome } from '@expo/vector-icons';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { SALON_SERVICES, SPA_SERVICES, PHYSIO_SERVICES } from '../../constants/Pricing';
import PressSpring from '@/components/PressSpring';
import { Link } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

const WELLNESS_SERVICES = [
  { id: 'sauna',     label: 'Sauna (20 Mins)',              defaultPrice: 500  },
  { id: 'hbot',      label: 'HBOT Chamber (45 Mins)',        defaultPrice: 3000 },
  { id: 'cryo',      label: 'Cryo Chamber (60 Mins)',        defaultPrice: 3000 },
  { id: 'red-light', label: 'Infrared Chamber (20 Mins)',   defaultPrice: 3000 },
];

interface PricingMap { [name: string]: number }
interface AllPricing {
  salon:    PricingMap;
  spa:      PricingMap;
  physio:   PricingMap;
  wellness: PricingMap;
}

const buildDefault = (): AllPricing => ({
  salon:    Object.fromEntries(SALON_SERVICES.map(s  => [s.name, s.price])),
  spa:      Object.fromEntries(SPA_SERVICES.map(s    => [s.name, s.price])),
  physio:   Object.fromEntries(PHYSIO_SERVICES.map(s => [s.name, s.price])),
  wellness: Object.fromEntries(WELLNESS_SERVICES.map(s => [s.id, s.defaultPrice])),
});

function SaveToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.toast}>
      <FontAwesome name="check-circle" size={14} color="#6B9E76" style={{ marginRight: 8 }} />
      <Text style={styles.toastText}>PRICING ARCHIVE UPDATED</Text>
    </View>
  );
}

function ServiceGroup({
  title, icon, items, priceMap, onUpdate, colors
}: {
  title: string;
  icon: string;
  items: { name: string; label?: string }[];
  priceMap: PricingMap;
  onUpdate: (name: string, val: number) => void;
  colors: any;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  return (
    <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.groupHeader}>
        <View style={styles.groupIconBg}>
          <FontAwesome name={icon as any} size={13} color="#B84600" />
        </View>
        <Text style={[styles.groupTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {items.map((item, idx) => {
        const isFocused = focused === item.name;
        const label = item.label ?? item.name;
        return (
          <View
            key={item.name}
            style={[
              styles.row,
              idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={2}>{label}</Text>
            <View style={[styles.priceInputWrap, { backgroundColor: colors.background, borderColor: isFocused ? '#B84600' : colors.border }]}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                style={[styles.priceInput, { color: colors.text }]}
                keyboardType="numeric"
                value={String(priceMap[item.name] ?? 0)}
                onFocus={() => setFocused(item.name)}
                onBlur={() => setFocused(null)}
                onChangeText={t => {
                  const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
                  onUpdate(item.name, isNaN(n) ? 0 : n);
                }}
                selectTextOnFocus
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function AdminPricing() {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  const { userProfile } = useAuth();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showToast, setToast]   = useState(false);
  const [pricing, setPricing]   = useState<AllPricing>(buildDefault());

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'pricing'));
        if (snap.exists()) {
          const data = snap.data() as Partial<AllPricing>;
          setPricing(prev => ({
            salon:    { ...prev.salon,    ...(data.salon    ?? {}) },
            spa:      { ...prev.spa,      ...(data.spa      ?? {}) },
            physio:   { ...prev.physio,   ...(data.physio   ?? {}) },
            wellness: { ...prev.wellness, ...(data.wellness ?? {}) },
          }));
        }
      } catch (e) {
        console.warn('Failed to load pricing from Firestore', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updatePrice = (section: keyof AllPricing, name: string, val: number) => {
    setPricing(prev => ({ ...prev, [section]: { ...prev[section], [name]: val } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'pricing'), pricing, { merge: true });
      setToast(true);
      setTimeout(() => setToast(false), 2200);
    } catch (e) {
      console.error('Failed to save pricing', e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setPricing(buildDefault());

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#B84600" />
        <Text style={[styles.loadingText, { color: colors.secondaryText }]}>Loading Club Pricing...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SaveToast visible={showToast} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
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
            <PressSpring
              style={[styles.navBtn, styles.navBtnActive]}
              scaleTo={0.96}
              hapticStyle="selection"
              fullWidth={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FontAwesome name="tag" size={13} color="#B84600" style={{ marginRight: 6 }} />
                <Text style={styles.navBtnTextActive}>Pricing</Text>
              </View>
            </PressSpring>
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

        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Pricing Management</Text>
          <Text style={[styles.pageSubtitle, { color: colors.secondaryText }]}>
            Set rates for Basic, Trial, and Wellness members. Gold members are not charged.
          </Text>
        </View>

        {/* Salon */}
        <ServiceGroup
          title="Hair Salon"
          icon="scissors"
          items={SALON_SERVICES.map(s => ({ name: s.name }))}
          priceMap={pricing.salon}
          onUpdate={(n, v) => updatePrice('salon', n, v)}
          colors={colors}
        />

        {/* Spa / Massage */}
        <ServiceGroup
          title="Spa & Massage"
          icon="heart"
          items={SPA_SERVICES.map(s => ({ name: s.name }))}
          priceMap={pricing.spa}
          onUpdate={(n, v) => updatePrice('spa', n, v)}
          colors={colors}
        />

        {/* Physio */}
        <ServiceGroup
          title="Physiotherapy"
          icon="medkit"
          items={PHYSIO_SERVICES.map(s => ({ name: s.name }))}
          priceMap={pricing.physio}
          onUpdate={(n, v) => updatePrice('physio', n, v)}
          colors={colors}
        />

        {/* Wellness */}
        <ServiceGroup
          title="Wellness Therapies"
          icon="fire"
          items={WELLNESS_SERVICES.map(s => ({ name: s.id, label: s.label }))}
          priceMap={pricing.wellness}
          onUpdate={(n, v) => updatePrice('wellness', n, v)}
          colors={colors}
        />

        {/* Note */}
        <View style={[styles.noteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FontAwesome name="info-circle" size={13} color={colors.secondaryText} style={{ marginRight: 8, marginTop: 2 }} />
          <Text style={[styles.noteText, { color: colors.secondaryText }]}>
            Prices are stored globally and applied automatically upon booking confirm. Active member reservations remain unaffected.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <PressSpring
            style={{ flex: 1 }}
            contentStyle={[styles.resetBtn, { borderColor: colors.border }]}
            onPress={handleReset}
            scaleTo={0.94}
            hapticStyle="light"
            fullWidth={true}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <FontAwesome name="undo" size={12} color={colors.secondaryText} style={{ marginRight: 6 }} />
              <Text style={[styles.resetBtnText, { color: colors.secondaryText }]}>Defaults</Text>
            </View>
          </PressSpring>

          <PressSpring
            style={{ flex: 2 }}
            contentStyle={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
            scaleTo={0.94}
            hapticStyle="heavy"
            fullWidth={true}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              {saving ? (
                <ActivityIndicator size="small" color="#0B0B0B" style={{ marginRight: 8 }} />
              ) : (
                <FontAwesome name="save" size={13} color="#0B0B0B" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Prices'}</Text>
            </View>
          </PressSpring>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:  { fontSize: 13, fontFamily: TheOneTypography.bodyFamily, marginTop: 8 },
  scroll:       { padding: 20, paddingBottom: 60 },

  pageHeader:   { marginBottom: 24 },
  pageTitle:    { fontSize: 22, fontFamily: TheOneTypography.headlineFamily, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  pageSubtitle: { fontSize: 13, fontFamily: TheOneTypography.bodyFamily, lineHeight: 18 },

  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
  },
  groupIconBg: {
    width: 28,
    height: 28,
    backgroundColor: '#1E1E22',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupTitle: { fontSize: 16, fontFamily: TheOneTypography.headlineFamily, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  rowLabel: { flex: 1, fontSize: 13, fontFamily: TheOneTypography.bodyFamily, lineHeight: 18 },

  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 80,
  },
  rupee:      { fontSize: 12, fontWeight: '700', color: '#B84600', marginRight: 3, fontFamily: TheOneTypography.bodyFamily },
  priceInput: { fontSize: 14, fontWeight: '700', minWidth: 46, textAlign: 'right', fontFamily: TheOneTypography.bodyFamily },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: TheOneTypography.bodyFamily, lineHeight: 18 },

  actions:   { flexDirection: 'row', gap: 12, marginBottom: 10 },
  resetBtn:  {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: 'transparent',
  },
  resetBtnText: { fontSize: 11, fontFamily: TheOneTypography.bodyFamily, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },

  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B84600',
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveBtnText: { color: '#0B0B0B', fontSize: 11, fontFamily: TheOneTypography.bodyFamily, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },

  toast: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#6B9E76',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 999,
  },
  toastText: { color: '#6B9E76', fontSize: 11, fontWeight: '800', letterSpacing: 1, fontFamily: TheOneTypography.bodyFamily },
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
});
