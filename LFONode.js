// LFONode.js
// Wrapper for LFO AudioWorkletProcessor
// Each LFO can modulate two destinations independently

export class LFONode extends AudioWorkletNode {
  constructor(context, lfoIndex = 0) {
    super(context, 'lfo-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    this.lfoIndex = lfoIndex;
    
    // Store parameter references
    this.params = {
      rate: this.parameters.get('rate'),
      waveform: this.parameters.get('waveform'),
      phase: this.parameters.get('phase')
    };
    
    // Create output gain
    this.output = context.createGain();
    this.connect(this.output);
    
    // Create two destination routing chains (A and B)
    this.destinations = [
      this.createDestinationChain(),
      this.createDestinationChain()
    ];
    
    console.log(`✓ LFO ${lfoIndex + 1} created`);
  }

  createDestinationChain() {
    return {
      enabled: false,
      param: null,
      depth: this.context.createGain(),
      offset: this.context.createConstantSource(),
      mode: 0, // 0=unipolar, 1=bipolar, 2=inv unipolar, 3=inv bipolar
      modeGain: this.context.createGain(),
      modeOffset: this.context.createConstantSource()
    };
  }

  // ========== PARAMETER SETTERS ==========

  /**
   * Set LFO rate in Hz
   * @param {number} hz - 0.01 to 100 Hz
   */
  setRate(hz) {
    this.params.rate.value = Math.max(0.01, Math.min(100, hz));
  }

  /**
   * Set waveform type
   * @param {number|string} waveform - Index or name
   *   0/'sine', 1/'square', 2/'triangle', 3/'samplehold', 4/'smoothrandom',
   *   5/'rampdown', 6/'rampup', 7/'exprampdown', 8/'exprampup'
   */
  setWaveform(waveform) {
    const waveformMap = {
      'sine': 0,
      'square': 1,
      'triangle': 2,
      'samplehold': 3,
      'smoothrandom': 4,
      'rampdown': 5,
      'rampup': 6,
      'exprampdown': 7,
      'exprampup': 8
    };
    
    const index = typeof waveform === 'string' 
      ? waveformMap[waveform.toLowerCase().replace(/[^a-z]/g, '')] 
      : waveform;
    
    this.params.waveform.value = Math.max(0, Math.min(8, Math.round(index)));
  }

  /**
   * Set phase offset (0-1)
   */
  setPhase(phase) {
    this.params.phase.value = Math.max(0, Math.min(1, phase));
  }

  // ========== DESTINATION CONTROL ==========

  /**
   * Set destination for one of the two routing channels
   * @param {number} destIndex - 0 or 1 (A or B)
   * @param {AudioParam} param - Destination AudioParam
   * @param {number} depth - Modulation depth (0-1)
   * @param {number} offset - Modulation offset (-1 to 1)
   * @param {number} mode - 0=unipolar, 1=bipolar, 2=inv unipolar, 3=inv bipolar
   */
  setDestination(destIndex, param, depth = 0.5, offset = 0, mode = 0) {
    if (destIndex !== 0 && destIndex !== 1) {
      console.error('LFO destination index must be 0 or 1');
      return;
    }
    
    const dest = this.destinations[destIndex];
    
    // Disconnect previous routing
    this.disconnectDestination(destIndex);
    
    if (!param) {
      dest.enabled = false;
      return;
    }
    
    // Store new destination
    dest.param = param;
    dest.enabled = true;
    dest.mode = mode;
    
    // Configure mode transformation
    this.configureModeTransform(destIndex, mode);
    
    // Set depth and offset
    dest.depth.gain.value = depth;
    dest.offset.offset.value = offset;
    
    // Connect signal chain: LFO → mode transform → depth → offset → destination
    dest.offset.start();
    this.output.connect(dest.modeGain);
    dest.modeOffset.start();
    dest.modeOffset.connect(dest.modeGain.gain);
    dest.modeGain.connect(dest.depth);
    dest.depth.connect(param);
    dest.offset.connect(param);
    
    console.log(`LFO ${this.lfoIndex + 1} destination ${destIndex === 0 ? 'A' : 'B'} connected`);
  }

  configureModeTransform(destIndex, mode) {
    const dest = this.destinations[destIndex];
    
    switch (mode) {
      case 0: // Unipolar (0 → 1): (x + 1) / 2
        dest.modeGain.gain.value = 0.5;
        dest.modeOffset.offset.value = 0.5;
        break;
      
      case 1: // Bipolar (-1 → +1): x
        dest.modeGain.gain.value = 1.0;
        dest.modeOffset.offset.value = 0;
        break;
      
      case 2: // Inv Unipolar (1 → 0): (1 - x) / 2
        dest.modeGain.gain.value = -0.5;
        dest.modeOffset.offset.value = 0.5;
        break;
      
      case 3: // Inv Bipolar (+1 → -1): -x
        dest.modeGain.gain.value = -1.0;
        dest.modeOffset.offset.value = 0;
        break;
    }
  }

  /**
   * Update depth for a destination
   */
  setDepth(destIndex, depth) {
    if (destIndex !== 0 && destIndex !== 1) return;
    this.destinations[destIndex].depth.gain.value = Math.max(0, Math.min(1, depth));
  }

  /**
   * Update offset for a destination
   */
  setOffset(destIndex, offset) {
    if (destIndex !== 0 && destIndex !== 1) return;
    this.destinations[destIndex].offset.offset.value = Math.max(-1, Math.min(1, offset));
  }

  /**
   * Update mode for a destination
   */
  setMode(destIndex, mode) {
    if (destIndex !== 0 && destIndex !== 1) return;
    const dest = this.destinations[destIndex];
    dest.mode = mode;
    this.configureModeTransform(destIndex, mode);
  }

  /**
   * Enable/disable a destination
   */
  setDestinationEnabled(destIndex, enabled) {
    if (destIndex !== 0 && destIndex !== 1) return;
    const dest = this.destinations[destIndex];
    
    if (enabled && dest.param) {
      dest.enabled = true;
      // Reconnect
      this.setDestination(
        destIndex, 
        dest.param, 
        dest.depth.gain.value, 
        dest.offset.offset.value,
        dest.mode
      );
    } else {
      this.disconnectDestination(destIndex);
      dest.enabled = false;
    }
  }

  /**
   * Disconnect a destination
   */
  disconnectDestination(destIndex) {
    if (destIndex !== 0 && destIndex !== 1) return;
    const dest = this.destinations[destIndex];
    
    try {
      this.output.disconnect(dest.modeGain);
      dest.modeGain.disconnect();
      dest.depth.disconnect();
      if (dest.offset.stop) {
        dest.offset.stop();
      }
      if (dest.modeOffset.stop) {
        dest.modeOffset.stop();
      }
    } catch (e) {
      // Already disconnected
    }
  }

  // ========== ACCESSORS ==========

  getOutput() {
    return this.output;
  }

  getDestinationInfo(destIndex) {
    if (destIndex !== 0 && destIndex !== 1) return null;
    const dest = this.destinations[destIndex];
    
    return {
      enabled: dest.enabled,
      hasParam: dest.param !== null,
      depth: dest.depth.gain.value,
      offset: dest.offset.offset.value,
      mode: dest.mode
    };
  }

  // ========== CLEANUP ==========

  dispose() {
    this.disconnectDestination(0);
    this.disconnectDestination(1);
    this.disconnect();
    this.output.disconnect();
  }
}
