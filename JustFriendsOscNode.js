/**
 * JustFriendsOscNode.js
 * 
 * AudioWorkletNode wrapper for the Just Friends oscillator processor.
 * Full implementation with all modes and RUN modes.
 * 
 * Provides a clean API for:
 *   - All 6 standard modes (3 modes × 2 ranges)
 *   - All 6 RUN modes (SHIFT, STRATA, VOLLEY, SPILL, PLUME, FLOOM)
 *   - CV inputs for all parameters
 *   - Trigger/gate inputs for envelope modes
 *   - Individual and mixed outputs
 * 
 * Usage:
 *   const ctx = new AudioContext();
 *   await ctx.audioWorklet.addModule('./just-friends-osc-processor.js');
 *   const jf = new JustFriendsOscNode(ctx);
 *   
 *   // Set to cycle/sound mode (oscillators)
 *   jf.setCycleSoundMode();
 *   
 *   // Or envelope mode
 *   jf.setTransientShapeMode();
 *   
 *   // Enable RUN mode for FLOOM
 *   jf.enableRunMode(true);
 *   jf.setCycleSoundMode();
 *   
 *   // Trigger envelopes
 *   jf.trigger(5); // Trigger 6N (cascades to all)
 *   
 *   // Connect outputs
 *   jf.getMixOutput().connect(ctx.destination);
 */

export class JustFriendsOscNode extends AudioWorkletNode {
  
  // ============================================
  // Constants
  // ============================================
  
  static RANGE_SHAPE = 0;
  static RANGE_SOUND = 1;
  
  static MODE_TRANSIENT = 0;
  static MODE_SUSTAIN = 1;
  static MODE_CYCLE = 2;
  
  // RUN mode names for reference
  static RUN_MODES = {
    'transient/shape': 'SHIFT',
    'sustain/shape': 'STRATA',
    'cycle/shape': 'VOLLEY',
    'transient/sound': 'SPILL',
    'sustain/sound': 'PLUME',
    'cycle/sound': 'FLOOM'
  };
  
  // ============================================
  // Constructor
  // ============================================
  
