import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable
} from 'react-native';
import { TheOneColors, TheOneTypography, TheOneSpacing } from '@/constants/TheOneTheme';
import PressSpring from './PressSpring';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface CustomAlertModalProps {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
  onClose: () => void;
}

export default function CustomAlertModal({
  visible, title, message, buttons, onClose
}: CustomAlertModalProps) {
  const defaultButtons: AlertButton[] = buttons?.length
    ? buttons
    : [{ text: 'OK', style: 'default', onPress: onClose }];

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Signature burnt-orange top accent line */}
          <View style={styles.accentLine} />

          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.buttonRow}>
            {defaultButtons.map((btn, i) => {
              const isPrimary = btn.style === 'default' || (!btn.style && i === defaultButtons.length - 1);
              const isDestructive = btn.style === 'destructive';
              return (
                <PressSpring
                  key={i}
                  style={i > 0 && { marginLeft: TheOneSpacing.sm }}
                  contentStyle={StyleSheet.flatten([
                    styles.button,
                    isPrimary && styles.buttonPrimary,
                    isDestructive && styles.buttonDestructive,
                  ])}
                  onPress={() => {
                    btn.onPress?.();
                    if (!btn.onPress || btn.style === 'cancel') onClose();
                  }}
                  scaleTo={isDestructive || isPrimary ? 0.94 : 0.96}
                  hapticStyle={isDestructive ? 'heavy' : isPrimary ? 'medium' : 'light'}
                  fullWidth={false}
                >
                  <Text style={StyleSheet.flatten([
                    styles.buttonText,
                    isPrimary && styles.buttonTextPrimary,
                    isDestructive && styles.buttonTextDestructive,
                  ])}>
                    {btn.text.toUpperCase()}
                  </Text>
                </PressSpring>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.80)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: TheOneSpacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: TheOneColors.charcoal,
    borderRadius: 12,
    overflow: 'hidden',
  },
  accentLine: {
    height: 2,
    backgroundColor: TheOneColors.accent,
    width: '100%',
  },
  content: {
    padding: TheOneSpacing.lg,
    paddingBottom: TheOneSpacing.md,
  },
  title: {
    fontFamily: TheOneTypography.headlineFamily,
    fontSize: 22,
    fontWeight: '600',
    color: TheOneColors.textPrimary,
    marginBottom: TheOneSpacing.sm,
    letterSpacing: 0.3,
  },
  message: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 14,
    color: TheOneColors.textSecondary,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  divider: {
    height: 1,
    backgroundColor: TheOneColors.charcoalBorder,
    marginHorizontal: TheOneSpacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    padding: TheOneSpacing.md,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: TheOneSpacing.md,
    borderWidth: 1,
    borderColor: TheOneColors.charcoalBorder,
  },
  buttonPrimary: {
    backgroundColor: TheOneColors.accent,
    borderColor: TheOneColors.accent,
  },
  buttonDestructive: {
    borderColor: TheOneColors.error,
  },
  buttonText: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '600',
    color: TheOneColors.textSecondary,
  },
  buttonTextPrimary: {
    color: TheOneColors.textInverse,
  },
  buttonTextDestructive: {
    color: TheOneColors.error,
  },
});
