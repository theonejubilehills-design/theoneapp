import React, { useRef } from 'react';
import { Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

interface PressSpringProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  contentStyle?: any;
  disabled?: boolean;
  scaleTo?: number; // customizable scale (defaults to 0.96)
  hapticStyle?: 'light' | 'medium' | 'heavy' | 'selection' | 'none';
  fullWidth?: boolean; // customizable width (defaults to true)
  speed?: number; // default 60
  bounciness?: number; // default 4
  [key: string]: any;
}

export default function PressSpring({
  children,
  onPress,
  style,
  contentStyle,
  disabled,
  scaleTo = 0.96,
  hapticStyle = 'light',
  fullWidth = true,
  speed = 60,
  bounciness = 4,
  ...rest
}: PressSpringProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: scaleTo,
      useNativeDriver: true,
      speed: speed,
      bounciness: bounciness,
    }).start();

    // Trigger haptic on press in
    if (hapticStyle !== 'none') {
      try {
        if (hapticStyle === 'light') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } else if (hapticStyle === 'medium') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        } else if (hapticStyle === 'heavy') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        } else if (hapticStyle === 'selection') {
          Haptics.selectionAsync().catch(() => {});
        }
      } catch (e) {
        // Fallback for web / simulator
      }
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: speed,
      bounciness: bounciness,
    }).start();
  };

  const handlePress = () => {
    if (disabled) return;
    if (onPress) {
      if (hapticStyle !== 'none') {
        try {
          Haptics.selectionAsync().catch(() => {});
        } catch (e) {
          // Fallback for web / simulator
        }
      }
      onPress();
    }
  };

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[{ width: fullWidth ? '100%' : undefined }, style]}
    >
      <Animated.View style={[{ transform: [{ scale }], width: fullWidth ? '100%' : undefined }, contentStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