  constructor(context) {
    super(context, 'just-friends-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [7],
      channelCount: 11, // TIME, FM, INTONE, RUN, RAMP, + 6 triggers
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    this._context = context;
    
    // Map AudioParams
    this.params = {
      time: this.parameters.get('time'),
      intone: this.parameters.get('intone'),
      ramp: this.parameters.get('ramp'),
      curve: this.parameters.get('curve'),
      range: this.parameters.get('range'),
      mode: this.parameters.get('mode'),
      run: this.parameters.get('run'),
      fmIndex: this.parameters.get('fmIndex'),
      runEnabled: this.parameters.get('runEnabled')
    };
    
    // ============================================
    // Create Input Nodes
    // ============================================
    
    // CV inputs
    this._timeCVInput = context.createGain();
    this._timeCVInput.gain.value = 1;
    
    this._fmInput = context.createGain();
    this._fmInput.gain.value = 1;
    
    this._intoneCVInput = context.createGain();
    this._intoneCVInput.gain.value = 1;
    
    this._runCVInput = context.createGain();
    this._runCVInput.gain.value = 1;
    
    this._rampCVInput = context.createGain();
    this._rampCVInput.gain.value = 1;
    
    // Trigger inputs (one per oscillator)
    this._triggerInputs = [];
    for (let i = 0; i < 6; i++) {
      const trigIn = context.createGain();
      trigIn.gain.value = 1;
      this._triggerInputs.push(trigIn);
    }
    
    // Merge all inputs into processor's multi-channel input
    this._inputMerger = context.createChannelMerger(11);
    this._timeCVInput.connect(this._inputMerger, 0, 0);
    this._fmInput.connect(this._inputMerger, 0, 1);
    this._intoneCVInput.connect(this._inputMerger, 0, 2);
    this._runCVInput.connect(this._inputMerger, 0, 3);
    this._rampCVInput.connect(this._inputMerger, 0, 4);
    
    for (let i = 0; i < 6; i++) {
      this._triggerInputs[i].connect(this._inputMerger, 0, 5 + i);
    }
    
    this._inputMerger.connect(this);
    
    // ============================================
    // Create Output Nodes
    // ============================================
    
    this._outputSplitter = context.createChannelSplitter(7);
    this.connect(this._outputSplitter);
    
    // Individual outputs with gain control
    this._outputs = [];
    for (let i = 0; i < 7; i++) {
      const out = context.createGain();
      out.gain.value = 1;
      this._outputSplitter.connect(out, i);
      this._outputs.push(out);
    }
    
    // Named references
    this._identityOut = this._outputs[0];
    this._n2Out = this._outputs[1];
    this._n3Out = this._outputs[2];
    this._n4Out = this._outputs[3];
    this._n5Out = this._outputs[4];
    this._n6Out = this._outputs[5];
    this._mixOut = this._outputs[6];
    
    // ============================================
    // Internal State
    // ============================================
    
    this._gateStates = [false, false, false, false, false, false];
    this._gateSources = [null, null, null, null, null, null];
  }
  
  // ============================================
  // CV Input Accessors
  // ============================================
  
  /** Get TIME CV input (1V/oct pitch control) */
  getTimeCVInput() {
    return this._timeCVInput;
  }
  
  /** Get FM input (audio-rate frequency modulation) */
  getFMInput() {
    return this._fmInput;
  }
  
  /** Get INTONE CV input */
  getIntoneCVInput() {
    return this._intoneCVInput;
  }
  
  /** Get RUN CV input (for RUN mode control) */
  getRunCVInput() {
    return this._runCVInput;
  }
  
  /** Get RAMP CV input */
  getRampCVInput() {
    return this._rampCVInput;
  }
  
  // ============================================
  // Trigger Input Accessors
  // ============================================
  
  /** Get IDENTITY trigger input */
  getIdentityTriggerInput() {
    return this._triggerInputs[0];
  }
  
  /** Get 2N trigger input */
  get2NTriggerInput() {
    return this._triggerInputs[1];
  }
  
  /** Get 3N trigger input */
  get3NTriggerInput() {
    return this._triggerInputs[2];
  }
  
  /** Get 4N trigger input */
  get4NTriggerInput() {
    return this._triggerInputs[3];
  }
  
  /** Get 5N trigger input */
  get5NTriggerInput() {
    return this._triggerInputs[4];
  }
  
  /** Get 6N trigger input */
  get6NTriggerInput() {
    return this._triggerInputs[5];
  }
  
  /** 
   * Get trigger input by index (0=IDENTITY, 5=6N)
   * @param {number} index 0-5
   */
  getTriggerInput(index) {
    return this._triggerInputs[index] || null;
  }
  
  // ============================================
  // Output Accessors
  // ============================================
  
  getIdentityOutput() { return this._identityOut; }
  get2NOutput() { return this._n2Out; }
  get3NOutput() { return this._n3Out; }
  get4NOutput() { return this._n4Out; }
  get5NOutput() { return this._n5Out; }
  get6NOutput() { return this._n6Out; }
  getMixOutput() { return this._mixOut; }
  
  /**
   * Get output by index (0-6)
   * 0=IDENTITY, 1=2N, 2=3N, 3=4N, 4=5N, 5=6N, 6=MIX
   */
  getOutput(index) {
    return this._outputs[index] || null;
  }
  
  // ============================================
  // Programmatic Trigger/Gate Control
  // ============================================
  
  /**
   * Send a trigger pulse to a specific oscillator
   * Triggers cascade down due to normalling (6N triggers all when others unpatched)
   * @param {number} index 0=IDENTITY, 5=6N
   */
  trigger(index) {
    if (index >= 0 && index < 6) {
      this.port.postMessage({ type: 'trigger', index });
    }
  }
  
  /**
   * Trigger all oscillators (equivalent to triggering 6N with normalling)
   */
  triggerAll() {
    this.trigger(5);
  }
  
  /**
   * Set gate state for a specific oscillator (for sustain mode)
   * @param {number} index 0=IDENTITY, 5=6N
   * @param {boolean} high true for gate high, false for gate low
   */
  setGate(index, high) {
    if (index >= 0 && index < 6) {
      this._gateStates[index] = high;
      this.port.postMessage({ type: 'gate', index, high });
    }
  }
  
  /**
   * Create a DC offset source for holding gates high
   * @param {number} index 0=IDENTITY, 5=6N
   * @param {boolean} high true to hold gate high
   */
  holdGate(index, high) {
    if (index < 0 || index >= 6) return;
    
    // Clean up existing source
    if (this._gateSources[index]) {
      this._gateSources[index].disconnect();
      this._gateSources[index] = null;
    }
    
    if (high) {
      // Create constant source for gate
      const constSource = this._context.createConstantSource();
      constSource.offset.value = 1; // High gate
      constSource.connect(this._triggerInputs[index]);
      constSource.start();
      this._gateSources[index] = constSource;
    }
    
    this._gateStates[index] = high;
  }
  
  /**
   * Pulse a gate (quick trigger for sustain mode)
   * @param {number} index 0=IDENTITY, 5=6N
   * @param {number} duration Duration in seconds (default 0.01 = 10ms)
   */
  pulseGate(index, duration = 0.01) {
    this.holdGate(index, true);
    setTimeout(() => this.holdGate(index, false), duration * 1000);
  }
  
  // ============================================
  // Mode Setting Methods
  // ============================================
  
  /**
   * Enable or disable RUN mode
   * When enabled, the current mode/range combination activates its RUN variant
   */
  enableRunMode(enabled) {
    this.params.runEnabled.value = enabled ? 1 : 0;
  }
  
  /** Set to transient/shape mode (AR envelopes, or SHIFT with RUN) */
  setTransientShapeMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SHAPE;
    this.params.mode.value = JustFriendsOscNode.MODE_TRANSIENT;
  }
  
