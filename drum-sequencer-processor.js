// drum-sequencer-processor.js
// 16-step drum sequencer with programmable patterns
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
    this.lastClockTime = 0;
    this.clockInterval = 0;
    this.stepSize = 11025; // Samples per 16th note (default 120 BPM)
    
    // Sequencer state
    this.currentStep = 0; // 0-15
    this.stepPhase = 0;
    this.steps = 16;
    
    // Swing state
    this.swingAmount = 0;
    
    // Pattern arrays - START BLANK
    this.kickPattern = new Array(16).fill(0);
    this.snarePattern = new Array(16).fill(0);
    this.hatPattern = new Array(16).fill(0);
    
    // Message handling for setting steps
    this.port.onmessage = (event) => {
      const { type, voice, step, value } = event.data;
      
      if (type === 'setStep') {
        if (voice === 'kick' && step >= 0 && step < 16) {
          this.kickPattern[step] = value ? 1 : 0;
        } else if (voice === 'snare' && step >= 0 && step < 16) {
          this.snarePattern[step] = value ? 1 : 0;
        } else if (voice === 'hat' && step >= 0 && step < 16) {
          this.hatPattern[step] = value ? 1 : 0;
        }
      } else if (type === 'clearPattern') {
        if (voice === 'kick') {
          this.kickPattern.fill(0);
        } else if (voice === 'snare') {
          this.snarePattern.fill(0);
        } else if (voice === 'hat') {
          this.hatPattern.fill(0);
        } else if (voice === 'all') {
          this.kickPattern.fill(0);
          this.snarePattern.fill(0);
          this.hatPattern.fill(0);
        }
      }
    };
    
    this.sampleCount = 0;
  }

  detectClock(currentSample) {
    const crossed = this.prevClockSample < this.clockThreshold && 
                   currentSample >= this.clockThreshold;
    this.prevClockSample = currentSample;
    return crossed;
  }

  updateClockInterval() {
    const now = this.sampleCount;
    
    if (this.lastClockTime > 0) {
      this.clockInterval = now - this.lastClockTime;
      this.stepSize = this.clockInterval / 4;
      this.stepSize = Math.max(2756, Math.min(44100, this.stepSize));
    }
    
    this.lastClockTime = now;
  }

  getSwingDelay(step) {
    const subDiv = step % 4;
    
    if (subDiv === 1 || subDiv === 3) {
      return this.stepSize * this.swingAmount * 0.3;
    }
    
    return 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 3) return true;
    
    const kickOut = output[0];
    const snareOut = output[1];
    const hatOut = output[2];
    
    const input = inputs[0];
    const clockIn = input && input[0] ? input[0] : null;
    
    this.swingAmount = parameters.swing[0];
    
    for (let i = 0; i < kickOut.length; i++) {
      this.sampleCount++;
      
      if (clockIn && this.detectClock(clockIn[i])) {
        this.updateClockInterval();
      }
      
      const swingDelay = this.getSwingDelay(this.currentStep);
      const effectiveStepSize = this.stepSize + swingDelay;
      
      this.stepPhase++;
      
      if (this.stepPhase >= effectiveStepSize) {
        this.stepPhase = 0;
        this.currentStep = (this.currentStep + 1) % 16;
      }
      
      // Trigger on first sample of step
      if (this.stepPhase === 0) {
        kickOut[i] = this.kickPattern[this.currentStep];
        snareOut[i] = this.snarePattern[this.currentStep];
        hatOut[i] = this.hatPattern[this.currentStep];
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
