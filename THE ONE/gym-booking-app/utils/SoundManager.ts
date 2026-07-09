import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Local bundled WAV assets — avoids iOS NSURLErrorDomain -1102 from remote CDN URLs
const SOUNDS = {
  click:   require('../assets/sounds/click.wav'),
  success: require('../assets/sounds/success.wav'),
  cancel:  require('../assets/sounds/cancel.wav'),
  slide:   require('../assets/sounds/slide.wav'),
};

let clickPlayer:   ReturnType<typeof createAudioPlayer> | null = null;
let successPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let cancelPlayer:  ReturnType<typeof createAudioPlayer> | null = null;
let slidePlayer:   ReturnType<typeof createAudioPlayer> | null = null;

/** Call once at app startup to pre-warm audio players */
export async function preloadSound() {
  try {
    if (!clickPlayer)   clickPlayer   = createAudioPlayer(SOUNDS.click);
    if (!successPlayer) successPlayer = createAudioPlayer(SOUNDS.success);
    if (!cancelPlayer)  cancelPlayer  = createAudioPlayer(SOUNDS.cancel);
    if (!slidePlayer)   slidePlayer   = createAudioPlayer(SOUNDS.slide);
  } catch (error) {
    console.warn('Failed to preload sounds:', error);
  }
}

export async function playClickSound() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!clickPlayer) clickPlayer = createAudioPlayer(SOUNDS.click);
    clickPlayer.seekTo(0); // seekTo takes milliseconds; 0ms = start
    clickPlayer.play();
  } catch (error) {
    console.warn('Failed to play click sound:', error);
  }
}

export async function playSuccessSound() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (!successPlayer) successPlayer = createAudioPlayer(SOUNDS.success);
    successPlayer.seekTo(0);
    successPlayer.play();
  } catch (error) {
    console.warn('Failed to play success sound:', error);
  }
}

export async function playCancelSound() {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    if (!cancelPlayer) cancelPlayer = createAudioPlayer(SOUNDS.cancel);
    cancelPlayer.seekTo(0);
    cancelPlayer.play();
  } catch (error) {
    console.warn('Failed to play cancel sound:', error);
  }
}

export async function playSlideSound() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!slidePlayer) slidePlayer = createAudioPlayer(SOUNDS.slide);
    slidePlayer.seekTo(0);
    slidePlayer.play();
  } catch (error) {
    console.warn('Failed to play slide sound:', error);
  }
}
