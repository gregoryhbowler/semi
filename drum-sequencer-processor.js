// drum-sequencer-processor.js
// Generative 16-step drum sequencer with clock multiplier
// Clocked from external source (JF or René), subdivides to 16th notes

class DrumSequencerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'swing', defaultValue: 0, minValue: 0, maxValue: 1 }
    ];
  }

  constructor() {
    super();
    
    // Clock state
    this.prevClockSample = 0;
    this.clockThreshold = 0.1;
    this.lastClockTime = 0; // Sample count of last clock edge
    this.clockInterval = 0; // Measured interval between clocks
    this.stepSize = 11025; // Samples per 16th note (default 120 BPM)
    
    // Sequencer state
    this.currentStep = 0; // 0-15
    this.stepPhase = 0; // Sample counter within current step
    this.steps = 16;
    
    // Swing state
    this.swingAmount = 0; // 0-1
    
    // Pattern arrays (1 = trigger, 0 = silence)
    this.kickPattern = new Array(16).fill(0);
    this.snarePattern = new Array(16).fill(0);
    this.hatPattern = new Array(16).fill(0);
    
    // Groove mask (controls which 16th subdivisions play)
    // Index: 0=downbeat, 1=e, 2=&, 3=a
    this.grooveMask = [1, 0, 1, 1]; // Default: mute the 'e'
    
    // Initialize patterns
    this.generatePattern();
    
    // Message handling
    this.port.onmessage = (event) => {
      const { type } = event.data;
      
      if (type === 'randomizePattern') {
        this.generatePattern();
      } else if (type === 'randomizeGroove') {
        this.generateGroove();
      } else if (type === 'randomizeKickPattern') {
        this.generateKickPattern();
      } else if (type === 'randomizeSnarePattern') {
        this.generateSnarePattern();
      } else if (type === 'randomizeHatPattern') {
        this.generateHatPattern();
      }
    };
    
    this.sampleCount = 0;
  }

  generatePattern() {
    this.generateKickPattern();
    this.generateSnarePattern();
    this.generateHatPattern();
  }

  generateKickPattern() {
    for (let i = 0; i < 16; i++) {
      // Bias kick towards downbeats (0, 4, 8, 12)
      const kickProb = (i % 4 === 0) ? 0.8 : 0.3;
      this.kickPattern[i] = Math.random() < kickProb ? 1 : 0;
    }
  }

  generateSnarePattern() {
    for (let i = 0; i < 16; i++) {
      // Bias snare towards backbeats (4, 12)
      const snareProb = (i % 8 === 4) ? 0.9 : 0.2;
      this.snarePattern[i] = Math.random() < snareProb ? 1 : 0;
    }
  }

  generateHatPattern() {
    for (let i = 0; i < 16; i++) {
      // Hi-hats: favor off-beats and 16th notes
      // Even steps get higher probability
      const hatProb = (i % 2 === 0) ? 0.7 : 0.5;
      this.hatPattern[i] = Math.random() < hatProb ? 1 : 0;
    }
  }

  generateGroove() {
    // Randomize the groove mask
    // Always keep downbeat (index 0) allowed
    this.grooveMask = [
      1, 
      Math.random() > 0.5 ? 1 : 0, 
      Math.random() > 0.5 ? 1 : 0, 
      Math.random() > 0.5 ? 1 : 0
    ];
  }

  detectClock(currentSample) {
    // Detect rising edge
    const crossed = this.prevClockSample < this.clockThreshold && 
                   currentSample >= this.clockThreshold;
    this.prevClockSample = currentSample;
    return crossed;
  }

  updateClockInterval() {
    const now = this.sampleCount;
    
    if (this.lastClockTime > 0) {
      this.clockInterval = now - this.lastClockTime;
      
      // Subdivide into 16th notes (4 per quarter note clock)
      this.stepSize = this.clockInterval / 4;
      
      // Clamp to reasonable values (30-300 BPM equivalent)
      this.stepSize = Math.max(2756, Math.min(44100, this.stepSize));
    }
    
    this.lastClockTime = now;
  }

  getSwingDelay(step) {
    // Apply swing to every other 16th note (the "e" and "a" of each beat)
    // step % 4: 0=downbeat, 1=e, 2=&, 3=a
    const subDiv = step % 4;
    
    if (subDiv === 1 || subDiv === 3) {
      // These are the swung notes
      return this.stepSize * this.swingAmount * 0.3; // Max 30% delay
    }
    
    return 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 3) return true;
    
    const kickOut = output[0];
    const snareOut = output[1];
    const hatOut = output[2];
    
    // Get clock input
    const input = inputs[0];
    const clockIn = input && input[0] ? input[0] : null;
    
    // Get swing parameter
    this.swingAmount = parameters.swing[0];
    
    for (let i = 0; i < kickOut.length; i++) {
      this.sampleCount++;
      
      // Detect clock edges and update interval
      if (clockIn && this.detectClock(clockIn[i])) {
        this.updateClockInterval();
      }
      
      // Calculate swing delay for current step
      const swingDelay = this.getSwingDelay(this.currentStep);
      const effectiveStepSize = this.stepSize + swingDelay;
      
      // Advance step phase
      this.stepPhase++;
      
      // Check if we should advance to next step
      if (this.stepPhase >= effectiveStepSize) {
        this.stepPhase = 0;
        this.currentStep = (this.currentStep + 1) % 16;
      }
      
      // Trigger on first sample of step
      if (this.stepPhase === 0) {
        // Check groove mask
        const subDiv = this.currentStep % 4;
        const isAllowed = this.grooveMask[subDiv];
        
        if (isAllowed) {
          kickOut[i] = this.kickPattern[this.currentStep];
          snareOut[i] = this.snarePattern[this.currentStep];
          hatOut[i] = this.hatPattern[this.currentStep];
        } else {
          kickOut[i] = 0;
          snareOut[i] = 0;
          hatOut[i] = 0;
        }
      } else {
        kickOut[i] = 0;
        snareOut[i] = 0;
        hatOut[i] = 0;
      }
    }
    
    return true;
  }
}

registerProcessor('drum-sequencer-processor', DrumSequencerProcessor);
