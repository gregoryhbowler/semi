// quantizer-processor.js
// CV Quantizer - AudioWorklet Processor
// Converts continuous audio-rate CV into quantized audio-rate CV (1V/oct space)
// NO MIDI, NO TRIGGERS - pure analog-style quantization

class QuantizerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Depth: scales incoming CV amplitude (0 = no modulation, 1 = full range)
      { name: 'depth', defaultValue: 1.0, minValue: 0, maxValue: 1 },
      
      // Offset: shifts CV before quantization (-2V to +2V for transposition)
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
  // Returns the index of the closest allowed note
  findNearestAllowedNote(semitonesInOctave) {
    // Clamp to 0-11 range
    let idx = Math.floor(semitonesInOctave) % 12;
    if (idx < 0) idx += 12;
    
    // If this note is allowed, use it
    if (this.noteMask[idx]) {
      return idx;
    }
    
    // Otherwise, spiral outward to find nearest allowed note
    // Check up and down simultaneously
    for (let distance = 1; distance < 12; distance++) {
      // Check upward
      const upIdx = (idx + distance) % 12;
      if (this.noteMask[upIdx]) {
        // Check if upward is closer than downward
        const downIdx = (idx - distance + 12) % 12;
        if (this.noteMask[downIdx]) {
          // Both directions have allowed notes at same distance
          // Choose the one closer to the fractional position
          const frac = semitonesInOctave - Math.floor(semitonesInOctave);
          return frac >= 0.5 ? upIdx : downIdx;
        }
        return upIdx;
      }
      
      // Check downward
      const downIdx = (idx - distance + 12) % 12;
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
      
      // Read input CV (normalized ±1 in Web Audio = ±5V in Eurorack)
      const cvValue = cvIn[i] || 0;
      
      // Convert to voltage
      let volts = cvValue * 5.0; // Web Audio ±1 → ±5V
      
      // Apply depth scaling
      volts *= depth;
      
      // Apply offset
      volts += offset;
      
      // Quantize to nearest allowed note
      const quantizedVolts = this.quantizeVoltage(volts);
      
      // Convert back to Web Audio normalized range
      cvOut[i] = quantizedVolts / 5.0;
    }
    
    return true;
  }
}

registerProcessor('quantizer-processor', QuantizerProcessor);
