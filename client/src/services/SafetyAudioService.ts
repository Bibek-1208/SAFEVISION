/**
 * SafetyAudioService
 * Real Acoustic Siren & Alarm Synthesis via Browser Web Audio API.
 * Adheres strictly to browser autoplay policies: operates only when explicitly armed by operator.
 */

class SafetyAudioService {
  private static instance: SafetyAudioService;
  private ctx: AudioContext | null = null;
  private armed: boolean = false;
  private currentOscillator: OscillatorNode | null = null;
  private currentGain: GainNode | null = null;
  private lfoOsc: OscillatorNode | null = null;
  private isAlarmActive: boolean = false;

  private constructor() {
    // Restore persisted armed preference if available
    const saved = localStorage.getItem('safevision_audio_armed');
    if (saved === 'true') {
      // AudioContext cannot auto-resume without user gesture, but flag is remembered
      this.armed = false; // Will be armed on first operator click
    }
  }

  public static getInstance(): SafetyAudioService {
    if (!SafetyAudioService.instance) {
      SafetyAudioService.instance = new SafetyAudioService();
    }
    return SafetyAudioService.instance;
  }

  public async arm(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) {
          console.warn('[SafetyAudio] Web Audio API is not supported in this browser.');
          return false;
        }
        this.ctx = new AudioCtxClass();
      }

      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.armed = true;
      localStorage.setItem('safevision_audio_armed', 'true');
      console.log('[SafetyAudio] Safety Acoustic Siren ARMED. AudioContext state:', this.ctx.state);
      return true;
    } catch (err) {
      console.error('[SafetyAudio] Failed to arm audio siren:', err);
      this.armed = false;
      return false;
    }
  }

  public disarm(): void {
    this.stopActiveAlarm();
    this.armed = false;
    localStorage.setItem('safevision_audio_armed', 'false');
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
    console.log('[SafetyAudio] Safety Acoustic Siren DISARMED.');
  }

  public isArmed(): boolean {
    return this.armed && this.ctx !== null && this.ctx.state === 'running';
  }

  public getStatus(): 'ARMED' | 'DISARMED' | 'UNSUPPORTED' {
    if (typeof window === 'undefined' || !(window.AudioContext || (window as any).webkitAudioContext)) {
      return 'UNSUPPORTED';
    }
    return this.isArmed() ? 'ARMED' : 'DISARMED';
  }

  /**
   * Triggers an industrial audio warning based on violation severity
   */
  public triggerAlert(severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH'): void {
    if (!this.isArmed() || !this.ctx) {
      // Unarmed: silent operation to prevent console errors
      return;
    }

    // Stop any existing loop first
    this.stopActiveAlarm();

    const now = this.ctx.currentTime;

    if (severity === 'CRITICAL' || severity === 'HIGH') {
      // Dual-tone industrial emergency siren: 800Hz base modulated by 4Hz LFO
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(3.5, now); // 3.5 Hz warble rate
      lfoGain.gain.setValueAtTime(200, now);  // +/- 200 Hz sweep (600Hz to 1000Hz)

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.28, now);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      lfo.start(now);
      osc.start(now);

      // Automatically decay and stop after 4.5 seconds if not acknowledged
      gain.gain.setValueAtTime(0.28, now + 4.0);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);

      setTimeout(() => {
        try {
          osc.stop();
          lfo.stop();
          osc.disconnect();
          lfo.disconnect();
          gain.disconnect();
        } catch (_) {}
      }, 4600);

      this.currentOscillator = osc;
      this.lfoOsc = lfo;
      this.currentGain = gain;
      this.isAlarmActive = true;
    } else if (severity === 'MEDIUM') {
      // 2-pulse alert tone (700Hz -> 500Hz)
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(720, now);
      osc.frequency.setValueAtTime(520, now + 0.2);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.setValueAtTime(0.22, now + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      // Low: brief confirmation ping
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    }
  }

  /**
   * Operator acoustic test pulse (0.7s)
   */
  public async testSiren(): Promise<void> {
    if (!this.isArmed()) {
      await this.arm();
    }
    if (!this.ctx) return;

    this.stopActiveAlarm();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(750, now);
    osc.frequency.linearRampToValueAtTime(950, now + 0.35);
    osc.frequency.linearRampToValueAtTime(750, now + 0.7);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.8);
  }

  public acknowledgeAlert(): void {
    this.stopActiveAlarm();
  }

  private stopActiveAlarm(): void {
    try {
      if (this.currentGain && this.ctx) {
        this.currentGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      }
      if (this.currentOscillator) {
        this.currentOscillator.stop();
        this.currentOscillator.disconnect();
      }
      if (this.lfoOsc) {
        this.lfoOsc.stop();
        this.lfoOsc.disconnect();
      }
    } catch (_) {}
    this.currentOscillator = null;
    this.lfoOsc = null;
    this.currentGain = null;
    this.isAlarmActive = false;
  }
}

export const safetyAudio = SafetyAudioService.getInstance();
