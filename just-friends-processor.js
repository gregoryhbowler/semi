// just-friends-processor.js
// Just Friends Multi-Slope Generator - AudioWorklet Processor
// Based on Mannequins Just Friends technical specifications

class JustFriendsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Master timing
      { name: 'time', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'intone', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      
      // Slope shaping
      { name: 'ramp', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'curve', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      
      // Mode switches
      { name: 'range', defaultValue: 0, minValue: 0, maxValue: 1 }, // 0=shape, 1=sound
      { name: 'mode', defaultValue: 2, minValue: 0, maxValue: 2 }, // 0=transient, 1=sustain, 2=cycle
      
      // FM controls
      { name: 'fmDepth', defaultValue: 0.5, minValue: 0, maxValue: 1 }, // Knob position (noon = no FM)
      { name: 'fmMode', defaultValue: 0.5, minValue: 0, maxValue: 1 } // <0.5=intone style, >0.5=time style
    ];
  }

  constructor() {
    super();
    
    this.sampleRate = sampleRate;
    this.sampleTime = 1.0 / this.sampleRate;
    
    // Initialize 6 slope generators
    this.slopes = Array.from({ length: 6 }, (_, i) => ({
      index: i + 1, // 1-6 for IDENTITY through 6N
      phase: Math.random(), // Random initial phase for cycle mode
      state: 'idle', // 'idle', 'rising', 'falling', 'sustaining'
      lastTriggerState: 0,
      value: 0, // Current output value
      frequency: 1.0, // Hz
      cycleStartTime: 0
    }));
    
    // For trigger detection
    this.lastTriggers = new Array(6).fill(0);
  }

  // Map TIME knob (0-1) to base frequency
  timeKnobToFreq(knob, range) {
    // range: 0=shape (slow), 1=sound (audio)
    if (range < 0.5) {
      // SHAPE range: ~0.01 Hz to ~10 Hz (minutes to milliseconds)
      // Exponential mapping over ~10 octaves
      const octaves = knob * 10 - 5; // -5 to +5 octaves from 1 Hz
      return Math.pow(2, octaves);
    } else {
      // SOUND range: ~20 Hz to ~5000 Hz (audio rate)
      // Map to musical range
      const octaves = knob * 8 - 1; // Roughly C1 to C9
      return 32.7 * Math.pow(2, octaves); // C1 base
    }
  }

  // Apply INTONE to get frequency multiplier for slope N
  getIntoneRatio(index, intoneValue) {
    // intoneValue 0-1, where 0.5 is noon (all equal)
    if (Math.abs(intoneValue - 0.5) < 0.001) {
      return 1.0; // All slopes equal at noon
    }
    
    if (intoneValue > 0.5) {
      // CW from noon: N × base_freq
      const amount = (intoneValue - 0.5) * 2.0; // 0 to 1
      return 1.0 + (index - 1) * amount; // IDENTITY stays 1.0, others scale up
    } else {
      // CCW from noon: 1/N × base_freq
      const amount = (0.5 - intoneValue) * 2.0; // 0 to 1
      return 1.0 / (1.0 + (index - 1) * amount); // IDENTITY stays 1.0, others scale down
    }
  }

  // Detect rising edge trigger (threshold at 1V in Eurorack context, but we use 0 for normalized signals)
  detectTrigger(current, last) {
    // Trigger on crossing from <=0 to >0
    return current > 0.1 && last <= 0.1;
  }

  // Apply RAMP to phase (adjusts rise/fall balance)
  // Returns a value 0-1 representing position in the shaped slope
  applyRamp(phase, ramp, state) {
    // phase: 0-1 over the entire cycle
    // ramp: 0-1 where 0=all rise, 0.5=balanced, 1=all fall
    
    // Calculate rise and fall portions
    // RAMP CCW (0) = instant attack/long release (sawtooth down)
    // RAMP noon (0.5) = equal attack/release (triangle)
    // RAMP CW (1) = long attack/instant release (ramp up)
    
    const riseTime = 1.0 - ramp; // More RAMP = less rise time
    const fallTime = ramp; // More RAMP = more fall time
    
    if (state === 'rising') {
      // We're in the rising portion
      // Map our phase within the rise time
      if (riseTime < 0.001) return 1.0; // Instant rise
      return Math.min(1.0, phase / riseTime);
    } else if (state === 'falling') {
      // We're in the falling portion
      // Phase continues from where rise ended
      if (fallTime < 0.001) return 0.0; // Instant fall
      const fallPhase = (phase - riseTime) / fallTime;
      return Math.max(0.0, 1.0 - fallPhase);
    }
    
    return 0.0;
  }

  // Apply CURVE waveshaping to linear slope value
  applyCurve(linearValue, curve) {
    // linearValue: 0-1
    // curve: 0-1 where 0=square, 0.5=linear, 1=sine
    
    if (Math.abs(curve - 0.5) < 0.001) {
      return linearValue; // Linear at noon
    }
    
    if (curve > 0.5) {
      // CW from noon: exponential → sine
      const amount = (curve - 0.5) * 2.0; // 0 to 1
      
      if (amount > 0.99) {
        // Full sine at maximum CW
        return (Math.sin((linearValue - 0.5) * Math.PI) + 1.0) * 0.5;
      } else {
        // Exponential curve
        // Exponential: slow start, fast finish
        const exp = 1.0 + amount * 3.0; // 1 to 4
        return Math.pow(linearValue, 1.0 / exp);
      }
    } else {
      // CCW from noon: logarithmic → square
      const amount = (0.5 - curve) * 2.0; // 0 to 1
      
      if (amount > 0.99) {
        // Full square at maximum CCW
        return linearValue > 0.5 ? 1.0 : 0.0;
      } else {
        // Logarithmic curve
        // Log: fast start, slow finish
        const exp = 1.0 + amount * 3.0; // 1 to 4
        return Math.pow(linearValue, exp);
      }
    }
  }

  // Update a single slope generator for one sample
  updateSlope(slope, mode, ramp, curve, range) {
    const freq = slope.frequency;
    const period = 1.0 / Math.max(0.001, freq);
    const phaseIncrement = this.sampleTime / period;
    
    // Determine rise and fall times based on RAMP
    const riseTime = 1.0 - ramp;
    const fallTime = ramp;
    
    if (mode === 2) {
      // CYCLE mode: continuous looping
      slope.phase += phaseIncrement;
      if (slope.phase >= 1.0) {
        slope.phase -= 1.0;
      }
      
      // Determine if we're in rise or fall based on phase and RAMP
      if (slope.phase < riseTime) {
        slope.state = 'rising';
      } else {
        slope.state = 'falling';
      }
      
      // Get shaped value
      const rampedValue = this.applyRamp(slope.phase, ramp, slope.state);
      const curvedValue = this.applyCurve(rampedValue, curve);
      
      // Scale to output range
      if (range < 0.5) {
        // SHAPE: 0-8V unipolar
        slope.value = curvedValue * 8.0;
      } else {
        // SOUND: ±5V bipolar
        slope.value = (curvedValue * 2.0 - 1.0) * 5.0;
      }
      
    } else if (mode === 0) {
      // TRANSIENT mode: triggered AR
      if (slope.state === 'rising') {
        slope.phase += phaseIncrement;
        
        if (slope.phase >= riseTime) {
          slope.state = 'falling';
          slope.phase = riseTime; // Clamp to start of fall
        }
        
        const rampedValue = this.applyRamp(slope.phase, ramp, slope.state);
        const curvedValue = this.applyCurve(rampedValue, curve);
        
        if (range < 0.5) {
          slope.value = curvedValue * 8.0;
        } else {
          slope.value = (curvedValue * 2.0 - 1.0) * 5.0;
        }
        
      } else if (slope.state === 'falling') {
        slope.phase += phaseIncrement;
        
        if (slope.phase >= 1.0) {
          slope.state = 'idle';
          slope.phase = 0;
          slope.value = range < 0.5 ? 0.0 : -5.0;
        } else {
          const rampedValue = this.applyRamp(slope.phase, ramp, slope.state);
          const curvedValue = this.applyCurve(rampedValue, curve);
          
          if (range < 0.5) {
            slope.value = curvedValue * 8.0;
          } else {
            slope.value = (curvedValue * 2.0 - 1.0) * 5.0;
          }
        }
      } else {
        // Idle
        slope.value = range < 0.5 ? 0.0 : -5.0;
      }
      
    } else if (mode === 1) {
      // SUSTAIN mode: gated ASR
      if (slope.state === 'rising') {
        slope.phase += phaseIncrement;
        
        const rampedValue = this.applyRamp(slope.phase, ramp, slope.state);
        const curvedValue = this.applyCurve(rampedValue, curve);
        
        if (range < 0.5) {
          slope.value = curvedValue * 8.0;
        } else {
          slope.value = (curvedValue * 2.0 - 1.0) * 5.0;
        }
        
        // Check if we reached sustain level
        if (slope.phase >= riseTime) {
          slope.state = 'sustaining';
          slope.value = range < 0.5 ? 8.0 : 5.0; // Max value
        }
        
      } else if (slope.state === 'sustaining') {
        // Hold at max
        slope.value = range < 0.5 ? 8.0 : 5.0;
        
      } else if (slope.state === 'falling') {
        slope.phase += phaseIncrement;
        
        if (slope.phase >= 1.0) {
          slope.state = 'idle';
          slope.phase = 0;
          slope.value = range < 0.5 ? 0.0 : -5.0;
        } else {
          const rampedValue = this.applyRamp(slope.phase, ramp, slope.state);
          const curvedValue = this.applyCurve(rampedValue, curve);
          
          if (range < 0.5) {
            slope.value = curvedValue * 8.0;
          } else {
            slope.value = (curvedValue * 2.0 - 1.0) * 5.0;
          }
        }
        
      } else {
        // Idle
        slope.value = range < 0.5 ? 0.0 : -5.0;
      }
    }
  }

  // Handle trigger for a slope based on mode
  handleTrigger(slope, mode, gateHigh) {
    if (mode === 2) {
      // CYCLE mode: reset phase
      if (!gateHigh) return; // Only trigger on rising edge
      slope.phase = 0;
      
    } else if (mode === 0) {
      // TRANSIENT mode: start AR if idle
      if (!gateHigh) return; // Only trigger on rising edge
      if (slope.state === 'idle') {
        slope.state = 'rising';
        slope.phase = 0;
      }
      
    } else if (mode === 1) {
      // SUSTAIN mode: gate-sensitive ASR
      if (gateHigh) {
        // Gate went high
        if (slope.state === 'idle' || slope.state === 'falling') {
          slope.state = 'rising';
          if (slope.state === 'idle') {
            slope.phase = 0;
          }
          // If falling, continue from current phase
        }
      } else {
        // Gate went low
        if (slope.state === 'rising' || slope.state === 'sustaining') {
          slope.state = 'falling';
          // Continue phase from current position
        }
      }
    }
  }

  // Calculate MIX output
  calculateMix(range) {
    if (range < 0.5) {
      // SHAPE range: max of (value / index)
      let maxValue = 0;
      for (let i = 0; i < 6; i++) {
        const normalized = this.slopes[i].value / this.slopes[i].index;
        maxValue = Math.max(maxValue, normalized);
      }
      return maxValue;
    } else {
      // SOUND range: equal mix with tanh limiting
      let sum = 0;
      for (let i = 0; i < 6; i++) {
        sum += this.slopes[i].value;
      }
      const avg = sum / 6.0;
      // Tanh limiting to ~15V p-p = ±7.5V
      return Math.tanh(avg / 7.5) * 7.5;
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 7) return true;
    
    // Get input channels for triggers (6 triggers + TIME CV + INTONE CV + RAMP CV + CURVE CV + FM INPUT)
    const triggers = [];
    for (let i = 0; i < 6; i++) {
      triggers[i] = inputs[i]?.[0] || new Float32Array(128);
    }
    const timeCv = inputs[6]?.[0] || new Float32Array(128);
    const intoneCv = inputs[7]?.[0] || new Float32Array(128);
    const rampCv = inputs[8]?.[0] || new Float32Array(128);
    const curveCv = inputs[9]?.[0] || new Float32Array(128);
    const fmInput = inputs[10]?.[0] || new Float32Array(128);
    
    // Output channels: 0-5 = IDENTITY through 6N, 6 = MIX
    const slopeOutputs = output.slice(0, 6);
    const mixOutput = output[6];
    
    for (let sample = 0; sample < 128; sample++) {
      // Get parameters
      const time = parameters.time[sample] ?? parameters.time[0];
      const intone = parameters.intone[sample] ?? parameters.intone[0];
      const ramp = parameters.ramp[sample] ?? parameters.ramp[0];
      const curve = parameters.curve[sample] ?? parameters.curve[0];
      const range = parameters.range[sample] ?? parameters.range[0];
      const mode = Math.round(parameters.mode[sample] ?? parameters.mode[0]);
      const fmDepth = parameters.fmDepth[sample] ?? parameters.fmDepth[0];
      const fmMode = parameters.fmMode[sample] ?? parameters.fmMode[0];
      
      // Apply CV to controls
      const timeCvVal = timeCv[sample] || 0;
      const intoneCvVal = intoneCv[sample] || 0;
      const rampCvVal = rampCv[sample] || 0;
      const curveCvVal = curveCv[sample] || 0;
      const fmVal = fmInput[sample] || 0;
      
      // TIME: exponential v/oct control
      const baseFreq = this.timeKnobToFreq(time, range);
      const freqMultiplier = Math.pow(2, timeCvVal / 10.0); // ±5V = ±0.5V/oct in normalized space
      const adjustedBaseFreq = baseFreq * freqMultiplier;
      
      // INTONE: with CV
      const intoneTotal = Math.max(0, Math.min(1, intone + intoneCvVal / 10.0));
      
      // RAMP: with CV
      const rampTotal = Math.max(0, Math.min(1, ramp + rampCvVal / 10.0));
      
      // CURVE: with CV
      const curveTotal = Math.max(0, Math.min(1, curve + curveCvVal / 10.0));
      
      // Process each slope
      for (let i = 0; i < 6; i++) {
        const slope = this.slopes[i];
        
        // Calculate frequency for this slope
        const intoneRatio = this.getIntoneRatio(slope.index, intoneTotal);
        let slopeFreq = adjustedBaseFreq * intoneRatio;
        
        // Apply FM
        if (Math.abs(fmDepth - 0.5) > 0.01) {
          const fmAmount = (fmDepth - 0.5) * 2.0; // -1 to +1
          
          if (fmDepth > 0.5) {
            // TIME style: equal FM to all slopes
            const fmHz = fmVal * Math.abs(fmAmount) * 100.0;
            slopeFreq += fmHz;
          } else {
            // INTONE style: FM proportional to index
            const fmHz = fmVal * Math.abs(fmAmount) * 100.0 * (slope.index / 6.0);
            slopeFreq += fmHz;
          }
        }
        
        slope.frequency = Math.max(0.001, slopeFreq);
        
        // Handle trigger normalling and detection
        // Each trigger cascades to the left if not patched
        // For simplicity in this implementation, we check each trigger independently
        // In a real system, unplugged jacks would be detected by the Node wrapper
        
        const triggerSignal = triggers[i][sample] || 0;
        const triggerHigh = triggerSignal > 0.1;
        const triggered = this.detectTrigger(triggerSignal, this.lastTriggers[i]);
        this.lastTriggers[i] = triggerSignal;
        
        // Handle trigger based on mode
        if (triggered || (mode === 1 && triggerHigh !== (this.slopes[i].lastTriggerState > 0))) {
          this.handleTrigger(slope, mode, triggerHigh);
        }
        slope.lastTriggerState = triggerHigh ? 1 : 0;
        
        // Update slope
        this.updateSlope(slope, mode, rampTotal, curveTotal, range);
        
        // Write to output
        if (slopeOutputs[i]) {
          slopeOutputs[i][sample] = slope.value / 5.0; // Normalize to ±1 for Web Audio
        }
      }
      
      // Calculate and write MIX output
      if (mixOutput) {
        const mixValue = this.calculateMix(range);
        mixOutput[sample] = mixValue / 5.0; // Normalize to ±1
      }
    }
    
    return true;
  }
}

registerProcessor('just-friends-processor', JustFriendsProcessor);
