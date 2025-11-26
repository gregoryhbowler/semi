/**
 * JustFriendsOscNode.js
 * 
 * AudioWorkletNode wrapper for the Just Friends oscillator processor.
 * Provides a clean API for patching and controlling the module.
 * 
 * Modeled after MangroveNode for consistency.
 * 
 * Usage:
 *   const ctx = new AudioContext();
 *   await ctx.audioWorklet.addModule('./just-friends-osc-processor.js');
 *   const jf = new JustFriendsOscNode(ctx);
 *   
 *   // Set parameters
 *   jf.params.time.value = 0.5;
 *   jf.params.intone.value = 0.5;
 *   jf.params.ramp.value = 0.5;
 *   jf.params.curve.value = 0.5;
 *   jf.params.range.value = 1; // SOUND
 *   jf.params.mode.value = 2;  // CYCLE
 *   
 *   // Connect outputs
 *   const gain = ctx.createGain();
 *   gain.gain.value = 0.2;
 *   jf.getMixOutput().connect(gain);
 *   gain.connect(ctx.destination);
 *   
 *   // Or connect individual outputs
 *   jf.getIdentityOutput().connect(someDestination);
 *   jf.get2NOutput().connect(anotherDestination);
 *   
 *   // Connect CV inputs
 *   someOscillator.connect(jf.getTimeCVInput());
 *   lfo.connect(jf.getFMInput());
 */

export class JustFriendsOscNode extends AudioWorkletNode {
  
  /**
   * Range constants for use with params.range
   */
  static RANGE_SHAPE = 0;
  static RANGE_SOUND = 1;
  static RANGE_TRANSIENT = 2; // Stub for future
  
  /**
   * Mode constants for use with params.mode
   */
  static MODE_TRANSIENT = 0;
  static MODE_SUSTAIN = 1;
  static MODE_CYCLE = 2;
  
