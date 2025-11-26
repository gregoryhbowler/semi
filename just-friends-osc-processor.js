/**
 * just-friends-osc-processor.js
 * 
 * AudioWorkletProcessor implementing a Just Friends-inspired multi-output oscillator.
 * Full implementation of all modes based on the Mannequins Just Friends technical map.
 * 
 * MODES:
 *   - CYCLE (2): Free-running oscillators/LFOs with phase reset via triggers
 *   - TRANSIENT (0): Triggered AR envelopes / Impulse-train VCOs
 *   - SUSTAIN (1): Gated ASR envelopes / Trapezoid VCOs
 * 
 * RANGES:
 *   - SHAPE (0): Control-rate (minutes to ms), unipolar 0-8V, scaled-max MIX
 *   - SOUND (1): Audio-rate (Hz to kHz), bipolar ±5V, summed MIX
 * 
 * RUN MODES (activated when RUN input is connected):
 *   - SHIFT (transient/shape): Retrigger point control
 *   - STRATA (sustain/shape): ARSR envelopes, slew limiting
 *   - VOLLEY (cycle/shape): Envelope bursts
 *   - SPILL (transient/sound): Self-clocked impulse-trains, sync chaos
 *   - PLUME (sustain/sound): LPG-processed VCOs
 *   - FLOOM (cycle/sound): 2-operator FM synthesis
 * 
 * Channel Layout:
 *   Input (11 channels):
 *     - ch0: TIME CV (1V/oct)
 *     - ch1: FM input
 *     - ch2: INTONE CV
 *     - ch3: RUN CV
 *     - ch4: RAMP CV
 *     - ch5-10: TRIGGER inputs (IDENTITY through 6N)
 *   
 *   Output (7 channels):
 *     - ch0-5: IDENTITY through 6N
 *     - ch6: MIX
 */

class JustFriendsProcessor extends AudioWorkletProcessor {
  
