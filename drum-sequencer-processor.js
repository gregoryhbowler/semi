// drum-sequencer-processor.js
// Clock-division drum sequencer
// Subdivides incoming step pulses by clockDivision parameter
// Resets to step 0 on reset pulse
//
// INPUTS:
// Input 0: Step clock pulses (from transpose sequencer)
// Input 1: Reset pulses (from transpose sequencer)
//
// OUTPUTS (3 channels):
// Channel 0: Kick trigger
// Channel 1: Snare trigger
// Channel 2: Hi-hat trigger

class DrumSequencerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'swing', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'clockDivision', defaultValue: 4, minValue: 1, maxValue: 16 }
    ];
  }

  constructor() {
    super();
    
    // Clock subdivision state
    this.subdivisionCounter = 0;
    this.clockDivision = 4; // How many drum steps per transpose step
    
    // Pulse detection
    this.prevStepPulse = 0;
    this.prevResetPulse = 0;
    this.pulseThreshold = 0.5;
    
    // Sequencer state
    this.currentStep = 0; // 0-15 (or less if clockDivision < 16)
    this.stepPhase = 0; // Sample counter within current step
    this.steps = 16;
    
    // Swing state
    this.swingAmount = 0; // 0-1
    
    // Pattern arrays (1 = trigger, 0 = silence)
    this.kickPattern = new Array(16).fill(0);
    this.snarePattern = new Array(16).fill(0);
    this.hatPattern = new Array(16).fill(0);
    
    // Message handling
    this.port.onmessage = (event) => {
      const { type } = event.data;
      
      if (type === 'setStep') {
        const { voice, step, value } = event.data;
        if (voice === 'kick') {
          this.kickPattern[step] = value ? 1 : 0;
        } else if (voice === 'snare') {
          this.snarePattern[step] = value ? 1 : 0;
        } else if (voice === 'hat') {
          this.hatPattern[step] = value ? 1 : 0;
        }
      } else if (type === 'clearPattern') {
        const { voice } = event.data;
        if (voice === 'kick' || voice === 'all') {
          this.kickPattern.fill(0);
        }
        if (voice === 'snare' || voice === 'all') {
          this.snarePattern.fill(0);
        }
        if (voice === 'hat' || voice === 'all') {
          this.hatPattern.fill(0);
        }
      }
    };
    
    this.sampleCount = 0;
    this.debugCounter = 0;
    this.debugInterval = sampleRate * 2; // Every 2 seconds
  }

  detectPulse(currentSample, prevSample) {
    // Detect rising edge
    return prevSample < this.pulseThreshold && currentSample >= this.pulseThreshold;
  }

  advanceDrumStep() {
    this.currentStep = (this.currentStep + 1) % 16;
  }

  resetDrumSequence() {
    this.currentStep = 0;
    this.subdivisionCounter = 0;
    console.log('[Drum Seq] Reset to step 0');
  }

  getSwingDelay(step) {
    // Apply swing to every other subdivision
    const subDiv = step % 4;
    
    if (subDiv === 1 || subDiv === 3) {
      // These are the swung notes
      return this.swingAmount * 0.3; // Max 30% delay
    }
    
    return 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 3) return true;
    
    const kickOut = output[0];
    const snareOut = output[1];
    const hatOut = output[2];
    
    // Get inputs
    const stepClockIn = inputs[0] && inputs[0][0] ? inputs[0][0] : null;
    const resetClockIn = inputs[1] && inputs[1][0] ? inputs[1][0] : null;
    
    // Get parameters
    this.swingAmount = parameters.swing[0];
    this.clockDivision = Math.max(1, Math.min(16, Math.round(parameters.clockDivision[0])));
    
    for (let i = 0; i < kickOut.length; i++) {
      this.sampleCount++;
      
      let stepAdvanced = false;
      
      // Detect reset pulse (has priority)
      if (resetClockIn && this.detectPulse(resetClockIn[i], this.prevResetPulse)) {
        this.resetDrumSequence();
        stepAdvanced = true;
        this.prevResetPulse = resetClockIn[i];
      } else {
        if (resetClockIn) this.prevResetPulse = resetClockIn[i];
      }
      
      // Detect step clock pulse
      if (stepClockIn && this.detectPulse(stepClockIn[i], this.prevStepPulse)) {
        this.subdivisionCounter++;
        
        // Advance drum step every clockDivision pulses
        if (this.subdivisionCounter >= this.clockDivision) {
          this.subdivisionCounter = 0;
          this.advanceDrumStep();
          stepAdvanced = true;
        }
        
        this.prevStepPulse = stepClockIn[i];
      } else {
        if (stepClockIn) this.prevStepPulse = stepClockIn[i];
      }
      
      // Trigger on step advance
      if (stepAdvanced) {
        kickOut[i] = this.kickPattern[this.currentStep];
        snareOut[i] = this.snarePattern[this.currentStep];
        hatOut[i] = this.hatPattern[this.currentStep];
      } else {
        kickOut[i] = 0;
        snareOut[i] = 0;
        hatOut[i] = 0;
      }
    }
    
    // Debug logging
    this.debugCounter++;
    if (this.debugCounter >= this.debugInterval) {
      this.debugCounter = 0;
      console.log('[Drum Sequencer]', {
        step: this.currentStep,
        subdivision: `${this.subdivisionCounter}/${this.clockDivision}`,
        swing: this.swingAmount.toFixed(2),
        clockDiv: this.clockDivision
      });
    }
    
    return true;
  }
}

registerProcessor('drum-sequencer-processor', DrumSequencerProcessor);