  /**
   * Create a new JustFriendsOscNode
   * @param {AudioContext} context - The audio context
   */
  constructor(context) {
    super(context, 'just-friends-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [7], // 6 slopes + MIX
      channelCount: 3, // TIME CV, FM, INTONE CV
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    this._context = context;
    
    // Map AudioParams to a friendly params object
    this.params = {
      time: this.parameters.get('time'),
      intone: this.parameters.get('intone'),
      ramp: this.parameters.get('ramp'),
      curve: this.parameters.get('curve'),
      range: this.parameters.get('range'),
      mode: this.parameters.get('mode'),
      run: this.parameters.get('run'),
      fmIndex: this.parameters.get('fmIndex')
    };
    
    // Create input nodes for CV routing
    // These allow external sources to modulate the processor inputs
    
    // TIME CV input (1V/oct pitch control)
    this._timeCVInput = context.createGain();
    this._timeCVInput.gain.value = 1;
    
    // FM input (frequency modulation)
    this._fmInput = context.createGain();
    this._fmInput.gain.value = 1;
    
    // INTONE CV input
    this._intoneCVInput = context.createGain();
    this._intoneCVInput.gain.value = 1;
    
    // Merge the 3 CV inputs into the processor's single multi-channel input
    this._inputMerger = context.createChannelMerger(3);
    this._timeCVInput.connect(this._inputMerger, 0, 0);
    this._fmInput.connect(this._inputMerger, 0, 1);
    this._intoneCVInput.connect(this._inputMerger, 0, 2);
    this._inputMerger.connect(this);
    
    // Create output splitter to route individual channels
    this._outputSplitter = context.createChannelSplitter(7);
    this.connect(this._outputSplitter);
    
    // Create individual output gain nodes for each slope
    // This allows independent gain control and easy patching
    
    this._identityOut = context.createGain();
    this._identityOut.gain.value = 1;
    
    this._n2Out = context.createGain();
    this._n2Out.gain.value = 1;
    
    this._n3Out = context.createGain();
    this._n3Out.gain.value = 1;
    
    this._n4Out = context.createGain();
    this._n4Out.gain.value = 1;
    
    this._n5Out = context.createGain();
    this._n5Out.gain.value = 1;
    
    this._n6Out = context.createGain();
    this._n6Out.gain.value = 1;
    
    this._mixOut = context.createGain();
    this._mixOut.gain.value = 1;
    
    // Connect splitter channels to output nodes
    this._outputSplitter.connect(this._identityOut, 0);
    this._outputSplitter.connect(this._n2Out, 1);
    this._outputSplitter.connect(this._n3Out, 2);
    this._outputSplitter.connect(this._n4Out, 3);
    this._outputSplitter.connect(this._n5Out, 4);
    this._outputSplitter.connect(this._n6Out, 5);
    this._outputSplitter.connect(this._mixOut, 6);
  }
  
  // ============================================
  // Input Accessors
  // ============================================
  
  /**
   * Get the TIME CV input node
   * Connect a 1V/oct pitch source here
   * @returns {GainNode}
   */
  getTimeCVInput() {
    return this._timeCVInput;
  }
  
  /**
   * Get the FM input node
   * Connect an audio-rate modulation source here
   * @returns {GainNode}
   */
  getFMInput() {
    return this._fmInput;
  }
  
  /**
   * Get the INTONE CV input node
   * Connect a modulation source to control harmonic spread
   * @returns {GainNode}
   */
  getIntoneCVInput() {
    return this._intoneCVInput;
  }
  
  // ============================================
  // Output Accessors
  // ============================================
  
  /**
   * Get the IDENTITY (1N) output
   * This is the fundamental frequency oscillator
   * @returns {GainNode}
   */
  getIdentityOutput() {
    return this._identityOut;
  }
  
  /**
   * Get the 2N output
   * At INTONE CW: 2x frequency (octave up)
   * At INTONE CCW: 1/2 frequency (octave down)
   * @returns {GainNode}
   */
  get2NOutput() {
    return this._n2Out;
  }
  
  /**
   * Get the 3N output
   * At INTONE CW: 3x frequency (octave + fifth)
   * At INTONE CCW: 1/3 frequency
   * @returns {GainNode}
   */
  get3NOutput() {
    return this._n3Out;
  }
  
  /**
   * Get the 4N output
   * At INTONE CW: 4x frequency (2 octaves)
   * At INTONE CCW: 1/4 frequency
   * @returns {GainNode}
   */
  get4NOutput() {
    return this._n4Out;
  }
  
  /**
   * Get the 5N output
   * At INTONE CW: 5x frequency (2 octaves + major 3rd)
   * At INTONE CCW: 1/5 frequency
   * @returns {GainNode}
   */
  get5NOutput() {
    return this._n5Out;
  }
  
  /**
   * Get the 6N output
   * At INTONE CW: 6x frequency (2 octaves + fifth)
   * At INTONE CCW: 1/6 frequency
   * @returns {GainNode}
   */
  get6NOutput() {
    return this._n6Out;
  }
  
  /**
   * Get the MIX output
   * Equal mix of all 6 oscillators with soft limiting
   * @returns {GainNode}
   */
  getMixOutput() {
    return this._mixOut;
  }
  
  /**
   * Get output by index (0-6)
   * 0=IDENTITY, 1=2N, 2=3N, 3=4N, 4=5N, 5=6N, 6=MIX
   * @param {number} index
   * @returns {GainNode}
   */
  getOutput(index) {
    const outputs = [
      this._identityOut,
      this._n2Out,
      this._n3Out,
      this._n4Out,
      this._n5Out,
      this._n6Out,
      this._mixOut
    ];
    return outputs[index] || null;
  }
  
  // ============================================
  // Convenience Methods
  // ============================================
  
  /**
   * Set the module to cycle/sound mode (oscillator mode)
   */
  setCycleSoundMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SOUND;
    this.params.mode.value = JustFriendsOscNode.MODE_CYCLE;
  }
  
  /**
   * Set the module to cycle/shape mode (LFO mode)
   */
  setCycleShapeMode() {
    this.params.range.value = JustFriendsOscNode.RANGE_SHAPE;
    this.params.mode.value = JustFriendsOscNode.MODE_CYCLE;
  }
  
  /**
   * Set all oscillators to unison (INTONE at noon)
   */
  setUnison() {
    this.params.intone.value = 0.5;
  }
  
  /**
   * Set oscillators to harmonic overtone series
   */
  setOvertones() {
    this.params.intone.value = 1.0;
  }
  
  /**
   * Set oscillators to undertone/subharmonic series
   */
  setUndertones() {
    this.params.intone.value = 0.0;
  }
  
  /**
   * Set waveshape to sine (CURVE fully CW, RAMP at noon)
   */
  setSineWave() {
    this.params.curve.value = 1.0;
    this.params.ramp.value = 0.5;
  }
  
  /**
   * Set waveshape to triangle (CURVE at noon, RAMP at noon)
   */
  setTriangleWave() {
    this.params.curve.value = 0.5;
    this.params.ramp.value = 0.5;
  }
  
  /**
   * Set waveshape to saw (CURVE at noon, RAMP fully CCW)
   */
  setSawWave() {
    this.params.curve.value = 0.5;
    this.params.ramp.value = 0.0;
  }
  
  /**
   * Set waveshape to ramp (CURVE at noon, RAMP fully CW)
   */
  setRampWave() {
    this.params.curve.value = 0.5;
    this.params.ramp.value = 1.0;
  }
  
  /**
   * Set waveshape to square/pulse (CURVE fully CCW)
   * RAMP controls pulse width
   */
  setSquareWave() {
    this.params.curve.value = 0.0;
    this.params.ramp.value = 0.5;
  }
  
