// drum-sequencer-processor.js
class DrumSequencerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'swing', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'clockDivision', defaultValue: 4, minValue: 1, maxValue: 16 }
    ];
  }

  constructor() {
    super();
    
    // Pulse detection
    this.prevStepPulse = 0;
    this.prevResetPulse = 0;
    this.pulseThreshold = 0.5;
    
    // Timing state
    this.samplesSinceLastPulse = 0;
    this.samplesPerDrumStep = 0;
    this.nextStepAt = 0;
    
    // Sequencer state
    this.currentStep = 0;
    this.steps = 16;
    this.clockDivision = 4;
    
    // Swing state
    this.swingAmount = 0;
    
    // Pattern arrays
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
    this.debugInterval = sampleRate * 2;
  }

  detectPulse(currentSample, prevSample) {
    return prevSample < this.pulseThreshold && currentSample >= this.pulseThreshold;
  }

  advanceDrumStep() {
    this.currentStep = (this.currentStep + 1) % 16;
  }

  resetDrumSequence() {
    this.currentStep = 0;
    this.samplesSinceLastPulse = 0;
    this.nextStepAt = 0;
    console.log('[Drum Seq] Reset to step 0');
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
    const newDivision = Math.max(1, Math.min(16, Math.round(parameters.clockDivision[0])));
    
    for (let i = 0; i < kickOut.length; i++) {
      this.sampleCount++;
      this.samplesSinceLastPulse++;
      
      let shouldTrigger = false;
      
      // Detect reset pulse (has priority)
      if (resetClockIn && this.detectPulse(resetClockIn[i], this.prevResetPulse)) {
        this.resetDrumSequence();
        shouldTrigger = true;
        this.prevResetPulse = resetClockIn[i];
      } else {
        if (resetClockIn) this.prevResetPulse = resetClockIn[i];
      }
      
      // Detect step clock pulse from transpose sequencer
      if (stepClockIn && this.detectPulse(stepClockIn[i], this.prevStepPulse)) {
        // Calculate how many samples should elapse per drum step
        // Higher clockDivision = more drum steps per input pulse = faster drums
        if (this.samplesSinceLastPulse > 0) {
          this.samplesPerDrumStep = this.samplesSinceLastPulse / newDivision;
        }
        
        this.clockDivision = newDivision;
        this.samplesSinceLastPulse = 0;
        this.nextStepAt = this.samplesPerDrumStep;
        
        // Trigger immediately on the pulse
        shouldTrigger = true;
        this.advanceDrumStep();
        
        this.prevStepPulse = stepClockIn[i];
      } else {
        if (stepClockIn) this.prevStepPulse = stepClockIn[i];
      }
      
      // Check if it's time for the next internal subdivision
      if (!shouldTrigger && this.samplesPerDrumStep > 0 && 
          this.samplesSinceLastPulse >= this.nextStepAt) {
        shouldTrigger = true;
        this.advanceDrumStep();
        this.nextStepAt += this.samplesPerDrumStep;
      }
      
      // Output triggers
      if (shouldTrigger) {
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
        division: this.clockDivision,
        samplesPerStep: this.samplesPerDrumStep.toFixed(1),
        effectiveBPM: this.samplesPerDrumStep > 0 ? ((sampleRate * 60) / (this.samplesPerDrumStep * 16)).toFixed(1) : 'N/A'
      });
    }
    
    return true;
  }
}

registerProcessor('drum-sequencer-processor', DrumSequencerProcessor);
