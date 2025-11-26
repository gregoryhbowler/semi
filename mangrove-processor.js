// mangrove-processor.js - FIXED VERSION
// Mangrove Formant Oscillator - AudioWorklet Processor
// Based on Mannequins Mangrove technical specifications
// 
// FIXES:
// 1. Impulse duration now calculated relative to oscillator period (not absolute time)
// 2. FM scaling adjusted for musically rich timbres
// 3. Proper through-zero FM with phase reversal

class MangroveProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Pitch controls
      { name: 'pitchKnob', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'fineKnob', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      
      // FM controls
      { name: 'fmIndex', defaultValue: 1.0, minValue: 0, maxValue: 1 },
      
      // Impulse shaping
      { name: 'barrelKnob', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'formantKnob', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'constantWaveFormant', defaultValue: 0, minValue: 0, maxValue: 1 },
      
      // Dynamics
      { name: 'airKnob', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'airAttenuverter', defaultValue: 0.5, minValue: 0, maxValue: 1 }
    ];
  }

  constructor() {
    super();
    
    // Oscillator core state
    this.phase = 0.0;
    this.frequency = 440.0;
    this.lastSquare = 0;
    
    // Impulse generator state
    this.impulsePhase = 0.0;
    this.impulseActive = false;
    this.impulseRiseTime = 0.5;
    this.impulseFallTime = 0.5;
    this.impulseDuration = 0.0;
    this.impulseValue = -5.0;
    
    this.sampleRate = sampleRate;
    this.sampleTime = 1.0 / this.sampleRate;
  }

  voltToFreq(volt) {
    return 440.0 * Math.pow(2, volt);
  }

  pitchKnobToFreq(knob) {
    const octaves = knob * 6 - 3;
    return 440.0 * Math.pow(2, octaves);
  }

  fineKnobToVolt(knob) {
    return (knob - 0.5) * 1.0;
  }

  generateTriangle(phase) {
    if (phase < 0.5) {
      return -1.0 + (phase * 4.0);
    } else {
      return 3.0 - (phase * 4.0);
    }
  }

  generateSquare(triangle) {
    return triangle >= 0 ? 1.0 : -1.0;
  }

  detectTrigger(currentSquare, lastSquare) {
    return currentSquare > 0 && lastSquare <= 0;
  }

  generateImpulse(impulsePhase, riseTime, fallTime) {
    const totalTime = riseTime + fallTime;
    
    if (impulsePhase < riseTime) {
      const progress = impulsePhase / riseTime;
      return -5.0 + (progress * 10.0);
    } else if (impulsePhase < totalTime) {
      const progress = (impulsePhase - riseTime) / fallTime;
      return 5.0 - (progress * 10.0);
    } else {
      return -5.0;
    }
  }

  waveshape(input, amount) {
    const x = input * (1.0 + amount * 2.0);
    const limited = Math.max(-Math.PI, Math.min(Math.PI, x));
    return Math.sin(limited) * 5.0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const squareOut = output[0];
    const formantOut = output[1];
    
    const pitchCV = inputs[0]?.[0] || new Float32Array(128);
    const fmInput = inputs[1]?.[0] || new Float32Array(128);
    const barrelCV = inputs[2]?.[0] || new Float32Array(128);
    const formantCV = inputs[3]?.[0] || new Float32Array(128);
    const airCV = inputs[4]?.[0] || new Float32Array(128);
    
    if (!squareOut || !formantOut) return true;

    for (let i = 0; i < squareOut.length; i++) {
      // === OSCILLATOR CORE ===
      
      const pitchKnob = parameters.pitchKnob[i] || parameters.pitchKnob[0];
      const fineKnob = parameters.fineKnob[i] || parameters.fineKnob[0];
      const pitchVolt = (pitchCV[i] || 0) * 5.0;
      
      const baseFreq = this.pitchKnobToFreq(pitchKnob);
      const fineVolt = this.fineKnobToVolt(fineKnob);
      const totalVolt = pitchVolt + fineVolt;
      
      this.frequency = baseFreq * Math.pow(2, totalVolt);
      
      // === THROUGH-ZERO FM ===
      // FIX: Proper FM scaling for rich timbres
      const fmIndexParam = parameters.fmIndex[i] || parameters.fmIndex[0];
      const fmSignal = fmInput[i] || 0;
      
      // FM Index: 0 to 8 range (classic FM synthesis range)
      // At index 3-5, we get rich harmonic content
      // At index 6-8, we get complex inharmonic timbres
      const actualFmIndex = fmIndexParam * 8.0;
      
      // Linear FM with through-zero capability
      // Deviation proportional to modulator amplitude × index × carrier freq
      // The 0.5 factor gives musically useful depth
      const fmAmount = fmSignal * actualFmIndex * this.frequency * 0.5;
      const modulatedFreq = this.frequency + fmAmount;
      
      // Advance phase - can go forwards or backwards for through-zero
      const phaseIncrement = modulatedFreq / this.sampleRate;
      this.phase += phaseIncrement;
      
      while (this.phase >= 1.0) this.phase -= 1.0;
      while (this.phase < 0.0) this.phase += 1.0;
      
      const triangle = this.generateTriangle(this.phase);
      const square = this.generateSquare(triangle);
      
      // === IMPULSE GENERATOR ===
      
      const trigger = this.detectTrigger(square, this.lastSquare);
      this.lastSquare = square;
      
      // BARREL control (rise/fall ratio)
      const barrelKnob = parameters.barrelKnob[i] || parameters.barrelKnob[0];
      const barrelCVVal = barrelCV[i] || 0;
      const barrelTotal = Math.max(0, Math.min(1, barrelKnob + (barrelCVVal / 10.0)));
      
      this.impulseRiseTime = 1.0 - barrelTotal;
      this.impulseFallTime = barrelTotal;
      
      // === FIX: FORMANT control (impulse duration RELATIVE TO PERIOD) ===
      const formantKnob = parameters.formantKnob[i] || parameters.formantKnob[0];
      const formantCVVal = formantCV[i] || 0;
      const formantTotal = Math.max(0, Math.min(1, formantKnob + (formantCVVal / 20.0)));
      
      const constantMode = parameters.constantWaveFormant[i] || parameters.constantWaveFormant[0];
      
      // Calculate period of the CORE oscillator (not the modulated freq)
      const period = 1.0 / Math.max(0.1, this.frequency);
      
      // FORMANT sets duration as a multiple of the period
      // formantTotal = 0.0 (CCW): long impulses (10× period) for pitch division
      // formantTotal = 0.5 (noon): impulses match period (1× period)  
      // formantTotal = 1.0 (CW): short impulses (0.1× period) for high-pass effect
      const durationInPeriods = Math.pow(10, 2 * (0.5 - formantTotal)); // 0.1 to 10 periods
      
      if (constantMode < 0.5) {
        // CONSTANT WAVE mode: duration scales with period
        this.impulseDuration = period * durationInPeriods;
      } else {
        // CONSTANT FORMANT mode: duration stays constant (based on 440Hz reference)
        const refPeriod = 1.0 / 440.0;
        this.impulseDuration = refPeriod * durationInPeriods;
      }
      
      // Trigger impulse on rising edge
      if (trigger && !this.impulseActive) {
        this.impulseActive = true;
        this.impulsePhase = 0.0;
      }
      
      // Update impulse generator
      if (this.impulseActive) {
        const riseTime = this.impulseDuration * this.impulseRiseTime;
        const fallTime = this.impulseDuration * this.impulseFallTime;
        
        this.impulseValue = this.generateImpulse(this.impulsePhase, riseTime, fallTime);
        
        this.impulsePhase += this.sampleTime;
        
        if (this.impulsePhase >= (riseTime + fallTime)) {
          this.impulseActive = false;
          this.impulseValue = -5.0;
        }
      }
      
      // === DYNAMICS (AIR) ===
      
      const airKnob = parameters.airKnob[i] || parameters.airKnob[0];
      const airAtten = parameters.airAttenuverter[i] || parameters.airAttenuverter[0];
      const airCVVal = airCV[i] || 0;
      
      const attenAmount = (airAtten - 0.5) * 2.0;
      const airTotal = Math.max(0, Math.min(1, airKnob + (airCVVal * attenAmount / 10.0)));
      
      let vcaOut = this.impulseValue * airTotal;
      
      const shapeAmount = Math.max(0, (airTotal - 0.25) / 0.75);
      const shaped = this.waveshape(vcaOut / 5.0, shapeAmount);
      
      // === OUTPUTS ===
      
      squareOut[i] = square;
      formantOut[i] = shaped / 5.0;
    }
    
    return true;
  }
}

registerProcessor('mangrove-processor', MangroveProcessor);
