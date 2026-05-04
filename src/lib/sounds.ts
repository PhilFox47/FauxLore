export const playLootSound = (rarity: string, type: 'buildup' | 'reveal') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.15; // Set base volume
    masterGain.connect(ctx.destination);

    const playTone = (freq: number, oscType: OscillatorType, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = oscType;
      osc.frequency.setValueAtTime(freq, startTime);
      
      const safeDuration = Math.max(duration, 0.01);
      const attack = Math.min(0.05, safeDuration / 4);
      const release = Math.min(0.1, safeDuration / 4);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + attack);
      gain.gain.setValueAtTime(1, startTime + safeDuration - release);
      gain.gain.linearRampToValueAtTime(0, startTime + safeDuration);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + safeDuration);
    };

    const now = ctx.currentTime;

    if (type === 'buildup') {
      if (rarity === 'Legendary') {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 2.5);
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 2.5);
        gain.gain.linearRampToValueAtTime(0, now + 2.6);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 2.6);
      } else if (rarity === 'Mythic') {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(40, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 2.5);
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.7, now + 2.5);
        gain.gain.linearRampToValueAtTime(0, now + 2.6);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 2.6);
      } else {
        // Subtle buildup for Common/Uncommon/Rare/Super Rare
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 1.5);
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 1.5);
        gain.gain.linearRampToValueAtTime(0, now + 1.6);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 1.6);
      }
      return;
    }

    switch (rarity) {
      case 'Common':
        playTone(440, 'sine', now, 0.3); // A4
        playTone(554.37, 'sine', now + 0.1, 0.4); // C#5
        break;
      case 'Uncommon':
        playTone(440, 'triangle', now, 0.15);
        playTone(554.37, 'triangle', now + 0.15, 0.4);
        break;
      case 'Rare':
        playTone(440, 'sine', now, 0.1);
        playTone(554.37, 'sine', now + 0.1, 0.1);
        playTone(659.25, 'sine', now + 0.2, 0.6); // E5
        playTone(880, 'sine', now + 0.2, 0.6); // A5
        break;
      case 'Super Rare':
        playTone(440, 'square', now, 0.08);
        playTone(554.37, 'square', now + 0.08, 0.08);
        playTone(659.25, 'square', now + 0.16, 0.08);
        playTone(880, 'square', now + 0.24, 0.8);
        playTone(1108.73, 'sine', now + 0.24, 0.8); // C#6
        break;
      case 'Legendary':
        playTone(440, 'square', now, 1.5);
        playTone(554.37, 'triangle', now, 1.5);
        playTone(659.25, 'square', now, 1.5);
        playTone(880, 'sine', now + 0.1, 1.5);
        for(let i=0; i<12; i++){
           playTone(880 + i*100, 'sine', now + i*0.04, 0.15);
        }
        break;
      case 'Mythic':
        playTone(329.63, 'square', now, 2.0); // E4
        playTone(415.30, 'square', now, 2.0); // G#4
        playTone(493.88, 'triangle', now, 2.0); // B4
        playTone(659.25, 'square', now, 2.0); // E5
        for(let i=0; i<20; i++){
           playTone(500 + i*100, 'sine', now + i*0.025, 0.1);
        }
        playTone(1318.51, 'square', now + 0.5, 2.0); // E6
        playTone(1661.22, 'sine', now + 0.5, 2.0); // G#6
        break;
      default:
        playTone(440, 'sine', now, 0.3);
    }
  } catch (e) {
    console.error('Audio playback failed', e);
  }
};
