// main.js - Phase 5 + René Mode Integration + 7 LFOs + Drum Machine
// UPDATED: Includes 7 LFOs with dual destinations, comprehensive modulation routing, and drum machine

import { JustFriendsNode } from './JustFriendsNode.js';
import { JustFriendsOscNode } from './JustFriendsOscNode.js';
import { QuantizerNode } from './QuantizerNode.js';
import { TransposeSequencerNode } from './TransposeSequencerNode.js';
import { MangroveNode } from './MangroveNode.js';
import { ThreeSistersNode } from './ThreeSistersNode.js';
import { ModulationMatrixNode } from './outputs/ModulationMatrixNode.js';
import { LFONode } from './LFONode.js';
import { EnvelopeVCANode } from './EnvelopeVCANode.js';
import { initReneMode, toggleReneMode } from './rene-integration-redesigned.js';
import { DrumSynthNode } from './DrumSynthNode.js';
import { DrumSequencerNode } from './DrumSequencerNode.js';

class Phase5App {
  constructor() {
    this.audioContext = null;
    
    // Modules
    this.jf1 = null;
    this.transposeSeq = null;
    this.quantizer = null;
    this.envelopeVCA = null;
    this.mangroveA = null;
    this.mangroveB = null;
    this.mangroveC = null;
    this.jfOsc = null;
    this.threeSisters = null;
    this.masterGain = null;
    
    // LFO array (7 LFOs)
    this.lfos = [];
    
    // Modulation matrix
    this.modMatrix = null;
    this.destinationMap = null;
    this.jfMerger = null;
    
    // Drum machine
    this.drumSequencer = null;
    this.drumSynth = null;
    this.drumMasterGain = null;
    this.drumClockSource = 'jf'; // 'jf' or 'rene'
    
    // Clock pulse generators for drums
    this.jfDrumClock = null;
    this.reneDrumClock = null;
    
    // Oscillator selection state
    this.activeOscillator = 'mangrove';
    
    // FM routing
    this.fmGainB = null;
    this.fmExpGain = null;
    this.fmLinGain = null;
    this.fmMode = 'exponential';
    
    // Crossfade gains for oscillator switching
    this.mangroveAGain = null;
    this.jfOscGain = null;
    
    // Transpose sequencer to quantizer connection
    this.transposeGain = null;
    
    // René CV routing node
    this.renePitchGain = null;
    this.renePitchSource = null;
    
    // JF #1 to quantizer routing
    this.jf1ToQuantGain = null;
    
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
      await this.audioContext.audioWorklet.addModule('./transpose-sequencer-processor.js');
      await this.audioContext.audioWorklet.addModule('./mangrove-processor.js');
      await this.audioContext.audioWorklet.addModule('./three-sisters-processor.js');
      await this.audioContext.audioWorklet.addModule('./modulation-matrix-processor.js');
      await this.audioContext.audioWorklet.addModule('./envelope-processor.js');
      await this.audioContext.audioWorklet.addModule('./lfo-processor.js');
      
      // Load drum machine worklets
      await this.audioContext.audioWorklet.addModule('./drum-synth-processor.js');
      await this.audioContext.audioWorklet.addModule('./drum-sequencer-processor.js');
      
      console.log('%c✓ All AudioWorklets loaded including drums', 'color: green; font-weight: bold');
      
      await new Promise(resolve => setTimeout(resolve, 200));

      // Create module instances
      this.jf1 = new JustFriendsNode(this.audioContext);
      this.jfOsc = new JustFriendsOscNode(this.audioContext);
      await new Promise(resolve => setTimeout(resolve, 10));
      this.transposeSeq = new TransposeSequencerNode(this.audioContext);
      this.quantizer = new QuantizerNode(this.audioContext);
      this.envelopeVCA = new EnvelopeVCANode(this.audioContext);
      
      // Create 7 LFOs
      for (let i = 0; i < 7; i++) {
        this.lfos.push(new LFONode(this.audioContext, i));
      }
      console.log('✓ 7 LFOs created');
      
      this.jf1ToQuantGain = this.audioContext.createGain();
      this.jf1ToQuantGain.gain.value = 1.0;
      
      this.mangroveA = new MangroveNode(this.audioContext);
      this.mangroveB = new MangroveNode(this.audioContext);
      this.mangroveC = new MangroveNode(this.audioContext);
      this.threeSisters = new ThreeSistersNode(this.audioContext);
      this.modMatrix = new ModulationMatrixNode(this.audioContext);
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.3;

      this.mangroveAGain = this.audioContext.createGain();
      this.mangroveAGain.gain.value = 1.0;
      this.jfOscGain = this.audioContext.createGain();
      this.jfOscGain.gain.value = 0.0;

      this.fmGainB = this.audioContext.createGain();
      this.fmGainB.gain.value = 0.0;
      this.fmExpGain = this.audioContext.createGain();
      this.fmExpGain.gain.value = 0.3;
      this.fmLinGain = this.audioContext.createGain();
      this.fmLinGain.gain.value = 1.0;

      this.transposeGain = this.audioContext.createGain();
      this.transposeGain.gain.value = 12.0;

      this.renePitchGain = this.audioContext.createGain();
      this.renePitchGain.gain.value = 0;
      
      this.renePitchSource = this.audioContext.createConstantSource();
      this.renePitchSource.offset.value = 0;
      this.renePitchSource.start();

      // CREATE DRUM MACHINE
      this.drumSequencer = new DrumSequencerNode(this.audioContext);
      this.drumSynth = new DrumSynthNode(this.audioContext);
      this.drumMasterGain = this.audioContext.createGain();
      this.drumMasterGain.gain.value = 0.7;
      
      // Create clock pulse generators
      this.createDrumClockSources();

      this.setupScope1();
      this.setupScope2();

      // ========== SIGNAL ROUTING ==========
      
      // Existing routing (unchanged)
      this.jf1.getIdentityOutput().connect(this.transposeSeq.getClockInput());
      this.jf1.getIdentityOutput().connect(this.scope1Analyser);
      this.scope1Analyser.connect(this.jf1ToQuantGain);
      this.jf1ToQuantGain.connect(this.quantizer.getInput());

      this.transposeSeq.getTransposeOutput().connect(this.transposeGain);
      this.transposeGain.connect(this.quantizer.params.transpose);

      this.renePitchSource.connect(this.renePitchGain);
      this.renePitchGain.connect(this.quantizer.getInput());

      this.quantizer.getOutput().connect(this.mangroveA.getPitchCVInput());
      this.quantizer.getOutput().connect(this.jfOsc.getTimeCVInput());

      this.mangroveB.getFormantOutput().connect(this.fmGainB);
      this.fmGainB.connect(this.fmExpGain);
      this.fmExpGain.connect(this.mangroveA.getPitchCVInput());
      this.fmExpGain.connect(this.jfOsc.getTimeCVInput());
      this.fmGainB.connect(this.fmLinGain);
      this.fmLinGain.connect(this.mangroveA.getFMInput());
      this.fmLinGain.connect(this.jfOsc.getFMInput());

      this.mangroveA.getFormantOutput().connect(this.mangroveAGain);
      this.jfOsc.getMixOutput().connect(this.jfOscGain);
      this.mangroveAGain.connect(this.threeSisters.getAudioInput());
      this.jfOscGain.connect(this.threeSisters.getAudioInput());

      this.mangroveC.getFormantOutput().connect(this.threeSisters.getFMInput());

      this.threeSisters.getAllOutput().connect(this.scope2Analyser);
      this.scope2Analyser.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);
      
