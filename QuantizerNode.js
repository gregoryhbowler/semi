// QuantizerNode.js
// Wrapper for Quantizer AudioWorkletProcessor

export class QuantizerNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'quantizer-processor', {
      numberOfInputs: 1,  // CV input
      numberOfOutputs: 1, // Quantized CV output
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Store parameter references
    this.params = {
      depth: this.parameters.get('depth'),
      offset: this.parameters.get('offset')
    };

    // Create input/output gain nodes for patching
    this.cvInput = context.createGain();
    this.cvOutput = context.createGain();
    
    // Wire up the signal path
    this.cvInput.connect(this, 0, 0);
    this.connect(this.cvOutput, 0, 0);
    
    // Track current note mask
    this.currentNoteMask = new Array(12).fill(true); // Default: chromatic
  }

  // ========== PARAMETER SETTERS ==========

  setDepth(value) {
    // 0 = no modulation (single note), 8 = eight octaves
    this.params.depth.value = Math.max(0, Math.min(8, value));
  }

  setOffset(volts) {
    // -4V to +4V (transposition range)
    this.params.offset.value = Math.max(-4, Math.min(4, volts));
  }

  // ========== NOTE MASK MANAGEMENT ==========

  // Set the note mask (12 booleans: C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
  setNoteMask(mask) {
    if (!Array.isArray(mask) || mask.length !== 12) {
      console.error('Note mask must be an array of 12 booleans');
      return;
    }
    
    this.currentNoteMask = [...mask];
    
    // Send to processor via message port
    this.port.postMessage({
      type: 'noteMask',
      mask: this.currentNoteMask
    });
  }

  // Enable/disable a specific note (0-11, where 0=C, 1=C#, etc.)
  setNote(noteIndex, enabled) {
    if (noteIndex < 0 || noteIndex >= 12) {
      console.error('Note index must be 0-11');
      return;
    }
    
    this.currentNoteMask[noteIndex] = enabled;
    this.setNoteMask(this.currentNoteMask);
  }

  // Convenience methods for common scales
  setChromatic() {
    this.setNoteMask(new Array(12).fill(true));
  }

  setMajorScale(root = 0) {
    // Major scale intervals: W-W-H-W-W-W-H (0,2,4,5,7,9,11)
    const intervals = [0, 2, 4, 5, 7, 9, 11];
    const mask = new Array(12).fill(false);
    intervals.forEach(interval => {
      mask[(root + interval) % 12] = true;
    });
    this.setNoteMask(mask);
  }

  setMinorScale(root = 0) {
    // Natural minor intervals: W-H-W-W-H-W-W (0,2,3,5,7,8,10)
    const intervals = [0, 2, 3, 5, 7, 8, 10];
    const mask = new Array(12).fill(false);
    intervals.forEach(interval => {
      mask[(root + interval) % 12] = true;
    });
    this.setNoteMask(mask);
  }

  setPentatonicMajor(root = 0) {
    // Major pentatonic: 0,2,4,7,9
    const intervals = [0, 2, 4, 7, 9];
    const mask = new Array(12).fill(false);
    intervals.forEach(interval => {
      mask[(root + interval) % 12] = true;
    });
    this.setNoteMask(mask);
  }

  setPentatonicMinor(root = 0) {
    // Minor pentatonic: 0,3,5,7,10
    const intervals = [0, 3, 5, 7, 10];
    const mask = new Array(12).fill(false);
    intervals.forEach(interval => {
      mask[(root + interval) % 12] = true;
    });
    this.setNoteMask(mask);
  }

  // Get current note mask
  getNoteMask() {
    return [...this.currentNoteMask];
  }

  // ========== I/O ACCESSORS ==========

  getInput() {
    return this.cvInput;
  }

  getOutput() {
    return this.cvOutput;
  }

  // ========== CLEANUP ==========

  dispose() {
    this.disconnect();
    this.cvInput.disconnect();
    this.cvOutput.disconnect();
  }
}
