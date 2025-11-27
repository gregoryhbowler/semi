// envelope-processor.js (FIXED VERSION)
// High-quality AD/ASR Envelope + VCA
// Supports very short plucks to long pads with linear/exponential curves
// FIX: Removed broken scheduling system, using immediate gate processing

class EnvelopeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attack', defaultValue: 0.01, minValue: 0.001, maxValue: 3.0 },
      { name: 'decay', defaultValue: 0.5, minValue: 0.005, maxValue: 10.0 },
      { name: 'sustain', defaultValue: 0.7, minValue: 0, maxValue: 1.0 },
      { name: 'mode', defaultValue: 1, minValue: 0, maxValue: 1 },      // 0=AD, 1=ASR
      { name: 'curve', defaultValue: 1, minValue: 0, maxValue: 1 }      // 0=linear, 1=exponential
    ];
  }

  constructor() {
    super();
    
    // Envelope state machine
    this.state = 'IDLE';  // IDLE, ATTACK, DECAY, SUSTAIN, RELEASE
    this.currentValue = 0;
    this.targetValue = 0;
    this.startValue = 0;
    this.phase = 0;
    this.phaseDelta = 0;
    
    // Gate handling - using immediate flags instead of broken scheduling
    this.gateOn = false;
    this.pendingGateOn = false;
    this.pendingGateOff = false;
    
    // Listen for gate events from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'gate') {
        // Process gate changes immediately on next process() call
        if (event.data.isOn) {
          this.pendingGateOn = true;
        } else {
          this.pendingGateOff = true;
        }
      }
    };
    
    // Debug
    this.debugCounter = 0;
    this.debugInterval = 48000; // Every second at 48kHz
  }

  // Calculate exponential curve value
  exponentialCurve(phase) {
    // Use y = 1 - e^(-k*x) for smooth exponential rise
    const k = 5; // Curve steepness
    return 1 - Math.exp(-k * phase);
  }

  // Process envelope state machine
  processEnvelope(attack, decay, sustain, mode, curve, sampleRate) {
    const isExponential = curve > 0.5;
    
    switch (this.state) {
      case 'IDLE':
        this.currentValue = 0;
        break;
        
      case 'ATTACK':
        this.phase += this.phaseDelta;
        
        if (this.phase >= 1.0) {
          this.phase = 1.0;
          this.currentValue = 1.0;
          
          // Transition based on mode
          if (mode < 0.5) {
            // AD mode: go to DECAY
            this.state = 'DECAY';
            this.phase = 0;
            this.phaseDelta = 1.0 / (decay * sampleRate);
            this.startValue = 1.0;
            this.targetValue = 0;
          } else {
            // ASR mode: go to SUSTAIN if gate is still on
            if (this.gateOn) {
              this.state = 'SUSTAIN';
              this.currentValue = sustain;
            } else {
              // Gate released during attack, go to RELEASE
              this.state = 'RELEASE';
              this.phase = 0;
              this.phaseDelta = 1.0 / (decay * sampleRate);
              this.startValue = this.currentValue;
              this.targetValue = 0;
            }
          }
        } else {
          // Calculate value based on curve type
          if (isExponential) {
            this.currentValue = this.exponentialCurve(this.phase);
          } else {
            this.currentValue = this.phase;
          }
        }
        break;
        
      case 'DECAY':
        this.phase += this.phaseDelta;
        
        if (this.phase >= 1.0) {
          this.phase = 1.0;
          this.currentValue = 0;
          this.state = 'IDLE';
        } else {
          // Calculate value based on curve type
          if (isExponential) {
            // Exponential decay
            const inverseCurve = 1 - this.exponentialCurve(this.phase);
            this.currentValue = inverseCurve;
          } else {
            // Linear decay
            this.currentValue = 1.0 - this.phase;
          }
        }
        break;
        
      case 'SUSTAIN':
        this.currentValue = sustain;
        break;
        
      case 'RELEASE':
        this.phase += this.phaseDelta;
        
        if (this.phase >= 1.0) {
          this.phase = 1.0;
          this.currentValue = 0;
          this.state = 'IDLE';
        } else {
          // Calculate value based on curve type
          const range = this.startValue - this.targetValue;
          
          if (isExponential) {
            const inverseCurve = 1 - this.exponentialCurve(this.phase);
            this.currentValue = this.startValue - (range * (1 - inverseCurve));
          } else {
            this.currentValue = this.startValue - (range * this.phase);
          }
        }
        break;
    }
    
    return this.currentValue;
  }

  // Handle gate on event
  triggerGateOn(mode, attack, sampleRate) {
    this.gateOn = true;
    
    if (this.state === 'IDLE' || this.state === 'RELEASE') {
      // Start new attack from current value
      this.state = 'ATTACK';
      this.phase = 0;
      this.phaseDelta = 1.0 / (attack * sampleRate);
      this.startValue = this.currentValue;
      this.targetValue = 1.0;
    } else if (this.state === 'DECAY') {
      // Retrigger during decay (AD mode)
      if (mode < 0.5) {
        this.state = 'ATTACK';
        this.phase = 0;
        this.phaseDelta = 1.0 / (attack * sampleRate);
        this.startValue = this.currentValue;
        this.targetValue = 1.0;
      }
    }
  }

  // Handle gate off event
  triggerGateOff(mode, decay, sustain, sampleRate) {
    this.gateOn = false;
    
    // Only matters for ASR mode
    if (mode > 0.5) {
      if (this.state === 'ATTACK' || this.state === 'SUSTAIN') {
        // Go to RELEASE
        this.state = 'RELEASE';
        this.phase = 0;
        this.phaseDelta = 1.0 / (decay * sampleRate);
        this.startValue = this.currentValue;
        this.targetValue = 0;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0] || !output || !output[0]) {
      return true;
    }
    
    const audioIn = input[0];
    const audioOut = output[0];
    
    // Get parameters (k-rate)
    const attack = parameters.attack[0];
    const decay = parameters.decay[0];
    const sustain = parameters.sustain[0];
    const mode = parameters.mode[0];
    const curve = parameters.curve[0];
    
    // Process pending gate events (FIXED: immediate processing)
    if (this.pendingGateOn) {
      this.triggerGateOn(mode, attack, sampleRate);
      this.pendingGateOn = false;
    }
    
    if (this.pendingGateOff) {
      this.triggerGateOff(mode, decay, sustain, sampleRate);
      this.pendingGateOff = false;
    }
    
    // Process each sample
    for (let i = 0; i < audioIn.length; i++) {
      // Update envelope
      const envValue = this.processEnvelope(attack, decay, sustain, mode, curve, sampleRate);
      
      // Apply envelope as VCA
      audioOut[i] = audioIn[i] * envValue;
      
      this.debugCounter++;
    }
    
    // Debug logging
    if (this.debugCounter >= this.debugInterval) {
      console.log('[Envelope]', {
        state: this.state,
        value: this.currentValue.toFixed(3),
        mode: mode < 0.5 ? 'AD' : 'ASR',
        curve: curve < 0.5 ? 'linear' : 'exponential',
        attack: attack.toFixed(3),
        decay: decay.toFixed(3),
        sustain: sustain.toFixed(2),
        gateOn: this.gateOn
      });
      this.debugCounter = 0;
    }
    
    return true;
  }
}

registerProcessor('envelope-processor', EnvelopeProcessor);