      this.jfMerger = this.audioContext.createChannelMerger(5);
      this.jf1.get2NOutput().connect(this.jfMerger, 0, 0);
      this.jf1.get3NOutput().connect(this.jfMerger, 0, 1);
      this.jf1.get4NOutput().connect(this.jfMerger, 0, 2);
      this.jf1.get5NOutput().connect(this.jfMerger, 0, 3);
      this.jf1.get6NOutput().connect(this.jfMerger, 0, 4);
      this.jfMerger.connect(this.modMatrix.getInput());
      
      // JF clock for drums: Use IDENTITY output
      const jfToDrumGain = this.audioContext.createGain();
      jfToDrumGain.gain.value = 1.0;
      this.jf1.getIdentityOutput().connect(jfToDrumGain);
      jfToDrumGain.connect(this.jfDrumClock.offset);
      
      // Setup drum routing
      this.setupDrumRouting();
      
      console.log('=== Phase 5 + LFOs + Drums ===');
      console.log('Signal routing complete');
      
      // Build comprehensive destination map
      this.buildDestinationMap();
      
      this.configureDefaults();
      
      await initReneMode(this);
      
      this.transposeSeq.addEventListener('step-changed', (e) => {
        this.updateSequencerUI(e.detail.step, e.detail.transpose);
      });
      
      document.getElementById('status').textContent = 'Ready - System Active';
      document.getElementById('startBtn').disabled = false;
      
      this.syncUIWithParameters();
      
