// ModulationMatrixNode.js
// Wrapper for Modulation Matrix AudioWorkletProcessor
// Routes Just Friends slopes 2N-6N to any parameter destination

export class ModulationMatrixNode extends AudioWorkletNode {
  constructor(context) {
    super(context, 'modulation-matrix-processor', {
      numberOfInputs: 1,   // 5 channels: 2N, 3N, 4N, 5N, 6N
      numberOfOutputs: 1,  // 5 channels: one per modulation slot
      outputChannelCount: [5],
      channelCount: 5,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Store parameter references for each slot
    this.slots = [];
    for (let i = 0; i < 5; i++) {
      this.slots.push({
        depth: this.parameters.get(`depth${i}`),
        offset: this.parameters.get(`offset${i}`),
        mode: this.parameters.get(`mode${i}`),
        enabled: false,
        source: i,  // Which JF slope (0=2N, 1=3N, 2=4N, 3=5N, 4=6N)
        destination: null,
        destinationParam: null,
        gain: context.createGain()  // For connecting to destinations
      });
    }
    
    // Create channel splitter for accessing separate outputs
    this.splitter = context.createChannelSplitter(5);
    this.connect(this.splitter);
    
    // Connect splitter to individual gain nodes
    for (let i = 0; i < 5; i++) {
      this.splitter.connect(this.slots[i].gain, i);
    }
    
    // Create input gain node (for connecting JF slopes)
    // Configure for 5-channel input (one per JF slope: 2N, 3N, 4N, 5N, 6N)
    this.input = context.createGain();
    this.input.channelCount = 5;
    this.input.channelCountMode = 'explicit';
    this.input.channelInterpretation = 'discrete';
    this.input.connect(this, 0, 0);
    
    console.log('ModulationMatrix Node created');
  }

  // ========== PARAMETER SETTERS ==========

  setDepth(slot, value) {
    if (slot < 0 || slot >= 5) return;
    this.slots[slot].depth.value = Math.max(0, Math.min(1, value));
  }

  setOffset(slot, value) {
    if (slot < 0 || slot >= 5) return;
    this.slots[slot].offset.value = Math.max(-1, Math.min(1, value));
  }

  setMode(slot, mode) {
    if (slot < 0 || slot >= 5) return;
    // mode: 0=unipolar, 1=bipolar, 2=inverted unipolar, 3=inverted bipolar
    this.slots[slot].mode.value = Math.max(0, Math.min(3, Math.round(mode)));
  }

  // ========== ROUTING ==========

  /**
   * Enable a modulation slot and route it to a destination
   * @param {number} slot - Slot index (0-4)
   * @param {AudioParam} destinationParam - The AudioParam to modulate
   */
  setDestination(slot, destinationParam) {
    if (slot < 0 || slot >= 5) return;
    
    const slotObj = this.slots[slot];
    
    // Disconnect previous destination if any
    if (slotObj.destinationParam) {
      slotObj.gain.disconnect();
    }
    
    // Store new destination
    slotObj.destinationParam = destinationParam;
    
    // Connect if enabled and destination exists
    if (slotObj.enabled && destinationParam) {
      slotObj.gain.connect(destinationParam);
      console.log(`Mod slot ${slot} → destination`);
    }
  }

  /**
   * Enable or disable a modulation slot
   * @param {number} slot - Slot index (0-4)
   * @param {boolean} enabled - Enable state
   */
  setEnabled(slot, enabled) {
    if (slot < 0 || slot >= 5) return;
    
    const slotObj = this.slots[slot];
    slotObj.enabled = enabled;
    
    // Notify processor
    this.port.postMessage({
      type: 'setEnabled',
      slot: slot,
      enabled: enabled
    });
    
    // Handle connection
    if (enabled && slotObj.destinationParam) {
      slotObj.gain.connect(slotObj.destinationParam);
      console.log(`Mod slot ${slot} ENABLED`);
    } else {
      slotObj.gain.disconnect();
      console.log(`Mod slot ${slot} DISABLED`);
    }
  }

  /**
   * Clear a modulation slot (disable and disconnect)
   * @param {number} slot - Slot index (0-4)
   */
  clearSlot(slot) {
    if (slot < 0 || slot >= 5) return;
    
    this.setEnabled(slot, false);
    this.slots[slot].destinationParam = null;
    this.slots[slot].gain.disconnect();
  }

  // ========== CONVENIENCE METHODS ==========

  /**
   * Get the input node for connecting JF slopes
   */
  getInput() {
    return this.input;
  }

  /**
   * Get info about a slot
   */
  getSlotInfo(slot) {
    if (slot < 0 || slot >= 5) return null;
    
    const slotObj = this.slots[slot];
    return {
      enabled: slotObj.enabled,
      source: slotObj.source,
      depth: slotObj.depth.value,
      offset: slotObj.offset.value,
      mode: slotObj.mode.value,
      hasDestination: slotObj.destinationParam !== null
    };
  }

  /**
   * Get all slot info
   */
  getAllSlotInfo() {
    return this.slots.map((_, i) => this.getSlotInfo(i));
  }

  // ========== CLEANUP ==========

  dispose() {
    this.disconnect();
    this.input.disconnect();
    this.splitter.disconnect();
    
    for (let i = 0; i < 5; i++) {
      this.slots[i].gain.disconnect();
    }
  }
}
