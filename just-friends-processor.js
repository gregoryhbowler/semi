// just-friends-processor.js
// Just Friends - 6-channel slope generator
// Faithful implementation of the Mannequins Just Friends module

class JustFriendsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'time', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'intone', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'ramp', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'curve', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'range', defaultValue: 0, minValue: 0, maxValue: 1 },    // 0=shape, 1=sound
      { name: 'mode', defaultValue: 2, minValue: 0, maxValue: 2 },     // 0=transient, 1=sustain, 2=cycle
      { name: 'fmDepth', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'fmMode', defaultValue: 0.5, minValue: 0, maxValue: 1 }
    ];
  }

  constructor() {
    super();
    
    // 6 slope generators: IDENTITY, 2N, 3N, 4N, 5N, 6N
    // Using 1-based indexing to match the module (index 1 = IDENTITY)
    this.slopes = Array.from({ length: 6 }, (_, i) => ({
      index: i + 1,  // 1-6 (IDENTITY is 1)
      phase: 0,
      value: 0,
      active: false,
      rising: true,
      prevTrigger: false
    }));
    
    this.sampleRate = sampleRate;
    this.debugCounter = 0;
    this.debugInterval = this.sampleRate * 2; // Every 2 seconds
  }

  // Calculate speed ratio based on INTONE and slope index
  // index: 1=IDENTITY, 2-6=other slopes
  // intone: 0=undertones, 0.5=unison, 1=overtones
  calculateIntoneRatio(index, intone) {
    if (index === 1) {
      return 1.0; // IDENTITY is always unaffected by INTONE
    }
    
    // Map intone from 0-1 to -1 to +1 range
    // 0.0 → -1 (undertone series: 1/N)
    // 0.5 → 0 (unison: all same speed)
    // 1.0 → +1 (overtone series: N×)
    const intoneAmount = (intone - 0.5) * 2.0;
    
    if (intoneAmount >= 0) {
      // Overtones: linear interpolation from 1× to N×
      // At intone=1.0: slope 2 → 2×, slope 3 → 3×, etc.
      return 1.0 + intoneAmount * (index - 1);
    } else {
      // Undertones: linear interpolation from 1× to 1/N×
      // At intone=0.0: slope 2 → 0.5×, slope 3 → 0.333×, etc.
      const undertoneAmount = -intoneAmount;
      return 1.0 / (1.0 + undertoneAmount * (index - 1));
    }
  }

  // Calculate actual speed for a slope
  calculateSpeed(baseTime, index, intone, range) {
    // Get the ratio based on INTONE
    const ratio = this.calculateIntoneRatio(index, intone);
    
    // Base frequency/speed from TIME knob
    // In SHAPE range: ~10 minutes to ~1ms (0.00167 Hz to 1000 Hz)
    // In SOUND range: ~10ms to ~0.1ms (100 Hz to 10kHz)
    let baseFreq;
    
    if (range < 0.5) {
      // SHAPE range: exponential mapping for CV-rate modulation
      // baseTime 0 → 0.00167 Hz (600 seconds)
      // baseTime 1 → 1000 Hz (1ms)
      baseFreq = 0.00167 * Math.pow(1000 / 0.00167, baseTime);
    } else {
      // SOUND range: exponential mapping for audio-rate
      // baseTime 0 → 20 Hz
      // baseTime 1 → 10000 Hz
      baseFreq = 20 * Math.pow(500, baseTime);
    }
    
    // Apply INTONE ratio
    const finalFreq = baseFreq * ratio;
    
    // Convert to phase increment per sample
    return finalFreq / this.sampleRate;
  }

  // Apply RAMP to get rise/fall balance
  // ramp: 0=instant rise/long fall, 0.5=triangle, 1=long rise/instant fall
  getRiseFallBalance(ramp) {
    // RAMP sets the proportion of the cycle spent rising vs falling
    // At 0: rise = 0.01, fall = 0.99 (sawtooth down)
    // At 0.5: rise = 0.5, fall = 0.5 (triangle)
    // At 1: rise = 0.99, fall = 0.01 (sawtooth up)
    const riseTime = 0.01 + ramp * 0.98;
    const fallTime = 1.0 - riseTime;
    
    return { riseTime, fallTime };
  }

  // Apply CURVE waveshaping
  // phase: 0-1 linear input
  // curve: 0=rectangular, 0.5=linear, 1=sine
  applyCurve(phase, curve) {
    if (curve < 0.5) {
      // Logarithmic curves (CCW from noon)
      // At curve=0: rectangular (instant transitions)
      const sharpness = (0.5 - curve) * 2.0; // 0 to 1
      
      if (sharpness > 0.99) {
        // Fully rectangular
        return phase > 0.001 ? 1.0 : 0.0;
      }
      
      // Logarithmic curve
      const log = Math.pow(phase, 1.0 - sharpness * 0.9);
      return log;
      
    } else {
      // Exponential curves (CW from noon)
      // At curve=1.0: sinusoidal
      const smoothness = (curve - 0.5) * 2.0; // 0 to 1
      
      if (smoothness > 0.99) {
        // Fully sinusoidal
        return (Math.sin((phase - 0.5) * Math.PI * 2) + 1) / 2;
      }
      
      // Exponential curve
      const exp = Math.pow(phase, 1.0 + smoothness * 2.0);
      return exp;
    }
  }

  // Process a single slope generator
  processSlope(slope, speed, ramp, curve, mode, triggerIn, gateIn) {
    const { riseTime, fallTime } = this.getRiseFallBalance(ramp);
    
    // Mode-specific behavior
    if (mode === 0) {
      // TRANSIENT: Triggered AR envelopes
      const trigger = triggerIn > 0.5;
      const triggerRise = trigger && !slope.prevTrigger;
      slope.prevTrigger = trigger;
      
      if (triggerRise && !slope.active) {
        slope.active = true;
        slope.rising = true;
        slope.phase = 0;
      }
      
      if (slope.active) {
        if (slope.rising) {
          slope.phase += speed / riseTime;
          if (slope.phase >= 1.0) {
            slope.phase = 1.0;
            slope.rising = false;
          }
        } else {
          slope.phase -= speed / fallTime;
          if (slope.phase <= 0) {
            slope.phase = 0;
            slope.active = false;
          }
        }
      }
      
    } else if (mode === 1) {
      // SUSTAIN: Gated ASR envelopes
      const gate = gateIn > 0.5;
      
      if (gate) {
        if (!slope.active) {
          slope.active = true;
          slope.rising = true;
        }
        if (slope.rising) {
          slope.phase += speed / riseTime;
          if (slope.phase >= 1.0) {
            slope.phase = 1.0;
            // Stay at max while gate is high
          }
        }
      } else {
        if (slope.active) {
          slope.rising = false;
          slope.phase -= speed / fallTime;
          if (slope.phase <= 0) {
            slope.phase = 0;
            slope.active = false;
          }
        }
      }
      
    } else {
      // CYCLE: Free-running oscillators
      const trigger = triggerIn > 0.5;
      const triggerRise = trigger && !slope.prevTrigger;
      slope.prevTrigger = trigger;
      
      // Trigger resets phase (hard sync)
      if (triggerRise) {
        slope.phase = 0;
        slope.rising = true;
      }
      
      // Always active in cycle mode
      slope.active = true;
      
      if (slope.rising) {
        slope.phase += speed / riseTime;
        if (slope.phase >= 1.0) {
          slope.phase = 1.0;
          slope.rising = false;
        }
      } else {
        slope.phase -= speed / fallTime;
        if (slope.phase <= 0) {
          slope.phase = 0;
          slope.rising = true;
        }
      }
    }
    
    // Apply curve waveshaping to the phase
    const shapedValue = this.applyCurve(Math.max(0, Math.min(1, slope.phase)), curve);
    
    slope.value = shapedValue;
    
    return slope.value;
  }

  // Calculate MIX output based on range
  calculateMix(range) {
    if (range < 0.5) {
      // SHAPE range: analog MAX (OR) with index division
      // Each slope divided by its index, then take the max
      let maxValue = 0;
      for (let i = 0; i < 6; i++) {
        const dividedValue = this.slopes[i].value / this.slopes[i].index;
        maxValue = Math.max(maxValue, dividedValue);
      }
      return maxValue;
      
    } else {
      // SOUND range: equal sum with soft limiting
      let sum = 0;
      for (let i = 0; i < 6; i++) {
        sum += this.slopes[i].value;
      }
      
      // Average and apply tanh soft limiting
      const avg = sum / 6;
      return Math.tanh(avg * 1.5); // Soft limit to prevent clipping
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length < 7) return true;
    
    // Get parameters
    const time = parameters.time[0];
    const intone = parameters.intone[0];
    const ramp = parameters.ramp[0];
    const curve = parameters.curve[0];
    const range = parameters.range[0];
    const mode = Math.round(parameters.mode[0]);
    
    // Input channels: 6 triggers + 4 CV inputs + FM
    const triggers = inputs[0] || [];
    
    // Process each sample
    for (let sample = 0; sample < 128; sample++) {
      // Calculate speeds for each slope based on TIME and INTONE
      const speeds = this.slopes.map(slope => 
        this.calculateSpeed(time, slope.index, intone, range)
      );
      
      // Process each slope
      for (let i = 0; i < 6; i++) {
        const triggerIn = triggers[i] ? triggers[i][sample] || 0 : 0;
        const gateIn = triggerIn; // Same for now
        
        const value = this.processSlope(
          this.slopes[i],
          speeds[i],
          ramp,
          curve,
          mode,
          triggerIn,
          gateIn
        );
        
        // Scale output based on range
        if (range < 0.5) {
          // SHAPE range: 0-8V → 0-1.6 in Web Audio
          output[i][sample] = value * 1.6;
        } else {
          // SOUND range: -5V to +5V → -1 to +1 in Web Audio
          output[i][sample] = (value * 2.0) - 1.0;
        }
      }
      
      // Calculate MIX output
      const mixValue = this.calculateMix(range);
      
      if (range < 0.5) {
        // SHAPE range: 0-8V
        output[6][sample] = mixValue * 1.6;
      } else {
        // SOUND range: bipolar
        output[6][sample] = (mixValue * 2.0) - 1.0;
      }
    }
    
    // Debug logging
    this.debugCounter++;
    if (this.debugCounter >= this.debugInterval) {
      this.debugCounter = 0;
      
      const intoneRatios = this.slopes.map(s => 
        this.calculateIntoneRatio(s.index, intone).toFixed(3)
      );
      
      console.log('[Just Friends Debug]', {
        time: time.toFixed(3),
        intone: intone.toFixed(3),
        ramp: ramp.toFixed(3),
        curve: curve.toFixed(3),
        range: range < 0.5 ? 'SHAPE' : 'SOUND',
        mode: ['TRANSIENT', 'SUSTAIN', 'CYCLE'][mode],
        ratios: intoneRatios.join(', '),
        identitySpeed: this.calculateSpeed(time, 1, intone, range).toFixed(6),
        values: this.slopes.map(s => s.value.toFixed(3)).join(', ')
      });
    }
    
    return true;
  }
}

registerProcessor('just-friends-processor', JustFriendsProcessor);
