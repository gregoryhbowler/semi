// JustFriendsNode.js
// Wrapper for Just Friends AudioWorkletProcessor
// 
// Just Friends is a 6-channel slope generator with shared parameters
// Slopes are named: IDENTITY (1N), 2N, 3N, 4N, 5N, 6N
//
// KEY CONTROLS:
// - TIME: Sets the speed of IDENTITY slope
// - INTONE: Controls speed ratios of 2N-6N relative to IDENTITY
//   - Noon (0.5): All slopes same speed
//   - CW (>0.5): Overtones (2×, 3×, 4×, 5×, 6× at maximum)
//   - CCW (<0.5): Undertones (1/2×, 1/3×, 1/4×, 1/5×, 1/6× at minimum)
// - RAMP: Balance of rise vs fall time (CCW=sawtooth down, noon=triangle, CW=sawtooth up)
// - CURVE: Waveshaping (CCW=rectangular, noon=linear, CW=exponential→sine)
// - RANGE: Timebase (0=shape/CV-rate, 1=sound/audio-rate)
// - MODE: Excitation type (0=transient/AR, 1=sustain/ASR, 2=cycle/LFO)

export class JustFriendsNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'just-friends-processor', {
      numberOfInputs: 11,  // 6 triggers + TIME CV + INTONE CV + RAMP CV + CURVE CV + FM INPUT
      numberOfOutputs: 1,  // 7 channels: IDENTITY, 2N, 3N, 4N, 5N, 6N, MIX
      outputChannelCount: [7],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Store parameter references
    this.params = {
      time: this.parameters.get('time'),
      intone: this.parameters.get('intone'),
      ramp: this.parameters.get('ramp'),
      curve: this.parameters.get('curve'),
      range: this.parameters.get('range'),
      mode: this.parameters.get('mode'),
      fmDepth: this.parameters.get('fmDepth'),
      fmMode: this.parameters.get('fmMode')
    };

    // Create channel splitter for accessing separate slope outputs
    this.splitter = context.createChannelSplitter(7);
    this.connect(this.splitter);

    // Create gain nodes for each output
    // Named to match the Just Friends manual: IDENTITY, 2N-6N, MIX
    this.slopeOutputs = {
      identity: context.createGain(),  // IDENTITY (1N)
      n2: context.createGain(),        // 2N
      n3: context.createGain(),        // 3N
      n4: context.createGain(),        // 4N
      n5: context.createGain(),        // 5N
      n6: context.createGain(),        // 6N
      mix: context.createGain()        // MIX
    };
    
    // Connect splitter to individual outputs
    this.splitter.connect(this.slopeOutputs.identity, 0);
    this.splitter.connect(this.slopeOutputs.n2, 1);
    this.splitter.connect(this.slopeOutputs.n3, 2);
    this.splitter.connect(this.slopeOutputs.n4, 3);
    this.splitter.connect(this.slopeOutputs.n5, 4);
    this.splitter.connect(this.slopeOutputs.n6, 5);
    this.splitter.connect(this.slopeOutputs.mix, 6);

    // Create input gain nodes for CV/trigger inputs
    this.triggerInputs = Array.from({ length: 6 }, () => context.createGain());
    this.timeCvInput = context.createGain();
    this.intoneCvInput = context.createGain();
    this.rampCvInput = context.createGain();
    this.curveCvInput = context.createGain();
    this.fmInput = context.createGain();

