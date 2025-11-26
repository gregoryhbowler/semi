// main.js - Phase 5 + Modulation Matrix + Just Friends Oscillator Integration
//
// Signal flow with oscillator selection:
// JF #1 → Quantizer → [Mangrove A OR Just Friends Osc] → Three Sisters
// JF #1 (2N-6N) → Modulation Matrix → [27 destinations]
// Mangrove B FORMANT → [Exponential FM OR Linear FM] → Selected Oscillator
// Mangrove C FORMANT → Three Sisters FM input
// Three Sisters ALL → Scope 2 → Master → Output

import { JustFriendsNode } from './JustFriendsNode.js';
import { JustFriendsOscNode } from './JustFriendsOscNode.js';
import { QuantizerNode } from './QuantizerNode.js';
import { MangroveNode } from './MangroveNode.js';
import { ThreeSistersNode } from './ThreeSistersNode.js';
import { ModulationMatrixNode } from './outputs/ModulationMatrixNode.js';

class Phase5App {
  constructor() {
    this.audioContext = null;
    
    // Modules
    this.jf1 = null;
    this.quantizer = null;
    this.mangroveA = null;
    this.mangroveB = null;
    this.mangroveC = null;
    this.jfOsc = null; // Full Just Friends oscillator
    this.threeSisters = null;
    this.masterGain = null;
    
    // Modulation matrix
    this.modMatrix = null;
    this.destinationMap = null;
    this.jfMerger = null;
    
    // Oscillator selection state
    this.activeOscillator = 'mangrove'; // 'mangrove' or 'justfriends'
    
    // FM routing
    this.fmGainB = null;
    this.fmExpGain = null; // For exponential FM (to TIME CV)
    this.fmLinGain = null; // For linear FM (to FM INPUT)
    this.fmMode = 'exponential'; // 'exponential' or 'linear'
    
    // Crossfade gains for oscillator switching
    this.mangroveAGain = null;
    this.jfOscGain = null;
    
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

    this.setupUI();
  }

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Load AudioWorklet processors
      await this.audioContext.audioWorklet.addModule('./just-friends-processor.js');
      await this.audioContext.audioWorklet.addModule('./just-friends-osc-processor.js');
      await this.audioContext.audioWorklet.addModule('./quantizer-processor.js');
      await this.audioContext.audioWorklet.addModule('./mangrove-processor.js');
      await this.audioContext.audioWorklet.addModule('./three-sisters-processor.js');
      await this.audioContext.audioWorklet.addModule('./modulation-matrix-processor.js');
      
      console.log('%c✓ All AudioWorklets loaded - Phase 5 + JF Osc Integration', 'color: green; font-weight: bold');
      
      // Create module instances
      this.jf1 = new JustFriendsNode(this.audioContext);
      this.jfOsc = new JustFriendsOscNode(this.audioContext);
      await new Promise(resolve => setTimeout(resolve, 10));
      this.quantizer = new QuantizerNode(this.audioContext);
      this.mangroveA = new MangroveNode(this.audioContext);
      this.mangroveB = new MangroveNode(this.audioContext);
      this.mangroveC = new MangroveNode(this.audioContext);
      this.threeSisters = new ThreeSistersNode(this.audioContext);
      this.modMatrix = new ModulationMatrixNode(this.audioContext);
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.3;

      // Create crossfade gains
      this.mangroveAGain = this.audioContext.createGain();
      this.mangroveAGain.gain.value = 1.0; // Start with Mangrove
      this.jfOscGain = this.audioContext.createGain();
      this.jfOscGain.gain.value = 0.0; // JF Osc starts silent

      // Create FM routing gains
      this.fmGainB = this.audioContext.createGain();
      this.fmGainB.gain.value = 0.0; // Start disabled
      this.fmExpGain = this.audioContext.createGain();
      this.fmExpGain.gain.value = 0.3; // Default exponential depth
      this.fmLinGain = this.audioContext.createGain();
      this.fmLinGain.gain.value = 1.0; // Pass-through for linear

      this.setupScope1();
      this.setupScope2();

      // ========== SIGNAL ROUTING ==========
      
