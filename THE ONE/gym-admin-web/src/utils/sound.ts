let clickAudio: HTMLAudioElement | null = null;

export const preloadClickSound = () => {
  try {
    if (!clickAudio) {
      clickAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav');
      clickAudio.volume = 0.2;
      clickAudio.load();
    }
  } catch (e) {
    console.warn('Failed to preload audio', e);
  }
};

export const playClickSound = () => {
  try {
    if (clickAudio) {
      // Clone it to allow rapid consecutive clicks
      const soundClone = clickAudio.cloneNode(true) as HTMLAudioElement;
      soundClone.volume = 0.2;
      soundClone.play().catch(() => {});
    } else {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav');
      audio.volume = 0.2;
      audio.play().catch(() => {});
    }
  } catch (e) {
    // Ignore audio failures
  }
};
