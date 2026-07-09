import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, Platform, Animated, StatusBar, Pressable, Image
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import CustomAlertModal from '@/components/CustomAlertModal';
import { useRouter } from 'expo-router';
import { auth } from '../firebaseConfig';
import { TheOneColors, TheOneTypography, TheOneSpacing } from '@/constants/TheOneTheme';
import { BlurView } from 'expo-blur';
import PressSpring from '@/components/PressSpring';
import { LinearGradient } from 'expo-linear-gradient';

const COUNTRY_CODE = '+91';

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-phone-number':      'Invalid phone number format.',
    'auth/too-many-requests':         'Too many attempts. Please wait a few minutes.',
    'auth/quota-exceeded':            'SMS quota exceeded. Try again later.',
    'auth/captcha-check-failed':      'reCAPTCHA check failed. Please refresh.',
    'auth/network-request-failed':    'Network error. Check your connection.',
    'auth/invalid-verification-code': 'Incorrect OTP. Please try again.',
    'auth/code-expired':              'OTP has expired. Please request a new one.',
    'auth/user-not-whitelisted':      'Access restricted to members only.',
    'auth/user-not-registered':       'You are not a registered member. Please register at the reception.',
  };
  return map[code] || `Error: ${code}`;
}

export default function LoginScreen() {
  const [localNumber, setLocalNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const [isOtpFocused, setIsOtpFocused] = useState(false);

  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '' });
  const showAlert = (title: string, message: string) => setAlertConfig({ visible: true, title, message });
  const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

  const recaptchaVerifierRef = useRef<any>(null);
  const lineAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { sendVerificationCode, confirmVerificationCode } = useAuth();
  const router = useRouter();
  const fullPhoneNumber = `${COUNTRY_CODE}${localNumber.replace(/\D/g, '')}`;

  useEffect(() => {
    // Entrance animation
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(lineAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
    ]).start();
  }, []);



  const handleSendCode = async () => {
    const digits = localNumber.replace(/\D/g, '');
    if (digits.length !== 10) { showAlert('Invalid Number', 'Please enter your 10-digit mobile number.'); return; }
    setIsLoading(true);

    let verifier = undefined;
    if (Platform.OS === 'web') {
      try {
        const { RecaptchaVerifier } = require('firebase/auth');

        // Always destroy the previous verifier — it's single-use after any send attempt
        if (recaptchaVerifierRef.current) {
          try { recaptchaVerifierRef.current.clear(); } catch (_) {}
          recaptchaVerifierRef.current = null;
        }

        // Fully remove the old container from the DOM so Firebase's internal
        // element registry doesn't complain about "already rendered".
        // innerHTML = '' is NOT enough — we need a brand-new element.
        const old = document.getElementById('recaptcha-container');
        if (old) old.parentNode?.removeChild(old);
        const container = document.createElement('div');
        container.id = 'recaptcha-container';
        document.body.appendChild(container);

        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, container, {
          size: 'invisible',
          callback: () => console.log('reCAPTCHA passed'),
        });
        verifier = recaptchaVerifierRef.current;
      } catch (err) {
        console.error('Failed to initialize RecaptchaVerifier:', err);
      }
    } else {
      verifier = {
        type: 'recaptcha',
        verify: async () => 'dummy-attestation-token',
        _reset: () => {}
      };
    }

    const result = await sendVerificationCode(fullPhoneNumber, verifier);
    setIsLoading(false);
    if (result.success) { setStep(2); }
    else { showAlert('OTP Failed', result.error ? friendlyError(result.error) : 'Failed to send OTP.'); }
  };

  const handleVerifyCode = async () => {
    if (verificationCode.length < 6) { showAlert('Enter OTP', 'Please enter the complete 6-digit OTP.'); return; }
    setIsLoading(true);
    const result = await confirmVerificationCode(verificationCode);
    if (result.success) {
      // RootLayoutNav will automatically handle role-based redirection to /(admin) or /(tabs)
    } else {
      setIsLoading(false);
      showAlert('Verification Failed', result.error ? friendlyError(result.error) : 'Incorrect OTP.');
    }
  };

  const lineWidth = lineAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={TheOneColors.black} />
      <CustomAlertModal visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} onClose={hideAlert} />

      {/* Background Image with Dark Vignette/Overlay */}
      <Image
        source={require('../assets/images/login_bg.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(11, 11, 11, 0.55)', 'rgba(11, 11, 11, 0.95)']}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        <BlurView
          intensity={Platform.OS === 'web' ? 25 : 18}
          tint="dark"
          style={styles.loginCard}
        >
          {/* ── Wordmark ── */}
          <View style={styles.wordmarkContainer}>
            <View style={styles.logoRow}>
              <Text style={styles.logoText}>THE</Text>
              <View style={{ width: 20 }} />
              <Text style={styles.logoText}>O</Text>
              <Image 
                source={require('../assets/images/n_logo.png')} 
                style={styles.doorwayImage} 
                resizeMode="contain"
              />
              <Text style={styles.logoText}>E</Text>
            </View>
            {/* Animated burnt-orange reveal line */}
            <Animated.View style={[styles.accentLine, { width: lineWidth }]} />
            <Text style={styles.tagline}>MEMBERS ONLY</Text>
          </View>

          {/* ── Step 1: Phone ── */}
          {step === 1 && (
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>MOBILE VERIFICATION</Text>

              <View style={StyleSheet.flatten([styles.inputWrap, isPhoneFocused && styles.inputWrapFocused])}>
                <View style={styles.countryChip}>
                  <Text style={styles.flag}>🇮🇳</Text>
                  <Text style={styles.countryCode}>+91</Text>
                </View>
                <View style={styles.inputDivider} />
                <TextInput
                  style={StyleSheet.flatten([styles.phoneInput, Platform.select({ web: { outlineStyle: 'none' } as any })])}
                  placeholder="98765  43210"
                  placeholderTextColor={TheOneColors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={10}
                  value={localNumber}
                  onChangeText={(t) => setLocalNumber(t.replace(/\D/g, ''))}
                  onFocus={() => setIsPhoneFocused(true)}
                  onBlur={() => setIsPhoneFocused(false)}
                />
              </View>

              <PressSpring
                contentStyle={StyleSheet.flatten([
                  styles.primaryBtn,
                  isLoading && { opacity: 0.6 }
                ])}
                onPress={handleSendCode}
                disabled={isLoading}
                scaleTo={0.94}
                hapticStyle="heavy"
                fullWidth={true}
              >
                {isLoading
                  ? <ActivityIndicator color={TheOneColors.textPrimary} />
                  : <Text style={[styles.primaryBtnText, { textAlign: 'center' }]}>SEND OTP</Text>
                }
              </PressSpring>
            </View>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 2 && (
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>ENTER VERIFICATION CODE</Text>
              <Text style={styles.subLabel}>Sent to +91 {localNumber}</Text>

              <TextInput
                style={StyleSheet.flatten([
                  styles.otpInput,
                  isOtpFocused && styles.otpInputFocused,
                  Platform.select({ web: { outlineStyle: 'none' } as any }),
                ])}
                placeholder="· · · · · ·"
                placeholderTextColor={TheOneColors.textTertiary}
                keyboardType="number-pad"
                maxLength={6}
                value={verificationCode}
                onChangeText={setVerificationCode}
                onFocus={() => setIsOtpFocused(true)}
                onBlur={() => setIsOtpFocused(false)}
              />

              <PressSpring
                contentStyle={StyleSheet.flatten([
                  styles.primaryBtn,
                  isLoading && { opacity: 0.6 }
                ])}
                onPress={handleVerifyCode}
                disabled={isLoading}
                scaleTo={0.94}
                hapticStyle="heavy"
                fullWidth={true}
              >
                {isLoading
                  ? <ActivityIndicator color={TheOneColors.textPrimary} />
                  : <Text style={[styles.primaryBtnText, { textAlign: 'center' }]}>ENTER THE ONE</Text>
                }
              </PressSpring>

              <View style={styles.otpFooter}>
                <PressSpring 
                  onPress={() => { setStep(1); setVerificationCode(''); }} 
                  contentStyle={styles.linkBtn}
                  scaleTo={0.95}
                  hapticStyle="light"
                  fullWidth={false}
                >
                  <Text style={styles.linkText}>← Change Number</Text>
                </PressSpring>
                <PressSpring 
                  onPress={handleSendCode} 
                  contentStyle={styles.linkBtn}
                  scaleTo={0.95}
                  hapticStyle="light"
                  fullWidth={false}
                >
                  <Text style={styles.linkText}>Resend OTP</Text>
                </PressSpring>
              </View>
            </View>
          )}
        </BlurView>

        <Text style={styles.footer}>PRIVATE MEMBERS CLUB · EST. 2024</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TheOneColors.black,
    justifyContent: 'center',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: TheOneSpacing.xl,
    paddingBottom: TheOneSpacing.xxl,
  },
  loginCard: {
    backgroundColor: 'rgba(21, 21, 21, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.15)',
    paddingHorizontal: TheOneSpacing.lg,
    paddingVertical: TheOneSpacing.xl,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
      }
    }),
  },

  // ── Wordmark ──
  wordmarkContainer: {
    alignItems: 'center',
    marginBottom: TheOneSpacing.xxl + TheOneSpacing.md,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: TheOneSpacing.md,
  },
  logoText: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 42,
    fontWeight: '200',
    color: '#FFFFFF',
    letterSpacing: 6,
    lineHeight: 50,
  },
  doorwayImage: {
    width: 21,
    height: 30,
    marginLeft: 6,
    marginRight: 10,
    marginBottom: 8,
  },
  accentLine: {
    height: 1,
    backgroundColor: TheOneColors.accent,
    marginBottom: TheOneSpacing.md,
    alignSelf: 'center',
  },
  tagline: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 10,
    letterSpacing: 4,
    color: TheOneColors.textTertiary,
    textAlign: 'center',
  },

  // ── Form ──
  formSection: {
    width: '100%',
  },
  sectionLabel: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 10,
    letterSpacing: 3,
    color: TheOneColors.textTertiary,
    marginBottom: TheOneSpacing.lg,
  },
  subLabel: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 13,
    color: TheOneColors.textSecondary,
    marginBottom: TheOneSpacing.lg,
    marginTop: -TheOneSpacing.sm,
    letterSpacing: 0.3,
  },

  // Phone input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: TheOneColors.charcoalBorder,
    marginBottom: TheOneSpacing.xl,
    paddingBottom: 2,
  },
  inputWrapFocused: {
    borderBottomColor: TheOneColors.accent,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: TheOneSpacing.md,
  },
  flag: { fontSize: 18, marginRight: 6 },
  countryCode: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 15,
    color: TheOneColors.textPrimary,
    fontWeight: '500',
  },
  inputDivider: {
    width: 1,
    height: 20,
    backgroundColor: TheOneColors.charcoalBorder,
    marginRight: TheOneSpacing.md,
  },
  phoneInput: {
    flex: 1,
    paddingVertical: TheOneSpacing.sm + 2,
    fontSize: 20,
    fontWeight: '300',
    color: TheOneColors.textPrimary,
    letterSpacing: 3,
    fontFamily: TheOneTypography.numberFamily,
  },

  // OTP input
  otpInput: {
    borderBottomWidth: 1,
    borderBottomColor: TheOneColors.charcoalBorder,
    paddingVertical: TheOneSpacing.md,
    marginBottom: TheOneSpacing.xl,
    textAlign: 'center',
    letterSpacing: 16,
    fontSize: 28,
    fontWeight: '300',
    color: TheOneColors.textPrimary,
    fontFamily: TheOneTypography.numberFamily,
  },
  otpInputFocused: {
    borderBottomColor: TheOneColors.accent,
  },

  // Primary CTA
  primaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: TheOneColors.accent,
    paddingVertical: TheOneSpacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: TheOneSpacing.md,
  },
  primaryBtnText: {
    fontFamily: TheOneTypography.bodyFamily,
    color: TheOneColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
  },

  otpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: TheOneSpacing.sm,
  },
  linkBtn: { paddingVertical: TheOneSpacing.sm },
  linkText: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 12,
    color: TheOneColors.textTertiary,
    letterSpacing: 0.3,
  },

  footer: {
    position: 'absolute',
    bottom: TheOneSpacing.xl,
    alignSelf: 'center',
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 9,
    letterSpacing: 2.5,
    color: TheOneColors.textTertiary,
  },
});
