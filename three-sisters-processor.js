// three-sisters-processor.js
// Three Sisters Multi-Mode Filter - EDGE MODE
// Allows chaotic behavior and near-instability, but with safety net to prevent total silence

class ThreeSistersProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'freq', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'span', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'quality', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'fmAttenuverter', defaultValue: 0.5, minValue: 0, maxValue: 1 }
    ];
  }

  constructor() {
    super();
    
    this.sampleRate = sampleRate;
    
    // Initialize 6 SVF filters (2 per block)
    this.lowSVF1 = this.createSVF();
    this.lowSVF2 = this.createSVF();
    this.centreSVF1 = this.createSVF();
    this.centreSVF2 = this.createSVF();
    this.highSVF1 = this.createSVF();
    this.highSVF2 = this.createSVF();
    
    // Debug counters
    this.debugCounter = 0;
    
    console.log('Three Sisters processor initialized - FM: ±3 octaves (musical sweet spot)');
  }

  createSVF() {
    return {
      lp: 0.0,
      bp: 0.0,
      hp: 0.0
    };
  }

  resetSVF(svf) {
    svf.lp = 0.0;
    svf.bp = 0.0;
    svf.hp = 0.0;
  }

  freqKnobToHz(knob) {
    const octaves = (knob - 0.5) * 8; // ±4 octaves from center
    return 500.0 * Math.pow(2, octaves);
  }

  calculateFreqCoeff(cutoffHz) {
    const omega = Math.PI * cutoffHz / this.sampleRate;
    let f = 2.0 * Math.sin(omega);
    
    // Still clamp f coefficient for basic stability
    f = Math.min(1.99, Math.max(0.0001, f));
    
    return f;
  }

  processSVF(svf, input, freqCoeff, q) {
    // MINIMAL input limiting - allow hot signals
    input = Math.max(-50, Math.min(50, input));
    
    // Standard Chamberlin SVF
    svf.hp = input - svf.lp - q * svf.bp;
    svf.bp = svf.bp + freqCoeff * svf.hp;
    svf.lp = svf.lp + freqCoeff * svf.bp;
    
    // REMOVED: tanh() soft clipping - let it get wild!
    
    // Denormal flush (essential for CPU, doesn't affect sound)
    const denormalThreshold = 1e-15;
    if (Math.abs(svf.lp) < denormalThreshold) svf.lp = 0;
    if (Math.abs(svf.bp) < denormalThreshold) svf.bp = 0;
    if (Math.abs(svf.hp) < denormalThreshold) svf.hp = 0;
    
    // SAFETY NET: Detect total failure and recover
    // This is your insurance against permanent silence
    if (!isFinite(svf.lp) || !isFinite(svf.bp) || !isFinite(svf.hp)) {
      this.resetSVF(svf);
      return svf; // Will be silent for one buffer, then recovers
    }
    
    // EMERGENCY BRAKE: If values get absolutely insane (>1000), pull back
    // This lets you get chaotic but prevents total meltdown
    if (Math.abs(svf.lp) > 1000) svf.lp *= 0.5;
    if (Math.abs(svf.bp) > 1000) svf.bp *= 0.5;
    if (Math.abs(svf.hp) > 1000) svf.hp *= 0.5;
    
    return svf;
  }

  processLowBlock(input, cfLow, q, mode, antiResonanceAmount) {
    const freqCoeff = this.calculateFreqCoeff(cfLow);
    
    this.processSVF(this.lowSVF1, input, freqCoeff, q);
    const svf1Out = this.lowSVF1.lp;
    this.processSVF(this.lowSVF2, svf1Out, freqCoeff, q);
    
    let mainOutput;
    let complementaryOutput;
    
    if (mode < 0.5) {
      mainOutput = this.lowSVF2.lp;
      complementaryOutput = this.lowSVF1.hp;
    } else {
      mainOutput = this.lowSVF2.hp;
      complementaryOutput = this.lowSVF1.lp;
    }
    
    const output = mainOutput + complementaryOutput * antiResonanceAmount;
    return output;
  }

  processHighBlock(input, cfHigh, q, mode, antiResonanceAmount) {
    const freqCoeff = this.calculateFreqCoeff(cfHigh);
    
    this.processSVF(this.highSVF1, input, freqCoeff, q);
    const svf1Out = this.highSVF1.hp;
    this.processSVF(this.highSVF2, svf1Out, freqCoeff, q);
    
    let mainOutput;
    let complementaryOutput;
    
    if (mode < 0.5) {
      mainOutput = this.highSVF2.hp;
      complementaryOutput = this.highSVF1.lp;
    } else {
      mainOutput = this.highSVF2.lp;
      complementaryOutput = this.highSVF1.hp;
    }
    
    const output = mainOutput + complementaryOutput * antiResonanceAmount;
    return output;
  }

  processCentreBlock(input, cfLow, cfHigh, cfCentre, q, mode, antiResonanceAmount) {
    if (mode < 0.5) {
      const freqCoeff1 = this.calculateFreqCoeff(cfLow);
      const freqCoeff2 = this.calculateFreqCoeff(cfHigh);
      
      this.processSVF(this.centreSVF1, input, freqCoeff1, q);
      const svf1Out = this.centreSVF1.hp;
      this.processSVF(this.centreSVF2, svf1Out, freqCoeff2, q);
      
      const mainOutput = this.centreSVF2.lp;
      const comp1 = this.centreSVF1.lp;
      const comp2 = this.centreSVF2.hp;
      const complementaryOutput = (comp1 + comp2) * 0.5;
      
      return mainOutput + complementaryOutput * antiResonanceAmount;
      
    } else {
      const freqCoeff = this.calculateFreqCoeff(cfCentre);
      
      this.processSVF(this.centreSVF1, input, freqCoeff, q);
      const svf1Out = this.centreSVF1.hp;
      this.processSVF(this.centreSVF2, svf1Out, freqCoeff, q);
      
      const mainOutput = this.centreSVF2.lp;
      const comp1 = this.centreSVF1.lp;
      const comp2 = this.centreSVF2.hp;
      const complementaryOutput = (comp1 + comp2) * 0.5;
      
      return mainOutput + complementaryOutput * antiResonanceAmount;
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    
    // Debug: Check if FM input bus exists (only log once)
    if (this.debugCounter === 0) {
      console.log(`Three Sisters inputs: ${inputs.length} buses`);
      console.log(`  Input 0 (audio): ${inputs[0] ? inputs[0].length + ' channels' : 'MISSING'}`);
      console.log(`  Input 1 (FM): ${inputs[1] ? inputs[1].length + ' channels' : 'MISSING'}`);
    }
    this.debugCounter++;
    
    // Read audio + FM from a single 2-channel bus (merged in the node)
    const audioIn = inputs[0]?.[0] || new Float32Array(128);
    const fmIn = inputs[0]?.[1] || new Float32Array(128);
    
    const lowOut = output[0];
    const centreOut = output[1];
    const highOut = output[2];
    const allOut = output[3];
    
    if (!lowOut || !centreOut || !highOut || !allOut) return true;
    
    for (let i = 0; i < audioIn.length; i++) {
      const freqKnob = parameters.freq[i] ?? parameters.freq[0];
      const spanKnob = parameters.span[i] ?? parameters.span[0];
      const quality = parameters.quality[i] ?? parameters.quality[0];
      const mode = parameters.mode[i] ?? parameters.mode[0];
      const fmAtten = parameters.fmAttenuverter[i] ?? parameters.fmAttenuverter[0];
      
      const audioSample = audioIn[i];
      const fmSample = fmIn[i];
      
      // === FREQ CALCULATION ===
      let baseFreqHz = this.freqKnobToHz(freqKnob);
      
      // fmAtten: 0.0 = full negative, 0.5 = off, 1.0 = full positive
      const fmAmount = (fmAtten - 0.5) * 2.0; // Range: -1.0 to +1.0
      
      // BALANCED FM: ±3 octaves for musical filter sweeps
      // Sweet spot between audibility and harshness
      // With audio-rate modulation from Mangrove formant output (~±1.0),
      // this creates dramatic but controllable filter movement
      const fmVoltage = fmSample * fmAmount * 3.0;
      const fmMultiplier = Math.pow(2, fmVoltage);
      let modulatedFreq = baseFreqHz * fmMultiplier;
      
      // RELAXED frequency limits - allow Nyquist approach
      const nyquist = this.sampleRate * 0.48; // Right up to the edge
      modulatedFreq = Math.max(5, Math.min(nyquist, modulatedFreq));
      
      // === SPAN CALCULATION ===
      const spanAmount = (spanKnob - 0.5) * 2.0;
      // RESTORED: Full 0.8 span range
      const spanHz = modulatedFreq * Math.abs(spanAmount) * 0.8;
      
      const cfCentre = modulatedFreq;
      const cfLow = Math.max(5, Math.min(nyquist, modulatedFreq - spanHz));
      const cfHigh = Math.max(5, Math.min(nyquist, modulatedFreq + spanHz));
      
      // === QUALITY CALCULATION ===
      let q;
      let antiResonanceAmount = 0;
      
      if (quality < 0.5) {
        q = 1.0 / 0.707;
        antiResonanceAmount = (0.5 - quality) * 2.0;
      } else {
        const resonanceAmount = (quality - 0.5) * 2.0;
        
        // RESTORED: High Q values for edge behavior
        // But with slightly softer curve for more control at the top end
        const minQ = 0.707;
        const maxQ = 25.0; // Sweet spot: allows chaos, recoverable
        const Q = minQ + (maxQ - minQ) * Math.pow(resonanceAmount, 1.8);
        q = 1.0 / Q;
        antiResonanceAmount = 0;
      }
      
      // === PROCESS FILTER BLOCKS ===
      const lowSample = this.processLowBlock(
        audioSample, cfLow, q, mode, antiResonanceAmount
      );
      
      const centreSample = this.processCentreBlock(
        audioSample, cfLow, cfHigh, cfCentre, q, mode, antiResonanceAmount
      );
      
      const highSample = this.processHighBlock(
        audioSample, cfHigh, q, mode, antiResonanceAmount
      );
      
      // === OUTPUT ===
      // RELAXED limiting - allow hot signals but prevent speaker damage
      const safeLow = Math.max(-10, Math.min(10, lowSample));
      const safeCentre = Math.max(-10, Math.min(10, centreSample));
      const safeHigh = Math.max(-10, Math.min(10, highSample));
      
      lowOut[i] = safeLow;
      centreOut[i] = safeCentre;
      highOut[i] = safeHigh;
      
      // ALL output: equal mix
      allOut[i] = (safeLow + safeCentre + safeHigh) / 3.0;
    }
    
    return true;
  }
}

registerProcessor('three-sisters-processor', ThreeSistersProcessor);
