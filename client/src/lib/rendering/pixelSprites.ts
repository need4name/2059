export type AnimationState = 'idle' | 'walk' | 'attack' | 'defend' | 'hurt';

export interface SpriteAnimation {
  frames: number;
  frameDuration: number;
}

export const ANIMATIONS: Record<AnimationState, SpriteAnimation> = {
  idle: { frames: 4, frameDuration: 250 },
  walk: { frames: 6, frameDuration: 120 },
  attack: { frames: 5, frameDuration: 150 }, // half again as slow as it was (ATTACK_PACE), so a hit can be followed
  defend: { frames: 3, frameDuration: 150 },
  hurt: { frames: 3, frameDuration: 150 },
};

// Color indices for palette-based rendering

// Animation state manager with random stumble timing for drunkard
export class SpriteAnimator {
  private state: AnimationState = 'idle';
  private frame: number = 0;
  private lastFrameTime: number = 0;
  private onComplete?: () => void;
  private randomSeed: number = Math.floor(Math.random() * 1000);
  private isDrunkard: boolean = false;
  
  // Drunkard-specific: random stumble system
  private nextStumbleTime: number = 0;
  private stumbleIntensity: number = 0; // 0 = none, 1 = small, 2 = medium, 3 = big
  private stumblePhase: number = 0;
  private stumbleStartTime: number = 0;
  
  constructor(isDrunkard: boolean = false) {
    this.isDrunkard = isDrunkard;
    if (isDrunkard) {
      this.scheduleNextStumble();
    }
  }
  
  // Schedule the next random stumble event
  private scheduleNextStumble() {
    // Random interval between 800ms and 3000ms
    const delay = 800 + Math.random() * 2200;
    this.nextStumbleTime = Date.now() + delay;
    // Random intensity for variety
    this.stumbleIntensity = Math.random() < 0.3 ? 3 : (Math.random() < 0.5 ? 2 : 1);
  }
  
  setState(newState: AnimationState, onComplete?: () => void) {
    if (this.state !== newState) {
      this.state = newState;
      this.frame = 0;
      this.lastFrameTime = Date.now();
      this.onComplete = onComplete;
      // New random seed for variation
      this.randomSeed = Math.floor(Math.random() * 1000);
    }
  }
  
  getState(): AnimationState {
    return this.state;
  }
  
  getFrame(): number {
    return this.frame;
  }
  
  getRandomSeed(): number {
    return this.randomSeed;
  }
  
  // Get current stumble offset for drunkard (for use in drawing)
  getStumbleOffset(): { x: number; y: number; rot: number } {
    if (!this.isDrunkard || this.state !== 'idle' || this.stumbleIntensity === 0) {
      return { x: 0, y: 0, rot: 0 };
    }
    
    const now = Date.now();
    const elapsed = now - this.stumbleStartTime;
    const duration = 400 + this.stumbleIntensity * 150; // 550-850ms per stumble
    
    if (elapsed > duration) {
      return { x: 0, y: 0, rot: 0 };
    }
    
    // Stumble animation curve: quick lurch, slow recovery
    const progress = elapsed / duration;
    const curve = Math.sin(progress * Math.PI); // smooth bump
    const wobble = Math.sin(progress * Math.PI * 3) * (1 - progress); // wobble that fades
    
    const intensity = this.stumbleIntensity;
    return {
      x: Math.round(curve * intensity * (this.stumblePhase % 2 === 0 ? 1 : -1) + wobble * 0.5),
      y: Math.round(Math.abs(curve) * intensity * 0.5),
      rot: curve * intensity * 0.05 * (this.stumblePhase % 2 === 0 ? 1 : -1)
    };
  }
  
  update(): void {
    const now = Date.now();
    
    // Drunkard random stumble check
    if (this.isDrunkard && this.state === 'idle') {
      if (now >= this.nextStumbleTime) {
        // Start a new stumble
        this.stumbleStartTime = now;
        this.stumblePhase++;
        this.randomSeed = Math.floor(Math.random() * 1000);
        this.scheduleNextStumble();
      }
    }
    
    const animation = ANIMATIONS[this.state];
    // Drunkard idle is much slower - 1.5 seconds per frame
    const duration = this.isDrunkard && this.state === 'idle' 
      ? 1500 
      : animation.frameDuration;
    
    if (now - this.lastFrameTime >= duration) {
      this.frame++;
      this.lastFrameTime = now;
      
      if (this.frame >= animation.frames) {
        if (this.state === 'attack' || this.state === 'hurt' || this.state === 'defend') {
          this.state = 'idle';
          this.frame = 0;
          this.randomSeed = Math.floor(Math.random() * 1000);
          if (this.onComplete) {
            this.onComplete();
            this.onComplete = undefined;
          }
        } else {
          this.frame = 0;
          // New random seed each idle cycle for variety
          if (this.isDrunkard) {
            this.randomSeed = Math.floor(Math.random() * 1000);
          }
        }
      }
    }
  }
}