  /**
   * Disconnect all nodes and clean up
   */
  dispose() {
    // Disconnect worklet node
    this.disconnect();
    
    // Disconnect outputs
    this._identityOut.disconnect();
    this._n2Out.disconnect();
    this._n3Out.disconnect();
    this._n4Out.disconnect();
    this._n5Out.disconnect();
    this._n6Out.disconnect();
    this._mixOut.disconnect();
    
    // Disconnect splitter
    this._outputSplitter.disconnect();
    
    // Disconnect inputs
    this._timeCVInput.disconnect();
    this._fmInput.disconnect();
    this._intoneCVInput.disconnect();
    this._inputMerger.disconnect();
  }
}

// Also export as default for flexibility
export default JustFriendsOscNode;

/*
 * ============================================
 * MINIMAL TEST HARNESS EXAMPLE
 * ============================================
 * 
 * This is a simple example of how to use JustFriendsOscNode.
 * Copy this to an HTML file or module to test.
 * 
 * ```javascript
 * import { JustFriendsOscNode } from './JustFriendsOscNode.js';
 * 
 * async function init() {
 *   const ctx = new AudioContext();
 *   
 *   // Load the processor
 *   await ctx.audioWorklet.addModule('./just-friends-osc-processor.js');
 *   
 *   // Create the node
 *   const jf = new JustFriendsOscNode(ctx);
 *   
 *   // Configure for oscillator mode
 *   jf.setCycleSoundMode();
 *   
 *   // Set initial parameters
 *   jf.params.time.value = 0.5;     // Middle frequency
 *   jf.params.intone.value = 0.5;   // Unison
 *   jf.params.ramp.value = 0.5;     // Triangle
 *   jf.params.curve.value = 1.0;    // Sine
 *   jf.params.fmIndex.value = 0;    // No FM
 *   
 *   // Create output gain for volume control
 *   const masterGain = ctx.createGain();
 *   masterGain.gain.value = 0.2;
 *   
 *   // Connect MIX output to speakers
 *   jf.getMixOutput().connect(masterGain);
 *   masterGain.connect(ctx.destination);
 *   
 *   // Resume audio context (required for user gesture)
 *   await ctx.resume();
 *   
 *   // Example: Sweep INTONE from unison to overtones
 *   jf.params.intone.setValueAtTime(0.5, ctx.currentTime);
 *   jf.params.intone.linearRampToValueAtTime(1.0, ctx.currentTime + 2);
 *   
 *   // Example: Connect an LFO to TIME CV for vibrato
 *   const lfo = ctx.createOscillator();
 *   lfo.frequency.value = 5; // 5 Hz vibrato
 *   const lfoGain = ctx.createGain();
 *   lfoGain.gain.value = 0.01; // Small amount (about 1 semitone)
 *   lfo.connect(lfoGain);
 *   lfoGain.connect(jf.getTimeCVInput());
 *   lfo.start();
 *   
 *   return { ctx, jf, masterGain };
 * }
 * 
 * // Call init() on user interaction (e.g., button click)
 * document.getElementById('startButton').addEventListener('click', init);
 * ```
 * 
 * ============================================
 * NOTES FOR FUTURE IMPLEMENTATION
 * ============================================
 * 
 * Modes to implement:
 * 
 * 1. transient/shape: Triggered AR envelopes
 *    - Requires trigger inputs (could use message port)
 *    - Trigger skipping behavior
 *    - Clock division
 * 
 * 2. sustain/shape: Gated ASR envelopes
 *    - Gate-sensitive inputs
 *    - Vactrol memory effect
 *    - Gate-to-CV-sequence converter
 * 
 * 3. transient/sound: Impulse-train VCOs
 *    - Requires external clock/oscillator to drive
 *    - Subharmonics generation
 * 
 * 4. sustain/sound: Trapezoid VCOs
 *    - PWM tracking from input gate width
 * 
 * RUN Modes (activated by RUN input):
 * 
 * 1. SHIFT (transient/shape): Retrigger control
 * 2. STRATA (sustain/shape): ARSR envelopes, slew limiting
 * 3. VOLLEY (cycle/shape): Modulation bursts
 * 4. SPILL (transient/sound): Impulse-trains with sync chaos
 * 5. PLUME (sustain/sound): LPG-processed VCOs, polyphonic synthesis
 * 6. FLOOM (cycle/sound): 2-operator FM synthesis, noise generation
 * 
 * Additional features to consider:
 * 
 * - Trigger inputs via MessagePort for envelope modes
 * - RAMP CV input
 * - CURVE CV input
 * - Trigger input normalling (cascade from 6N down to IDENTITY)
 * - Phase sync/reset via triggers
 * - Different MIX behavior for SHAPE range (scaled max)
 */