  /** Set to sustain/shape mode (ASR envelopes, or STRATA with RUN) */
  setSustainShapeMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SHAPE;
    this.params.mode.value = JustFriendsOscNode.MODE_SUSTAIN;
  }
  
  /** Set to cycle/shape mode (LFOs, or VOLLEY with RUN) */
  setCycleShapeMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SHAPE;
    this.params.mode.value = JustFriendsOscNode.MODE_CYCLE;
  }
  
  /** Set to transient/sound mode (impulse-train VCOs, or SPILL with RUN) */
  setTransientSoundMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SOUND;
    this.params.mode.value = JustFriendsOscNode.MODE_TRANSIENT;
  }
  
  /** Set to sustain/sound mode (trapezoid VCOs, or PLUME with RUN) */
  setSustainSoundMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SOUND;
    this.params.mode.value = JustFriendsOscNode.MODE_SUSTAIN;
  }
  
  /** Set to cycle/sound mode (waveshaped VCOs, or FLOOM with RUN) */
  setCycleSoundMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SOUND;
    this.params.mode.value = JustFriendsOscNode.MODE_CYCLE;
  }
  
  /**
   * Get the name of the current RUN mode based on range/mode settings
   */
  getCurrentRunModeName() {
    const range = this.params.range.value > 0.5 ? 'sound' : 'shape';
    const modes = ['transient', 'sustain', 'cycle'];
    const mode = modes[Math.round(this.params.mode.value)];
    return JustFriendsOscNode.RUN_MODES[`${mode}/${range}`];
  }
  
  // ============================================
  // Convenience Parameter Methods
  // ============================================
  
  setUnison() { this.params.intone.value = 0.5; }
  setOvertones() { this.params.intone.value = 1.0; }
  setUndertones() { this.params.intone.value = 0.0; }
  
  setSineWave() {
    this.params.curve.value = 1.0;
    this.params.ramp.value = 0.5;
  }
  
  setTriangleWave() {
    this.params.curve.value = 0.5;
    this.params.ramp.value = 0.5;
  }
  
  setSawWave() {
    this.params.curve.value = 0.5;
    this.params.ramp.value = 0.0;
  }
  
  setRampWave() {
    this.params.curve.value = 0.5;
    this.params.ramp.value = 1.0;
  }
  
  setSquareWave() {
    this.params.curve.value = 0.0;
    this.params.ramp.value = 0.5;
  }
  
  // ============================================
  // Cleanup
  // ============================================
  
  dispose() {
    // Stop any gate sources
    for (let i = 0; i < 6; i++) {
      if (this._gateSources[i]) {
        this._gateSources[i].stop();
        this._gateSources[i].disconnect();
      }
    }
    
    this.disconnect();
    
    for (const out of this._outputs) {
      out.disconnect();
    }
    
    this._outputSplitter.disconnect();
    this._timeCVInput.disconnect();
    this._fmInput.disconnect();
    this._intoneCVInput.disconnect();
    this._runCVInput.disconnect();
    this._rampCVInput.disconnect();
    
    for (const trigIn of this._triggerInputs) {
      trigIn.disconnect();
    }
    
    this._inputMerger.disconnect();
  }
}