      console.log('%c✓ Phase 5 + LFOs + Drums initialized!', 'color: green; font-weight: bold');
      
    } catch (error) {
      console.error('Failed to initialize:', error);
      document.getElementById('status').textContent = 'Error: ' + error.message;
    }
  }

  createDrumClockSources() {
    // JF Clock: Create a constant source that will be modulated by JF
    this.jfDrumClock = this.audioContext.createConstantSource();
    this.jfDrumClock.offset.value = 0;
    this.jfDrumClock.start();
    
    // René Clock: Create pulse generator
    this.reneDrumClock = this.audioContext.createConstantSource();
    this.reneDrumClock.offset.value = 0;
    this.reneDrumClock.start();
  }

  setupDrumRouting() {
    // Connect sequencer outputs to synth inputs
    this.drumSequencer.getKickTriggerOutput().connect(this.drumSynth.getKickTriggerInput());
    this.drumSequencer.getSnareTriggerOutput().connect(this.drumSynth.getSnareTriggerInput());
    this.drumSequencer.getHatTriggerOutput().connect(this.drumSynth.getHatTriggerInput());
    
    // Connect synth output to master
    this.drumSynth.getOutput().connect(this.drumMasterGain);
    this.drumMasterGain.connect(this.masterGain);
    
    // Set initial clock source (JF by default)
    this.setDrumClockSource('jf');
    
    console.log('✓ Drum machine routing complete');
  }

  setDrumClockSource(source) {
    this.drumClockSource = source;
    
    // Disconnect current clock
    try {
      this.drumSequencer.getClockInput().disconnect();
    } catch (e) {
      // Ignore if nothing connected
    }
    
    if (source === 'jf') {
      // Route JF clock to drums
      this.jfDrumClock.connect(this.drumSequencer.getClockInput());
      console.log('✓ Drums clocked by Just Friends');
    } else {
      // Route René clock to drums
      this.reneDrumClock.connect(this.drumSequencer.getClockInput());
      console.log('✓ Drums clocked by René (16th notes)');
    }
  }

  buildDestinationMap() {
    // COMPREHENSIVE destination map - every parameter with a UI control
    this.destinationMap = {
      // Just Friends #1 (LFO/Clock)
      'jf1.time': this.jf1.params.time,
      'jf1.intone': this.jf1.params.intone,
      'jf1.ramp': this.jf1.params.ramp,
      'jf1.curve': this.jf1.params.curve,
      'jf1.fmDepth': this.jf1.params.fmDepth,
      
      // Quantizer
      'quant.depth': this.quantizer.params.depth,
      'quant.offset': this.quantizer.params.offset,
      'quant.transpose': this.quantizer.params.transpose,
      
      // Envelope/VCA
      'env.attack': this.envelopeVCA.params.attack,
      'env.decay': this.envelopeVCA.params.decay,
      'env.sustain': this.envelopeVCA.params.sustain,
      
      // Mangrove A
      'ma.pitch': this.mangroveA.params.pitchKnob,
      'ma.barrel': this.mangroveA.params.barrelKnob,
      'ma.formant': this.mangroveA.params.formantKnob,
      'ma.air': this.mangroveA.params.airKnob,
      'ma.fmIndex': this.mangroveA.params.fmIndex,
      'ma.airAtten': this.mangroveA.params.airAttenuverter,
      
      // Mangrove B
      'mb.pitch': this.mangroveB.params.pitchKnob,
      'mb.barrel': this.mangroveB.params.barrelKnob,
      'mb.formant': this.mangroveB.params.formantKnob,
      'mb.air': this.mangroveB.params.airKnob,
      'mb.fmIndex': this.mangroveB.params.fmIndex,
      
      // Mangrove C
      'mc.pitch': this.mangroveC.params.pitchKnob,
      'mc.barrel': this.mangroveC.params.barrelKnob,
      'mc.formant': this.mangroveC.params.formantKnob,
      'mc.air': this.mangroveC.params.airKnob,
      'mc.fmIndex': this.mangroveC.params.fmIndex,
      
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
    
    // Add LFO parameters to destination map
    this.lfos.forEach((lfo, i) => {
      this.destinationMap[`lfo${i + 1}.rate`] = lfo.params.rate;
      this.destinationMap[`lfo${i + 1}.phase`] = lfo.params.phase;
    });
    
    console.log(`✓ Destination map built - ${Object.keys(this.destinationMap).length} parameters available`);
  }

  configureDefaults() {
    // JF #1
    this.jf1.setMode(2);
    this.jf1.setRange(0);
    this.jf1.setTime(0.25);
    this.jf1.setIntone(0.5);
    this.jf1.setRamp(0.5);
    this.jf1.setCurve(0.5);

    // JF Osc
    this.jfOsc.setCycleSoundMode();
    this.jfOsc.setUnison();
    this.jfOsc.setTriangleWave();
    if (this.jfOsc.params?.time) this.jfOsc.params.time.value = 0.5;
    if (this.jfOsc.params?.fmIndex) this.jfOsc.params.fmIndex.value = 0;
    if (this.jfOsc.params?.run) this.jfOsc.params.run.value = 0;
    this.jfOsc.enableRunMode(false);

    // Quantizer
    this.quantizer.setMajorScale(0);
    this.quantizer.setDepth(1.0);
    this.quantizer.setOffset(0);

    // Transpose Sequencer
    this.transposeSeq.setPlaybackMode('forward');
    this.transposeSeq.clearCells();

    // Envelope/VCA
    this.envelopeVCA.setMode('ASR');
    this.envelopeVCA.setCurve('exponential');
    this.envelopeVCA.setAttack(0.03);
    this.envelopeVCA.setDecay(0.5);
    this.envelopeVCA.setSustain(0.7);

    // Mangroves
    this.mangroveA.setPitch(0.5);
    this.mangroveA.setBarrel(0.3);
    this.mangroveA.setFormant(0.6);
    this.mangroveA.setAir(0.5);
    this.mangroveA.setFMIndex(0.3);

    this.mangroveB.setPitch(0.52);
    this.mangroveB.setBarrel(0.65);
    this.mangroveB.setFormant(0.55);
    this.mangroveB.setAir(0.7);

    this.mangroveC.setPitch(0.6);
    this.mangroveC.setBarrel(0.5);
    this.mangroveC.setFormant(0.5);
    this.mangroveC.setAir(0.8);

    // Three Sisters
    this.threeSisters.setFreq(0.5);
    this.threeSisters.setSpan(0.5);
    this.threeSisters.setQuality(0.5);
    this.threeSisters.setMode(0);
    this.threeSisters.setFMAttenuverter(0.5);
    
    // LFOs: Default settings
    this.lfos.forEach((lfo, i) => {
      lfo.setRate(1.0); // 1 Hz
      lfo.setWaveform('sine');
      lfo.setPhase(i / 7); // Stagger phases
    });
    
    // Drum machine defaults are already set in the node constructors
    console.log('Drum machine defaults configured');
    console.log('Default settings configured');
  }

  setActiveOscillator(osc) {
    if (osc === this.activeOscillator) return;
    
    this.activeOscillator = osc;
    const now = this.audioContext.currentTime;
    const fadeTime = 0.05;
    
    if (osc === 'mangrove') {
      this.mangroveAGain.gain.cancelScheduledValues(now);
      this.mangroveAGain.gain.setValueAtTime(this.mangroveAGain.gain.value, now);
      this.mangroveAGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
      
      this.jfOscGain.gain.cancelScheduledValues(now);
      this.jfOscGain.gain.setValueAtTime(this.jfOscGain.gain.value, now);
      this.jfOscGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      
      console.log('✓ Switched to Mangrove A');
    } else {
      this.mangroveAGain.gain.cancelScheduledValues(now);
      this.mangroveAGain.gain.setValueAtTime(this.mangroveAGain.gain.value, now);
      this.mangroveAGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      
      this.jfOscGain.gain.cancelScheduledValues(now);
      this.jfOscGain.gain.setValueAtTime(this.jfOscGain.gain.value, now);
      this.jfOscGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
      
      console.log('✓ Switched to Just Friends Osc');
    }
    
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
    
    document.querySelectorAll('.osc-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.osc === this.activeOscillator);
    });
  }

  setFMMode(mode) {
    if (mode === this.fmMode) return;
    
    this.fmMode = mode;
    const now = this.audioContext.currentTime;
    const fadeTime = 0.02;
    
    if (mode === 'exponential') {
      this.fmExpGain.gain.cancelScheduledValues(now);
      this.fmExpGain.gain.setValueAtTime(this.fmExpGain.gain.value, now);
      this.fmExpGain.gain.linearRampToValueAtTime(0.3, now + fadeTime);
      
      this.fmLinGain.gain.cancelScheduledValues(now);
      this.fmLinGain.gain.setValueAtTime(this.fmLinGain.gain.value, now);
      this.fmLinGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
    } else {
      this.fmExpGain.gain.cancelScheduledValues(now);
      this.fmExpGain.gain.setValueAtTime(this.fmExpGain.gain.value, now);
      this.fmExpGain.gain.linearRampToValueAtTime(0.0, now + fadeTime);
      
      this.fmLinGain.gain.cancelScheduledValues(now);
      this.fmLinGain.gain.setValueAtTime(this.fmLinGain.gain.value, now);
      this.fmLinGain.gain.linearRampToValueAtTime(1.0, now + fadeTime);
    }
    
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
  }

  setJFOscMode(mode, range) {
    const modeValue = parseInt(mode);
    const rangeValue = parseInt(range);
    
    this.jfOsc.params.mode.value = modeValue;
    this.jfOsc.params.range.value = rangeValue;
    
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

  // ========== LFO UI GENERATION ==========

  generateLFOHTML(lfoIndex) {
    const lfoNum = lfoIndex + 1;
    
    return `
      <div class="lfo-module" data-lfo="${lfoIndex}">
        <div class="lfo-header">
          <span class="lfo-title">LFO ${lfoNum}</span>
          <label class="lfo-enable-toggle">
            <input type="checkbox" class="lfo-enable" data-lfo="${lfoIndex}">
            <span class="lfo-enable-text">enable</span>
          </label>
        </div>
        
        <div class="lfo-controls">
          <div class="lfo-control-row">
            <label>rate</label>
            <input type="range" class="lfo-rate" data-lfo="${lfoIndex}" 
                   min="0.01" max="100" step="0.01" value="1">
            <span class="lfo-value lfo-rate-value" data-lfo="${lfoIndex}">1.00 Hz</span>
          </div>
          
          <div class="lfo-control-row">
            <label>waveform</label>
            <select class="lfo-waveform" data-lfo="${lfoIndex}">
              <option value="0">Sine</option>
              <option value="1">Square</option>
              <option value="2">Triangle</option>
              <option value="3">Sample & Hold</option>
              <option value="4">Smooth Random</option>
              <option value="5">Ramp Down</option>
              <option value="6">Ramp Up</option>
              <option value="7">Exp Ramp Down</option>
              <option value="8">Exp Ramp Up</option>
            </select>
          </div>
          
          <div class="lfo-control-row">
            <label>phase</label>
            <input type="range" class="lfo-phase" data-lfo="${lfoIndex}" 
                   min="0" max="1" step="0.01" value="${(lfoIndex / 7).toFixed(2)}">
            <span class="lfo-value lfo-phase-value" data-lfo="${lfoIndex}">${(lfoIndex / 7).toFixed(2)}</span>
          </div>
        </div>
        
        <div class="lfo-destinations">
          ${this.generateLFODestinationHTML(lfoIndex, 0)}
          ${this.generateLFODestinationHTML(lfoIndex, 1)}
        </div>
      </div>
    `;
  }

  generateLFODestinationHTML(lfoIndex, destIndex) {
    const destLetter = destIndex === 0 ? 'A' : 'B';
    
    return `
      <div class="lfo-dest" data-lfo="${lfoIndex}" data-dest="${destIndex}">
        <div class="lfo-dest-header">
          <span class="lfo-dest-label">Destination ${destLetter}</span>
          <label class="lfo-dest-toggle">
            <input type="checkbox" class="lfo-dest-enable" 
                   data-lfo="${lfoIndex}" data-dest="${destIndex}">
            <span class="lfo-dest-toggle-text">enable</span>
          </label>
        </div>
        
        <div class="lfo-dest-controls">
          <div class="lfo-control-row">
            <label>target</label>
            <select class="lfo-dest-param" data-lfo="${lfoIndex}" data-dest="${destIndex}">
              <option value="">-- none --</option>
              ${this.generateDestinationOptions()}
            </select>
          </div>
          
          <div class="lfo-control-row">
            <label>mode</label>
            <select class="lfo-dest-mode" data-lfo="${lfoIndex}" data-dest="${destIndex}">
              <option value="0">Unipolar (0→1)</option>
              <option value="1">Bipolar (-1→+1)</option>
              <option value="2">Inv Unipolar (1→0)</option>
              <option value="3">Inv Bipolar (+1→-1)</option>
            </select>
          </div>
          
          <div class="lfo-control-row">
            <label>depth</label>
            <input type="range" class="lfo-dest-depth" 
                   data-lfo="${lfoIndex}" data-dest="${destIndex}"
                   min="0" max="1" step="0.01" value="0.5">
            <span class="lfo-value lfo-dest-depth-value" 
                  data-lfo="${lfoIndex}" data-dest="${destIndex}">0.50</span>
          </div>
          
          <div class="lfo-control-row">
            <label>offset</label>
            <input type="range" class="lfo-dest-offset" 
                   data-lfo="${lfoIndex}" data-dest="${destIndex}"
                   min="-1" max="1" step="0.01" value="0">
            <span class="lfo-value lfo-dest-offset-value" 
                  data-lfo="${lfoIndex}" data-dest="${destIndex}">0.00</span>
          </div>
        </div>
      </div>
    `;
  }

  generateDestinationOptions() {
    const groups = [
      {
        label: 'Just Friends #1',
        options: [
          { value: 'jf1.time', label: 'Time' },
          { value: 'jf1.intone', label: 'Intone' },
          { value: 'jf1.ramp', label: 'Ramp' },
          { value: 'jf1.curve', label: 'Curve' },
          { value: 'jf1.fmDepth', label: 'FM Depth' }
        ]
      },
      {
        label: 'Envelope/VCA',
        options: [
          { value: 'env.attack', label: 'Attack' },
          { value: 'env.decay', label: 'Decay/Release' },
          { value: 'env.sustain', label: 'Sustain' }
        ]
      },
      {
        label: 'Quantizer',
        options: [
          { value: 'quant.depth', label: 'Depth' },
          { value: 'quant.offset', label: 'Offset' },
          { value: 'quant.transpose', label: 'Transpose' }
        ]
      },
      {
        label: 'Mangrove A',
        options: [
          { value: 'ma.pitch', label: 'Pitch' },
          { value: 'ma.barrel', label: 'Barrel' },
          { value: 'ma.formant', label: 'Formant' },
          { value: 'ma.air', label: 'Air' },
          { value: 'ma.fmIndex', label: 'FM Depth' }
        ]
      },
      {
        label: 'Mangrove B',
        options: [
          { value: 'mb.pitch', label: 'Pitch' },
          { value: 'mb.barrel', label: 'Barrel' },
          { value: 'mb.formant', label: 'Formant' },
          { value: 'mb.air', label: 'Air' },
          { value: 'mb.fmIndex', label: 'FM Depth' }
        ]
      },
      {
        label: 'Mangrove C',
        options: [
          { value: 'mc.pitch', label: 'Pitch' },
          { value: 'mc.barrel', label: 'Barrel' },
          { value: 'mc.formant', label: 'Formant' },
          { value: 'mc.air', label: 'Air' },
          { value: 'mc.fmIndex', label: 'FM Depth' }
        ]
      },
      {
        label: 'Just Friends Osc',
        options: [
          { value: 'jfosc.time', label: 'Time' },
          { value: 'jfosc.intone', label: 'Intone' },
          { value: 'jfosc.ramp', label: 'Ramp' },
          { value: 'jfosc.curve', label: 'Curve' },
          { value: 'jfosc.fmIndex', label: 'FM Index' },
          { value: 'jfosc.run', label: 'RUN' }
        ]
      },
      {
        label: 'Three Sisters',
        options: [
          { value: 'ts.freq', label: 'Frequency' },
          { value: 'ts.span', label: 'Span' },
          { value: 'ts.quality', label: 'Quality' },
          { value: 'ts.fmAtten', label: 'FM Atten' }
        ]
      },
      {
        label: 'LFOs',
        options: []
      },
      {
        label: 'Master',
        options: [
          { value: 'master.volume', label: 'Volume' }
        ]
      }
    ];
    
    // Add LFO destinations
    for (let i = 0; i < 7; i++) {
      groups.find(g => g.label === 'LFOs').options.push(
        { value: `lfo${i + 1}.rate`, label: `LFO ${i + 1}: Rate` },
        { value: `lfo${i + 1}.phase`, label: `LFO ${i + 1}: Phase` }
      );
    }
    
    // Generate HTML
    let html = '';
    groups.forEach(group => {
      if (group.options.length === 0) return;
      html += `<optgroup label="${group.label}">`;
      group.options.forEach(opt => {
        html += `<option value="${opt.value}">${opt.label}</option>`;
      });
      html += '</optgroup>';
    });
    
    return html;
  }

  initLFOUI() {
    const container = document.getElementById('lfoGridContainer');
    if (!container) {
      console.warn('LFO container not found');
      return;
    }
    
    for (let i = 0; i < 7; i++) {
      container.innerHTML += this.generateLFOHTML(i);
    }
    
    this.bindLFOControls();
    console.log('✓ LFO UI initialized');
  }

  bindLFOControls() {
    document.querySelectorAll('.lfo-enable').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const enabled = e.target.checked;
        const module = document.querySelector(`.lfo-module[data-lfo="${lfoIndex}"]`);
        module.classList.toggle('active', enabled);
      });
    });
    
    document.querySelectorAll('.lfo-rate').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const value = parseFloat(e.target.value);
        this.lfos[lfoIndex].setRate(value);
        
        const display = document.querySelector(`.lfo-rate-value[data-lfo="${lfoIndex}"]`);
        display.textContent = `${value.toFixed(2)} Hz`;
      });
    });
    
    document.querySelectorAll('.lfo-waveform').forEach(select => {
      select.addEventListener('change', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const waveform = parseInt(e.target.value);
        this.lfos[lfoIndex].setWaveform(waveform);
      });
    });
    
    document.querySelectorAll('.lfo-phase').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const value = parseFloat(e.target.value);
        this.lfos[lfoIndex].setPhase(value);
        
        const display = document.querySelector(`.lfo-phase-value[data-lfo="${lfoIndex}"]`);
        display.textContent = value.toFixed(2);
      });
    });
    
    document.querySelectorAll('.lfo-dest-enable').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const destIndex = parseInt(e.target.dataset.dest);
        const enabled = e.target.checked;
        
        const dest = document.querySelector(
          `.lfo-dest[data-lfo="${lfoIndex}"][data-dest="${destIndex}"]`
        );
        dest.classList.toggle('active', enabled);
        
        this.lfos[lfoIndex].setDestinationEnabled(destIndex, enabled);
      });
    });
    
    document.querySelectorAll('.lfo-dest-param').forEach(select => {
      select.addEventListener('change', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const destIndex = parseInt(e.target.dataset.dest);
        const paramKey = e.target.value;
        
        if (!paramKey) {
          this.lfos[lfoIndex].setDestination(destIndex, null);
          return;
        }
        
        const param = this.destinationMap[paramKey];
        if (!param) {
          console.error(`Unknown parameter: ${paramKey}`);
          return;
        }
        
        const depthSlider = document.querySelector(
          `.lfo-dest-depth[data-lfo="${lfoIndex}"][data-dest="${destIndex}"]`
        );
        const offsetSlider = document.querySelector(
          `.lfo-dest-offset[data-lfo="${lfoIndex}"][data-dest="${destIndex}"]`
        );
        const modeSelect = document.querySelector(
          `.lfo-dest-mode[data-lfo="${lfoIndex}"][data-dest="${destIndex}"]`
        );
        
        const depth = parseFloat(depthSlider?.value || 0.5);
        const offset = parseFloat(offsetSlider?.value || 0);
        const mode = parseInt(modeSelect?.value || 0);
        
        this.lfos[lfoIndex].setDestination(destIndex, param, depth, offset, mode);
        console.log(`LFO ${lfoIndex + 1} dest ${destIndex} → ${paramKey}`);
      });
    });
    
    document.querySelectorAll('.lfo-dest-depth').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const destIndex = parseInt(e.target.dataset.dest);
        const value = parseFloat(e.target.value);
        
        this.lfos[lfoIndex].setDepth(destIndex, value);
        
        const display = document.querySelector(
          `.lfo-dest-depth-value[data-lfo="${lfoIndex}"][data-dest="${destIndex}"]`
        );
        display.textContent = value.toFixed(2);
      });
    });
    
    document.querySelectorAll('.lfo-dest-offset').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const destIndex = parseInt(e.target.dataset.dest);
        const value = parseFloat(e.target.value);
        
        this.lfos[lfoIndex].setOffset(destIndex, value);
        
        const display = document.querySelector(
          `.lfo-dest-offset-value[data-lfo="${lfoIndex}"][data-dest="${destIndex}"]`
        );
        display.textContent = value.toFixed(2);
      });
    });
    
    document.querySelectorAll('.lfo-dest-mode').forEach(select => {
      select.addEventListener('change', (e) => {
        const lfoIndex = parseInt(e.target.dataset.lfo);
        const destIndex = parseInt(e.target.dataset.dest);
        const mode = parseInt(e.target.value);
        
        this.lfos[lfoIndex].setMode(destIndex, mode);
      });
    });
  }

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
              ${this.generateDestinationOptions()}
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
      console.warn('Mod matrix container not found');
      return;
    }
    
    for (let i = 0; i < 5; i++) {
      container.innerHTML += this.generateModSlotHTML(i);
    }
    
    this.bindModMatrixControls();
    console.log('✓ Modulation matrix UI initialized');
  }

  createSequencerUI() {
    const grid = document.getElementById('sequencerGrid');
    if (!grid) {
      console.error('[Sequencer] ERROR: Grid container not found!');
      return;
    }
    
    grid.innerHTML = '';
    
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.className = 'seq-cell';
      cell.dataset.step = i;
      
      cell.innerHTML = `
        <div class="seq-cell-header">
          <span class="seq-cell-number">${i + 1}</span>
          <input type="checkbox" class="seq-cell-toggle" data-step="${i}">
        </div>
        <div class="transpose-value">${0}</div>
        <input type="range" class="transpose-slider" data-step="${i}" 
               min="-24" max="24" value="0" step="1">
        <input type="number" class="repeats-input" data-step="${i}" 
               min="1" max="64" value="1" title="repeats">
      `;
      
      grid.appendChild(cell);
    }
    
    this.setupSequencerListeners();
  }

  setupSequencerListeners() {
    document.querySelectorAll('.seq-cell-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const step = parseInt(e.target.dataset.step);
        const active = e.target.checked;
        const cell = document.querySelector(`.seq-cell[data-step="${step}"]`);
        cell.classList.toggle('active', active);
        
        if (this.transposeSeq) {
          this.transposeSeq.setCell(step, { active });
        }
      });
    });
    
    document.querySelectorAll('.transpose-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const step = parseInt(e.target.dataset.step);
        const transpose = parseInt(e.target.value);
        const valueDisplay = e.target.parentElement.querySelector('.transpose-value');
        const sign = transpose > 0 ? '+' : '';
        valueDisplay.textContent = `${sign}${transpose}`;
        valueDisplay.className = 'transpose-value';
        if (transpose > 0) valueDisplay.classList.add('positive');
        if (transpose < 0) valueDisplay.classList.add('negative');
        
        if (this.transposeSeq) {
          this.transposeSeq.setCell(step, { transpose });
        }
      });
    });
    
    document.querySelectorAll('.repeats-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const step = parseInt(e.target.dataset.step);
        let repeats = parseInt(e.target.value);
        repeats = Math.max(1, Math.min(64, repeats));
        e.target.value = repeats;
        
        if (this.transposeSeq) {
          this.transposeSeq.setCell(step, { repeats });
        }
      });
    });
    
    document.querySelectorAll('.playback-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.playback-mode-btn').forEach(b => 
          b.classList.remove('active'));
        e.target.classList.add('active');
        const mode = e.target.dataset.mode;
        if (this.transposeSeq) {
          this.transposeSeq.setPlaybackMode(mode);
        }
      });
    });
    
    document.getElementById('seqResetBtn')?.addEventListener('click', () => {
      if (this.transposeSeq) {
        this.transposeSeq.reset();
      }
      document.querySelectorAll('.seq-cell').forEach(cell => {
        cell.classList.remove('current');
      });
      document.querySelector('.seq-cell[data-step="0"]')?.classList.add('current');
    });
    
    document.getElementById('seqClearBtn')?.addEventListener('click', () => {
      if (this.transposeSeq) {
        this.transposeSeq.clearCells();
      }
      document.querySelectorAll('.seq-cell-toggle').forEach(t => t.checked = false);
      document.querySelectorAll('.seq-cell').forEach(c => c.classList.remove('active', 'current'));
      document.querySelectorAll('.transpose-slider').forEach(s => s.value = 0);
      document.querySelectorAll('.transpose-value').forEach(d => {
        d.textContent = '0';
        d.className = 'transpose-value';
      });
      document.querySelectorAll('.repeats-input').forEach(i => i.value = 1);
    });
    
    document.getElementById('seqRandomizeBtn')?.addEventListener('click', () => {
      document.querySelectorAll('.transpose-slider').forEach(slider => {
        const step = parseInt(slider.dataset.step);
        const transpose = Math.floor(Math.random() * 49) - 24;
        slider.value = transpose;
        const valueDisplay = slider.parentElement.querySelector('.transpose-value');
        const sign = transpose > 0 ? '+' : '';
        valueDisplay.textContent = `${sign}${transpose}`;
        valueDisplay.className = 'transpose-value';
        if (transpose > 0) valueDisplay.classList.add('positive');
        if (transpose < 0) valueDisplay.classList.add('negative');
        
        if (this.transposeSeq) {
          this.transposeSeq.setCell(step, { transpose });
        }
      });
    });
  }

  updateSequencerUI(step, transpose) {
    document.querySelectorAll('.seq-cell').forEach(cell => {
      cell.classList.remove('current');
    });
    const currentCell = document.querySelector(`.seq-cell[data-step="${step}"]`);
    if (currentCell) {
      currentCell.classList.add('current');
    }
  }

  bindModMatrixControls() {
    document.querySelectorAll('.mod-enable').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const enabled = e.target.checked;
        this.handleModSlotEnable(slot, enabled);
      });
    });
    
    document.querySelectorAll('.mod-destination').forEach(select => {
      select.addEventListener('change', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const destination = e.target.value;
        this.handleModDestinationChange(slot, destination);
      });
    });
    
    document.querySelectorAll('.mod-mode').forEach(select => {
      select.addEventListener('change', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const mode = parseInt(e.target.value);
        this.modMatrix.setMode(slot, mode);
      });
    });
    
    document.querySelectorAll('.mod-depth').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const slot = parseInt(e.target.dataset.slot);
        const value = parseFloat(e.target.value);
        this.modMatrix.setDepth(slot, value);
        
        const display = document.querySelector(`.mod-depth-value[data-slot="${slot}"]`);
        if (display) display.textContent = value.toFixed(2);
      });
    });
    
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
    
    const slotElement = document.querySelector(`.mod-slot[data-slot="${slot}"]`);
    if (slotElement) {
      slotElement.classList.toggle('active', enabled);
    }
  }

  handleModDestinationChange(slot, destination) {
    if (!destination || destination === '') {
      this.modMatrix.clearSlot(slot);
      return;
    }
    
    const audioParam = this.destinationMap[destination];
    
    if (!audioParam) {
      console.error(`Unknown destination: ${destination}`);
      return;
    }
    
    this.modMatrix.setDestination(slot, audioParam);
  }

  bindDrumControls() {
    // Clock source selector
    const clockSource = document.getElementById('drumClockSource');
    clockSource?.addEventListener('change', (e) => {
      this.setDrumClockSource(e.target.value);
    });
    
    // Randomization buttons
    document.getElementById('drumRandomizeAll')?.addEventListener('click', () => {
      this.drumSynth.randomizeKit();
      this.drumSequencer.randomizePattern();
      this.drumSequencer.randomizeGroove();
      this.updateDrumUI();
    });
    
    document.getElementById('drumRandomizeKit')?.addEventListener('click', () => {
      this.drumSynth.randomizeKit();
      this.updateDrumUI();
    });
    
    document.getElementById('drumRandomizePattern')?.addEventListener('click', () => {
      this.drumSequencer.randomizePattern();
    });
    
    document.getElementById('drumRandomizeGroove')?.addEventListener('click', () => {
      this.drumSequencer.randomizeGroove();
    });
    
    // Individual voice randomization
    document.getElementById('drumRandomizeKick')?.addEventListener('click', () => {
      this.drumSynth.randomizeKick();
      this.updateDrumUI();
    });
    
    document.getElementById('drumRandomizeSnare')?.addEventListener('click', () => {
      this.drumSynth.randomizeSnare();
      this.updateDrumUI();
    });
    
    document.getElementById('drumRandomizeHat')?.addEventListener('click', () => {
      this.drumSynth.randomizeHat();
      this.updateDrumUI();
    });
    
    // Individual pattern randomization
    document.getElementById('drumRandomizeKickPattern')?.addEventListener('click', () => {
      this.drumSequencer.randomizeKickPattern();
    });
    
    document.getElementById('drumRandomizeSnarePattern')?.addEventListener('click', () => {
      this.drumSequencer.randomizeSnarePattern();
    });
    
    document.getElementById('drumRandomizeHatPattern')?.addEventListener('click', () => {
      this.drumSequencer.randomizeHatPattern();
    });
    
    // Kick controls
    this.bindDrumParam('drumKickPitch', (v) => this.drumSynth.setKickPitch(v), ' Hz');
    this.bindDrumParam('drumKickDecay', (v) => this.drumSynth.setKickDecay(v), 's');
    this.bindDrumParam('drumKickDrive', (v) => this.drumSynth.setKickDrive(v));
    this.bindDrumParam('drumKickVolume', (v) => this.drumSynth.setKickVolume(v));
    
    // Snare controls
    this.bindDrumParam('drumSnarePitch', (v) => this.drumSynth.setSnarePitch(v), ' Hz');
    this.bindDrumParam('drumSnareDecay', (v) => this.drumSynth.setSnareDecay(v), 's');
    this.bindDrumParam('drumSnareDrive', (v) => this.drumSynth.setSnareDrive(v));
    this.bindDrumParam('drumSnareVolume', (v) => this.drumSynth.setSnareVolume(v));
    
    // Hat controls
    this.bindDrumParam('drumHatDecay', (v) => this.drumSynth.setHatDecay(v), 's');
    this.bindDrumParam('drumHatHPF', (v) => this.drumSynth.setHatHPF(v), ' Hz');
    this.bindDrumParam('drumHatDrive', (v) => this.drumSynth.setHatDrive(v));
    this.bindDrumParam('drumHatVolume', (v) => this.drumSynth.setHatVolume(v));
    
    // Global controls
    this.bindDrumParam('drumSwing', (v) => {
      this.drumSequencer.setSwing(v);
      const display = document.getElementById('drumSwingValue');
      if (display) display.textContent = `${Math.round(v * 100)}%`;
    });
    
    this.bindDrumParam('drumMasterVolume', (v) => {
      this.drumMasterGain.gain.value = v;
    });
    
    // Mute toggles
    document.getElementById('drumKickMute')?.addEventListener('change', (e) => {
      this.drumSynth.setKickVolume(e.target.checked ? 0 : 0.8);
      document.getElementById('drumKickSection')?.classList.toggle('muted', e.target.checked);
    });
    
    document.getElementById('drumSnareMute')?.addEventListener('change', (e) => {
      this.drumSynth.setSnareVolume(e.target.checked ? 0 : 0.6);
      document.getElementById('drumSnareSection')?.classList.toggle('muted', e.target.checked);
    });
    
    document.getElementById('drumHatMute')?.addEventListener('change', (e) => {
      this.drumSynth.setHatVolume(e.target.checked ? 0 : 0.4);
      document.getElementById('drumHatSection')?.classList.toggle('muted', e.target.checked);
    });
  }

  bindDrumParam(id, callback, suffix = '') {
    const slider = document.getElementById(id);
    const display = document.getElementById(id + 'Value');
    
    slider?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      callback(value);
      
      if (display) {
        let displayValue = value.toFixed(2);
        if (suffix === ' Hz') displayValue = Math.round(value) + suffix;
        else if (suffix === 's') displayValue = value.toFixed(2) + suffix;
        else if (suffix === '') displayValue = value.toFixed(2);
        else displayValue += suffix;
        
        display.textContent = displayValue;
      }
    });
  }

  updateDrumUI() {
    if (!this.drumSynth || !this.drumSynth.params) return;
    
    const params = [
      ['drumKickPitch', this.drumSynth.params.kickPitch.value, ' Hz'],
      ['drumKickDecay', this.drumSynth.params.kickDecay.value, 's'],
      ['drumKickDrive', this.drumSynth.params.kickDrive.value, ''],
      ['drumKickVolume', this.drumSynth.params.kickVolume.value, ''],
      ['drumSnarePitch', this.drumSynth.params.snarePitch.value, ' Hz'],
      ['drumSnareDecay', this.drumSynth.params.snareDecay.value, 's'],
      ['drumSnareDrive', this.drumSynth.params.snareDrive.value, ''],
      ['drumSnareVolume', this.drumSynth.params.snareVolume.value, ''],
      ['drumHatDecay', this.drumSynth.params.hatDecay.value, 's'],
      ['drumHatHPF', this.drumSynth.params.hatHPF.value, ' Hz'],
      ['drumHatDrive', this.drumSynth.params.hatDrive.value, ''],
      ['drumHatVolume', this.drumSynth.params.hatVolume.value, '']
    ];
    
    params.forEach(([id, value, suffix]) => {
      const slider = document.getElementById(id);
      const display = document.getElementById(id + 'Value');
      
      if (slider) slider.value = value;
      if (display) {
        let displayValue;
        if (suffix === ' Hz') displayValue = Math.round(value) + suffix;
        else if (suffix === 's') displayValue = value.toFixed(2) + suffix;
        else displayValue = value.toFixed(2);
        
        display.textContent = displayValue;
      }
    });
  }

  setScale(scaleName, root = 0) {
    if (!this.quantizer) return;

    switch (scaleName) {
      case 'chromatic':
        this.quantizer.setChromatic();
        break;
      case 'major':
        this.quantizer.setMajorScale(root);
        break;
      case 'minor':
        this.quantizer.setMinorScale(root);
        break;
      case 'dorian':
        this.quantizer.setDorianMode(root);
        break;
      case 'phrygian':
        this.quantizer.setPhrygianMode(root);
        break;
      case 'lydian':
        this.quantizer.setLydianMode(root);
        break;
      case 'mixolydian':
        this.quantizer.setMixolydianMode(root);
        break;
      case 'locrian':
        this.quantizer.setLocrianMode(root);
        break;
      case 'harmonic-minor':
        this.quantizer.setHarmonicMinor(root);
        break;
      case 'melodic-minor':
        this.quantizer.setMelodicMinor(root);
        break;
      case 'penta-maj':
        this.quantizer.setPentatonicMajor(root);
        break;
      case 'penta-min':
        this.quantizer.setPentatonicMinor(root);
        break;
      case 'blues':
        this.quantizer.setBluesScale(root);
        break;
      case 'whole-tone':
        this.quantizer.setWholeTone(root);
        break;
      case 'diminished':
        this.quantizer.setDiminished(root);
        break;
    }

    this.updatePianoKeyboard();
  }

  updatePianoKeyboard() {
    const mask = this.quantizer?.getNoteMask();
    if (!mask) return;

    const keys = document.querySelectorAll('.piano-key');
    keys.forEach((key, i) => {
      key.classList.toggle('active', mask[i]);
    });
  }

  setupUI() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.bindControls();
        this.initModMatrixUI();
        this.createSequencerUI();
        this.initLFOUI();
      });
    } else {
      this.bindControls();
      this.initModMatrixUI();
      this.createSequencerUI();
      this.initLFOUI();
    }
  }

  bindControls() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.toggle());
    }

    document.querySelectorAll('.osc-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const osc = e.target.dataset.osc;
        this.setActiveOscillator(osc);
      });
    });

    document.querySelectorAll('.fm-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.dataset.mode;
        this.setFMMode(mode);
      });
    });

    const fmEnable = document.getElementById('fmEnable');
    if (fmEnable) {
      fmEnable.checked = false;
      fmEnable.addEventListener('change', (e) => {
        this.toggleFM(e.target.checked);
      });
    }

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

    this.bindKnob('jfOscTime', (val) => {
      if (this.jfOsc?.params?.time) this.jfOsc.params.time.value = val;
    });
    this.bindKnob('jfOscIntone', (val) => {
      if (this.jfOsc?.params?.intone) this.jfOsc.params.intone.value = val;
    });
    this.bindKnob('jfOscRamp', (val) => {
      if (this.jfOsc?.params?.ramp) this.jfOsc.params.ramp.value = val;
    });
    this.bindKnob('jfOscCurve', (val) => {
      if (this.jfOsc?.params?.curve) this.jfOsc.params.curve.value = val;
    });
    this.bindKnob('jfOscFmIndex', (val) => {
      if (this.jfOsc?.params?.fmIndex) this.jfOsc.params.fmIndex.value = val;
    });
    this.bindKnob('jfOscRun', (val) => {
      if (this.jfOsc?.params?.run) this.jfOsc.params.run.value = val;
    });

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

    const jfOscRunToggle = document.getElementById('jfOscRunToggle');
    if (jfOscRunToggle) {
      jfOscRunToggle.addEventListener('change', (e) => {
        if (this.jfOsc) {
          this.jfOsc.enableRunMode(e.target.checked);
          this.updateJFOscModeDisplay();
        }
      });
    }

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

    this.bindKnob('quantDepth', (val) => this.quantizer?.setDepth(val));
    this.bindKnob('quantOffset', (val) => this.quantizer?.setOffset(val));

    const rootSelect = document.getElementById('rootNote');
    if (rootSelect) {
      rootSelect.addEventListener('change', () => {
        const activeBtn = document.querySelector('.scale-btn.active');
        if (activeBtn) {
          const scale = activeBtn.dataset.scale;
          const root = parseInt(rootSelect.value);
          this.setScale(scale, root);
        }
      });
    }

    const scaleBtns = document.querySelectorAll('.scale-btn');
    scaleBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        scaleBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const scale = e.target.dataset.scale;
        const root = parseInt(rootSelect?.value || '0');
        this.setScale(scale, root);
      });
    });

    this.createPianoKeyboard();

    this.bindKnob('maPitch', (val) => this.mangroveA?.setPitch(val));
    this.bindKnob('maBarrel', (val) => this.mangroveA?.setBarrel(val));
    this.bindKnob('maFormant', (val) => this.mangroveA?.setFormant(val));
    this.bindKnob('maAir', (val) => this.mangroveA?.setAir(val));
    this.bindKnob('maFmIndex', (val) => this.mangroveA?.setFMIndex(val));

    this.bindKnob('mbPitch', (val) => this.mangroveB?.setPitch(val));
    this.bindKnob('mbBarrel', (val) => this.mangroveB?.setBarrel(val));
    this.bindKnob('mbFormant', (val) => this.mangroveB?.setFormant(val));

    this.bindKnob('mcPitch', (val) => this.mangroveC?.setPitch(val));
    this.bindKnob('mcBarrel', (val) => this.mangroveC?.setBarrel(val));
    this.bindKnob('mcFormant', (val) => this.mangroveC?.setFormant(val));

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
    
    // Bind drum controls
    this.bindDrumControls();
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

    container.innerHTML = '';

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
  }
}

const app = new Phase5App();
window.addEventListener('load', () => app.init());
