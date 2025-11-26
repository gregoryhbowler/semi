// three-sisters-processor.js
// Three Sisters Multi-Mode Filter - AudioWorklet Processor
// Based on Mannequins Three Sisters technical specifications
//
// Architecture: 3 filter blocks (LOW, CENTRE, HIGH)
// Each block contains 2 cascaded state-variable filters (SVFs)
// Supports CROSSOVER and FORMANT modes with audio-rate FM

class ThreeSistersProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Main filter controls
      { name: 'freq', defaultValue: 0.5, minValue: 0, maxValue: 1 },      // Exponential 1V/oct
      { name: 'span', defaultValue: 0.5, minValue: 0, maxValue: 1 },      // Spread LOW/HIGH
      { name: 'quality', defaultValue: 0.5, minValue: 0, maxValue: 1 },   // Resonance control
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 1 },        // 0=crossover, 1=formant
      
      // FM controls
      { name: 'fmDepth', defaultValue: 0, minValue: 0, maxValue: 1 }      // FM amount
    ];
  }

  constructor() {
    super();
    
    this.sampleRate = sampleRate;
    
    // Initialize 6 SVF filters (2 per block)
    // LOW block
    this.lowSVF1 = this.createSVF();
    this.lowSVF2 = this.createSVF();
    
    // CENTRE block
    this.centreSVF1 = this.createSVF();
    this.centreSVF2 = this.createSVF();
    
    // HIGH block
    this.highSVF1 = this.createSVF();
    this.highSVF2 = this.createSVF();
    
    console.log('Three Sisters processor initialized');
  }

  // Create a state-variable filter with LP, BP, HP outputs
  createSVF() {
    return {
      lp: 0.0,  // Lowpass output
      bp: 0.0,  // Bandpass output
      hp: 0.0,  // Highpass output
      ic1eq: 0.0,  // Internal state 1
      ic2eq: 0.0   // Internal state 2
    };
  }

  // Reset SVF state (for clearing artifacts)
  resetSVF(svf) {
    svf.lp = 0.0;
    svf.bp = 0.0;
    svf.hp = 0.0;
    svf.ic1eq = 0.0;
    svf.ic2eq = 0.0;
  }

  // Map FREQ knob (0-1) to cutoff frequency in Hz
  // Exponential mapping with 1V/oct scaling
  freqKnobToHz(knob) {
    // Map 0-1 to roughly 20Hz - 10kHz
    // Center frequency around 500Hz (knob = 0.5)
    const octaves = (knob - 0.5) * 8; // ±4 octaves from center
    return 500.0 * Math.pow(2, octaves);
  }

  // Calculate frequency coefficient for SVF
  // cutoffHz: cutoff frequency in Hz
  calculateFreqCoeff(cutoffHz) {
    // Standard SVF frequency coefficient
    // f = 2 * sin(π * fc / fs)
    const omega = Math.PI * cutoffHz / this.sampleRate;
    let f = 2.0 * Math.sin(omega);
    
    // Clamp for stability (must be < 2.0)
    f = Math.min(1.99, Math.max(0.0001, f));
    
    return f;
  }

  // Calculate resonance from QUALITY parameter
  // quality: 0-1 parameter value
  // Returns Q value for SVF
  calculateResonance(quality) {
    if (quality < 0.5) {
      // CCW from noon: anti-resonance (will be handled separately)
      return 0.5; // Neutral Q
    } else {
      // CW from noon: increase resonance
      const amount = (quality - 0.5) * 2.0; // 0 to 1
      
      // Map to Q: 0.5 (neutral) to 30 (self-oscillation)
      // Exponential curve for musical feel
      const minQ = 0.5;
      const maxQ = 30.0;
      return minQ + (maxQ - minQ) * Math.pow(amount, 2.0);
    }
  }

  // Process one sample through an SVF
  // Returns object with lp, bp, hp outputs
  processSVF(svf, input, freqCoeff, resonance) {
    // Standard SVF algorithm (trapezoidal integration)
    // Based on Hal Chamberlin's design
    
    const q = 1.0 / resonance; // Convert Q to damping
    
    // Calculate highpass
    svf.hp = (input - svf.ic2eq - q * svf.ic1eq) / (1.0 + q * freqCoeff + freqCoeff * freqCoeff);
    
    // Calculate bandpass
    const bp = freqCoeff * svf.hp + svf.ic1eq;
    svf.ic1eq = freqCoeff * svf.hp + bp;
    
    // Calculate lowpass
    const lp = freqCoeff * bp + svf.ic2eq;
    svf.ic2eq = freqCoeff * bp + lp;
    
    // Update outputs
    svf.lp = lp;
    svf.bp = bp;
    svf.hp = svf.hp; // Already calculated above
    
    return svf;
  }

  // Process LOW filter block
  processLowBlock(input, cfLow, resonance, mode, antiResonanceAmount) {
    const freqCoeff = this.calculateFreqCoeff(cfLow);
    
    // First SVF: lowpass
    this.processSVF(this.lowSVF1, input, freqCoeff, resonance);
    
    // Second SVF: feed from first
    const svf1Out = this.lowSVF1.lp;
    this.processSVF(this.lowSVF2, svf1Out, freqCoeff, resonance);
    
    let mainOutput;
    let complementaryOutput;
    
    if (mode < 0.5) {
      // CROSSOVER mode: LP → LP (4-pole lowpass)
      mainOutput = this.lowSVF2.lp;
      complementaryOutput = this.lowSVF1.hp; // Highpass for notch
    } else {
      // FORMANT mode: LP → HP (bandpass)
      mainOutput = this.lowSVF2.hp;
      complementaryOutput = this.lowSVF1.lp; // Inverted for notch
    }
    
    // Mix in complementary output for anti-resonance (CCW quality)
    const output = mainOutput + complementaryOutput * antiResonanceAmount;
    
    return output;
  }

  // Process HIGH filter block
  processHighBlock(input, cfHigh, resonance, mode, antiResonanceAmount) {
    const freqCoeff = this.calculateFreqCoeff(cfHigh);
    
    // First SVF: highpass
    this.processSVF(this.highSVF1, input, freqCoeff, resonance);
    
    // Second SVF: feed from first
    const svf1Out = this.highSVF1.hp;
    this.processSVF(this.highSVF2, svf1Out, freqCoeff, resonance);
    
    let mainOutput;
    let complementaryOutput;
    
    if (mode < 0.5) {
      // CROSSOVER mode: HP → HP (4-pole highpass)
      mainOutput = this.highSVF2.hp;
      complementaryOutput = this.highSVF1.lp; // Lowpass for notch
    } else {
      // FORMANT mode: HP → LP (bandpass)
      mainOutput = this.highSVF2.lp;
      complementaryOutput = this.highSVF1.hp; // Inverted for notch
    }
    
    // Mix in complementary output for anti-resonance
    const output = mainOutput + complementaryOutput * antiResonanceAmount;
    
    return output;
  }

  // Process CENTRE filter block
  processCentreBlock(input, cfLow, cfHigh, cfCentre, resonance, mode, antiResonanceAmount) {
    if (mode < 0.5) {
      // CROSSOVER mode: HP at cfLow → LP at cfHigh
      const freqCoeff1 = this.calculateFreqCoeff(cfLow);
      const freqCoeff2 = this.calculateFreqCoeff(cfHigh);
      
      // First SVF: highpass at LOW cutoff
      this.processSVF(this.centreSVF1, input, freqCoeff1, resonance);
      
      // Second SVF: lowpass at HIGH cutoff
      const svf1Out = this.centreSVF1.hp;
      this.processSVF(this.centreSVF2, svf1Out, freqCoeff2, resonance);
      
      const mainOutput = this.centreSVF2.lp;
      
      // For anti-resonance, mix both complementary outputs
      const comp1 = this.centreSVF1.lp;
      const comp2 = this.centreSVF2.hp;
      const complementaryOutput = (comp1 + comp2) * 0.5;
      
      return mainOutput + complementaryOutput * antiResonanceAmount;
      
    } else {
      // FORMANT mode: HP → LP at cfCentre (bandpass)
      const freqCoeff = this.calculateFreqCoeff(cfCentre);
      
      // First SVF: highpass
      this.processSVF(this.centreSVF1, input, freqCoeff, resonance);
      
      // Second SVF: lowpass
      const svf1Out = this.centreSVF1.hp;
      this.processSVF(this.centreSVF2, svf1Out, freqCoeff, resonance);
      
      const mainOutput = this.centreSVF2.lp;
      
      // For anti-resonance in formant mode
      const comp1 = this.centreSVF1.lp;
      const comp2 = this.centreSVF2.hp;
      const complementaryOutput = (comp1 + comp2) * 0.5;
      
      return mainOutput + complementaryOutput * antiResonanceAmount;
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    // Input channels: [0] = ALL(IN), [1] = FM(IN)
    const audioIn = input[0] || new Float32Array(128);
    const fmIn = input[1] || new Float32Array(128);
    
    // Output channels: [0] = LOW, [1] = CENTRE, [2] = HIGH, [3] = ALL
    const lowOut = output[0];
    const centreOut = output[1];
    const highOut = output[2];
    const allOut = output[3];
    
    if (!lowOut || !centreOut || !highOut || !allOut) return true;
    
    for (let i = 0; i < audioIn.length; i++) {
      // Get parameters
      const freqKnob = parameters.freq[i] ?? parameters.freq[0];
      const spanKnob = parameters.span[i] ?? parameters.span[0];
      const quality = parameters.quality[i] ?? parameters.quality[0];
      const mode = parameters.mode[i] ?? parameters.mode[0];
      const fmDepth = parameters.fmDepth[i] ?? parameters.fmDepth[0];
      
      // Audio input (from Mangrove A)
      const audioSample = audioIn[i] * 5.0; // Denormalize from Web Audio
      
      // FM input (from Mangrove C)
      const fmSample = fmIn[i] * 5.0; // Denormalize
      
      // Calculate base frequency from FREQ knob
      let baseFreqHz = this.freqKnobToHz(freqKnob);
      
      // Apply audio-rate FM
      // FM modulates the cutoff frequency exponentially (1V/oct style)
      const fmAmount = fmSample * fmDepth * 2.0; // Scale FM
      const fmMultiplier = Math.pow(2, fmAmount / 12.0); // Exponential FM
      const modulatedFreq = baseFreqHz * fmMultiplier;
      
      // Calculate cutoff frequencies for each block
      // SPAN spreads LOW and HIGH apart
      const spanAmount = (spanKnob - 0.5) * 2.0; // -1 to +1
      const spanHz = modulatedFreq * spanAmount; // Frequency offset
      
      const cfCentre = modulatedFreq;
      const cfLow = Math.max(20, modulatedFreq - Math.abs(spanHz));
      const cfHigh = Math.min(20000, modulatedFreq + Math.abs(spanHz));
      
      // Calculate resonance and anti-resonance
      const resonance = this.calculateResonance(quality);
      
      let antiResonanceAmount = 0;
      if (quality < 0.5) {
        // CCW from noon: anti-resonance
        antiResonanceAmount = (0.5 - quality) * 2.0; // 0 to 1
      }
      
      // Process each filter block
      const lowSample = this.processLowBlock(
        audioSample, cfLow, resonance, mode, antiResonanceAmount
      );
      
      const centreSample = this.processCentreBlock(
        audioSample, cfLow, cfHigh, cfCentre, resonance, mode, antiResonanceAmount
      );
      
      const highSample = this.processHighBlock(
        audioSample, cfHigh, resonance, mode, antiResonanceAmount
      );
      
      // Output to channels (normalize back to Web Audio range)
      lowOut[i] = lowSample / 5.0;
      centreOut[i] = centreSample / 5.0;
      highOut[i] = highSample / 5.0;
      
      // ALL output: equal mix of three
      const mixSample = (lowSample + centreSample + highSample) / 3.0;
      allOut[i] = mixSample / 5.0;
    }
    
    return true;
  }
}

registerProcessor('three-sisters-processor', ThreeSistersProcessor);
