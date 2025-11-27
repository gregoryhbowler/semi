// EnvelopeVCANode.js
// Wrapper for Envelope + VCA AudioWorkletProcessor
// Provides high-quality AD/ASR envelopes with linear/exponential curves

export class EnvelopeVCANode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'envelope-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Store parameter references
    this.params = {
      attack: this.parameters.get('attack'),
      decay: this.parameters.get('decay'),
      sustain: this.parameters.get('sustain'),
      mode: this.parameters.get('mode'),
      curve: this.parameters.get('curve')
    };
    
    // Create I/O nodes
    this.audioInput = context.createGain();
    this.audioOutput = context.createGain();
    
    // Wire up
    this.audioInput.connect(this, 0, 0);
    this.connect(this.audioOutput, 0, 0);
    
    console.log('✓ EnvelopeVCANode created');
  }

  // ========== PARAMETER SETTERS ==========

  /**
   * Set attack time in seconds
   * @param {number} seconds - 0.001 to 3.0
   */
  setAttack(seconds) {
    this.params.attack.value = Math.max(0.001, Math.min(3.0, seconds));
  }

  /**
   * Set decay/release time in seconds
   * @param {number} seconds - 0.005 to 10.0
   */
  setDecay(seconds) {
    this.params.decay.value = Math.max(0.005, Math.min(10.0, seconds));
  }

  /**
   * Set sustain level (ASR mode only)
   * @param {number} level - 0.0 to 1.0
   */
  setSustain(level) {
    this.params.sustain.value = Math.max(0, Math.min(1.0, level));
  }

  /**
   * Set envelope mode
   * @param {string} mode - 'AD' or 'ASR'
   */
  setMode(mode) {
    if (mode === 'AD') {
      this.params.mode.value = 0;
    } else if (mode === 'ASR') {
      this.params.mode.value = 1;
    }
  }

  /**
   * Set curve type
   * @param {string} curve - 'linear' or 'exponential'
   */
  setCurve(curve) {
    if (curve === 'linear') {
      this.params.curve.value = 0;
    } else if (curve === 'exponential') {
      this.params.curve.value = 1;
    }
  }

  // ========== GATE CONTROL ==========

  /**
   * Trigger gate ON at specified time
   * @param {number} time - AudioContext time in seconds
   */
  triggerGateOn(time) {
    this.port.postMessage({
      type: 'gate',
      time: time,
      isOn: true
    });
  }

  /**
   * Trigger gate OFF at specified time
   * @param {number} time - AudioContext time in seconds
   */
  triggerGateOff(time) {
    this.port.postMessage({
      type: 'gate',
      time: time,
      isOn: false
    });
  }

  /**
   * Trigger gate ON immediately
   */
  trigger() {
    this.triggerGateOn(this.context.currentTime);
  }

  /**
   * Release gate immediately
   */
  release() {
    this.triggerGateOff(this.context.currentTime);
  }

  // ========== I/O ACCESSORS ==========

  getInput() {
    return this.audioInput;
  }

  getOutput() {
    return this.audioOutput;
  }

  // ========== CLEANUP ==========

  dispose() {
    this.disconnect();
    this.audioInput.disconnect();
    this.audioOutput.disconnect();
  }
}