export default JustFriendsOscNode;

/*
 * ============================================
 * MODE REFERENCE
 * ============================================
 * 
 * STANDARD MODES:
 * 
 * transient/shape:
 *   AR envelope generators. Triggers start attack phase.
 *   Triggers ignored while envelope is active.
 *   TIME/INTONE control duration, RAMP controls attack/release balance.
 * 
 * sustain/shape:
 *   ASR envelope generators. Gate-sensitive.
 *   Gate high = rise to max and hold, gate low = fall to min.
 *   "Vactrol memory" effect when gates faster than envelope.
 * 
 * cycle/shape:
 *   LFOs with controllable phase relationships.
 *   Triggers reset phase (useful for sync, quadrature patterns).
 *   INTONE spreads frequencies, TIME sets base rate.
 * 
 * transient/sound:
 *   Impulse-train VCOs. Requires external audio-rate trigger.
 *   TIME/INTONE control formant (impulse duration), not pitch.
 *   Pitch determined by external trigger rate.
 * 
 * sustain/sound:
 *   Trapezoid VCOs. Tracks PWM of input gate.
 *   Similar to transient/sound but gate-sensitive.
 * 
 * cycle/sound:
 *   Waveshaped VCOs. Free-running oscillators.
 *   TIME/INTONE control pitch relationships.
 *   RAMP/CURVE control timbre.
 * 
 * ============================================
 * RUN MODES (enableRunMode(true)):
 * ============================================
 * 
 * SHIFT (transient/shape):
 *   AR envelopes with retrigger control.
 *   RUN CV sets point where envelope becomes retriggerable.
 *   -5V: always retriggerable
 *   0V: retriggerable after rise complete
 *   +5V: retriggerable only at end (standard behavior)
 * 
 * STRATA (sustain/shape):
 *   ARSR envelopes. RUN CV controls sustain level.
 *   After reaching max, falls to sustain level and holds.
 *   Can be used as 6-channel slew limiter.
 * 
 * VOLLEY (cycle/shape):
 *   Modulation burst generator.
 *   Triggers start fixed number of LFO cycles.
 *   RUN CV controls burst count (-4V=choked, 0V=6, +5V=36).
 * 
 * SPILL (transient/sound):
 *   Self-clocked impulse trains with sync chaos.
 *   IDENTITY is free-running, others triggered by IDENTITY EOC.
 *   RUN CV controls retrigger behavior (subharmonics, split-tones).
 *   INTONE CCW = undertones/subharmonics possible.
 * 
 * PLUME (sustain/sound):
 *   LPG-processed VCOs for polyphonic synthesis.
 *   Triggers/gates pluck or hold internal lowpass gates.
 *   RUN CV controls vactrol response (attack/decay time).
 *   INTONE CW = major chord, CCW = minor chord.
 * 
 * FLOOM (cycle/sound):
 *   2-operator FM synthesis.
 *   Internal modulator for each carrier, no external FM needed.
 *   RUN CV controls modulator:carrier ratio (-5V=0.5x, 0=1x, +5V=2x).
 *   FM knob controls depth. Can generate noise at extreme settings.
 * 
 * ============================================
 * TRIGGER NORMALLING
 * ============================================
 * 
 * Trigger inputs are normalled from 6N down to IDENTITY.
 * A trigger to 6N (with nothing else patched) triggers all 6.
 * Patching breaks the normal at that point.
 * 
 * Example: Trigger to 6N, dummy cable to 3N
 *   - 6N trigger -> 6N, 5N, 4N
 *   - Nothing reaches 3N, 2N, IDENTITY
 * 
 * Example: Trigger to 6N, different trigger to 2N
 *   - 6N trigger -> 6N, 5N, 4N, 3N
 *   - 2N trigger -> 2N, IDENTITY
 */
