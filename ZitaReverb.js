// ZitaReverb - High-quality FDN reverb for Web Audio
// Usage helper class

class ZitaReverb {
  constructor(audioContext) {
    this.context = audioContext;
    this.node = null;
    this.isInitialized = false;
    
    // Parameter ranges (matching the C++ header)
    this.paramRanges = {
      preDel: { min: 0, max: 200, default: 20, unit: 'ms' },
      lfFc: { min: 30, max: 1200, default: 200, unit: 'Hz' },
      lowRt60: { min: 0.1, max: 3.0, default: 1.0, unit: 's' },
      midRt60: { min: 0.1, max: 3.0, default: 1.0, unit: 's' },
      hfDamp: { min: 1200, max: 23520, default: 6000, unit: 'Hz' }
    };
  }
  
  async init(workletUrl) {
    if (this.isInitialized) {
      return this.node;
    }
    
    try {
      // Load the AudioWorklet processor
      await this.context.audioWorklet.addModule(workletUrl);
      
      // Create the AudioWorklet node
      this.node = new AudioWorkletNode(this.context, 'zita-reverb-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      
      this.isInitialized = true;
      return this.node;
    } catch (error) {
      console.error('Failed to initialize ZitaReverb:', error);
      throw error;
    }
  }
  
  // Parameter setters
  setPreDelay(ms) {
    this._setParam('preDel', ms);
  }
  
  setLowFreqCrossover(hz) {
    this._setParam('lfFc', hz);
  }
  
  setLowRT60(seconds) {
    this._setParam('lowRt60', seconds);
  }
  
  setMidRT60(seconds) {
    this._setParam('midRt60', seconds);
  }
  
  setHighFreqDamping(hz) {
    this._setParam('hfDamp', hz);
  }
  
  // Set all parameters at once
  setParams(params) {
    if (params.preDel !== undefined) this.setPreDelay(params.preDel);
    if (params.lfFc !== undefined) this.setLowFreqCrossover(params.lfFc);
    if (params.lowRt60 !== undefined) this.setLowRT60(params.lowRt60);
    if (params.midRt60 !== undefined) this.setMidRT60(params.midRt60);
    if (params.hfDamp !== undefined) this.setHighFreqDamping(params.hfDamp);
  }
  
  // Internal parameter setter
  _setParam(param, value) {
    if (!this.isInitialized || !this.node) {
      console.warn('ZitaReverb not initialized yet');
      return;
    }
    
    // Clamp value to range
    const range = this.paramRanges[param];
    if (range) {
      value = Math.max(range.min, Math.min(range.max, value));
    }
    
    this.node.port.postMessage({
      type: 'setParam',
      param: param,
      value: value
    });
  }
  
  // Connect to destination
  connect(destination) {
    if (!this.node) {
      throw new Error('ZitaReverb not initialized. Call init() first.');
    }
    return this.node.connect(destination);
  }
  
  // Disconnect from all or specific destination
  disconnect(destination) {
    if (!this.node) return;
    if (destination) {
      this.node.disconnect(destination);
    } else {
      this.node.disconnect();
    }
  }
  
  // Get the underlying AudioWorkletNode
  getNode() {
    return this.node;
  }
  
  // Preset configurations
  static presets = {
    small: {
      preDel: 10,
      lfFc: 300,
      lowRt60: 0.8,
      midRt60: 0.6,
      hfDamp: 8000
    },
    medium: {
      preDel: 20,
      lfFc: 200,
      lowRt60: 1.5,
      midRt60: 1.2,
      hfDamp: 6000
    },
    large: {
      preDel: 40,
      lfFc: 150,
      lowRt60: 2.5,
      midRt60: 2.0,
      hfDamp: 5000
    },
    hall: {
      preDel: 50,
      lfFc: 120,
      lowRt60: 3.0,
      midRt60: 2.5,
      hfDamp: 4000
    },
    bright: {
      preDel: 15,
      lfFc: 250,
      lowRt60: 1.0,
      midRt60: 1.0,
      hfDamp: 12000
    },
    dark: {
      preDel: 25,
      lfFc: 180,
      lowRt60: 1.5,
      midRt60: 1.2,
      hfDamp: 3000
    }
  };
  
  // Load a preset
  loadPreset(presetName) {
    const preset = ZitaReverb.presets[presetName];
    if (!preset) {
      console.warn(`Preset "${presetName}" not found`);
      return;
    }
    this.setParams(preset);
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZitaReverb;
}
