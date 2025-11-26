// MangroveNode.js
// Wrapper for Mangrove AudioWorkletProcessor

export class MangroveNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'mangrove-processor', {
      numberOfInputs: 5,  // pitchCV, fmInput, barrelCV, formantCV, airCV
      numberOfOutputs: 1, // SQUARE and FORMANT on separate channels
      outputChannelCount: [2],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });

    this.context = context;
    
    // Store parameter references for easy access
    this.params = {
      pitchKnob: this.parameters.get('pitchKnob'),
      fineKnob: this.parameters.get('fineKnob'),
      fmIndex: this.parameters.get('fmIndex'),
      barrelKnob: this.parameters.get('barrelKnob'),
      formantKnob: this.parameters.get('formantKnob'),
      constantWaveFormant: this.parameters.get('constantWaveFormant'),
      airKnob: this.parameters.get('airKnob'),
      airAttenuverter: this.parameters.get('airAttenuverter')
    };

    // Create channel splitter for accessing separate outputs
    this.splitter = context.createChannelSplitter(2);
    this.connect(this.splitter);

    // Create gain nodes for each output
    this.squareOut = context.createGain();
    this.formantOut = context.createGain();
    
    this.splitter.connect(this.squareOut, 0);
    this.splitter.connect(this.formantOut, 1);

    // Create input gain nodes for CV inputs
    this.pitchCVInput = context.createGain();
    this.fmInput = context.createGain();
    this.barrelCVInput = context.createGain();
    this.formantCVInput = context.createGain();
    this.airCVInput = context.createGain();

    // Connect inputs to the processor
    this.pitchCVInput.connect(this, 0, 0);
    this.fmInput.connect(this, 0, 1);
    this.barrelCVInput.connect(this, 0, 2);
    this.formantCVInput.connect(this, 0, 3);
    this.airCVInput.connect(this, 0, 4);
  }

  // Convenience methods for setting parameters
  setPitch(knobValue) {
    this.params.pitchKnob.value = knobValue;
  }

  setFine(knobValue) {
    this.params.fineKnob.value = knobValue;
  }

  setFMIndex(value) {
    this.params.fmIndex.value = value;
  }

  setBarrel(knobValue) {
    this.params.barrelKnob.value = knobValue;
  }

  setFormant(knobValue) {
    this.params.formantKnob.value = knobValue;
  }

  setConstantMode(isConstantFormant) {
    // false/0 = constant wave, true/1 = constant formant
    this.params.constantWaveFormant.value = isConstantFormant ? 1 : 0;
  }

  setAir(knobValue) {
    this.params.airKnob.value = knobValue;
  }

  setAirAttenuverter(value) {
    this.params.airAttenuverter.value = value;
  }

  // Get output nodes
  getSquareOutput() {
    return this.squareOut;
  }

  getFormantOutput() {
    return this.formantOut;
  }

  // Get input nodes for patching
  getPitchCVInput() {
    return this.pitchCVInput;
  }

  getFMInput() {
    return this.fmInput;
  }

  getBarrelCVInput() {
    return this.barrelCVInput;
  }

  getFormantCVInput() {
    return this.formantCVInput;
  }

  getAirCVInput() {
    return this.airCVInput;
  }

  // Cleanup
  dispose() {
    this.disconnect();
    this.squareOut.disconnect();
    this.formantOut.disconnect();
    this.pitchCVInput.disconnect();
    this.fmInput.disconnect();
    this.barrelCVInput.disconnect();
    this.formantCVInput.disconnect();
    this.airCVInput.disconnect();
  }
}