      // 1. JF #1 → Scope 1 → Quantizer
      this.jf1.getIdentityOutput().connect(this.scope1Analyser);
      this.scope1Analyser.connect(this.quantizer.getInput());

      // 2. Quantizer → Both Mangrove A and JF Osc (both always get pitch CV)
      this.quantizer.getOutput().connect(this.mangroveA.getPitchCVInput());
      this.quantizer.getOutput().connect(this.jfOsc.getTimeCVInput());

      // 3. Mangrove B FORMANT → FM routing
      // This splits to both exponential and linear paths, controlled by gains
      this.mangroveB.getFormantOutput().connect(this.fmGainB);
      
      // Exponential path: FM → fmExpGain → Mangrove A pitch / JF Osc TIME CV
      this.fmGainB.connect(this.fmExpGain);
      this.fmExpGain.connect(this.mangroveA.getPitchCVInput());
      this.fmExpGain.connect(this.jfOsc.getTimeCVInput());
      
      // Linear path: FM → fmLinGain → Mangrove A FM / JF Osc FM
      this.fmGainB.connect(this.fmLinGain);
      this.fmLinGain.connect(this.mangroveA.getFMInput());
      this.fmLinGain.connect(this.jfOsc.getFMInput());

      // 4. Oscillator outputs → Crossfade → Three Sisters
      this.mangroveA.getFormantOutput().connect(this.mangroveAGain);
      this.jfOsc.getMixOutput().connect(this.jfOscGain);
      
      this.mangroveAGain.connect(this.threeSisters.getAudioInput());
      this.jfOscGain.connect(this.threeSisters.getAudioInput());

      // 5. Mangrove C FORMANT → Three Sisters FM input
      this.mangroveC.getFormantOutput().connect(this.threeSisters.getFMInput());

