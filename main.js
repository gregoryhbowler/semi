// main.js
// Main application entry point

import { MangroveNode } from './MangroveNode.js';

class MangroveApp {
  constructor() {
    this.audioContext = null;
    this.mangrove = null;
    this.isRunning = false;

    // Bind UI event handlers
    this.setupUI();
  }

  async init() {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Load the AudioWorklet processor
      await this.audioContext.audioWorklet.addModule('./mangrove-processor.js');
      
      // Create Mangrove instance
      this.mangrove = new MangroveNode(this.audioContext);
      
      // Connect FORMANT output to speakers initially
      this.mangrove.getFormantOutput().connect(this.audioContext.destination);
      
      console.log('Mangrove initialized successfully');
      
      // Update UI
      document.getElementById('status').textContent = 'Ready';
      document.getElementById('startBtn').disabled = false;
      
      // Sync UI with default values
      this.syncUIWithParameters();
      
    } catch (error) {
      console.error('Failed to initialize Mangrove:', error);
      document.getElementById('status').textContent = 'Error: ' + error.message;
    }
  }

  start() {
    if (!this.mangrove) return;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.isRunning = true;
    document.getElementById('startBtn').textContent = 'Stop';
    document.getElementById('status').textContent = 'Running';
  }

  stop() {
    if (!this.mangrove) return;
    
    this.audioContext.suspend();
    this.isRunning = false;
    document.getElementById('startBtn').textContent = 'Start';
    document.getElementById('status').textContent = 'Stopped';
  }

  toggle() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  setupUI() {
    // Wait for DOM to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.bindControls());
    } else {
      this.bindControls();
    }
  }

  bindControls() {
    // Start/Stop button
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.toggle());
    }

    // Pitch controls
    this.bindKnob('pitchKnob', (val) => this.mangrove?.setPitch(val));
    this.bindKnob('fineKnob', (val) => this.mangrove?.setFine(val));

    // FM controls
    this.bindKnob('fmIndex', (val) => this.mangrove?.setFMIndex(val));

    // Impulse shaping
    this.bindKnob('barrelKnob', (val) => this.mangrove?.setBarrel(val));
    this.bindKnob('formantKnob', (val) => this.mangrove?.setFormant(val));
    
    // constant wave/formant switch
    const modeSwitch = document.getElementById('constantMode');
    if (modeSwitch) {
      modeSwitch.addEventListener('change', (e) => {
        this.mangrove?.setConstantMode(e.target.value === 'formant');
      });
    }

    // Dynamics
    this.bindKnob('airKnob', (val) => this.mangrove?.setAir(val));
    this.bindKnob('airAttenuverter', (val) => this.mangrove?.setAirAttenuverter(val));

    // Output selector
    const outputSelect = document.getElementById('outputSelect');
    if (outputSelect) {
      outputSelect.addEventListener('change', (e) => this.switchOutput(e.target.value));
    }
  }

  bindKnob(id, callback) {
    const knob = document.getElementById(id);
    const display = document.getElementById(id + 'Value');
    
    if (knob) {
      knob.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        callback(value);
        if (display) {
          display.textContent = value.toFixed(2);
        }
      });
    }
  }

  syncUIWithParameters() {
    // Set initial display values
    const params = [
      'pitchKnob', 'fineKnob', 'fmIndex', 
      'barrelKnob', 'formantKnob',
      'airKnob', 'airAttenuverter'
    ];

    params.forEach(param => {
      const knob = document.getElementById(param);
      const display = document.getElementById(param + 'Value');
      if (knob && display) {
        display.textContent = parseFloat(knob.value).toFixed(2);
      }
    });
  }

  switchOutput(output) {
    if (!this.mangrove) return;

    // Disconnect both outputs
    this.mangrove.getSquareOutput().disconnect();
    this.mangrove.getFormantOutput().disconnect();

    // Connect selected output
    if (output === 'square') {
      this.mangrove.getSquareOutput().connect(this.audioContext.destination);
    } else if (output === 'formant') {
      this.mangrove.getFormantOutput().connect(this.audioContext.destination);
    } else if (output === 'both') {
      const merger = this.audioContext.createChannelMerger(2);
      this.mangrove.getSquareOutput().connect(merger, 0, 0);
      this.mangrove.getFormantOutput().connect(merger, 0, 1);
      merger.connect(this.audioContext.destination);
    }
  }
}

// Initialize app when page loads
const app = new MangroveApp();
window.addEventListener('load', () => app.init());