  static get parameterDescriptors() {
    return [
      { name: 'time', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'intone', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'ramp', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'curve', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'range', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mode', defaultValue: 2, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
      { name: 'run', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
      { name: 'fmIndex', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
      { name: 'runEnabled', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super();
    
    this.NUM_OSCILLATORS = 6;
    
    // Phase accumulators (0 to 1)
    this.phases = new Float32Array(6);
    
    // Slope state machines
    // States: 0=IDLE, 1=RISING, 2=SUSTAINING, 3=FALLING
    this.states = new Uint8Array(6);
    
    // Current output values for each slope (before waveshaping)
    this.slopeValues = new Float32Array(6);
    
    // Gate states (for detecting edges)
    this.gateStates = new Uint8Array(6); // 0=low, 1=high
    this.prevGateInputs = new Float32Array(6);
    
    // For VOLLEY mode: burst counters
    this.burstCounters = new Int32Array(6);
    
    // For PLUME mode: LPG envelope values
    this.lpgEnvelopes = new Float32Array(6);
    this.lpgGateStates = new Uint8Array(6);
    
    // For FLOOM mode: internal modulator phases
    this.modPhases = new Float32Array(6);
    
    // For SPILL mode: IDENTITY's EOC triggers others
    this.identityEOC = false;
    
    // Frequency range constants
    this.SOUND_BASE_FREQ = 261.63; // C4
    this.SOUND_OCTAVE_RANGE = 7;
    this.SHAPE_BASE_FREQ = 0.5; // Hz - LFO territory
    this.SHAPE_OCTAVE_RANGE = 10;
    
    // Voltage range for TIME
    this.TIME_CV_MIN = -2;
    this.TIME_CV_MAX = 5;
    
    // Trigger threshold (normalized, ~1V = 0.1 in ±5V range)
    this.TRIGGER_THRESHOLD = 0.1;
    
    // FM scaling
    this.FM_SCALE = 0.5;
    
    // Initialize states
    for (let i = 0; i < 6; i++) {
      this.states[i] = 0; // IDLE
      this.slopeValues[i] = 0;
      this.lpgEnvelopes[i] = 0;
    }
    
    // Message port for programmatic triggers
    this.port.onmessage = (e) => {
      if (e.data.type === 'trigger') {
        const index = e.data.index;
        if (index >= 0 && index < 6) {
          this.handleTrigger(index, true, 2); // mode=CYCLE as default
        }
      } else if (e.data.type === 'gate') {
        const index = e.data.index;
        const high = e.data.high;
        if (index >= 0 && index < 6) {
          this.gateStates[index] = high ? 1 : 0;
        }
      }
    };
  }

  // ============================================
  // Utility Functions
  // ============================================

  timeToVolt(timeNorm) {
    return this.TIME_CV_MIN + timeNorm * (this.TIME_CV_MAX - this.TIME_CV_MIN);
  }

  voltToFreq(volt, baseFreq) {
    return baseFreq * Math.pow(2, volt);
  }

  shapeIntone(intone) {
    const centered = intone - 0.5;
    const shaped = centered * (1 - 0.3 * Math.abs(centered));
    return 0.5 + shaped;
  }

  getIntoneMultiplier(intone, n) {
    if (n === 1) return 1;
    const shaped = this.shapeIntone(intone);
    if (shaped >= 0.5) {
      const t = (shaped - 0.5) * 2;
      return 1 + t * (n - 1);
    } else {
      const t = (0.5 - shaped) * 2;
      return 1 / (1 + t * (n - 1));
    }
  }

  softLimit(x, gain = 1) {
    return Math.tanh(x * gain);
  }

  // ============================================
  // Waveshaping Functions
  // ============================================

  logShape(x) {
    const sign = x >= 0 ? 1 : -1;
    return sign * Math.sqrt(Math.abs(x));
  }

  expoShape(x) {
    const sign = x >= 0 ? 1 : -1;
    const absX = Math.abs(x);
    return sign * absX * absX;
  }

  applyCurve(linearValue, curve) {
    if (curve < 0.01) {
      return linearValue >= 0 ? 1 : -1;
    }
    if (Math.abs(curve - 0.5) < 0.01) {
      return linearValue;
    }
    if (curve > 0.99) {
      return Math.sin(linearValue * Math.PI * 0.5);
    }
    
    if (curve < 0.5) {
      const t = curve * 2;
      if (t < 0.5) {
        const squareVal = linearValue >= 0 ? 1 : -1;
        const logT = t * 2;
        const logVal = this.logShape(linearValue);
        return squareVal * (1 - logT) + logVal * logT;
      } else {
        const logVal = this.logShape(linearValue);
        const linT = (t - 0.5) * 2;
        return logVal * (1 - linT) + linearValue * linT;
      }
    } else {
      const t = (curve - 0.5) * 2;
      if (t < 0.5) {
        const expoVal = this.expoShape(linearValue);
        const expoT = t * 2;
        return linearValue * (1 - expoT) + expoVal * expoT;
      } else {
        const expoVal = this.expoShape(linearValue);
        const sineVal = Math.sin(linearValue * Math.PI * 0.5);
        const sineT = (t - 0.5) * 2;
        return expoVal * (1 - sineT) + sineVal * sineT;
      }
    }
  }

  // ============================================
  // Slope Generation
  // ============================================

  /**
   * Calculate rise and fall proportions from RAMP
   */
  getRisefall(ramp) {
    const minRise = 0.001;
    const maxRise = 0.999;
    const riseProp = minRise + ramp * (maxRise - minRise);
    return { rise: riseProp, fall: 1 - riseProp };
  }

  /**
   * Generate linear slope value from phase
   */
  generateLinearSlope(phase, ramp) {
    const { rise } = this.getRisefall(ramp);
    if (phase < rise) {
      return -1 + 2 * (phase / rise);
    } else {
      const fallPhase = (phase - rise) / (1 - rise);
      return 1 - 2 * fallPhase;
    }
  }

  /**
   * Handle trigger input for a slope
   */
  handleTrigger(index, triggered, mode, runValue = 0, runEnabled = false) {
    const state = this.states[index];
    
    if (mode === 2) {
      // CYCLE mode: trigger resets phase
      if (triggered) {
        this.phases[index] = 0;
      }
    } else if (mode === 0) {
      // TRANSIENT mode: AR envelope
      if (triggered) {
        if (runEnabled) {
          // SHIFT mode: retrigger point control
          // runValue: -5V to +5V mapped to -1 to 1
          // -1: always retriggerable
          // 0: retriggerable after rise
          // +1: retriggerable only at end of cycle (standard)
          
          const retriggerPoint = (runValue + 1) / 2; // 0 to 1
          const currentPhase = this.phases[index];
          const { rise } = this.getRisefall(0.5); // Use default ramp for timing
          
          let canRetrigger = false;
          if (retriggerPoint < 0.01) {
            canRetrigger = true; // Always
          } else if (retriggerPoint < 0.5) {
            // During rise phase
            const trigPoint = retriggerPoint * 2 * rise;
            canRetrigger = currentPhase >= trigPoint || state === 0;
          } else {
            // During fall phase
            const trigPoint = rise + (retriggerPoint - 0.5) * 2 * (1 - rise);
            canRetrigger = currentPhase >= trigPoint || state === 0;
          }
          
          if (canRetrigger) {
            this.states[index] = 1; // RISING
            this.phases[index] = 0;
          }
        } else {
          // Standard transient: only retrigger when idle
          if (state === 0) {
            this.states[index] = 1; // RISING
            this.phases[index] = 0;
          }
        }
      }
    } else if (mode === 1) {
      // SUSTAIN mode: ASR envelope, gate-sensitive
      // Handled separately in processGate
    }
  }

  /**
   * Handle gate input for sustain mode
   */
  processGate(index, gateHigh, mode, runValue = 0, runEnabled = false) {
    const state = this.states[index];
    const prevGate = this.gateStates[index];
    
    if (mode === 1) {
      // SUSTAIN mode
      if (gateHigh && !prevGate) {
        // Gate went high - start rising
        this.states[index] = 1; // RISING
      } else if (!gateHigh && prevGate) {
        // Gate went low - start falling
        this.states[index] = 3; // FALLING
      }
      
      // STRATA mode: ARSR envelope
      if (runEnabled && state === 2) {
        // In sustain state, runValue sets sustain level
        // This is handled in the slope generation
      }
    }
    
    this.gateStates[index] = gateHigh ? 1 : 0;
  }

  // ============================================
  // RUN Mode Processing
  // ============================================

  /**
   * VOLLEY (cycle/shape): Burst generator
   * Returns true if oscillator should be active
   */
  processVolley(index, triggered, runValue) {
    if (triggered) {
      // Calculate burst count from RUN voltage
      // -5V (-1): choked, 0: 6 bursts, +5V (+1): 36 bursts
      if (runValue < -0.8) {
        this.burstCounters[index] = 0; // Choked
      } else {
        const normalized = (runValue + 1) / 2; // 0 to 1
        this.burstCounters[index] = Math.floor(1 + normalized * 35);
      }
      this.phases[index] = 0;
      this.states[index] = 1;
    }
    
    return this.burstCounters[index] > 0;
  }

  /**
   * PLUME (sustain/sound): LPG-processed VCOs
   */
  processPlume(index, gateHigh, runValue, dt) {
    // LPG envelope with vactrol-like response
    // runValue controls attack/decay: positive = faster, negative = slower + velocity sensitive
    
    const baseAttack = 0.005; // 5ms
    const baseDecay = 0.3;    // 300ms
    
    let attackTime = baseAttack;
    let decayTime = baseDecay;
    
    if (runValue > 0) {
      // Faster response
      const speedup = 1 + runValue * 4;
      attackTime /= speedup;
      decayTime /= speedup;
    } else {
      // Slower, more velocity sensitive
      const slowdown = 1 - runValue * 2;
      attackTime *= slowdown;
      decayTime *= slowdown;
    }
    
    const attackRate = dt / attackTime;
    const decayRate = dt / decayTime;
    
    if (gateHigh) {
      this.lpgEnvelopes[index] = Math.min(1, this.lpgEnvelopes[index] + attackRate);
    } else {
      this.lpgEnvelopes[index] = Math.max(0, this.lpgEnvelopes[index] - decayRate);
    }
    
    return this.lpgEnvelopes[index];
  }

  /**
   * FLOOM (cycle/sound): 2-operator FM
   */
  processFloom(index, carrierFreq, runValue, fmIndex, dt) {
    // Internal modulator frequency ratio based on RUN
    // -1: 0.5x, 0: 1x, +1: 2x
    const ratio = Math.pow(2, runValue);
    const modFreq = carrierFreq * ratio;
    
    // Advance modulator phase
    this.modPhases[index] += modFreq * dt;
    while (this.modPhases[index] >= 1) this.modPhases[index] -= 1;
    
    // Generate modulator signal (sine)
    const modSignal = Math.sin(this.modPhases[index] * Math.PI * 2);
    
    // Apply FM index (fmIndex controls depth)
    return modSignal * Math.abs(fmIndex) * carrierFreq;
  }

  /**
   * SPILL (transient/sound): Self-clocked impulse trains
   */
  processSPILL(index, identityFreq, intoneMultiplier, runValue, ramp, curve, dt) {
    if (index === 0) {
      // IDENTITY is free-running
      const freq = identityFreq;
      const phaseInc = freq * dt;
      
      const prevPhase = this.phases[0];
      this.phases[0] += phaseInc;
      
      // Detect end-of-cycle
      this.identityEOC = this.phases[0] >= 1;
      while (this.phases[0] >= 1) this.phases[0] -= 1;
      
      // Generate waveform
      const linear = this.generateLinearSlope(this.phases[0], ramp);
      return this.applyCurve(linear, curve);
    } else {
      // Other oscillators are impulse trains clocked by IDENTITY
      const n = index + 1;
      
      // Calculate slope duration relative to IDENTITY
      // When INTONE CCW, slopes are longer (subharmonics possible)
      const slopeDuration = 1 / (identityFreq * intoneMultiplier);
      const slopeFreq = identityFreq * intoneMultiplier;
      
      // Determine if we can retrigger based on RUN
      const state = this.states[index];
      const phase = this.phases[index];
      const { rise } = this.getRisefall(ramp);
      
      let canRetrigger = false;
      if (runValue >= 0.99) {
        // Only when idle (end of cycle)
        canRetrigger = state === 0;
      } else if (runValue <= -0.99) {
        // Always retriggerable (turn around from current position)
        canRetrigger = true;
      } else {
        // Intermediate: retrigger point based on RUN
        const retriggerPhase = (runValue + 1) / 2;
        canRetrigger = phase >= retriggerPhase || state === 0;
      }
      
      // Check for IDENTITY EOC trigger
      if (this.identityEOC && canRetrigger) {
        if (runValue <= -0.99) {
          // Turn around behavior
          // Don't reset phase, just reverse direction
          if (state === 1) {
            this.states[index] = 3; // Start falling
          } else {
            this.states[index] = 1; // Start rising
            this.phases[index] = 0;
          }
        } else {
          this.states[index] = 1;
          this.phases[index] = 0;
        }
      }
      
      // Process slope state machine
      if (this.states[index] === 1) {
        // Rising
        this.phases[index] += slopeFreq * dt;
        if (this.phases[index] >= rise) {
          this.states[index] = 3; // Start falling
        }
      } else if (this.states[index] === 3) {
        // Falling
        this.phases[index] += slopeFreq * dt;
        if (this.phases[index] >= 1) {
          this.states[index] = 0; // Idle
          this.phases[index] = 0;
        }
      }
      
      // Generate output
      if (this.states[index] === 0) {
        return -1; // Resting at minimum
      } else {
        const linear = this.generateLinearSlope(this.phases[index], ramp);
        return this.applyCurve(linear, curve);
      }
    }
  }

  // ============================================
  // Main Process
  // ============================================

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const input = inputs[0];
    
    // Get input channels
    const timeCVChannel = input?.[0] || null;
    const fmChannel = input?.[1] || null;
    const intoneCVChannel = input?.[2] || null;
    const runCVChannel = input?.[3] || null;
    const rampCVChannel = input?.[4] || null;
    const triggerChannels = [];
    for (let i = 0; i < 6; i++) {
      triggerChannels.push(input?.[5 + i] || null);
    }
    
    const blockSize = output[0]?.length || 128;
    const dt = 1 / sampleRate;
    
    // K-rate parameters
    const range = Math.round(parameters.range[0]);
    const mode = Math.round(parameters.mode[0]);
    const runEnabled = parameters.runEnabled[0] > 0.5;
    
    // Determine base frequency
    const baseFreq = range === 1 ? this.SOUND_BASE_FREQ : this.SHAPE_BASE_FREQ;
    
    // Determine which RUN mode we're in
    // shape(0) + transient(0) = SHIFT
    // shape(0) + sustain(1) = STRATA
    // shape(0) + cycle(2) = VOLLEY
    // sound(1) + transient(0) = SPILL
    // sound(1) + sustain(1) = PLUME
    // sound(1) + cycle(2) = FLOOM
    
    for (let i = 0; i < blockSize; i++) {
      // Get a-rate parameters
      const getParam = (name) => {
        const p = parameters[name];
        return p.length > 1 ? p[i] : p[0];
      };
      
      const time = getParam('time');
      let intone = getParam('intone');
      let ramp = getParam('ramp');
      const curve = getParam('curve');
      let fmIndex = getParam('fmIndex');
      let runValue = getParam('run');
      
      // Add CV inputs
      const timeCV = timeCVChannel ? timeCVChannel[i] : 0;
      const fmSignal = fmChannel ? fmChannel[i] : 0;
      const intoneCV = intoneCVChannel ? intoneCVChannel[i] : 0;
      const runCV = runCVChannel ? runCVChannel[i] : 0;
      const rampCV = rampCVChannel ? rampCVChannel[i] : 0;
      
      intone = Math.max(0, Math.min(1, intone + intoneCV * 0.1));
      ramp = Math.max(0, Math.min(1, ramp + rampCV * 0.1));
      runValue = Math.max(-1, Math.min(1, runValue + runCV));
      
      // Calculate IDENTITY frequency
      const timeVolt = this.timeToVolt(time);
      const totalVolt = Math.max(this.TIME_CV_MIN, Math.min(this.TIME_CV_MAX, timeVolt + timeCV));
      const identityFreq = this.voltToFreq(totalVolt, baseFreq);
      
      // Process trigger inputs with normalling
      // 6N triggers cascade down to IDENTITY when inputs are unpatched
      let triggerValues = new Float32Array(6);
      let cascadeTrigger = 0;
      
      // Start from 6N (index 5) and cascade down
      for (let osc = 5; osc >= 0; osc--) {
        const trigChannel = triggerChannels[osc];
        if (trigChannel) {
          triggerValues[osc] = trigChannel[i];
          cascadeTrigger = trigChannel[i]; // This breaks the cascade
        } else {
          triggerValues[osc] = cascadeTrigger; // Use cascaded value
        }
      }
      
      // Detect trigger edges and update gate states
      for (let osc = 0; osc < 6; osc++) {
        const trigVal = triggerValues[osc];
        const prevTrig = this.prevGateInputs[osc];
        const gateHigh = trigVal > this.TRIGGER_THRESHOLD;
        const wasHigh = prevTrig > this.TRIGGER_THRESHOLD;
        const risingEdge = gateHigh && !wasHigh;
        
        // Process based on mode
        if (mode === 0) {
          // TRANSIENT: rising edge triggers
          if (risingEdge) {
            this.handleTrigger(osc, true, mode, runValue, runEnabled);
          }
        } else if (mode === 1) {
          // SUSTAIN: gate-sensitive
          this.processGate(osc, gateHigh, mode, runValue, runEnabled);
        } else if (mode === 2) {
          // CYCLE: rising edge resets phase
          if (risingEdge) {
            this.handleTrigger(osc, true, mode, runValue, runEnabled);
          }
        }
        
        this.prevGateInputs[osc] = trigVal;
      }
      
      // Mix accumulator
      let mixSum = 0;
      let scaledMaxValues = new Float32Array(6); // For SHAPE range MIX
      
      // Process each oscillator
      for (let osc = 0; osc < 6; osc++) {
        const n = osc + 1;
        const intoneMultiplier = this.getIntoneMultiplier(intone, n);
        let freq = identityFreq * intoneMultiplier;
        
        let outputValue = 0;
        
        // Handle RUN modes
        if (runEnabled) {
          if (range === 0) {
            // SHAPE range RUN modes
            if (mode === 0) {
              // SHIFT: handled in handleTrigger
              outputValue = this.processTransientShape(osc, freq, ramp, curve, dt, runValue);
            } else if (mode === 1) {
              // STRATA: ARSR envelopes
              outputValue = this.processStrata(osc, freq, ramp, curve, dt, runValue);
            } else {
              // VOLLEY: burst generator
              const trigVal = triggerValues[osc];
              const risingEdge = trigVal > this.TRIGGER_THRESHOLD && 
                                 this.prevGateInputs[osc] <= this.TRIGGER_THRESHOLD;
              
              if (this.processVolley(osc, risingEdge, runValue)) {
                outputValue = this.processCycleShape(osc, freq, ramp, curve, dt);
                // Decrement burst on cycle completion
                if (this.phases[osc] < dt * freq) {
                  this.burstCounters[osc]--;
                  if (this.burstCounters[osc] <= 0) {
                    this.states[osc] = 0;
                  }
                }
              } else {
                outputValue = 0;
              }
            }
          } else {
            // SOUND range RUN modes
            if (mode === 0) {
              // SPILL: self-clocked impulse trains
              outputValue = this.processSPILL(osc, identityFreq, intoneMultiplier, 
                                              runValue, ramp, curve, dt);
            } else if (mode === 1) {
              // PLUME: LPG-processed VCOs
              const gateHigh = triggerValues[osc] > this.TRIGGER_THRESHOLD;
              const lpgLevel = this.processPlume(osc, gateHigh, runValue, dt);
              
              // Generate oscillator
              const phaseInc = freq / sampleRate;
              this.phases[osc] += phaseInc;
              while (this.phases[osc] >= 1) this.phases[osc] -= 1;
              
              const linear = this.generateLinearSlope(this.phases[osc], ramp);
              const shaped = this.applyCurve(linear, curve);
              
              // Apply LPG (simplified: just amplitude for now)
              // Real LPG would also filter
              outputValue = shaped * lpgLevel;
            } else {
              // FLOOM: 2-operator FM
              // Get FM from internal modulator instead of external
              const fmFromMod = this.processFloom(osc, freq, runValue, fmIndex, dt);
              
              // Apply FM (only if fmIndex is set)
              if (Math.abs(fmIndex) > 0.01) {
                freq += fmFromMod;
              }
              freq = Math.max(0.001, freq);
              
              const phaseInc = freq / sampleRate;
              this.phases[osc] += phaseInc;
              while (this.phases[osc] >= 1) this.phases[osc] -= 1;
              
              const linear = this.generateLinearSlope(this.phases[osc], ramp);
              outputValue = this.applyCurve(linear, curve);
            }
          }
        } else {
          // Standard modes (no RUN)
          if (mode === 2) {
            // CYCLE
            if (range === 1) {
              outputValue = this.processCycleSound(osc, freq, ramp, curve, fmIndex, fmSignal, dt);
            } else {
              outputValue = this.processCycleShape(osc, freq, ramp, curve, dt);
            }
          } else if (mode === 0) {
            // TRANSIENT
            if (range === 1) {
              outputValue = this.processTransientSound(osc, freq, ramp, curve, dt, triggerValues[osc]);
            } else {
              outputValue = this.processTransientShape(osc, freq, ramp, curve, dt, 1);
            }
          } else {
            // SUSTAIN
            if (range === 1) {
              outputValue = this.processSustainSound(osc, freq, ramp, curve, dt, triggerValues[osc]);
            } else {
              outputValue = this.processSustainShape(osc, freq, ramp, curve, dt);
            }
          }
        }
        
        // Write output
        if (output[osc]) {
          output[osc][i] = outputValue;
        }
        
        // Accumulate for mix
        if (range === 1) {
          mixSum += outputValue;
        } else {
          // SHAPE range: scaled by index for analog OR
          scaledMaxValues[osc] = (outputValue + 1) / 2 * 8 / n; // Scale to 0-8V, divide by index
        }
      }
      
      // Generate MIX output
      if (output[6]) {
        if (range === 1) {
          // SOUND: equal mix with soft limiting
          output[6][i] = this.softLimit(mixSum / 3, 1);
        } else {
          // SHAPE: scaled max (analog OR)
          let maxVal = 0;
          for (let osc = 0; osc < 6; osc++) {
            if (scaledMaxValues[osc] > maxVal) {
              maxVal = scaledMaxValues[osc];
            }
          }
          // Convert back to -1 to 1 range for consistency
          output[6][i] = (maxVal / 4) - 1;
        }
      }
    }
    
    return true;
  }

  // ============================================
  // Mode-Specific Processing Functions
  // ============================================

  processCycleSound(osc, freq, ramp, curve, fmIndex, fmSignal, dt) {
    // Apply external FM
    if (Math.abs(fmIndex) > 0.01 && fmSignal !== 0) {
      const fmAmount = fmSignal * fmIndex * this.FM_SCALE * freq;
      freq += fmAmount;
    }
    freq = Math.max(0.001, freq);
    
    const phaseInc = freq / sampleRate;
    this.phases[osc] += phaseInc;
    while (this.phases[osc] >= 1) this.phases[osc] -= 1;
    
    const linear = this.generateLinearSlope(this.phases[osc], ramp);
    return this.applyCurve(linear, curve);
  }

  processCycleShape(osc, freq, ramp, curve, dt) {
    const phaseInc = freq * dt;
    this.phases[osc] += phaseInc;
    while (this.phases[osc] >= 1) this.phases[osc] -= 1;
    
    const linear = this.generateLinearSlope(this.phases[osc], ramp);
    return this.applyCurve(linear, curve);
  }

  processTransientShape(osc, freq, ramp, curve, dt, runValue) {
    const state = this.states[osc];
    const { rise } = this.getRisefall(ramp);
    
    if (state === 0) {
      // IDLE
      return -1;
    }
    
    const phaseInc = freq * dt;
    this.phases[osc] += phaseInc;
    
    if (state === 1 && this.phases[osc] >= rise) {
      // Transition to falling
      this.states[osc] = 3;
    }
    
    if (this.phases[osc] >= 1) {
      // Cycle complete
      this.states[osc] = 0;
      this.phases[osc] = 0;
      return -1;
    }
    
    const linear = this.generateLinearSlope(this.phases[osc], ramp);
    return this.applyCurve(linear, curve);
  }

  processTransientSound(osc, freq, ramp, curve, dt, triggerInput) {
    // Impulse-train VCO: needs external clock
    // Each trigger starts an impulse, slope duration set by TIME/INTONE
    
    const state = this.states[osc];
    
    if (state === 0) {
      // Waiting for trigger - output at minimum
      return -1;
    }
    
    const phaseInc = freq * dt;
    this.phases[osc] += phaseInc;
    
    if (this.phases[osc] >= 1) {
      // Impulse complete
      this.states[osc] = 0;
      this.phases[osc] = 0;
      return -1;
    }
    
    const linear = this.generateLinearSlope(this.phases[osc], ramp);
    return this.applyCurve(linear, curve);
  }

  processSustainShape(osc, freq, ramp, curve, dt) {
    const state = this.states[osc];
    const { rise, fall } = this.getRisefall(ramp);
    
    if (state === 0) {
      // IDLE
      this.slopeValues[osc] = -1;
    } else if (state === 1) {
      // RISING
      const riseRate = 2 / (rise / freq) * dt;
      this.slopeValues[osc] = Math.min(1, this.slopeValues[osc] + riseRate);
      
      if (this.slopeValues[osc] >= 1) {
        this.states[osc] = 2; // SUSTAINING
      }
    } else if (state === 2) {
      // SUSTAINING at max
      this.slopeValues[osc] = 1;
    } else if (state === 3) {
      // FALLING
      const fallRate = 2 / (fall / freq) * dt;
      this.slopeValues[osc] = Math.max(-1, this.slopeValues[osc] - fallRate);
      
      if (this.slopeValues[osc] <= -1) {
        this.states[osc] = 0; // IDLE
      }
    }
    
    return this.applyCurve(this.slopeValues[osc], curve);
  }

  processSustainSound(osc, freq, ramp, curve, dt, triggerInput) {
    // Trapezoid VCO: tracks PWM of input
    // For now, simplified: behave like sustain/shape but at audio rate
    return this.processSustainShape(osc, freq, ramp, curve, dt);
  }

  processStrata(osc, freq, ramp, curve, dt, runValue) {
    // ARSR envelope: RUN controls sustain level
    const state = this.states[osc];
    const { rise, fall } = this.getRisefall(ramp);
    
    // Sustain level from RUN (-1 to 1 mapped to 0 to 1)
    const sustainLevel = (runValue + 1) / 2;
    // Map to -1 to 1 output range
    const sustainValue = -1 + sustainLevel * 2;
    
    if (state === 0) {
      // IDLE
      this.slopeValues[osc] = -1;
    } else if (state === 1) {
      // RISING (attack)
      const riseRate = 2 / (rise / freq) * dt;
      this.slopeValues[osc] = Math.min(1, this.slopeValues[osc] + riseRate);
      
      if (this.slopeValues[osc] >= 1) {
        // Peak reached, start release-1 (decay to sustain)
        this.states[osc] = 4; // Special state for release-1
      }
    } else if (state === 4) {
      // RELEASE-1 (decay to sustain level)
      const fallRate = 2 / (fall / freq) * dt;
      this.slopeValues[osc] = Math.max(sustainValue, this.slopeValues[osc] - fallRate);
      
      if (this.slopeValues[osc] <= sustainValue) {
        this.states[osc] = 2; // SUSTAINING
      }
    } else if (state === 2) {
      // SUSTAINING at sustain level
      this.slopeValues[osc] = sustainValue;
    } else if (state === 3) {
      // RELEASE-2 (falling from sustain to min)
      const fallRate = 2 / (fall / freq) * dt;
      this.slopeValues[osc] = Math.max(-1, this.slopeValues[osc] - fallRate);
      
      if (this.slopeValues[osc] <= -1) {
        this.states[osc] = 0; // IDLE
      }
    }
    
    return this.applyCurve(this.slopeValues[osc], curve);
  }
}

registerProcessor('just-friends-processor', JustFriendsProcessor);