    // Connect inputs to the processor (matching the input index order)
    this.triggerInputs.forEach((input, i) => {
      input.connect(this, 0, i);
    });
    this.timeCvInput.connect(this, 0, 6);
    this.intoneCvInput.connect(this, 0, 7);
    this.rampCvInput.connect(this, 0, 8);
    this.curveCvInput.connect(this, 0, 9);
    this.fmInput.connect(this, 0, 10);
  }

  // ========== PARAMETER SETTERS ==========

  /**
   * Set TIME knob value (controls IDENTITY slope speed)
   * @param {number} knobValue - 0 to 1 (CCW to CW)
   */
  setTime(knobValue) {
    this.params.time.value = Math.max(0, Math.min(1, knobValue));
  }

  /**
   * Set INTONE knob value (controls 2N-6N speed ratios)
   * @param {number} knobValue - 0 to 1
   *   - 0.0: Undertone series (1/2×, 1/3×, 1/4×, 1/5×, 1/6×)
   *   - 0.5: Unison (all slopes same speed)
   *   - 1.0: Overtone series (2×, 3×, 4×, 5×, 6×)
   */
  setIntone(knobValue) {
    this.params.intone.value = Math.max(0, Math.min(1, knobValue));
  }

  /**
   * Set RAMP knob value (rise/fall balance)
   * @param {number} knobValue - 0 to 1
   *   - 0.0: Instant rise, long fall (falling sawtooth)
   *   - 0.5: Equal rise/fall (triangle)
   *   - 1.0: Long rise, instant fall (rising sawtooth)
   */
  setRamp(knobValue) {
    this.params.ramp.value = Math.max(0, Math.min(1, knobValue));
  }

  /**
   * Set CURVE knob value (waveshaping)
   * @param {number} knobValue - 0 to 1
   *   - 0.0: Rectangular (instant transitions)
   *   - 0.5: Linear (no shaping)
   *   - 1.0: Sinusoidal (smooth curves)
   */
  setCurve(knobValue) {
    this.params.curve.value = Math.max(0, Math.min(1, knobValue));
  }

  /**
   * Set RANGE switch
   * @param {number} rangeValue - 0 = shape (CV-rate), 1 = sound (audio-rate)
   */
  setRange(rangeValue) {
    this.params.range.value = rangeValue;
  }

  /**
   * Set MODE switch
   * @param {number} modeValue - 0 = transient (AR), 1 = sustain (ASR), 2 = cycle (looping)
   */
  setMode(modeValue) {
    this.params.mode.value = Math.max(0, Math.min(2, Math.round(modeValue)));
  }

  /**
   * Set FM depth knob
   * @param {number} knobValue - 0.5 = noon (no FM), <0.5 = INTONE style, >0.5 = TIME style
   */
  setFMDepth(knobValue) {
    this.params.fmDepth.value = Math.max(0, Math.min(1, knobValue));
  }

  /**
   * Set FM mode
   * @param {number} modeValue - <0.5 = INTONE style, >0.5 = TIME style
   */
  setFMMode(modeValue) {
    this.params.fmMode.value = Math.max(0, Math.min(1, modeValue));
  }

  // ========== OUTPUT ACCESSORS ==========

  /**
   * Get IDENTITY (1N) output
   * IDENTITY is the fundamental slope - its speed is set by TIME
   * and is unaffected by INTONE
   */
  getIdentityOutput() {
    return this.slopeOutputs.identity;
  }

  /**
   * Get 2N output
   * Speed is affected by INTONE (2× at max CW, 0.5× at max CCW)
   */
  get2NOutput() {
    return this.slopeOutputs.n2;
  }

  /**
   * Get 3N output
   * Speed is affected by INTONE (3× at max CW, 0.333× at max CCW)
   */
  get3NOutput() {
    return this.slopeOutputs.n3;
  }

  /**
   * Get 4N output
   * Speed is affected by INTONE (4× at max CW, 0.25× at max CCW)
   */
  get4NOutput() {
    return this.slopeOutputs.n4;
  }

  /**
   * Get 5N output
   * Speed is affected by INTONE (5× at max CW, 0.2× at max CCW)
   */
  get5NOutput() {
    return this.slopeOutputs.n5;
  }

  /**
   * Get 6N output
   * Speed is affected by INTONE (6× at max CW, 0.167× at max CCW)
   */
  get6NOutput() {
    return this.slopeOutputs.n6;
  }

  /**
   * Get MIX output
   * In SHAPE range: Analog MAX (each slope divided by index, then max)
   * In SOUND range: Equal mix of all slopes with soft limiting
   */
  getMixOutput() {
    return this.slopeOutputs.mix;
  }

  /**
   * Get any slope output by index (0-5)
   * @param {number} index - 0=IDENTITY, 1=2N, 2=3N, 3=4N, 4=5N, 5=6N
   */
  getSlopeOutput(index) {
    const outputs = [
      this.slopeOutputs.identity,
      this.slopeOutputs.n2,
      this.slopeOutputs.n3,
      this.slopeOutputs.n4,
      this.slopeOutputs.n5,
      this.slopeOutputs.n6
    ];
    return outputs[index];
  }

  // ========== INPUT ACCESSORS ==========

  /**
   * Get trigger input for a specific slope (0-5)
   * Trigger inputs are normalled: a trigger to 6N cascades to all lower indices
   * unless broken by another patch cable
   */
  getTriggerInput(index) {
    if (index < 0 || index >= 6) {
      throw new Error(`Invalid trigger index: ${index}. Must be 0-5.`);
    }
    return this.triggerInputs[index];
  }

  /**
   * Get TIME CV input (1V/octave for precise timing control)
   */
  getTimeCVInput() {
    return this.timeCvInput;
  }

  /**
   * Get INTONE CV input (modulates speed ratios)
   */
  getIntoneCVInput() {
    return this.intoneCvInput;
  }

  /**
   * Get RAMP CV input (modulates rise/fall balance)
   */
  getRampCVInput() {
    return this.rampCvInput;
  }

  /**
   * Get CURVE CV input (modulates waveshaping)
   */
  getCurveCVInput() {
    return this.curveCvInput;
  }

  /**
   * Get FM input (frequency modulation)
   */
  getFMInput() {
    return this.fmInput;
  }

  // ========== CONVENIENCE METHODS ==========

  /**
   * Set all triggers to the same source (trigger normalling behavior)
   */
  connectTriggerToAll(sourceNode) {
    this.triggerInputs.forEach(input => {
      sourceNode.connect(input);
    });
  }

  /**
   * Disconnect all triggers
   */
  disconnectAllTriggers() {
    this.triggerInputs.forEach(input => {
      input.disconnect();
    });
  }

  // ========== CLEANUP ==========

  dispose() {
    // Disconnect all outputs
    this.disconnect();
    Object.values(this.slopeOutputs).forEach(output => output.disconnect());
    
    // Disconnect all inputs
    this.triggerInputs.forEach(input => input.disconnect());
    this.timeCvInput.disconnect();
    this.intoneCvInput.disconnect();
    this.rampCvInput.disconnect();
    this.curveCvInput.disconnect();
    this.fmInput.disconnect();
    
    this.splitter.disconnect();
  }
}
