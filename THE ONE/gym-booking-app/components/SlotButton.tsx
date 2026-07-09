import React from 'react';
import {
  View, Text, StyleSheet
} from 'react-native';
import { TheOneColors, TheOneTypography, TheOneSpacing } from '@/constants/TheOneTheme';
import PressSpring from './PressSpring';

interface SlotButtonProps {
  time: string;
  available: boolean;
  selected: boolean;
  onPress: () => void;
  price?: string;
}

export function SlotButton({ time, available, selected, onPress, price }: SlotButtonProps) {
  return (
    <PressSpring
      style={[
        styles.slot,
        selected && styles.slotSelected,
        !available && styles.slotUnavailable,
      ]}
      onPress={onPress}
      disabled={!available}
      scaleTo={0.92}
      hapticStyle="selection"
      fullWidth={false}
    >
      <Text style={[
        styles.timeText,
        selected && styles.timeTextSelected,
        !available && styles.timeTextUnavailable,
      ]}>
        {time}
      </Text>
      {price && available ? (
        <Text style={[styles.priceText, selected && styles.priceTextSelected]}>
          {price}
        </Text>
      ) : null}
      {!available ? (
        <Text style={styles.bookedLabel}>BOOKED</Text>
      ) : null}
    </PressSpring>
  );
}
export default SlotButton;

const styles = StyleSheet.create({
  slot: {
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
    backgroundColor: TheOneColors.charcoal,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    width: '30.5%',
    borderRadius: 10,
  },
  slotSelected: {
    backgroundColor: TheOneColors.accent,
    borderColor: TheOneColors.accent,
  },
  slotUnavailable: {
    backgroundColor: '#111111',
    borderColor: '#1A1A1A',
    opacity: 0.5,
  },
  timeText: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 13,
    fontWeight: '500',
    color: TheOneColors.textPrimary,
    letterSpacing: 0.5,
  },
  timeTextSelected: {
    color: TheOneColors.textInverse,
    fontWeight: '700',
  },
  timeTextUnavailable: {
    color: TheOneColors.textTertiary,
  },
  priceText: {
    fontFamily: TheOneTypography.numberFamily,
    fontSize: 11,
    color: TheOneColors.accent,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  priceTextSelected: {
    color: 'rgba(11,11,11,0.7)',
  },
  bookedLabel: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 9,
    letterSpacing: 1.5,
    color: TheOneColors.textTertiary,
    marginTop: 3,
  },
});
