// quantizer-processor.js
// CV Quantizer - AudioWorklet Processor
// Converts continuous audio-rate CV into quantized audio-rate CV (1V/oct space)
// NO MIDI, NO TRIGGERS - pure analog-style quantization

class QuantizerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Depth: controls pitch range in octaves (0 = single note, 1 = 1 octave range)
      { name: 'depth', defaultValue: 1.0, minValue: 0, maxValue: 1 },
      
      // Offset: shifts CV after quantization (-2V to +2V for transposition)
      { name: 'offset', defaultValue: 0.0, minValue: -2.0, maxValue: 2.0 }
    ];
  }

  constructor() {
    super();
    
    // Note mask: 12 booleans for C through B
    // Default: chromatic scale (all notes allowed)
    this.noteMask = new Array(12).fill(true);
    
    // Listen for note mask updates from the Node
    this.port.onmessage = (event) => {
      if (event.data.type === 'noteMask') {
        this.noteMask = event.data.mask;
      }
    };
  }

  // Find nearest allowed semitone within an octave (0-11)
  // Takes a fractional semitone value and rounds to nearest allowed note
  findNearestAllowedNote(semitonesInOctave) {
    // Round to nearest integer first
    let targetIdx = Math.round(semitonesInOctave);
    
    // Wrap to 0-11 range
    while (targetIdx < 0) targetIdx += 12;
    while (targetIdx >= 12) targetIdx -= 12;
    
    // If this note is allowed, use it
    if (this.noteMask[targetIdx]) {
      return targetIdx;
    }
    
    // Otherwise, spiral outward to find nearest allowed note
    for (let distance = 1; distance < 12; distance++) {
      // Check upward
      const upIdx = (targetIdx + distance) % 12;
      if (this.noteMask[upIdx]) {
        // Check if downward also has an allowed note at same distance
        const downIdx = (targetIdx - distance + 12) % 12;
        if (this.noteMask[downIdx]) {
          // Both directions have allowed notes at same distance
          // Choose based on which side of the semitone we're on
          const frac = semitonesInOctave - Math.floor(semitonesInOctave);
          return frac >= 0.5 ? upIdx : downIdx;
        }
        return upIdx;
      }
      
      // Check downward
      const downIdx = (targetIdx - distance + 12) % 12;
      if (this.noteMask[downIdx]) {
        return downIdx;
      }
    }
    
    // Fallback: return C if no notes are allowed (shouldn't happen)
    return 0;
  }

  // Quantize a voltage value to the nearest allowed note
  quantizeVoltage(voltsIn) {
    // Convert voltage to semitones (1V/oct = 12 semitones/volt)
    const noteFloat = voltsIn * 12.0;
    
    // Split into octave and note-within-octave
    const octave = Math.floor(noteFloat / 12.0);
    const semitonesInOctave = noteFloat - (octave * 12.0);
    
    // Handle negative octaves correctly
    if (semitonesInOctave < 0) {
      // For negative voltages, adjust octave and semitone
      return this.quantizeVoltage(voltsIn + (Math.abs(octave) + 1));
    }
    
    // Find nearest allowed note in this octave
    const snappedIdx = this.findNearestAllowedNote(semitonesInOctave);
    
    // Reconstruct the full note number
    const snappedNote = (octave * 12.0) + snappedIdx;
    
    // Convert back to voltage
    return snappedNote / 12.0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0] || !output || !output[0]) {
      return true;
    }
    
    const cvIn = input[0];
    const cvOut = output[0];
    
    for (let i = 0; i < cvIn.length; i++) {
      // Get parameters (can be audio-rate modulated)
      const depth = parameters.depth[i] ?? parameters.depth[0];
      const offset = parameters.offset[i] ?? parameters.offset[0];
      
      // Read input CV (Just Friends SHAPE outputs 0-8V, normalized as 0-1.6)
      const cvValue = cvIn[i] || 0;
      
      // Convert JF output (0-1.6) to 0-1 normalized range
      // JF SHAPE: 0-8V → 0-1.6 in Web Audio
      const normalized = Math.max(0, Math.min(1.6, cvValue)) / 1.6;
      
      // Apply depth: map to octave range
      // depth = 1.0 → 1 octave (0-1V)
      // depth = 0.5 → half octave (0-0.5V) 
      // depth = 0 → no modulation (0V)
      const volts = normalized * depth;
      
      // Quantize to nearest allowed note
      const quantizedVolts = this.quantizeVoltage(volts);
      
      // Apply offset (transposition) AFTER quantization
      const finalVolts = quantizedVolts + offset;
      
      // Convert back to Web Audio normalized range
      // For pitch CV: 1V/oct, so we keep it in voltage space
      cvOut[i] = finalVolts / 5.0; // Normalize for Web Audio
    }
    
    return true;
  }
}

registerProcessor('quantizer-processor', QuantizerProcessor);
