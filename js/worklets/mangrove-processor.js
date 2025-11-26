// mangrove-processor.js
// Mangrove Formant Oscillator - AudioWorklet Processor
// Based on Mannequins Mangrove technical specifications

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
      { name: 'constantWaveFormant', defaultValue: 0, minValue: 0, maxValue: 1 }, // 0 = constant wave, 1 = constant formant
      
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
    this.impulseValue = -5.0; // Resting state at -5V
    
    // Sample rate
    this.sampleRate = sampleRate;
    this.sampleTime = 1.0 / this.sampleRate;
  }

  // Convert V/oct to frequency (A4 = 440Hz at 0V, standard Eurorack)
  voltToFreq(volt) {
    // 0V = A4 (440Hz), 1V/oct scaling
    return 440.0 * Math.pow(2, volt);
  }

  // Map pitch knob to frequency range (approx 6 octave range)
  pitchKnobToFreq(knob) {
    // Map 0-1 to roughly 27.5Hz (A0) to 1760Hz (A6)
    const octaves = knob * 6 - 3; // -3 to +3 octaves from A4
    return 440.0 * Math.pow(2, octaves);
  }

  // Map fine knob to voltage offset (-0.5V to +0.5V for one octave range)
  fineKnobToVolt(knob) {
    return (knob - 0.5) * 1.0; // ±0.5V = ±6 semitones
  }

  // Triangle core oscillator
  generateTriangle(phase) {
    // Triangle: -1 to +1
    if (phase < 0.5) {
      return -1.0 + (phase * 4.0);
    } else {
      return 3.0 - (phase * 4.0);
    }
  }

  // Square wave from triangle
  generateSquare(triangle) {
    return triangle >= 0 ? 1.0 : -1.0;
  }

  // Detect rising edge of square wave for impulse triggering
  detectTrigger(currentSquare, lastSquare) {
    return currentSquare > 0 && lastSquare <= 0;
  }

  // Generate impulse (AR envelope)
  generateImpulse(impulsePhase, riseTime, fallTime) {
    const totalTime = riseTime + fallTime;
    
    if (impulsePhase < riseTime) {
      // Rising phase: -5V to +5V
      const progress = impulsePhase / riseTime;
      return -5.0 + (progress * 10.0);
    } else if (impulsePhase < totalTime) {
      // Falling phase: +5V to -5V
      const progress = (impulsePhase - riseTime) / fallTime;
      return 5.0 - (progress * 10.0);
    } else {
      // Resting at -5V
      return -5.0;
    }
  }

  // Waveshaper (sine-shaping overdrive)
  waveshape(input, amount) {
    // amount: 0 = no shaping, 1 = full overdrive
    // Sine-shaping formula with smooth overdrive
    const x = input * (1.0 + amount * 2.0);
    const limited = Math.max(-Math.PI, Math.min(Math.PI, x));
    return Math.sin(limited) * 5.0; // Scale back to ±5V range
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const squareOut = output[0]; // Channel 0: SQUARE output
    const formantOut = output[1]; // Channel 1: FORMANT output
    
    // Get input channels
    const pitchCV = inputs[0]?.[0] || new Float32Array(128);
    const fmInput = inputs[1]?.[0] || new Float32Array(128);
    const barrelCV = inputs[2]?.[0] || new Float32Array(128);
    const formantCV = inputs[3]?.[0] || new Float32Array(128);
    const airCV = inputs[4]?.[0] || new Float32Array(128);
    
    if (!squareOut || !formantOut) return true;

    for (let i = 0; i < squareOut.length; i++) {
      // === OSCILLATOR CORE ===
      
      // Calculate frequency from pitch controls
      const pitchKnob = parameters.pitchKnob[i] || parameters.pitchKnob[0];
      const fineKnob = parameters.fineKnob[i] || parameters.fineKnob[0];
      const pitchVolt = pitchCV[i] || 0;
      
      const baseFreq = this.pitchKnobToFreq(pitchKnob);
      const fineVolt = this.fineKnobToVolt(fineKnob);
      const totalVolt = pitchVolt + fineVolt;
      
      this.frequency = baseFreq * Math.pow(2, totalVolt);
      
      // Apply linear FM
      const fmIndex = parameters.fmIndex[i] || parameters.fmIndex[0];
      const fmSignal = fmInput[i] || 0;
      const fmAmount = fmSignal * fmIndex * 100.0; // Scale FM depth
      const modulatedFreq = Math.max(0.1, this.frequency + fmAmount);
      
      // Advance triangle oscillator phase
      this.phase += (modulatedFreq / this.sampleRate);
      if (this.phase >= 1.0) this.phase -= 1.0;
      
      // Generate triangle and square
      const triangle = this.generateTriangle(this.phase);
      const square = this.generateSquare(triangle);
      
      // === IMPULSE GENERATOR ===
      
      // Detect trigger
      const trigger = this.detectTrigger(square, this.lastSquare);
      this.lastSquare = square;
      
      // BARREL control (rise/fall ratio)
      const barrelKnob = parameters.barrelKnob[i] || parameters.barrelKnob[0];
      const barrelCVVal = barrelCV[i] || 0;
      // BARREL CV is DC-coupled, ±5V sweeps full range when knob at noon
      const barrelTotal = Math.max(0, Math.min(1, barrelKnob + (barrelCVVal / 10.0)));
      
      // Map barrel to rise/fall ratio
      // 0.0 = 100% rise (ramp), 0.5 = 50/50 (triangle), 1.0 = 100% fall (saw)
      // As BARREL increases, rise decreases and fall increases
      this.impulseRiseTime = 1.0 - barrelTotal;
      this.impulseFallTime = barrelTotal;
      
      // FORMANT control (impulse duration)
      const formantKnob = parameters.formantKnob[i] || parameters.formantKnob[0];
      const formantCVVal = formantCV[i] || 0;
      // FORMANT CV depth is reduced: ±5V = 50% sweep
      const formantTotal = Math.max(0, Math.min(1, formantKnob + (formantCVVal / 20.0)));
      
      // constant wave/formant switch
      const constantMode = parameters.constantWaveFormant[i] || parameters.constantWaveFormant[0];
      
      // Calculate base impulse duration
      // FORMANT control: higher values = shorter duration
      const baseDuration = 0.001 + (1.0 - formantTotal) * 0.02; // 1ms to 20ms range
      
      if (constantMode < 0.5) {
        // CONSTANT WAVE mode: duration scales with frequency
        const period = 1.0 / this.frequency;
        this.impulseDuration = baseDuration * (period / 0.00227); // Normalize to ~440Hz
      } else {
        // CONSTANT FORMANT mode: duration stays constant
        this.impulseDuration = baseDuration;
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
        
        // Check if impulse is complete
        if (this.impulsePhase >= (riseTime + fallTime)) {
          this.impulseActive = false;
          this.impulseValue = -5.0; // Return to rest
        }
      }
      
      // === DYNAMICS (AIR) ===
      
      const airKnob = parameters.airKnob[i] || parameters.airKnob[0];
      const airAtten = parameters.airAttenuverter[i] || parameters.airAttenuverter[0];
      const airCVVal = airCV[i] || 0;
      
      // Attenuverter: 0.5 = zero, 0 = -1x, 1 = +1x
      const attenAmount = (airAtten - 0.5) * 2.0;
      const airTotal = Math.max(0, Math.min(1, airKnob + (airCVVal * attenAmount / 10.0)));
      
      // VCA: airTotal controls amplitude (0 = -60dB closed)
      let vcaOut = this.impulseValue * airTotal;
      
      // Waveshaper: higher AIR values add overdrive
      // Starts around 9:00, full at max
      const shapeAmount = Math.max(0, (airTotal - 0.25) / 0.75);
      const shaped = this.waveshape(vcaOut / 5.0, shapeAmount);
      
      // === OUTPUTS ===
      
      squareOut[i] = square * 5.0; // ±5V
      formantOut[i] = shaped; // ±5V with waveshaping
    }
    
    return true;
  }
}

registerProcessor('mangrove-processor', MangroveProcessor);
