// lfo-processor.js
// Multi-waveform LFO AudioWorklet Processor

class LFOProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 1.0, minValue: 0.01, maxValue: 100 }, // Hz
      { name: 'waveform', defaultValue: 0, minValue: 0, maxValue: 8 },
      // 0=sine, 1=square, 2=triangle, 3=S&H, 4=smooth random, 
      // 5=ramp down, 6=ramp up, 7=exp ramp down, 8=exp ramp up
      { name: 'phase', defaultValue: 0, minValue: 0, maxValue: 1 }
    ];
  }

  constructor() {
    super();
    
    this.phase = 0;
    this.lastOutput = 0;
    this.sampleHoldValue = 0;
    this.sampleHoldPhase = 0;
    this.smoothRandomTarget = 0;
    this.smoothRandomCurrent = 0;
    this.smoothRandomPhase = 0;
    
    // For smooth random interpolation
    this.randomSeed = Math.random();
  }

  // Simple random number generator (seeded)
  random() {
    this.randomSeed = (this.randomSeed * 9301 + 49297) % 233280;
    return this.randomSeed / 233280;
  }

  // Waveform generators
  generateSine(phase) {
    return Math.sin(phase * Math.PI * 2);
  }

  generateSquare(phase) {
    return phase < 0.5 ? 1 : -1;
  }

  generateTriangle(phase) {
    return phase < 0.5 
      ? (phase * 4 - 1)
      : (3 - phase * 4);
  }

  generateSampleHold(phase) {
    // Update value at phase wrap
    if (phase < this.sampleHoldPhase) {
      this.sampleHoldValue = this.random() * 2 - 1;
    }
    this.sampleHoldPhase = phase;
    return this.sampleHoldValue;
  }

  generateSmoothRandom(phase) {
    // Update target at phase wrap
    if (phase < this.smoothRandomPhase) {
      this.smoothRandomTarget = this.random() * 2 - 1;
    }
    this.smoothRandomPhase = phase;
    
    // Smooth interpolation
    const smoothing = 0.995;
    this.smoothRandomCurrent = this.smoothRandomCurrent * smoothing + 
                               this.smoothRandomTarget * (1 - smoothing);
    return this.smoothRandomCurrent;
  }

  generateRampDown(phase) {
    return 1 - (phase * 2);
  }

  generateRampUp(phase) {
    return (phase * 2) - 1;
  }

  generateExpRampDown(phase) {
    // Exponential decay from 1 to -1
    const normalized = Math.exp(-phase * 4);
    return normalized * 2 - 1;
  }

  generateExpRampUp(phase) {
    // Exponential rise from -1 to 1
    const normalized = 1 - Math.exp(-phase * 4);
    return normalized * 2 - 1;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];
    const rate = parameters.rate;
    const waveform = parameters.waveform;
    const phaseOffset = parameters.phase;

    for (let i = 0; i < channel.length; i++) {
      const currentRate = rate.length > 1 ? rate[i] : rate[0];
      const currentWaveform = waveform.length > 1 ? waveform[i] : waveform[0];
      const currentPhaseOffset = phaseOffset.length > 1 ? phaseOffset[i] : phaseOffset[0];

      // Update phase
      const increment = currentRate / sampleRate;
      this.phase += increment;
      if (this.phase >= 1.0) {
        this.phase -= 1.0;
      }

      // Apply phase offset
      let adjustedPhase = this.phase + currentPhaseOffset;
      if (adjustedPhase >= 1.0) adjustedPhase -= 1.0;

      // Generate waveform
      let value = 0;
      const waveformIndex = Math.round(currentWaveform);

      switch (waveformIndex) {
        case 0: value = this.generateSine(adjustedPhase); break;
        case 1: value = this.generateSquare(adjustedPhase); break;
        case 2: value = this.generateTriangle(adjustedPhase); break;
        case 3: value = this.generateSampleHold(adjustedPhase); break;
        case 4: value = this.generateSmoothRandom(adjustedPhase); break;
        case 5: value = this.generateRampDown(adjustedPhase); break;
        case 6: value = this.generateRampUp(adjustedPhase); break;
        case 7: value = this.generateExpRampDown(adjustedPhase); break;
        case 8: value = this.generateExpRampUp(adjustedPhase); break;
        default: value = this.generateSine(adjustedPhase);
      }

      channel[i] = value;
      this.lastOutput = value;
    }

    return true;
  }
}

registerProcessor('lfo-processor', LFOProcessor);
