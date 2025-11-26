// main.js
// Phase 4 ENHANCED: Multi-Mangrove FM Architecture with Rich Timbres
// JF #1 → Quantizer → Mangrove A (pitch CV)
// Mangrove B SQUARE → Mangrove A FM (audio-rate) — NOW WITH 20× DEEPER MODULATION
// Mangrove C (ready for filter FM in Phase 5)

import { JustFriendsNode } from './JustFriendsNode.js';
import { QuantizerNode } from './QuantizerNode.js';
import { MangroveNode } from './MangroveNode.js';

class Phase4App {
  constructor() {
    this.audioContext = null;
    
    // Modules
    this.jf1 = null;
    this.quantizer = null;
    this.mangroveA = null;  // Main voice
    this.mangroveB = null;  // FM source for A
    this.mangroveC = null;  // FM source for filter (Phase 5)
    this.masterGain = null;
    
    // FM routing
    this.fmGainB = null; // Gain node to enable/disable FM from B
    
    this.isRunning = false;

    // Scope visualization
    this.scope1Analyser = null;
    this.scope1Canvas = null;
    this.scope1Ctx = null;
    this.scope1AnimationId = null;

    this.scope2Analyser = null;
    this.scope2Canvas = null;
    this.scope2Ctx = null;
    this.scope2AnimationId = null;

    // Setup UI when DOM is ready
    this.setupUI();
  }

  async init() {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Load all AudioWorklet processors
      await this.audioContext.audioWorklet.addModule('./just-friends-processor.js');
      await this.audioContext.audioWorklet.addModule('./quantizer-processor.js');
      await this.audioContext.audioWorklet.addModule('./mangrove-processor.js');
      
      console.log('All AudioWorklets loaded successfully');
      
      // Create module instances
      this.jf1 = new JustFriendsNode(this.audioContext);
      this.quantizer = new QuantizerNode(this.audioContext);
      this.mangroveA = new MangroveNode(this.audioContext);
      this.mangroveB = new MangroveNode(this.audioContext);
      this.mangroveC = new MangroveNode(this.audioContext);
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.3;

      // FM routing gain nodes
      this.fmGainB = this.audioContext.createGain();
      this.fmGainB.gain.value = 1.0; // Start with FM ENABLED for demonstration

      // Setup scope visualization
      this.setupScope1();
      this.setupScope2();

      // ========== CRITICAL SIGNAL ROUTING ==========
      
      // 1. JF #1 → Scope 1 → Quantizer → Mangrove A pitch CV
      this.jf1.getIdentityOutput().connect(this.scope1Analyser);
      this.scope1Analyser.connect(this.quantizer.getInput());
      this.quantizer.getOutput().connect(this.mangroveA.getPitchCVInput());

      // 2. Mangrove B SQUARE → FM Gain → Mangrove A FM input (AUDIO-RATE FM)
      this.mangroveB.getSquareOutput().connect(this.fmGainB);
      this.fmGainB.connect(this.mangroveA.getFMInput());

      // 3. Mangrove A FORMANT → Scope 2 → Master Gain → Destination
      this.mangroveA.getFormantOutput().connect(this.scope2Analyser);
      this.scope2Analyser.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);

      // Note: Mangrove C runs independently, ready for Phase 5 filter FM
      
      console.log('=== Phase 4 ENHANCED Signal Flow ===');
      console.log('JF #1 IDENTITY → Scope 1 → Quantizer → Mangrove A pitch');
      console.log('Mangrove B SQUARE → Mangrove A FM input (20× depth increase!)');
      console.log('Mangrove A FORMANT → Scope 2 → Output');
      console.log('Mangrove C: Ready for filter FM (Phase 5)');

      // Configure default settings
      this.configureDefaults();
      
      // Update UI
      document.getElementById('status').textContent = 'Ready - Through-Zero FM';
      document.getElementById('startBtn').disabled = false;
      
      // Sync UI with default values
      this.syncUIWithParameters();
      