      // 6. Three Sisters ALL output → Scope 2 → Master → Output
      this.threeSisters.getAllOutput().connect(this.scope2Analyser);
      this.scope2Analyser.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);
      
      // 7. JF slopes 2N-6N → Modulation Matrix
      this.jfMerger = this.audioContext.createChannelMerger(5);
      this.jf1.get2NOutput().connect(this.jfMerger, 0, 0);
      this.jf1.get3NOutput().connect(this.jfMerger, 0, 1);
      this.jf1.get4NOutput().connect(this.jfMerger, 0, 2);
      this.jf1.get5NOutput().connect(this.jfMerger, 0, 3);
      this.jf1.get6NOutput().connect(this.jfMerger, 0, 4);
      this.jfMerger.connect(this.modMatrix.getInput());
      
      console.log('=== Phase 5 + JF Osc Integration Signal Flow ===');
      console.log('JF #1 IDENTITY → Quantizer → [Mangrove A OR JF Osc] → Three Sisters');
      console.log('Mangrove B → [Exponential OR Linear FM] → Active Oscillator');
      console.log('Mangrove C → Three Sisters FM');
      console.log('Active oscillator controlled by toggle');
      
      // Build destination map for modulation matrix
      this.buildDestinationMap();
      
      this.configureDefaults();
      
      document.getElementById('status').textContent = 'Ready - System Active';
      document.getElementById('startBtn').disabled = false;
      
      this.syncUIWithParameters();
      
      console.log('%c✓ Phase 5 + JF Osc Integration initialized!', 'color: green; font-weight: bold');
      console.log('%c✓ Toggle between Mangrove and Just Friends oscillators', 'color: blue; font-weight: bold');
      
    } catch (error) {
      console.error('Failed to initialize:', error);
      document.getElementById('status').textContent = 'Error: ' + error.message;
    }
  }

  buildDestinationMap() {
    this.destinationMap = {
      // Just Friends #1 (LFO)
      'jf1.time': this.jf1.params.time,
      'jf1.intone': this.jf1.params.intone,
      'jf1.ramp': this.jf1.params.ramp,
      'jf1.curve': this.jf1.params.curve,
      
      // Quantizer
      'quant.depth': this.quantizer.params.depth,
      'quant.offset': this.quantizer.params.offset,
      
      // Mangrove A
      'ma.pitch': this.mangroveA.params.pitchKnob,
      'ma.barrel': this.mangroveA.params.barrelKnob,
      'ma.formant': this.mangroveA.params.formantKnob,
      'ma.air': this.mangroveA.params.airKnob,
      'ma.fmIndex': this.mangroveA.params.fmIndex,
      
      // Mangrove B
      'mb.pitch': this.mangroveB.params.pitchKnob,
      'mb.barrel': this.mangroveB.params.barrelKnob,
      'mb.formant': this.mangroveB.params.formantKnob,
      
      // Mangrove C
      'mc.pitch': this.mangroveC.params.pitchKnob,
      'mc.barrel': this.mangroveC.params.barrelKnob,
      'mc.formant': this.mangroveC.params.formantKnob,
      
      // Just Friends Osc
      'jfosc.time': this.jfOsc.params.time,
      'jfosc.intone': this.jfOsc.params.intone,
      'jfosc.ramp': this.jfOsc.params.ramp,
      'jfosc.curve': this.jfOsc.params.curve,
      'jfosc.fmIndex': this.jfOsc.params.fmIndex,
      'jfosc.run': this.jfOsc.params.run,
      
      // Three Sisters
      'ts.freq': this.threeSisters.params.freq,
      'ts.span': this.threeSisters.params.span,
      'ts.quality': this.threeSisters.params.quality,
      'ts.fmAtten': this.threeSisters.params.fmAttenuverter,
      
      // Master
      'master.volume': this.masterGain.gain
    };
    
    console.log('✓ Destination map built - 33 parameters available');
  }

  configureDefaults() {
    // JF #1: Cycle mode LFO for pitch modulation
    this.jf1.setMode(2);
    this.jf1.setRange(0);
    this.jf1.setTime(0.25);
    this.jf1.setIntone(0.5);
    this.jf1.setRamp(0.5);
    this.jf1.setCurve(0.5);

    // JF Osc: Default to cycle/sound mode (VCO)
    this.jfOsc.setCycleSoundMode();
    this.jfOsc.setUnison();
    this.jfOsc.setTriangleWave();
    if (this.jfOsc.params && this.jfOsc.params.time) {
      this.jfOsc.params.time.value = 0.5;
    }
    if (this.jfOsc.params && this.jfOsc.params.fmIndex) {
      this.jfOsc.params.fmIndex.value = 0;
    }
    if (this.jfOsc.params && this.jfOsc.params.run) {
      this.jfOsc.params.run.value = 0;
    }
    this.jfOsc.enableRunMode(false);

    // Quantizer: C major scale
    this.quantizer.setMajorScale(0);
    this.quantizer.setDepth(1.0);
    this.quantizer.setOffset(0);

    // Mangrove A: Main voice
    this.mangroveA.setPitch(0.5);
    this.mangroveA.setBarrel(0.3);
    this.mangroveA.setFormant(0.6);
    this.mangroveA.setAir(0.5);
    this.mangroveA.setFMIndex(0.3);

    // Mangrove B: FM modulator
    this.mangroveB.setPitch(0.52);
    this.mangroveB.setBarrel(0.65);
    this.mangroveB.setFormant(0.55);
    this.mangroveB.setAir(0.7);

    // Mangrove C: Filter FM source
    this.mangroveC.setPitch(0.6);
    this.mangroveC.setBarrel(0.5);
    this.mangroveC.setFormant(0.5);
    this.mangroveC.setAir(0.8);

    // Three Sisters: Default filter settings
    this.threeSisters.setFreq(0.5);
    this.threeSisters.setSpan(0.5);
    this.threeSisters.setQuality(0.5);
    this.threeSisters.setMode(0);
    this.threeSisters.setFMAttenuverter(0.5);
    
    console.log('Default settings configured');
  }

  // ========== OSCILLATOR SWITCHING ==========

  setActiveOscillator(osc) {
    if (osc === this.activeOscillator) return;
    
    this.activeOscillator = osc;
    const now = this.audioContext.currentTime;
    const fadeTime = 0.05; // 50ms crossfade
    
    if (osc === 'mangrove') {
      // Fade to Mangrove
      this.mangroveAGain.gain.cancelScheduledValues(now);
      this.mangroveAGain.gain.setValueAtTime(this.mangroveAGain.gain.value, now);
      this.mangroveAGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
      
      this.jfOscGain.gain.cancelScheduledValues(now);
      this.jfOscGain.gain.setValueAtTime(this.jfOscGain.gain.value, now);
      this.jfOscGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      
      console.log('✓ Switched to Mangrove A');
    } else {
      // Fade to Just Friends Osc
      this.mangroveAGain.gain.cancelScheduledValues(now);
      this.mangroveAGain.gain.setValueAtTime(this.mangroveAGain.gain.value, now);
      this.mangroveAGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      
      this.jfOscGain.gain.cancelScheduledValues(now);
      this.jfOscGain.gain.setValueAtTime(this.jfOscGain.gain.value, now);
      this.jfOscGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
      
      console.log('✓ Switched to Just Friends Osc');
    }
    
    // Update UI
    this.updateOscillatorUI();
  }

  updateOscillatorUI() {
    const mangrovePanel = document.getElementById('mangrovePanel');
    const jfOscPanel = document.getElementById('jfOscPanel');
    
    if (this.activeOscillator === 'mangrove') {
      if (mangrovePanel) mangrovePanel.style.display = 'block';
      if (jfOscPanel) jfOscPanel.style.display = 'none';
    } else {
      if (mangrovePanel) mangrovePanel.style.display = 'none';
      if (jfOscPanel) jfOscPanel.style.display = 'block';
    }
    
    // Update toggle button states
    document.querySelectorAll('.osc-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.osc === this.activeOscillator);
    });
  }

  // ========== FM MODE SWITCHING ==========

  setFMMode(mode) {
    if (mode === this.fmMode) return;
    
    this.fmMode = mode;
    const now = this.audioContext.currentTime;
    const fadeTime = 0.02;
    
    if (mode === 'exponential') {
      // Enable exponential, disable linear
      this.fmExpGain.gain.cancelScheduledValues(now);
      this.fmExpGain.gain.setValueAtTime(this.fmExpGain.gain.value, now);
      this.fmExpGain.gain.linearRampToValueAtTime(0.3, now + fadeTime);
      
      this.fmLinGain.gain.cancelScheduledValues(now);
      this.fmLinGain.gain.setValueAtTime(this.fmLinGain.gain.value, now);
      this.fmLinGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      
      console.log('✓ FM Mode: Exponential (pitch modulation)');
    } else {
      // Enable linear, disable exponential
      this.fmExpGain.gain.cancelScheduledValues(now);
      this.fmExpGain.gain.setValueAtTime(this.fmExpGain.gain.value, now);
      this.fmExpGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      
      this.fmLinGain.gain.cancelScheduledValues(now);
      this.fmLinGain.gain.setValueAtTime(this.fmLinGain.gain.value, now);
      this.fmLinGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
      
      console.log('✓ FM Mode: Linear (through-zero FM)');
    }
    
    // Update UI
    document.querySelectorAll('.fm-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  toggleFM(enabled) {
    if (!this.fmGainB) return;
    
    const now = this.audioContext.currentTime;
    this.fmGainB.gain.cancelScheduledValues(now);
    this.fmGainB.gain.setValueAtTime(this.fmGainB.gain.value, now);
    this.fmGainB.gain.linearRampToValueAtTime(enabled ? 1.0 : 0.0, now + 0.05);
    
    console.log(`FM B → A: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // ========== JUST FRIENDS OSC MODE SWITCHING ==========

  setJFOscMode(mode, range) {
    const modeValue = parseInt(mode);
    const rangeValue = parseInt(range);
    
    this.jfOsc.params.mode.value = modeValue;
    this.jfOsc.params.range.value = rangeValue;
    
    // Update mode badge
    this.updateJFOscModeDisplay();
  }

  updateJFOscModeDisplay() {
    const modeBadge = document.getElementById('jfOscModeBadge');
    if (!modeBadge || !this.jfOsc || !this.jfOsc.params) return;
  
    const mode = Math.round(this.jfOsc.params.mode?.value || 0);
    const range = Math.round(this.jfOsc.params.range?.value || 0);
    const runEnabled = (this.jfOsc.params.runEnabled?.value || 0) > 0.5;
    
      const modeNames = ['transient', 'sustain', 'cycle'];
      const rangeNames = ['shape', 'sound'];
      const runModes = {
        '0/0': 'SHIFT', '1/0': 'STRATA', '2/0': 'VOLLEY',
        '0/1': 'SPILL', '1/1': 'PLUME', '2/1': 'FLOOM'
    };
    
    if (runEnabled) {
      const runName = runModes[`${mode}/${range}`];
      modeBadge.textContent = runName;
      modeBadge.classList.add('run-mode');
    } else {
      modeBadge.textContent = `${modeNames[mode]}/${rangeNames[range]}`;
      modeBadge.classList.remove('run-mode');
    }
  }

  setupScope1() {
    this.scope1Analyser = this.audioContext.createAnalyser();
    this.scope1Analyser.fftSize = 2048;
    this.scope1Analyser.smoothingTimeConstant = 0;
    this.scope1Canvas = document.getElementById('scope1');
    this.scope1Ctx = this.scope1Canvas.getContext('2d');
  }

  setupScope2() {
    this.scope2Analyser = this.audioContext.createAnalyser();
    this.scope2Analyser.fftSize = 2048;
    this.scope2Analyser.smoothingTimeConstant = 0;
    this.scope2Canvas = document.getElementById('scope2');
    this.scope2Ctx = this.scope2Canvas.getContext('2d');
  }

  drawScope(analyser, canvas, ctx, color = '#6b5b95') {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    
    analyser.getFloatTimeDomainData(dataArray);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 4; i++) {
      const y = (canvas.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

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
    document.getElementById('status').textContent = 'Running - System Active';
    
    console.log('%c▶ System running', 'color: green; font-weight: bold');
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

  // ========== MODULATION MATRIX UI ==========

  generateModSlotHTML(slotIndex) {
    const slopeNames = ['2N', '3N', '4N', '5N', '6N'];
    const slopeName = slopeNames[slotIndex];
    const slotNumber = slotIndex + 1;
    
    return `
      <div class="mod-slot" data-slot="${slotIndex}">
        <div class="mod-slot-header">
          <span class="mod-slot-label">Slot ${slotNumber} (${slopeName})</span>
          <label class="mod-toggle">
            <input type="checkbox" class="mod-enable" data-slot="${slotIndex}">
            <span class="mod-toggle-text">Enable</span>
          </label>
        </div>
        
        <div class="mod-slot-controls">
          <div class="mod-control-row">
            <label>destination</label>
            <select class="mod-destination" data-slot="${slotIndex}">
              <option value="">-- none --</option>
              <optgroup label="Just Friends #1 (LFO)">
                <option value="jf1.time">JF1: Time</option>
                <option value="jf1.intone">JF1: Intone</option>
                <option value="jf1.ramp">JF1: Ramp</option>
                <option value="jf1.curve">JF1: Curve</option>
              </optgroup>
              <optgroup label="Quantizer">
                <option value="quant.depth">Quantizer: Depth</option>
                <option value="quant.offset">Quantizer: Offset</option>
              </optgroup>
              <optgroup label="Mangrove A">
                <option value="ma.pitch">Mangrove A: Pitch</option>
                <option value="ma.barrel">Mangrove A: Barrel</option>
                <option value="ma.formant">Mangrove A: Formant</option>
                <option value="ma.air">Mangrove A: Air</option>
                <option value="ma.fmIndex">Mangrove A: FM Depth</option>
              </optgroup>
              <optgroup label="Mangrove B">
                <option value="mb.pitch">Mangrove B: Pitch</option>
                <option value="mb.barrel">Mangrove B: Barrel</option>
                <option value="mb.formant">Mangrove B: Formant</option>
              </optgroup>
              <optgroup label="Mangrove C">
                <option value="mc.pitch">Mangrove C: Pitch</option>
                <option value="mc.barrel">Mangrove C: Barrel</option>
                <option value="mc.formant">Mangrove C: Formant</option>
              </optgroup>
              <optgroup label="Just Friends Osc">
                <option value="jfosc.time">JF Osc: Time</option>
                <option value="jfosc.intone">JF Osc: Intone</option>
                <option value="jfosc.ramp">JF Osc: Ramp</option>
                <option value="jfosc.curve">JF Osc: Curve</option>
                <option value="jfosc.fmIndex">JF Osc: FM Index</option>
                <option value="jfosc.run">JF Osc: RUN</option>
              </optgroup>
              <optgroup label="Three Sisters">
                <option value="ts.freq">Three Sisters: Freq</option>
                <option value="ts.span">Three Sisters: Span</option>
                <option value="ts.quality">Three Sisters: Quality</option>
                <option value="ts.fmAtten">Three Sisters: FM Atten</option>
              </optgroup>
              <optgroup label="Master">
                <option value="master.volume">Master: Volume</option>
              </optgroup>
            </select>
          </div>
          
          <div class="mod-control-row">
            <label>mode</label>
            <select class="mod-mode" data-slot="${slotIndex}">
              <option value="0">Unipolar (0→1)</option>
              <option value="1">Bipolar (-1→+1)</option>
              <option value="2">Inv Unipolar (1→0)</option>
              <option value="3">Inv Bipolar (+1→-1)</option>
            </select>
          </div>
          
          <div class="mod-control-row">
            <label>depth</label>
            <input type="range" class="mod-depth" data-slot="${slotIndex}" 
                   min="0" max="1" step="0.01" value="0.5">
            <span class="mod-value mod-depth-value" data-slot="${slotIndex}">0.50</span>
          </div>
          
          <div class="mod-control-row">
            <label>offset</label>
            <input type="range" class="mod-offset" data-slot="${slotIndex}" 
                   min="-1" max="1" step="0.01" value="0">
            <span class="mod-value mod-offset-value" data-slot="${slotIndex}">0.00</span>
          </div>
        </div>
      </div>
    `;
  }

  initModMatrixUI() {
    const container = document.getElementById('modSlotsContainer');
    if (!container) {
      console.warn('Mod matrix container not found - skipping mod matrix UI');
      return;
    }
    
    // Generate 5 slots
    for (let i = 0; i < 5; i++) {
      container.innerHTML += this.generateModSlotHTML(i);
    }
    
    // Bind event handlers
    this.bindModMatrixControls();
    
    console.log('✓ Modulation matrix UI initialized');
  }

  bindModMatrixControls() {
    // Enable/disable checkboxes
    document.querySelectorAll('.mod-enable').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const enabled = e.target.checked;
        this.handleModSlotEnable(slot, enabled);
      });
    });
    
    // Destination dropdowns
    document.querySelectorAll('.mod-destination').forEach(select => {
      select.addEventListener('change', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const destination = e.target.value;
        this.handleModDestinationChange(slot, destination);
      });
    });
    
    // Mode dropdowns
    document.querySelectorAll('.mod-mode').forEach(select => {
      select.addEventListener('change', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const mode = parseInt(e.target.value);
        this.modMatrix.setMode(slot, mode);
      });
    });
    
    // Depth sliders
    document.querySelectorAll('.mod-depth').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const value = parseFloat(e.target.value);
        this.modMatrix.setDepth(slot, value);
        
        const display = document.querySelector(`.mod-depth-value[data-slot="${slot}"]`);
        if (display) display.textContent = value.toFixed(2);
      });
    });
    
    // Offset sliders
    document.querySelectorAll('.mod-offset').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const value = parseFloat(e.target.value);
        this.modMatrix.setOffset(slot, value);
        
        const display = document.querySelector(`.mod-offset-value[data-slot="${slot}"]`);
        if (display) display.textContent = value.toFixed(2);
      });
    });
  }

  handleModSlotEnable(slot, enabled) {
    this.modMatrix.setEnabled(slot, enabled);
    
    // Update UI
    const slotElement = document.querySelector(`.mod-slot[data-slot="${slot}"]`);
    if (slotElement) {
      if (enabled) {
        slotElement.classList.add('active');
      } else {
        slotElement.classList.remove('active');
      }
    }
    
    console.log(`Mod slot ${slot} ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  handleModDestinationChange(slot, destination) {
    if (!destination || destination === '') {
      // Clear destination
      this.modMatrix.clearSlot(slot);
      console.log(`Mod slot ${slot} destination cleared`);
      return;
    }
    
    // Look up the AudioParam
    const audioParam = this.destinationMap[destination];
    
    if (!audioParam) {
      console.error(`Unknown destination: ${destination}`);
      return;
    }
    
    // Set the destination
    this.modMatrix.setDestination(slot, audioParam);
    console.log(`Mod slot ${slot} → ${destination}`);
  }

  // ========== UI SETUP ==========

  setupUI() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.bindControls();
        this.initModMatrixUI();
      });
    } else {
      this.bindControls();
      this.initModMatrixUI();
    }
  }

  bindControls() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.toggle());
    }

    // Oscillator toggle
    document.querySelectorAll('.osc-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const osc = e.target.dataset.osc;
        this.setActiveOscillator(osc);
      });
    });

    // FM mode toggle
    document.querySelectorAll('.fm-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.dataset.mode;
        this.setFMMode(mode);
      });
    });

    // FM enable
    const fmEnable = document.getElementById('fmEnable');
    if (fmEnable) {
      fmEnable.checked = false;
      fmEnable.addEventListener('change', (e) => {
        this.toggleFM(e.target.checked);
      });
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

    // JF Osc controls
    this.bindKnob('jfOscTime', (val) => {
      if (this.jfOsc && this.jfOsc.params && this.jfOsc.params.time) {
        this.jfOsc.params.time.value = val;
      }
    });
    this.bindKnob('jfOscIntone', (val) => {
      if (this.jfOsc && this.jfOsc.params && this.jfOsc.params.intone) {
        this.jfOsc.params.intone.value = val;
      }
    });
    this.bindKnob('jfOscRamp', (val) => {
      if (this.jfOsc && this.jfOsc.params && this.jfOsc.params.ramp) {
        this.jfOsc.params.ramp.value = val;
      }
    });
    this.bindKnob('jfOscCurve', (val) => {
      if (this.jfOsc && this.jfOsc.params && this.jfOsc.params.curve) {
        this.jfOsc.params.curve.value = val;
      }
    });
    this.bindKnob('jfOscFmIndex', (val) => {
      if (this.jfOsc && this.jfOsc.params && this.jfOsc.params.fmIndex) {
        this.jfOsc.params.fmIndex.value = val;
      }
    });
    this.bindKnob('jfOscRun', (val) => {
      if (this.jfOsc && this.jfOsc.params && this.jfOsc.params.run) {
        this.jfOsc.params.run.value = val;
      }
    });

    // JF Osc mode selection
    const jfOscMode = document.getElementById('jfOscMode');
    if (jfOscMode) {
      jfOscMode.addEventListener('change', (e) => {
        const range = document.getElementById('jfOscRange')?.value || '1';
        this.setJFOscMode(e.target.value, range);
      });
    }

    const jfOscRange = document.getElementById('jfOscRange');
    if (jfOscRange) {
      jfOscRange.addEventListener('change', (e) => {
        const mode = document.getElementById('jfOscMode')?.value || '2';
        this.setJFOscMode(mode, e.target.value);
      });
    }

    // JF Osc RUN toggle
    const jfOscRunToggle = document.getElementById('jfOscRunToggle');
    if (jfOscRunToggle) {
      jfOscRunToggle.addEventListener('change', (e) => {
        if (this.jfOsc) {
          this.jfOsc.enableRunMode(e.target.checked);
          this.updateJFOscModeDisplay();
        }
      });
    }

    // JF Osc trigger buttons
    document.querySelectorAll('.jfosc-trigger-btn').forEach(btn => {
      const index = parseInt(btn.dataset.index);
      
      btn.addEventListener('mousedown', () => {
        if (!this.jfOsc) return;
        btn.classList.add('active');
        this.jfOsc.trigger(index);
      });
      
      btn.addEventListener('mouseup', () => {
        btn.classList.remove('active');
      });
      
      btn.addEventListener('mouseleave', () => {
        btn.classList.remove('active');
      });
    });

    // Quantizer controls
    this.bindKnob('quantDepth', (val) => this.quantizer?.setDepth(val));
    this.bindKnob('quantOffset', (val) => this.quantizer?.setOffset(val));

    const presetBtns = document.querySelectorAll('.preset-btn');
    presetBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        presetBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const scale = e.target.dataset.scale;
        this.setScale(scale);
      });
    });

    this.createPianoKeyboard();

    // Mangrove A controls
    this.bindKnob('maPitch', (val) => this.mangroveA?.setPitch(val));
    this.bindKnob('maBarrel', (val) => this.mangroveA?.setBarrel(val));
    this.bindKnob('maFormant', (val) => this.mangroveA?.setFormant(val));
    this.bindKnob('maAir', (val) => this.mangroveA?.setAir(val));
    this.bindKnob('maFmIndex', (val) => this.mangroveA?.setFMIndex(val));

    // Mangrove B controls
    this.bindKnob('mbPitch', (val) => this.mangroveB?.setPitch(val));
    this.bindKnob('mbBarrel', (val) => this.mangroveB?.setBarrel(val));
    this.bindKnob('mbFormant', (val) => this.mangroveB?.setFormant(val));

    // Mangrove C controls
    this.bindKnob('mcPitch', (val) => this.mangroveC?.setPitch(val));
    this.bindKnob('mcBarrel', (val) => this.mangroveC?.setBarrel(val));
    this.bindKnob('mcFormant', (val) => this.mangroveC?.setFormant(val));

    // Three Sisters controls
    this.bindKnob('tsFreq', (val) => this.threeSisters?.setFreq(val));
    this.bindKnob('tsSpan', (val) => this.threeSisters?.setSpan(val));
    this.bindKnob('tsQuality', (val) => this.threeSisters?.setQuality(val));
    this.bindKnob('tsFmAtten', (val) => this.threeSisters?.setFMAttenuverter(val));

    const tsMode = document.getElementById('tsMode');
    if (tsMode) {
      tsMode.addEventListener('change', (e) => {
        this.threeSisters?.setMode(parseFloat(e.target.value));
      });
    }

    this.bindKnob('masterVolume', (val) => {
      if (this.masterGain) this.masterGain.gain.value = val;
    });
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
      
      knob.addEventListener('change', (e) => {
        const value = parseFloat(e.target.value);
        if (display) {
          display.textContent = value.toFixed(2);
        }
      });
      
      if (display) {
        display.textContent = parseFloat(knob.value).toFixed(2);
      }
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
        this.quantizer.setMajorScale(0);
        break;
      case 'minor':
        this.quantizer.setMinorScale(9);
        break;
      case 'penta-maj':
        this.quantizer.setPentatonicMajor(0);
        break;
      case 'penta-min':
        this.quantizer.setPentatonicMinor(9);
        break;
    }

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
    const params = [
      'jf1Time', 'jf1Intone', 'jf1Ramp', 'jf1Curve',
      'quantDepth', 'quantOffset',
      'maPitch', 'maBarrel', 'maFormant', 'maAir', 'maFmIndex',
      'mbPitch', 'mbBarrel', 'mbFormant',
      'mcPitch', 'mcBarrel', 'mcFormant',
      'jfOscTime', 'jfOscIntone', 'jfOscRamp', 'jfOscCurve', 'jfOscFmIndex', 'jfOscRun',
      'tsFreq', 'tsSpan', 'tsQuality', 'tsFmAtten',
      'masterVolume'
    ];

    params.forEach(param => {
      const knob = document.getElementById(param);
      const display = document.getElementById(param + 'Value');
      if (knob && display) {
        const value = parseFloat(knob.value);
        display.textContent = value.toFixed(2);
      }
    });

    this.updatePianoKeyboard();
    this.updateOscillatorUI();
    this.updateJFOscModeDisplay();
    
    const fmEnable = document.getElementById('fmEnable');
    if (fmEnable) {
      fmEnable.checked = false;
    }
    
    console.log('UI synced - ready to modulate!');
  }
}

const app = new Phase5App();
window.addEventListener('load', () => app.init());
