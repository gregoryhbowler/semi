// TransposeSequencerNode.js
// Wrapper for Transpose Sequencer AudioWorkletProcessor
// UPDATED: Supports both JF and René clock sources
// Uses Just Friends #1 IDENTITY output as a clock source (default)
// OR can be triggered externally by René note sequence cycles
// Outputs semitone transpose offsets synchronized to clock cycles

export class TransposeSequencerNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'transpose-sequencer-processor', {
      numberOfInputs: 1,  // Clock input from JF #1 IDENTITY
      numberOfOutputs: 1, // Transpose CV output (for visualization/monitoring)
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Sequence data: 16 cells
    this.cells = Array.from({ length: 16 }, () => ({
      transpose: 0,    // -24 to +24 semitones
      repeats: 1,      // How many clock cycles before advancing
      active: false    // Whether this cell is enabled
    }));
    
    // Playback state
    this.playbackMode = 'forward'; // 'forward', 'backward', 'pingpong', 'random'
    this.currentStep = 0;
    this.currentTranspose = 0;
    
    // NEW: Clock source mode
    this.clockSource = 'jf'; // 'jf' or 'rene'
    
    // Create I/O nodes
    this.clockInput = context.createGain();
    this.transposeOutput = context.createGain();
    
    // Wire up
    this.clockInput.connect(this, 0, 0);
    this.connect(this.transposeOutput, 0, 0);
    
    // Listen for messages from processor
    this.port.onmessage = (event) => {
      if (event.data.type === 'step-changed') {
        this.currentStep = event.data.step;
        this.currentTranspose = event.data.transpose;
        
        // Dispatch event for UI updates
        this.dispatchEvent(new CustomEvent('step-changed', {
          detail: {
            step: event.data.step,
            transpose: event.data.transpose
          }
        }));
      }
    };
    
    // Initialize the first active cell
    this.sendCellData();
  }

  // ========== CELL MANAGEMENT ==========

  /**
   * Set a cell's properties
   * @param {number} index - Cell index (0-15)
   * @param {object} data - {transpose?, repeats?, active?}
   */
  setCell(index, data) {
    if (index < 0 || index >= 16) {
      console.error('Cell index must be 0-15');
      return;
    }
    
    if (data.transpose !== undefined) {
      this.cells[index].transpose = Math.max(-24, Math.min(24, Math.round(data.transpose)));
    }
    if (data.repeats !== undefined) {
      this.cells[index].repeats = Math.max(1, Math.min(64, Math.round(data.repeats)));
    }
    if (data.active !== undefined) {
      this.cells[index].active = !!data.active;
    }
    
    this.sendCellData();
  }

  /**
   * Get a cell's properties
   */
  getCell(index) {
    if (index < 0 || index >= 16) return null;
    return { ...this.cells[index] };
  }

  /**
   * Set all cells at once
   */
  setCells(cellsArray) {
    if (!Array.isArray(cellsArray) || cellsArray.length !== 16) {
      console.error('setCells requires array of 16 cell objects');
      return;
    }
    
    cellsArray.forEach((cell, i) => {
      if (cell.transpose !== undefined) {
        this.cells[i].transpose = Math.max(-24, Math.min(24, Math.round(cell.transpose)));
      }
      if (cell.repeats !== undefined) {
        this.cells[i].repeats = Math.max(1, Math.min(64, Math.round(cell.repeats)));
      }
      if (cell.active !== undefined) {
        this.cells[i].active = !!cell.active;
      }
    });
    
    this.sendCellData();
  }

  /**
   * Get all cells
   */
  getCells() {
    return this.cells.map(cell => ({ ...cell }));
  }

  /**
   * Clear all cells (reset to defaults)
   */
  clearCells() {
    this.cells.forEach(cell => {
      cell.transpose = 0;
      cell.repeats = 1;
      cell.active = false;
    });
    this.sendCellData();
  }

  // ========== PLAYBACK CONTROL ==========

  /**
   * Set playback mode
   * @param {string} mode - 'forward', 'backward', 'pingpong', 'random'
   */
  setPlaybackMode(mode) {
    const validModes = ['forward', 'backward', 'pingpong', 'random'];
    if (!validModes.includes(mode)) {
      console.error('Invalid playback mode:', mode);
      return;
    }
    
    this.playbackMode = mode;
    this.port.postMessage({
      type: 'playback-mode',
      mode: mode
    });
  }

  getPlaybackMode() {
    return this.playbackMode;
  }

  /**
   * Reset sequence to beginning
   */
  reset() {
    this.port.postMessage({ type: 'reset' });
    this.currentStep = 0;
  }

  /**
   * Get current step index
   */
  getCurrentStep() {
    return this.currentStep;
  }

  /**
   * Get current transpose value
   */
  getCurrentTranspose() {
    return this.currentTranspose;
  }

  // ========== NEW: CLOCK SOURCE CONTROL ==========

  /**
   * Set clock source mode
   * @param {string} source - 'jf' (Just Friends) or 'rene' (external trigger)
   */
  setClockSource(source) {
    if (source !== 'jf' && source !== 'rene') {
      console.error('Clock source must be "jf" or "rene"');
      return;
    }
    
    this.clockSource = source;
    this.port.postMessage({
      type: 'clock-source',
      source: source
    });
    
    console.log(`✓ Transpose sequencer clock: ${source === 'jf' ? 'Just Friends' : 'René cycles'}`);
  }

  /**
   * Get current clock source
   */
  getClockSource() {
    return this.clockSource;
  }

  /**
   * Manually trigger advancement (for René mode)
   * This should be called once per René note sequence cycle
   */
  trigger() {
    if (this.clockSource !== 'rene') {
      console.warn('trigger() only works in René clock mode');
      return;
    }
    
    this.port.postMessage({ type: 'external-trigger' });
  }

  // ========== INTERNAL ==========

  sendCellData() {
    this.port.postMessage({
      type: 'cell-data',
      cells: this.cells.map(cell => ({ ...cell }))
    });
  }

  // ========== I/O ACCESSORS ==========

  getClockInput() {
    return this.clockInput;
  }

  getTransposeOutput() {
    return this.transposeOutput;
  }

  // ========== CLEANUP ==========

  dispose() {
    this.disconnect();
    this.clockInput.disconnect();
    this.transposeOutput.disconnect();
  }
}
