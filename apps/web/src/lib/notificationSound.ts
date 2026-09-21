let audioContext: AudioContext | null = null;
let audioUnlocked = false;

export function unlockNotificationAudio() {
  if (typeof window === "undefined") return;
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  audioContext ??= new Context();
  audioUnlocked = true;
  void audioContext.resume();
}

export function playNewQueueSound() {
  if (!audioUnlocked || !audioContext) return;
  const context = audioContext;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.08);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
}
