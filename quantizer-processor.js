// quantizer-processor.js
// CV Quantizer - AudioWorkletProcessor
// Converts continuous audio-rate CV into quantized audio-rate CV (1V/oct space)
// NOW WITH TRANSPOSE SEQUENCER SUPPORT
// NO MIDI, NO TRIGGERS - pure analog-style quantization

class QuantizerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Depth: controls pitch range in octaves (0 = single note, 8 = 8 octaves range)
      { name: 'depth', defaultValue: 1.0, minValue: 0, maxValue: 8.0 },
      
      // Offset: shifts CV after quantization (-4V to +4V for transposition)
      { name: 'offset', defaultValue: 0.0, minValue: -4.0, maxValue: 4.0 },
      
      // Transpose: semitone offset within scale (-24 to +24)
      { name: 'transpose', defaultValue: 0, minValue: -24, maxValue: 24 }
    ];
  }

  constructor() {
    super();
    
    // Note mask: 12 booleans for C through B
    // Default: chromatic scale (all notes allowed)
    this.noteMask = new Array(12).fill(true);
    
    // Get list of allowed notes (indices 0-11)
    this.updateAllowedNotes();
    
    // Debug counters
    this.sampleCount = 0;
    this.debugInterval = 48000; // Log every second at 48kHz
    
    // Listen for note mask updates from the Node
    this.port.onmessage = (event) => {
      if (event.data.type === 'noteMask') {
        this.noteMask = event.data.mask;
        this.updateAllowedNotes();
        console.log(`[Quantizer] Note mask updated: ${this.allowedNotes.length}/12 notes active`);
      }
    };
  }

  // Update the list of allowed note indices
  updateAllowedNotes() {
    this.allowedNotes = [];
    for (let i = 0; i < 12; i++) {
      if (this.noteMask[i]) {
        this.allowedNotes.push(i);
      }
    }
    
    // If no notes are allowed, default to C
    if (this.allowedNotes.length === 0) {
      this.allowedNotes = [0];
    }
  }

  // Find nearest allowed semitone index (0-11) within an octave
  findNearestAllowedNote(fractionalSemitone) {
    // Round to nearest integer semitone first
    let targetIdx = Math.round(fractionalSemitone);
    
    // Wrap to 0-11 range
    targetIdx = ((targetIdx % 12) + 12) % 12;
    
    // If this note is allowed, use it immediately
    if (this.noteMask[targetIdx]) {
      return targetIdx;
    }
    
    // Otherwise, spiral outward to find nearest allowed note
    for (let distance = 1; distance <= 6; distance++) {
      // Check upward
      const upIdx = (targetIdx + distance) % 12;
      if (this.noteMask[upIdx]) {
        // Check downward at same distance
        const downIdx = (targetIdx - distance + 12) % 12;
        if (this.noteMask[downIdx]) {
          // Both directions have allowed notes - pick closest based on fractional part
          const frac = fractionalSemitone - Math.floor(fractionalSemitone);
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
    
    // Fallback: return C (shouldn't happen if at least one note is enabled)
    return 0;
  }

  // Quantize a voltage value to the nearest allowed note
  // Returns voltage in 1V/oct space
  quantizeVoltage(voltsIn) {
    // Convert voltage to semitones (1V/oct = 12 semitones/volt)
    const totalSemitones = voltsIn * 12.0;
    
    // Split into octave and semitone-within-octave
    const octave = Math.floor(totalSemitones / 12.0);
    const semitoneInOctave = totalSemitones - (octave * 12.0);
    
    // Find nearest allowed note within this octave
    const snappedIdx = this.findNearestAllowedNote(semitoneInOctave);
    
    // Reconstruct the quantized semitone value
    const quantizedSemitones = (octave * 12) + snappedIdx;
    
    // Convert back to voltage
    return quantizedSemitones / 12.0;
  }

  // Transpose within scale by N semitones
  // This keeps the result within the allowed notes
  transposeInScale(voltsIn, transposeSemitones) {
    if (transposeSemitones === 0) {
      return voltsIn;
    }
    
    // Convert voltage to semitones
    const totalSemitones = Math.round(voltsIn * 12.0);
    
    // Split into octave and semitone-within-octave
    let octave = Math.floor(totalSemitones / 12.0);
    let noteIdx = totalSemitones - (octave * 12);
    noteIdx = ((noteIdx % 12) + 12) % 12;
    
    // Find current note's position in allowedNotes array
    let currentPos = this.allowedNotes.indexOf(noteIdx);
    if (currentPos === -1) {
      // Note not in scale (shouldn't happen after quantization)
      currentPos = 0;
    }
    
    // Apply transpose by moving through the scale
    let targetPos = currentPos + transposeSemitones;
    
    // Calculate octave shifts
    const scaleLength = this.allowedNotes.length;
    const octaveShifts = Math.floor(targetPos / scaleLength);
    targetPos = ((targetPos % scaleLength) + scaleLength) % scaleLength;
    
    octave += octaveShifts;
    
    // Get the new note
    const newNoteIdx = this.allowedNotes[targetPos];
    
    // Reconstruct voltage
    const newSemitones = (octave * 12) + newNoteIdx;
    return newSemitones / 12.0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0] || !output || !output[0]) {
      return true;
    }
    
    const cvIn = input[0];
    const cvOut = output[0];
    
    // Debug logging
    let debugValues = null;
    if (this.sampleCount % this.debugInterval === 0) {
      debugValues = {
        inputMin: Infinity,
        inputMax: -Infinity,
        outputMin: Infinity,
        outputMax: -Infinity,
        quantizedValues: new Set(),
        transposedValues: new Set()
      };
    }
    
    for (let i = 0; i < cvIn.length; i++) {
      // Get parameters
      const depth = parameters.depth[i] ?? parameters.depth[0];
      const offset = parameters.offset[i] ?? parameters.offset[0];
      const transpose = Math.round(parameters.transpose[i] ?? parameters.transpose[0]);
      
      // Read input CV from Just Friends
      // JF SHAPE mode outputs 0-8V, normalized to 0-1.6 in Web Audio
      const cvValue = cvIn[i] || 0;
      
      // Normalize JF output to 0-1 range
      // JF outputs 0-8V which becomes 0-1.6, so divide by 1.6
      const normalized = Math.max(0, Math.min(1.6, cvValue)) / 1.6;
      
      // Apply depth to map to voltage range
      // depth is now in octaves (0-8 range)
      const volts = normalized * depth;
      
      // Quantize to nearest allowed note
      let quantizedVolts = this.quantizeVoltage(volts);
      
      // Apply transpose WITHIN SCALE
      if (transpose !== 0) {
        quantizedVolts = this.transposeInScale(quantizedVolts, transpose);
      }
      
      // Apply offset AFTER transpose (final transposition)
      const finalVolts = quantizedVolts + offset;
      
      // Convert to Web Audio range for Mangrove pitch CV
      // Keep in voltage space, normalize by 5V for Web Audio
      cvOut[i] = finalVolts / 5.0;
      
      // Debug logging
      if (debugValues) {
        debugValues.inputMin = Math.min(debugValues.inputMin, cvValue);
        debugValues.inputMax = Math.max(debugValues.inputMax, cvValue);
        debugValues.outputMin = Math.min(debugValues.outputMin, finalVolts);
        debugValues.outputMax = Math.max(debugValues.outputMax, finalVolts);
        debugValues.quantizedValues.add(quantizedVolts.toFixed(3));
        if (transpose !== 0) {
          debugValues.transposedValues.add(finalVolts.toFixed(3));
        }
      }
      
      this.sampleCount++;
    }
    
    // Output debug info
    if (debugValues) {
      console.log('[Quantizer Debug]', {
        input: `${debugValues.inputMin.toFixed(3)} to ${debugValues.inputMax.toFixed(3)}`,
        output: `${debugValues.outputMin.toFixed(2)}V to ${debugValues.outputMax.toFixed(2)}V`,
        uniqueNotes: debugValues.quantizedValues.size,
        noteValues: Array.from(debugValues.quantizedValues).slice(0, 8).join(', '),
        depth: parameters.depth[0].toFixed(2),
        offset: parameters.offset[0].toFixed(2),
        transpose: Math.round(parameters.transpose[0]),
        scaleNotes: this.allowedNotes.length,
        activeMask: this.noteMask.map((v, i) => v ? i : -1).filter(v => v >= 0).join(',')
      });
    }
    
    return true;
  }
}

registerProcessor('quantizer-processor', QuantizerProcessor);
