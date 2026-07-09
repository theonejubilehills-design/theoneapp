import React, { useState } from 'react';
import { 
  StyleSheet, View, Text, Modal, TouchableOpacity, 
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Pressable
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { TheOneColors, TheOneTypography, TheOneSpacing, TheOneBorderRadius } from '@/constants/TheOneTheme';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import PressSpring from './PressSpring';

interface FeedbackModalProps {
  visible: boolean;
  booking: any;
  userProfile: any;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function FeedbackModal({ visible, booking, userProfile, onClose, onSubmitted }: FeedbackModalProps) {
  const colors = {
    text: TheOneColors.textPrimary,
    secondaryText: TheOneColors.textSecondary,
    card: TheOneColors.charcoal,
    border: TheOneColors.charcoalBorder,
    background: TheOneColors.black,
    tint: TheOneColors.accent,
  };
  
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!booking || !userProfile) return null;

  const handleSubmit = async () => {
    if (rating === 0) return;
    
    setIsSubmitting(true);
    try {
      // Create feedback doc
      await addDoc(collection(db, 'feedbacks'), {
        bookingId: booking.id,
        userId: userProfile.phoneNumber,
        userName: userProfile.name,
        serviceId: booking.equipment,
        serviceName: booking.equipment.replace('-', ' ').toUpperCase(),
        date: booking.date,
        rating,
        comments: comments.trim(),
        createdAt: new Date().toISOString(),
        status: 'new'
      });

      // Mark booking as feedback submitted
      await updateDoc(doc(db, 'bookings', booking.id), {
        feedbackSubmitted: true
      });

      onSubmitted();
    } catch (e) {
      console.error('Failed to submit feedback:', e);
    } finally {
      setIsSubmitting(false);
      setRating(0);
      setComments('');
    }
  };

  const handleClose = () => {
    // If they close without submitting, maybe prompt later? Or mark it skipped.
    // For now, let's just mark it skipped so it doesn't pop up endlessly.
    if (!isSubmitting) {
      updateDoc(doc(db, 'bookings', booking.id), {
        feedbackSubmitted: true
      }).catch(console.error);
      onClose();
    }
  };

  const serviceName = booking.equipment.replace('-', ' ').toUpperCase();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', alignItems: 'center' }}
        >
          <Pressable style={[styles.modalContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.iconCircle}>
              <FontAwesome name="star" size={32} color={TheOneColors.accent} />
            </View>
            
            <Text style={[styles.title, { color: colors.text }]}>How was your session?</Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              You recently completed a session at {serviceName}. We'd love to hear your feedback!
            </Text>

            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <PressSpring 
                  key={star} 
                  onPress={() => setRating(star)} 
                  style={{ padding: 4 }}
                  scaleTo={0.82}
                  hapticStyle="selection"
                  fullWidth={false}
                >
                  <FontAwesome 
                    name={rating >= star ? "star" : "star-o"} 
                    size={36} 
                    color={rating >= star ? TheOneColors.accent : TheOneColors.charcoalBorder} 
                  />
                </PressSpring>
              ))}
            </View>

            <TextInput
              style={StyleSheet.flatten([
                styles.textInput, 
                { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }
              ])}
              placeholder="Tell us what you liked or any complaints you have..."
              placeholderTextColor={colors.secondaryText}
              value={comments}
              onChangeText={setComments}
              multiline
              textAlignVertical="top"
            />

            <PressSpring 
              contentStyle={[
                styles.submitButton, 
                { backgroundColor: rating > 0 ? TheOneColors.accent : TheOneColors.charcoalBorder }
              ]}
              onPress={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              scaleTo={0.94}
              hapticStyle="medium"
            >
              {isSubmitting ? (
                <ActivityIndicator color={TheOneColors.textInverse} />
              ) : (
                <Text style={[styles.submitButtonText, { color: rating > 0 ? TheOneColors.textInverse : TheOneColors.textTertiary }]}>Submit Feedback</Text>
              )}
            </PressSpring>

            <PressSpring 
              contentStyle={styles.skipButton} 
              onPress={handleClose}
              scaleTo={0.96}
              hapticStyle="light"
            >
              <Text style={[styles.skipButtonText, { color: colors.secondaryText, textAlign: 'center' }]}>Skip for now</Text>
            </PressSpring>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: TheOneBorderRadius.none,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.2)',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: TheOneBorderRadius.none,
    borderWidth: 1,
    borderColor: 'rgba(184, 70, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: TheOneTypography.headlineFamily,
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: TheOneTypography.bodyFamily,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  textInput: {
    width: '100%',
    height: 100,
    borderWidth: 1,
    borderRadius: TheOneBorderRadius.none,
    padding: 16,
    fontSize: 14,
    fontFamily: TheOneTypography.bodyFamily,
    marginBottom: 24,
  },
  submitButton: {
    width: '100%',
    height: 50,
    borderRadius: TheOneBorderRadius.none,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  skipButton: {
    paddingVertical: 8,
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
});
