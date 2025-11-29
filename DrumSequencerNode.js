// DrumSequencerNode.js
// Wrapper for drum sequencer AudioWorkletProcessor
// UPDATED: Clock division system
// Receives step pulses and subdivides them by clockDivision
//
// INPUTS:
// Input 0: Step clock (from transpose sequencer)
// Input 1: Reset clock (from transpose sequencer)
//
// OUTPUTS (3 channels):
// Channel 0: Kick trigger
// Channel 1: Snare trigger
// Channel 2: Hi-hat trigger

export class DrumSequencerNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'drum-sequencer-processor', {
      numberOfInputs: 2,  // Step clock and reset clock
      numberOfOutputs: 1, // 3 channels: Kick, Snare, Hat triggers
      outputChannelCount: [3],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Store parameter references
    this.params = {
      swing: this.parameters.get('swing'),
      clockDivision: this.parameters.get('clockDivision')
    };
    
    // Create I/O nodes
    this.stepClockInput = context.createGain();
    this.resetClockInput = context.createGain();
    
    // Create channel splitter for accessing separate trigger outputs
    this.splitter = context.createChannelSplitter(3);
    this.connect(this.splitter);
    
    // Create gain nodes for each trigger output
    this.kickTrigger = context.createGain();
    this.snareTrigger = context.createGain();
    this.hatTrigger = context.createGain();
    
    // Connect splitter to outputs
    this.splitter.connect(this.kickTrigger, 0);
    this.splitter.connect(this.snareTrigger, 1);
    this.splitter.connect(this.hatTrigger, 2);
    
    // Wire up inputs
    this.stepClockInput.connect(this, 0, 0); // Input 0: Step clock
    this.resetClockInput.connect(this, 0, 1); // Input 1: Reset clock
  }

  // ========== PARAMETER SETTERS ==========

  setSwing(value) {
    this.params.swing.value = Math.max(0, Math.min(1, value));
  }

  /**
   * Set clock division (how many drum steps per transpose step)
   * @param {number} division - 1, 2, 4, 8, or 16
   */
  setClockDivision(division) {
    const validDivisions = [1, 2, 4, 8, 16];
    const closest = validDivisions.reduce((prev, curr) => 
      Math.abs(curr - division) < Math.abs(prev - division) ? curr : prev
    );
    this.params.clockDivision.value = closest;
    console.log(`✓ Drum clock division: ${closest} (${closest} drum steps per melody step)`);
  }

  getClockDivision() {
    return Math.round(this.params.clockDivision.value);
  }

  // ========== STEP PROGRAMMING ==========

  setStep(voice, step, value) {
    this.port.postMessage({ 
      type: 'setStep', 
      voice: voice, // 'kick', 'snare', or 'hat'
      step: step,   // 0-15
      value: value  // true/false or 1/0
    });
  }

  clearPattern(voice) {
    this.port.postMessage({ 
      type: 'clearPattern', 
      voice: voice // 'kick', 'snare', 'hat', or 'all'
    });
  }

  // ========== I/O ACCESSORS ==========

  /**
   * Get step clock input (connect transpose sequencer step pulse here)
   */
  getStepClockInput() {
    return this.stepClockInput;
  }

  /**
   * Get reset clock input (connect transpose sequencer reset pulse here)
   */
  getResetClockInput() {
    return this.resetClockInput;
  }

  // Legacy method for backwards compatibility
  getClockInput() {
    return this.stepClockInput;
  }

  getKickTriggerOutput() {
    return this.kickTrigger;
  }

  getSnareTriggerOutput() {
    return this.snareTrigger;
  }

  getHatTriggerOutput() {
    return this.hatTrigger;
  }

  // ========== CLEANUP ==========

  dispose() {
    this.disconnect();
    this.stepClockInput.disconnect();
    this.resetClockInput.disconnect();
    this.splitter.disconnect();
    this.kickTrigger.disconnect();
    this.snareTrigger.disconnect();
    this.hatTrigger.disconnect();
  }
}