      console.log('Phase 4 ENHANCED system initialized successfully');
      console.log('THROUGH-ZERO FM: Index 0-10 range (phase reversal enabled)');
      
    } catch (error) {
      console.error('Failed to initialize system:', error);
      document.getElementById('status').textContent = 'Error: ' + error.message;
    }
  }

  configureDefaults() {
    // JF #1: Cycle mode, shape range, slow modulation
    this.jf1.setMode(2); // cycle
    this.jf1.setRange(0); // shape
    this.jf1.setTime(0.25);
    this.jf1.setIntone(0.5);
    this.jf1.setRamp(0.5);
    this.jf1.setCurve(0.5);

    // Quantizer: C major scale, moderate depth
    this.quantizer.setMajorScale(0);
    this.quantizer.setDepth(1.0);
    this.quantizer.setOffset(0);

    // Mangrove A: Main voice, FM depth at 0.3 (Index 3.0 for through-zero)
    this.mangroveA.setPitch(0.5);
    this.mangroveA.setBarrel(0.3);
    this.mangroveA.setFormant(0.6);
    this.mangroveA.setAir(0.5);
    this.mangroveA.setFMIndex(0.3); // THROUGH-ZERO: Index 3.0 for harmonic FM

    // Mangrove B: FM source, slightly detuned for interesting FM
    this.mangroveB.setPitch(0.52); // Slightly higher than A
    this.mangroveB.setBarrel(0.5);
    this.mangroveB.setFormant(0.5);
    this.mangroveB.setAir(0.8); // Higher level for stronger FM signal

    // Mangrove C: Ready for Phase 5
    this.mangroveC.setPitch(0.6);
    this.mangroveC.setBarrel(0.5);
    this.mangroveC.setFormant(0.5);
    this.mangroveC.setAir(0.8);
    
    console.log('Defaults configured with THROUGH-ZERO FM:');
    console.log('- Mangrove A FM Index: 0.3 (synthesis index 3.0)');
    console.log('- Phase reversal enabled (analog-style through-zero)');
    console.log('- FM enabled by default');
    console.log('- Expect rich FM timbres without gating artifacts');
  }

  setupScope1() {
    // Create analyser for scope visualization
    this.scope1Analyser = this.audioContext.createAnalyser();
    this.scope1Analyser.fftSize = 2048;
    this.scope1Analyser.smoothingTimeConstant = 0;

    // Get canvas
    this.scope1Canvas = document.getElementById('scope1');
    this.scope1Ctx = this.scope1Canvas.getContext('2d');
  }

  setupScope2() {
    // Create analyser for scope visualization
    this.scope2Analyser = this.audioContext.createAnalyser();
    this.scope2Analyser.fftSize = 2048;
    this.scope2Analyser.smoothingTimeConstant = 0;

    // Get canvas
    this.scope2Canvas = document.getElementById('scope2');
    this.scope2Ctx = this.scope2Canvas.getContext('2d');
  }

  drawScope(analyser, canvas, ctx, color = '#6b5b95') {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    
    analyser.getFloatTimeDomainData(dataArray);

    // Clear canvas
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
      const y = (canvas.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw waveform
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();

    const sliceWidth = canvas.width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i];
      const y = ((v + 1) / 2) * canvas.height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }

  startScope1() {
    const draw = () => {
      this.scope1AnimationId = requestAnimationFrame(draw);
      this.drawScope(this.scope1Analyser, this.scope1Canvas, this.scope1Ctx, '#6b5b95');
    };
    draw();
  }

  startScope2() {
    const draw = () => {
      this.scope2AnimationId = requestAnimationFrame(draw);
      this.drawScope(this.scope2Analyser, this.scope2Canvas, this.scope2Ctx, '#d67e7e');
    };
    draw();
  }

  stopScope1() {
    if (this.scope1AnimationId) {
      cancelAnimationFrame(this.scope1AnimationId);
      this.scope1AnimationId = null;
    }
  }

  stopScope2() {
    if (this.scope2AnimationId) {
      cancelAnimationFrame(this.scope2AnimationId);
      this.scope2AnimationId = null;
    }
  }

  start() {
    if (!this.mangroveA) return;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.isRunning = true;
    this.startScope1();
    this.startScope2();
    
    document.getElementById('startBtn').innerHTML = '<span class="btn-icon">⏸</span> Stop';
    document.getElementById('status').textContent = 'Running - Through-Zero FM Active';
    
    console.log('Phase 4 system running with THROUGH-ZERO FM');
    console.log('Listen for true FM timbres with phase reversal');
    console.log('Current FM Index:', this.mangroveA.params.fmIndex.value.toFixed(3),
                '(Synthesis Index:', (this.mangroveA.params.fmIndex.value * 10).toFixed(1) + ')');
  }

  stop() {
    if (!this.mangroveA) return;
    
    this.audioContext.suspend();
    this.stopScope1();
    this.stopScope2();
    this.isRunning = false;
    
    document.getElementById('startBtn').innerHTML = '<span class="btn-icon">▶</span> Start Audio';
    document.getElementById('status').textContent = 'Stopped';
  }

  toggle() {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
  }

  toggleFM(enabled) {
    if (!this.fmGainB) return;
    
    // Smoothly ramp the FM gain to avoid clicks
    const now = this.audioContext.currentTime;
    this.fmGainB.gain.cancelScheduledValues(now);
    this.fmGainB.gain.setValueAtTime(this.fmGainB.gain.value, now);
    this.fmGainB.gain.linearRampToValueAtTime(enabled ? 1.0 : 0.0, now + 0.05);
    
    console.log(`FM B → A: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    if (enabled) {
      const currentIndex = this.mangroveA.params.fmIndex.value;
      console.log(`Current FM Index: ${currentIndex.toFixed(3)} (Synthesis Index: ${(currentIndex * 20).toFixed(1)})`);
    }
  }

  setupUI() {
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

    // JF #1 controls
    this.bindKnob('jf1Time', (val) => this.jf1?.setTime(val));
    this.bindKnob('jf1Intone', (val) => this.jf1?.setIntone(val));
    this.bindKnob('jf1Ramp', (val) => this.jf1?.setRamp(val));
    this.bindKnob('jf1Curve', (val) => this.jf1?.setCurve(val));

    const jf1Mode = document.getElementById('jf1Mode');
    if (jf1Mode) {
      jf1Mode.addEventListener('change', (e) => {
        this.jf1?.setMode(parseInt(e.target.value));
      });
    }

    const jf1Range = document.getElementById('jf1Range');
    if (jf1Range) {
      jf1Range.addEventListener('change', (e) => {
        this.jf1?.setRange(parseInt(e.target.value));
      });
    }

    // Quantizer controls
    this.bindKnob('quantDepth', (val) => this.quantizer?.setDepth(val));
    this.bindKnob('quantOffset', (val) => this.quantizer?.setOffset(val));

    // Scale preset buttons
    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remove active class from all
        presetBtns.forEach(b => b.classList.remove('active'));
        // Add to clicked
        e.target.classList.add('active');
        
        const scale = e.target.dataset.scale;
        this.setScale(scale);
      });
    });

    // Piano keyboard
    this.createPianoKeyboard();

    // Mangrove A controls
    this.bindKnob('maPitch', (val) => this.mangroveA?.setPitch(val));
    this.bindKnob('maBarrel', (val) => this.mangroveA?.setBarrel(val));
    this.bindKnob('maFormant', (val) => this.mangroveA?.setFormant(val));
    this.bindKnob('maAir', (val) => this.mangroveA?.setAir(val));
    this.bindKnob('maFmIndex', (val) => {
      this.mangroveA?.setFMIndex(val);
      // Log the actual FM synthesis index
      const synthesisIndex = val * 10.0;
      console.log(`FM Index updated: ${val.toFixed(3)} (Synthesis Index: ${synthesisIndex.toFixed(1)})`);
    });

    // Mangrove B controls
    this.bindKnob('mbPitch', (val) => this.mangroveB?.setPitch(val));
    this.bindKnob('mbBarrel', (val) => this.mangroveB?.setBarrel(val));
    this.bindKnob('mbFormant', (val) => this.mangroveB?.setFormant(val));

    // FM enable/disable toggle
    const fmEnable = document.getElementById('fmEnable');
    if (fmEnable) {
      fmEnable.addEventListener('change', (e) => {
        this.toggleFM(e.target.checked);
      });
    }

    // Mangrove C controls
    this.bindKnob('mcPitch', (val) => this.mangroveC?.setPitch(val));
    this.bindKnob('mcBarrel', (val) => this.mangroveC?.setBarrel(val));
    this.bindKnob('mcFormant', (val) => this.mangroveC?.setFormant(val));

    // Master volume
    this.bindKnob('masterVolume', (val) => {
      if (this.masterGain) this.masterGain.gain.value = val;
    });
  }

  bindKnob(id, callback) {
    const knob = document.getElementById(id);
    const display = document.getElementById(id + 'Value');
    
    if (knob) {
      // Update display on input
      knob.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        callback(value);
        if (display) {
          display.textContent = value.toFixed(2);
        }
      });
      
      // Also bind to 'change' event for better compatibility
      knob.addEventListener('change', (e) => {
        const value = parseFloat(e.target.value);
        if (display) {
          display.textContent = value.toFixed(2);
        }
      });
      
      // Set initial display value
      if (display) {
        display.textContent = parseFloat(knob.value).toFixed(2);
      }
    } else {
      console.warn(`Knob element not found: ${id}`);
    }
  }

  createPianoKeyboard() {
    const container = document.getElementById('pianoKeyboard');
    if (!container) return;

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const isBlackKey = [false, true, false, true, false, false, true, false, true, false, true, false];

    for (let i = 0; i < 12; i++) {
      const key = document.createElement('div');
      key.className = isBlackKey[i] ? 'piano-key black-key active' : 'piano-key white-key active';
      key.dataset.note = i;
      key.title = noteNames[i];
      
      key.addEventListener('click', () => {
        key.classList.toggle('active');
        const isActive = key.classList.contains('active');
        this.quantizer?.setNote(i, isActive);
      });
      
      container.appendChild(key);
    }
  }

  setScale(scaleName) {
    if (!this.quantizer) return;

    switch (scaleName) {
      case 'chromatic':
        this.quantizer.setChromatic();
        break;
      case 'major':
        this.quantizer.setMajorScale(0); // C major
        break;
      case 'minor':
        this.quantizer.setMinorScale(9); // A minor
        break;
      case 'penta-maj':
        this.quantizer.setPentatonicMajor(0); // C penta major
        break;
      case 'penta-min':
        this.quantizer.setPentatonicMinor(9); // A penta minor
        break;
    }

    // Update piano keyboard visual
    this.updatePianoKeyboard();
  }

  updatePianoKeyboard() {
    const mask = this.quantizer?.getNoteMask();
    if (!mask) return;

    const keys = document.querySelectorAll('.piano-key');
    keys.forEach((key, i) => {
      if (mask[i]) {
        key.classList.add('active');
      } else {
        key.classList.remove('active');
      }
    });
  }

  syncUIWithParameters() {
    // Update all parameter displays
    const params = [
      'jf1Time', 'jf1Intone', 'jf1Ramp', 'jf1Curve',
      'quantDepth', 'quantOffset',
      'maPitch', 'maBarrel', 'maFormant', 'maAir', 'maFmIndex',
      'mbPitch', 'mbBarrel', 'mbFormant',
      'mcPitch', 'mcBarrel', 'mcFormant',
      'masterVolume'
    ];

    params.forEach(param => {
      const knob = document.getElementById(param);
      const display = document.getElementById(param + 'Value');
      if (knob && display) {
        const value = parseFloat(knob.value);
        display.textContent = value.toFixed(2);
      } else {
        if (!knob) console.warn(`Knob not found: ${param}`);
        if (!display) console.warn(`Display not found: ${param}Value`);
      }
    });

    // Update piano keyboard to show C major (default)
    this.updatePianoKeyboard();
    
    // Check FM enabled checkbox
    const fmEnable = document.getElementById('fmEnable');
    if (fmEnable) {
      fmEnable.checked = true; // FM enabled by default now
    }
    
    console.log('UI parameters synced - THROUGH-ZERO FM mode');
  }
}

// Initialize app when page loads
const app = new Phase4App();
window.addEventListener('load', () => app.init());
