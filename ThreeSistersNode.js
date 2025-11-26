// ThreeSistersNode.js
// Wrapper for Three Sisters AudioWorkletProcessor

export class ThreeSistersNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'three-sisters-processor', {
      numberOfInputs: 1,  // Single bus, 2 channels merged below
      numberOfOutputs: 1, // 4 channels: LOW, CENTRE, HIGH, ALL
      outputChannelCount: [4],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Store parameter references
    this.params = {
      freq: this.parameters.get('freq'),
      span: this.parameters.get('span'),
      quality: this.parameters.get('quality'),
      mode: this.parameters.get('mode'),
      fmAttenuverter: this.parameters.get('fmAttenuverter')
    };

    // Create channel splitter for accessing separate outputs
    this.splitter = context.createChannelSplitter(4);
    this.connect(this.splitter);

    // Create gain nodes for each output
    this.outputs = {
      low: context.createGain(),
      centre: context.createGain(),
      high: context.createGain(),
      all: context.createGain()
    };
    
    // Connect splitter to individual outputs
    this.splitter.connect(this.outputs.low, 0);
    this.splitter.connect(this.outputs.centre, 1);
    this.splitter.connect(this.outputs.high, 2);
    this.splitter.connect(this.outputs.all, 3);

    // Create input gain nodes
    this.audioInput = context.createGain();
    this.fmInput = context.createGain();

    // Merge audio + FM into a single 2-channel bus to avoid input index errors
    this.inputMerger = context.createChannelMerger(2);
    this.audioInput.connect(this.inputMerger, 0, 0);
    this.fmInput.connect(this.inputMerger, 0, 1);
    this.inputMerger.channelInterpretation = 'discrete';
    this.inputMerger.connect(this);
  }

  // ========== PARAMETER SETTERS ==========

  setFreq(knobValue) {
    // 0-1 range, exponential mapping handled in processor
    this.params.freq.value = Math.max(0, Math.min(1, knobValue));
  }

  setSpan(knobValue) {
    // 0-1 range, controls spread between LOW and HIGH
    this.params.span.value = Math.max(0, Math.min(1, knobValue));
  }

  setQuality(knobValue) {
    // 0-1 range
    // < 0.5 = anti-resonance (notch filtering)
    // 0.5 = neutral
    // > 0.5 = resonance → self-oscillation
    this.params.quality.value = Math.max(0, Math.min(1, knobValue));
  }

  setMode(modeValue) {
    // 0 = crossover, 1 = formant
    this.params.mode.value = modeValue < 0.5 ? 0 : 1;
  }

  setFMAttenuverter(knobValue) {
    // 0-1 range: 0 = full negative, 0.5 = off (noon), 1 = full positive
    // This matches the technical map's FM attenuverter
    this.params.fmAttenuverter.value = Math.max(0, Math.min(1, knobValue));
  }

  // ========== OUTPUT ACCESSORS ==========

  getLowOutput() {
    return this.outputs.low;
  }

  getCentreOutput() {
    return this.outputs.centre;
  }

  getHighOutput() {
    return this.outputs.high;
  }

  getAllOutput() {
    return this.outputs.all;
  }

  // ========== INPUT ACCESSORS ==========

  getAudioInput() {
    return this.audioInput;
  }

  getFMInput() {
    return this.fmInput;
  }

  // ========== CLEANUP ==========

    dispose() {
      this.disconnect();
      Object.values(this.outputs).forEach(output => output.disconnect());
      this.audioInput.disconnect();
      this.fmInput.disconnect();
      this.inputMerger.disconnect();
      this.splitter.disconnect();
    }
}
