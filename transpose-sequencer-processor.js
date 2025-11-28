// transpose-sequencer-processor.js
// Transpose Sequencer - AudioWorklet Processor
// SUPPORTS TWO CLOCK SOURCES:
// 1. Just Friends #1 IDENTITY (zero crossing detection)
// 2. External trigger (e.g., René note cycle completion)

class TransposeSequencerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Sequence data
    this.cells = Array.from({ length: 16 }, () => ({
      transpose: 0,
      repeats: 1,
      active: false
    }));
    
    // Playback state
    this.playbackMode = 'forward';
    this.currentStep = 0;
    this.currentRepeat = 0;
    this.direction = 1; // 1 for forward, -1 for backward (pingpong)
    this.currentTranspose = 0;
    
    // Clock source: 'jf' (Just Friends) or 'rene' (external trigger)
    this.clockSource = 'jf';
    
    // Clock detection (for JF mode)
    this.prevSample = 0;
    this.clockThreshold = 0.1; // Threshold for zero crossing detection
    
    // Message handling
    this.port.onmessage = (event) => {
      const { type } = event.data;
      
      if (type === 'cell-data') {
        this.cells = event.data.cells.map(cell => ({ ...cell }));
        this.updateCurrentTranspose();
      } else if (type === 'playback-mode') {
        this.playbackMode = event.data.mode;
      } else if (type === 'clock-source') {
        // NEW: Set clock source mode
        this.clockSource = event.data.source;
        console.log(`[Transpose Seq] Clock source: ${this.clockSource.toUpperCase()}`);
      } else if (type === 'external-trigger') {
        // NEW: External trigger from René or other source
        this.advanceSequence();
      } else if (type === 'reset') {
        this.reset();
      }
    };
    
    // Debug
    this.sampleCount = 0;
    this.debugInterval = 48000; // Every second
  }

  reset() {
    this.currentStep = 0;
    this.currentRepeat = 0;
    this.direction = 1;
    this.updateCurrentTranspose();
  }

  updateCurrentTranspose() {
    // Find current active cell
    const cell = this.cells[this.currentStep];
    this.currentTranspose = cell.active ? cell.transpose : 0;
    
    // Send to main thread for UI updates
    this.port.postMessage({
      type: 'step-changed',
      step: this.currentStep,
      transpose: this.currentTranspose
    });
  }

  detectClock(currentSample) {
    // Detect rising zero crossing
    // JF in SHAPE mode outputs 0-8V (0-1.6 in Web Audio)
    // Look for crossing from below threshold to above threshold
    const crossed = this.prevSample < this.clockThreshold && currentSample >= this.clockThreshold;
    this.prevSample = currentSample;
    return crossed;
  }

  advanceSequence() {
    // Increment repeat counter
    this.currentRepeat++;
    
    const currentCell = this.cells[this.currentStep];
    const repeatsNeeded = currentCell.active ? currentCell.repeats : 1;
    
    // Check if we should advance to next step
    if (this.currentRepeat >= repeatsNeeded) {
      this.currentRepeat = 0;
      this.advanceStep();
    }
  }

  advanceStep() {
    if (this.playbackMode === 'random') {
      this.advanceRandom();
    } else if (this.playbackMode === 'pingpong') {
      this.advancePingPong();
    } else if (this.playbackMode === 'backward') {
      this.advanceBackward();
    } else {
      this.advanceForward();
    }
    
    this.updateCurrentTranspose();
  }

  advanceForward() {
    // Find next active cell, wrapping around
    const startStep = this.currentStep;
    
    do {
      this.currentStep = (this.currentStep + 1) % 16;
      
      // If we've looped back to start and found no active cells, stay at current
      if (this.currentStep === startStep) {
        break;
      }
    } while (!this.cells[this.currentStep].active && !this.allInactive());
    
    // If all inactive, stay at step 0
    if (this.allInactive()) {
      this.currentStep = 0;
    }
  }

  advanceBackward() {
    const startStep = this.currentStep;
    
    do {
      this.currentStep = (this.currentStep - 1 + 16) % 16;
      
      if (this.currentStep === startStep) {
        break;
      }
    } while (!this.cells[this.currentStep].active && !this.allInactive());
    
    if (this.allInactive()) {
      this.currentStep = 0;
    }
  }

  advancePingPong() {
    const startStep = this.currentStep;
    let attempts = 0;
    const maxAttempts = 32; // Prevent infinite loop
    
    do {
      this.currentStep += this.direction;
      
      // Bounce at boundaries
      if (this.currentStep >= 16) {
        this.currentStep = 14; // Bounce back from 15
        this.direction = -1;
      } else if (this.currentStep < 0) {
        this.currentStep = 1; // Bounce back from 0
        this.direction = 1;
      }
      
      attempts++;
      if (attempts >= maxAttempts) {
        this.currentStep = 0;
        this.direction = 1;
        break;
      }
      
    } while (!this.cells[this.currentStep].active && !this.allInactive());
    
    if (this.allInactive()) {
      this.currentStep = 0;
      this.direction = 1;
    }
  }

  advanceRandom() {
    // Get all active cell indices
    const activeIndices = this.cells
      .map((cell, index) => cell.active ? index : -1)
      .filter(index => index !== -1);
    
    if (activeIndices.length === 0) {
      this.currentStep = 0;
      return;
    }
    
    // Pick random active cell
    const randomIndex = Math.floor(Math.random() * activeIndices.length);
    this.currentStep = activeIndices[randomIndex];
  }

  allInactive() {
    return this.cells.every(cell => !cell.active);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    // In René mode, ignore JF clock input
    if (this.clockSource === 'rene') {
      // Output current transpose value (for monitoring)
      if (output && output[0]) {
        for (let i = 0; i < 128; i++) {
          output[0][i] = this.currentTranspose / 12.0;
        }
      }
      return true;
    }
    
    // JF clock mode - process input
    if (!input || !input[0]) {
      return true;
    }
    
    const clockIn = input[0];
    
    // Process each sample
    for (let i = 0; i < clockIn.length; i++) {
      // Detect clock pulse
      if (this.detectClock(clockIn[i])) {
        this.advanceSequence();
      }
      
      // Output current transpose value
      // Convert semitones to voltage for monitoring (1 semitone = 1/12 volt)
      if (output && output[0]) {
        output[0][i] = this.currentTranspose / 12.0;
      }
      
      this.sampleCount++;
    }
    
    // Debug logging
    if (this.sampleCount % this.debugInterval === 0) {
      const activeCells = this.cells.filter(c => c.active).length;
      console.log('[Transpose Sequencer]', {
        clockSource: this.clockSource,
        step: this.currentStep,
        repeat: `${this.currentRepeat}/${this.cells[this.currentStep].repeats}`,
        transpose: this.currentTranspose,
        mode: this.playbackMode,
        activeCells: activeCells,
        direction: this.direction
      });
    }
    
    return true;
  }
}

registerProcessor('transpose-sequencer-processor', TransposeSequencerProcessor);
