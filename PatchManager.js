// PatchManager.js - Save and Load patch functionality for Phase 5
// Serializes all module parameters to JSON and restores them
// UPDATED: Now includes René sequencer and pattern system state

export class PatchManager {
  constructor(app) {
    this.app = app;
    this.version = '1.1.0'; // Updated version for René support
  }

  /**
   * Collect all current parameter values into a serializable object
   */
  collectPatchState() {
    const patch = {
      version: this.version,
      timestamp: new Date().toISOString(),
      name: 'Untitled Patch',
      
      // JF #1 (Clock/LFO)
      jf1: {
        time: this.getSliderValue('jf1Time'),
        intone: this.getSliderValue('jf1Intone'),
        ramp: this.getSliderValue('jf1Ramp'),
        curve: this.getSliderValue('jf1Curve'),
        mode: this.getSelectValue('jf1Mode'),
        range: this.getSelectValue('jf1Range')
      },
      
      // JF Osc
      jfOsc: {
        time: this.getSliderValue('jfOscTime'),
        intone: this.getSliderValue('jfOscIntone'),
        ramp: this.getSliderValue('jfOscRamp'),
        curve: this.getSliderValue('jfOscCurve'),
        fmIndex: this.getSliderValue('jfOscFmIndex'),
        run: this.getSliderValue('jfOscRun'),
        mode: this.getSelectValue('jfOscMode'),
        range: this.getSelectValue('jfOscRange'),
        runEnabled: document.getElementById('jfOscRunToggle')?.checked || false
      },
      
      // Oscillator Selection
      oscillator: {
        active: this.app.activeOscillator,
        fmEnabled: document.getElementById('fmEnable')?.checked || false,
        fmMode: this.app.fmMode
      },
      
      // Quantizer
      quantizer: {
        root: this.getSelectValue('rootNote'),
        scale: this.getActiveScale(),
        depth: this.getSliderValue('quantDepth'),
        offset: this.getSliderValue('quantOffset'),
        noteMask: this.getNoteMask()
      },
      
      // Envelope
      envelope: {
        mode: this.getActiveEnvMode(),
        curve: this.getActiveEnvCurve(),
        attack: this.getSliderValue('envAttack'),
        decay: this.getSliderValue('envDecay'),
        sustain: this.getSliderValue('envSustain')
      },
      
      // Mangrove A
      mangroveA: {
        pitch: this.getSliderValue('maPitch'),
        barrel: this.getSliderValue('maBarrel'),
        formant: this.getSliderValue('maFormant'),
        air: this.getSliderValue('maAir'),
        fmIndex: this.getSliderValue('maFmIndex')
      },
      
      // Mangrove B
      mangroveB: {
        pitch: this.getSliderValue('mbPitch'),
        barrel: this.getSliderValue('mbBarrel'),
        formant: this.getSliderValue('mbFormant')
      },
      
      // Mangrove C
      mangroveC: {
        pitch: this.getSliderValue('mcPitch'),
        barrel: this.getSliderValue('mcBarrel'),
        formant: this.getSliderValue('mcFormant')
      },
      
      // Three Sisters
      threeSisters: {
        freq: this.getSliderValue('tsFreq'),
        span: this.getSliderValue('tsSpan'),
        quality: this.getSliderValue('tsQuality'),
        fmAtten: this.getSliderValue('tsFmAtten'),
        mode: this.getSelectValue('tsMode')
      },
      
      // Master
      master: {
        volume: this.getSliderValue('masterVolume')
      },
      
      // Transpose Sequencer
      transposeSequencer: this.collectTransposeSequencer(),
      
      // Drum Machine
      drums: this.collectDrumState(),
      
      // LFOs
      lfos: this.collectLFOState(),
      
      // Modulation Matrix
      modMatrix: this.collectModMatrixState(),
      
      // Effects
      effects: this.collectEffectsState(),
      
      // René Sequencer
      rene: this.collectReneState()
    };
    
    return patch;
  }

  /**
   * Apply a patch state to all modules
   */
  applyPatchState(patch) {
    if (!patch || !patch.version) {
      console.error('Invalid patch format');
      return false;
    }
    
    try {
      // JF #1
      if (patch.jf1) {
        this.setSliderValue('jf1Time', patch.jf1.time);
        this.setSliderValue('jf1Intone', patch.jf1.intone);
        this.setSliderValue('jf1Ramp', patch.jf1.ramp);
        this.setSliderValue('jf1Curve', patch.jf1.curve);
        this.setSelectValue('jf1Mode', patch.jf1.mode);
        this.setSelectValue('jf1Range', patch.jf1.range);
        
        if (this.app.jf1) {
          this.app.jf1.setTime(patch.jf1.time);
          this.app.jf1.setIntone(patch.jf1.intone);
          this.app.jf1.setRamp(patch.jf1.ramp);
          this.app.jf1.setCurve(patch.jf1.curve);
          this.app.jf1.setMode(parseInt(patch.jf1.mode));
          this.app.jf1.setRange(parseInt(patch.jf1.range));
        }
      }
      
      // JF Osc
      if (patch.jfOsc) {
        this.setSliderValue('jfOscTime', patch.jfOsc.time);
        this.setSliderValue('jfOscIntone', patch.jfOsc.intone);
        this.setSliderValue('jfOscRamp', patch.jfOsc.ramp);
        this.setSliderValue('jfOscCurve', patch.jfOsc.curve);
        this.setSliderValue('jfOscFmIndex', patch.jfOsc.fmIndex);
        this.setSliderValue('jfOscRun', patch.jfOsc.run);
        this.setSelectValue('jfOscMode', patch.jfOsc.mode);
        this.setSelectValue('jfOscRange', patch.jfOsc.range);
        
        const runToggle = document.getElementById('jfOscRunToggle');
        if (runToggle) runToggle.checked = patch.jfOsc.runEnabled;
        
        if (this.app.jfOsc?.params) {
          this.app.jfOsc.params.time.value = patch.jfOsc.time;
          this.app.jfOsc.params.intone.value = patch.jfOsc.intone;
          this.app.jfOsc.params.ramp.value = patch.jfOsc.ramp;
          this.app.jfOsc.params.curve.value = patch.jfOsc.curve;
          this.app.jfOsc.params.fmIndex.value = patch.jfOsc.fmIndex;
          this.app.jfOsc.params.run.value = patch.jfOsc.run;
          this.app.jfOsc.params.mode.value = parseInt(patch.jfOsc.mode);
          this.app.jfOsc.params.range.value = parseInt(patch.jfOsc.range);
          this.app.jfOsc.enableRunMode(patch.jfOsc.runEnabled);
        }
        
        this.app.updateJFOscModeDisplay?.();
      }
      
      // Oscillator Selection
      if (patch.oscillator) {
        this.app.setActiveOscillator(patch.oscillator.active);
        
        const fmEnable = document.getElementById('fmEnable');
        if (fmEnable) {
          fmEnable.checked = patch.oscillator.fmEnabled;
          this.app.toggleFM(patch.oscillator.fmEnabled);
        }
        
        this.app.setFMMode(patch.oscillator.fmMode);
      }
      
      // Quantizer
      if (patch.quantizer) {
        this.setSelectValue('rootNote', patch.quantizer.root);
        this.setSliderValue('quantDepth', patch.quantizer.depth);
        this.setSliderValue('quantOffset', patch.quantizer.offset);
        
        // Set scale button active state
        document.querySelectorAll('.scale-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.scale === patch.quantizer.scale);
        });
        
        if (this.app.quantizer) {
          const root = parseInt(patch.quantizer.root);
          this.app.setScale(patch.quantizer.scale, root);
          this.app.quantizer.setDepth(patch.quantizer.depth);
          this.app.quantizer.setOffset(patch.quantizer.offset);
          
          // Restore custom note mask if present
          if (patch.quantizer.noteMask) {
            patch.quantizer.noteMask.forEach((active, i) => {
              this.app.quantizer.setNote(i, active);
            });
          }
        }
        
        this.app.updatePianoKeyboard?.();
      }
      
      // Envelope
      if (patch.envelope) {
        this.setSliderValue('envAttack', patch.envelope.attack);
        this.setSliderValue('envDecay', patch.envelope.decay);
        this.setSliderValue('envSustain', patch.envelope.sustain);
        
        // Set mode buttons
        document.querySelectorAll('.env-mode-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.mode === patch.envelope.mode);
        });
        document.querySelectorAll('.curve-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.curve === patch.envelope.curve);
        });
        
        if (this.app.envelopeVCA) {
          this.app.envelopeVCA.setMode(patch.envelope.mode);
          this.app.envelopeVCA.setCurve(patch.envelope.curve);
          this.app.envelopeVCA.setAttack(patch.envelope.attack);
          this.app.envelopeVCA.setDecay(patch.envelope.decay);
          this.app.envelopeVCA.setSustain(patch.envelope.sustain);
        }
      }
      
      // Mangrove A
      if (patch.mangroveA) {
        this.setSliderValue('maPitch', patch.mangroveA.pitch);
        this.setSliderValue('maBarrel', patch.mangroveA.barrel);
        this.setSliderValue('maFormant', patch.mangroveA.formant);
        this.setSliderValue('maAir', patch.mangroveA.air);
        this.setSliderValue('maFmIndex', patch.mangroveA.fmIndex);
        
        if (this.app.mangroveA) {
          this.app.mangroveA.setPitch(patch.mangroveA.pitch);
          this.app.mangroveA.setBarrel(patch.mangroveA.barrel);
          this.app.mangroveA.setFormant(patch.mangroveA.formant);
          this.app.mangroveA.setAir(patch.mangroveA.air);
          this.app.mangroveA.setFMIndex(patch.mangroveA.fmIndex);
        }
      }
      
      // Mangrove B
      if (patch.mangroveB) {
        this.setSliderValue('mbPitch', patch.mangroveB.pitch);
        this.setSliderValue('mbBarrel', patch.mangroveB.barrel);
        this.setSliderValue('mbFormant', patch.mangroveB.formant);
        
        if (this.app.mangroveB) {
          this.app.mangroveB.setPitch(patch.mangroveB.pitch);
          this.app.mangroveB.setBarrel(patch.mangroveB.barrel);
          this.app.mangroveB.setFormant(patch.mangroveB.formant);
        }
      }
      
      // Mangrove C
      if (patch.mangroveC) {
        this.setSliderValue('mcPitch', patch.mangroveC.pitch);
        this.setSliderValue('mcBarrel', patch.mangroveC.barrel);
        this.setSliderValue('mcFormant', patch.mangroveC.formant);
        
        if (this.app.mangroveC) {
          this.app.mangroveC.setPitch(patch.mangroveC.pitch);
          this.app.mangroveC.setBarrel(patch.mangroveC.barrel);
          this.app.mangroveC.setFormant(patch.mangroveC.formant);
        }
      }
      
      // Three Sisters
      if (patch.threeSisters) {
        this.setSliderValue('tsFreq', patch.threeSisters.freq);
        this.setSliderValue('tsSpan', patch.threeSisters.span);
        this.setSliderValue('tsQuality', patch.threeSisters.quality);
        this.setSliderValue('tsFmAtten', patch.threeSisters.fmAtten);
        this.setSelectValue('tsMode', patch.threeSisters.mode);
        
        if (this.app.threeSisters) {
          this.app.threeSisters.setFreq(patch.threeSisters.freq);
          this.app.threeSisters.setSpan(patch.threeSisters.span);
          this.app.threeSisters.setQuality(patch.threeSisters.quality);
          this.app.threeSisters.setFMAttenuverter(patch.threeSisters.fmAtten);
          this.app.threeSisters.setMode(parseFloat(patch.threeSisters.mode));
        }
      }
      
      // Master
      if (patch.master) {
        this.setSliderValue('masterVolume', patch.master.volume);
        if (this.app.masterGain) {
          this.app.masterGain.gain.value = patch.master.volume;
        }
        
        // Sync transport volume
        const transportVol = document.getElementById('transportVolume');
        const transportVolValue = document.getElementById('transportVolumeValue');
        if (transportVol) transportVol.value = patch.master.volume;
        if (transportVolValue) transportVolValue.textContent = patch.master.volume.toFixed(2);
      }
      
      // Transpose Sequencer
      if (patch.transposeSequencer) {
        this.applyTransposeSequencer(patch.transposeSequencer);
      }
      
      // Drums
      if (patch.drums) {
        this.applyDrumState(patch.drums);
      }
      
      // LFOs
      if (patch.lfos) {
        this.applyLFOState(patch.lfos);
      }
      
      // Mod Matrix
      if (patch.modMatrix) {
        this.applyModMatrixState(patch.modMatrix);
      }
      
      // Effects
      if (patch.effects) {
        this.applyEffectsState(patch.effects);
      }
      
      // René Sequencer
      if (patch.rene) {
        this.applyReneState(patch.rene);
      }
      
      console.log('%c✓ Patch loaded successfully', 'color: green; font-weight: bold');
      return true;
      
    } catch (error) {
      console.error('Error applying patch:', error);
      return false;
    }
  }

  // ========== HELPER METHODS ==========

  getSliderValue(id) {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) : 0;
  }

  setSliderValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.value = value;
      // Also update the display value
      const displayEl = document.getElementById(id + 'Value');
      if (displayEl) {
        displayEl.textContent = parseFloat(value).toFixed(2);
      }
      // Trigger input event so the app updates
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  getSelectValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  getActiveScale() {
    const activeBtn = document.querySelector('.scale-btn.active');
    return activeBtn ? activeBtn.dataset.scale : 'major';
  }

  getActiveEnvMode() {
    const activeBtn = document.querySelector('.env-mode-btn.active');
    return activeBtn ? activeBtn.dataset.mode : 'ASR';
  }

  getActiveEnvCurve() {
    const activeBtn = document.querySelector('.curve-btn.active');
    return activeBtn ? activeBtn.dataset.curve : 'exponential';
  }

  getNoteMask() {
    const mask = [];
    document.querySelectorAll('.piano-key').forEach((key, i) => {
      mask.push(key.classList.contains('active'));
    });
    return mask;
  }

  // ========== TRANSPOSE SEQUENCER ==========

  collectTransposeSequencer() {
    const cells = [];
    for (let i = 0; i < 16; i++) {
      const toggle = document.querySelector(`.seq-cell-toggle[data-step="${i}"]`);
      const slider = document.querySelector(`.transpose-slider[data-step="${i}"]`);
      const repeats = document.querySelector(`.repeats-input[data-step="${i}"]`);
      
      cells.push({
        active: toggle?.checked || false,
        transpose: slider ? parseInt(slider.value) : 0,
        repeats: repeats ? parseInt(repeats.value) : 1
      });
    }
    
    const activeMode = document.querySelector('.playback-mode-btn.active');
    const clockSource = document.getElementById('transposeClockSource');
    
    return {
      cells,
      playbackMode: activeMode?.dataset.mode || 'forward',
      clockSource: clockSource?.value || 'jf'
    };
  }

  applyTransposeSequencer(state) {
    if (!state.cells) return;
    
    state.cells.forEach((cell, i) => {
      const toggle = document.querySelector(`.seq-cell-toggle[data-step="${i}"]`);
      const slider = document.querySelector(`.transpose-slider[data-step="${i}"]`);
      const repeats = document.querySelector(`.repeats-input[data-step="${i}"]`);
      const cellEl = document.querySelector(`.seq-cell[data-step="${i}"]`);
      const valueDisplay = cellEl?.querySelector('.transpose-value');
      
      if (toggle) {
        toggle.checked = cell.active;
        cellEl?.classList.toggle('active', cell.active);
      }
      
      if (slider) {
        slider.value = cell.transpose;
        if (valueDisplay) {
          const sign = cell.transpose > 0 ? '+' : '';
          valueDisplay.textContent = `${sign}${cell.transpose}`;
          valueDisplay.className = 'transpose-value';
          if (cell.transpose > 0) valueDisplay.classList.add('positive');
          if (cell.transpose < 0) valueDisplay.classList.add('negative');
        }
      }
      
      if (repeats) repeats.value = cell.repeats;
      
      if (this.app.transposeSeq) {
        this.app.transposeSeq.setCell(i, cell);
      }
    });
    
    // Playback mode
    document.querySelectorAll('.playback-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.playbackMode);
    });
    if (this.app.transposeSeq) {
      this.app.transposeSeq.setPlaybackMode(state.playbackMode);
    }
    
    // Clock source
    this.setSelectValue('transposeClockSource', state.clockSource);
  }

  // ========== DRUM MACHINE ==========

  collectDrumState() {
    const patterns = {
      kick: [],
      snare: [],
      hat: []
    };
    
    ['kick', 'snare', 'hat'].forEach(voice => {
      for (let i = 0; i < 16; i++) {
        const step = document.querySelector(`.drum-step[data-voice="${voice}"][data-step="${i}"]`);
        patterns[voice].push(step?.classList.contains('active') || false);
      }
    });
    
    return {
      patterns,
      clockSource: this.getSelectValue('drumClockSource'),
      clockDivision: this.getSelectValue('drumClockDivision'),
      kick: {
        pitch: this.getSliderValue('drumKickPitch'),
        decay: this.getSliderValue('drumKickDecay'),
        drive: this.getSliderValue('drumKickDrive'),
        volume: this.getSliderValue('drumKickVolume'),
        mute: document.getElementById('drumKickMute')?.checked || false
      },
      snare: {
        pitch: this.getSliderValue('drumSnarePitch'),
        decay: this.getSliderValue('drumSnareDecay'),
        drive: this.getSliderValue('drumSnareDrive'),
        volume: this.getSliderValue('drumSnareVolume'),
        mute: document.getElementById('drumSnareMute')?.checked || false
      },
      hat: {
        decay: this.getSliderValue('drumHatDecay'),
        hpf: this.getSliderValue('drumHatHPF'),
        drive: this.getSliderValue('drumHatDrive'),
        volume: this.getSliderValue('drumHatVolume'),
        mute: document.getElementById('drumHatMute')?.checked || false
      },
      swing: this.getSliderValue('drumSwing'),
      masterVolume: this.getSliderValue('drumMasterVolume')
    };
  }

  applyDrumState(state) {
    if (!state) return;
    
    // Patterns
    if (state.patterns) {
      ['kick', 'snare', 'hat'].forEach(voice => {
        state.patterns[voice]?.forEach((active, i) => {
          const step = document.querySelector(`.drum-step[data-voice="${voice}"][data-step="${i}"]`);
          if (step) {
            step.classList.toggle('active', active);
          }
          if (this.app.drumSequencer) {
            this.app.drumSequencer.setStep(voice, i, active);
          }
        });
      });
    }
    
    // Clock settings
    this.setSelectValue('drumClockSource', state.clockSource);
    this.setSelectValue('drumClockDivision', state.clockDivision);
    this.app.setDrumClockSource?.(state.clockSource);
    this.app.drumSequencer?.setClockDivision?.(parseInt(state.clockDivision));
    
    // Voice parameters
    if (state.kick && this.app.drumSynth) {
      this.setSliderValue('drumKickPitch', state.kick.pitch);
      this.setSliderValue('drumKickDecay', state.kick.decay);
      this.setSliderValue('drumKickDrive', state.kick.drive);
      this.setSliderValue('drumKickVolume', state.kick.volume);
      this.app.drumSynth.setKickPitch(state.kick.pitch);
      this.app.drumSynth.setKickDecay(state.kick.decay);
      this.app.drumSynth.setKickDrive(state.kick.drive);
      this.app.drumSynth.setKickVolume(state.kick.mute ? 0 : state.kick.volume);
      
      const kickMute = document.getElementById('drumKickMute');
      if (kickMute) kickMute.checked = state.kick.mute;
    }
    
    if (state.snare && this.app.drumSynth) {
      this.setSliderValue('drumSnarePitch', state.snare.pitch);
      this.setSliderValue('drumSnareDecay', state.snare.decay);
      this.setSliderValue('drumSnareDrive', state.snare.drive);
      this.setSliderValue('drumSnareVolume', state.snare.volume);
      this.app.drumSynth.setSnarePitch(state.snare.pitch);
      this.app.drumSynth.setSnareDecay(state.snare.decay);
      this.app.drumSynth.setSnareDrive(state.snare.drive);
      this.app.drumSynth.setSnareVolume(state.snare.mute ? 0 : state.snare.volume);
      
      const snareMute = document.getElementById('drumSnareMute');
      if (snareMute) snareMute.checked = state.snare.mute;
    }
    
    if (state.hat && this.app.drumSynth) {
      this.setSliderValue('drumHatDecay', state.hat.decay);
      this.setSliderValue('drumHatHPF', state.hat.hpf);
      this.setSliderValue('drumHatDrive', state.hat.drive);
      this.setSliderValue('drumHatVolume', state.hat.volume);
      this.app.drumSynth.setHatDecay(state.hat.decay);
      this.app.drumSynth.setHatHPF(state.hat.hpf);
      this.app.drumSynth.setHatDrive(state.hat.drive);
      this.app.drumSynth.setHatVolume(state.hat.mute ? 0 : state.hat.volume);
      
      const hatMute = document.getElementById('drumHatMute');
      if (hatMute) hatMute.checked = state.hat.mute;
    }
    
    // Global
    this.setSliderValue('drumSwing', state.swing);
    this.setSliderValue('drumMasterVolume', state.masterVolume);
    this.app.drumSequencer?.setSwing?.(state.swing);
    if (this.app.drumMasterGain) {
      this.app.drumMasterGain.gain.value = state.masterVolume;
    }
  }

  // ========== LFOs ==========

  collectLFOState() {
    const lfos = [];
    
    for (let i = 0; i < 7; i++) {
      const lfoState = {
        enabled: document.querySelector(`.lfo-enable[data-lfo="${i}"]`)?.checked || false,
        rate: parseFloat(document.querySelector(`.lfo-rate[data-lfo="${i}"]`)?.value || 1),
        waveform: parseInt(document.querySelector(`.lfo-waveform[data-lfo="${i}"]`)?.value || 0),
        phase: parseFloat(document.querySelector(`.lfo-phase[data-lfo="${i}"]`)?.value || 0),
        destinations: []
      };
      
      for (let d = 0; d < 2; d++) {
        lfoState.destinations.push({
          enabled: document.querySelector(`.lfo-dest-enable[data-lfo="${i}"][data-dest="${d}"]`)?.checked || false,
          param: document.querySelector(`.lfo-dest-param[data-lfo="${i}"][data-dest="${d}"]`)?.value || '',
          mode: parseInt(document.querySelector(`.lfo-dest-mode[data-lfo="${i}"][data-dest="${d}"]`)?.value || 0),
          depth: parseFloat(document.querySelector(`.lfo-dest-depth[data-lfo="${i}"][data-dest="${d}"]`)?.value || 0.5),
          offset: parseFloat(document.querySelector(`.lfo-dest-offset[data-lfo="${i}"][data-dest="${d}"]`)?.value || 0)
        });
      }
      
      lfos.push(lfoState);
    }
    
    return lfos;
  }

  applyLFOState(lfos) {
    if (!lfos || !Array.isArray(lfos)) return;
    
    lfos.forEach((lfoState, i) => {
      if (i >= 7) return;
      
      // Enable checkbox
      const enableEl = document.querySelector(`.lfo-enable[data-lfo="${i}"]`);
      if (enableEl) {
        enableEl.checked = lfoState.enabled;
        const module = document.querySelector(`.lfo-module[data-lfo="${i}"]`);
        module?.classList.toggle('active', lfoState.enabled);
      }
      
      // Rate
      const rateEl = document.querySelector(`.lfo-rate[data-lfo="${i}"]`);
      if (rateEl) {
        rateEl.value = lfoState.rate;
        const rateDisplay = document.querySelector(`.lfo-rate-value[data-lfo="${i}"]`);
        if (rateDisplay) rateDisplay.textContent = `${lfoState.rate.toFixed(2)} Hz`;
      }
      this.app.lfos[i]?.setRate?.(lfoState.rate);
      
      // Waveform
      const waveEl = document.querySelector(`.lfo-waveform[data-lfo="${i}"]`);
      if (waveEl) waveEl.value = lfoState.waveform;
      this.app.lfos[i]?.setWaveform?.(lfoState.waveform);
      
      // Phase
      const phaseEl = document.querySelector(`.lfo-phase[data-lfo="${i}"]`);
      if (phaseEl) {
        phaseEl.value = lfoState.phase;
        const phaseDisplay = document.querySelector(`.lfo-phase-value[data-lfo="${i}"]`);
        if (phaseDisplay) phaseDisplay.textContent = lfoState.phase.toFixed(2);
      }
      this.app.lfos[i]?.setPhase?.(lfoState.phase);
      
      // Destinations
      lfoState.destinations?.forEach((dest, d) => {
        const destEnableEl = document.querySelector(`.lfo-dest-enable[data-lfo="${i}"][data-dest="${d}"]`);
        if (destEnableEl) {
          destEnableEl.checked = dest.enabled;
          const destEl = document.querySelector(`.lfo-dest[data-lfo="${i}"][data-dest="${d}"]`);
          destEl?.classList.toggle('active', dest.enabled);
        }
        
        const paramEl = document.querySelector(`.lfo-dest-param[data-lfo="${i}"][data-dest="${d}"]`);
        if (paramEl) paramEl.value = dest.param;
        
        const modeEl = document.querySelector(`.lfo-dest-mode[data-lfo="${i}"][data-dest="${d}"]`);
        if (modeEl) modeEl.value = dest.mode;
        
        const depthEl = document.querySelector(`.lfo-dest-depth[data-lfo="${i}"][data-dest="${d}"]`);
        if (depthEl) {
          depthEl.value = dest.depth;
          const depthDisplay = document.querySelector(`.lfo-dest-depth-value[data-lfo="${i}"][data-dest="${d}"]`);
          if (depthDisplay) depthDisplay.textContent = dest.depth.toFixed(2);
        }
        
        const offsetEl = document.querySelector(`.lfo-dest-offset[data-lfo="${i}"][data-dest="${d}"]`);
        if (offsetEl) {
          offsetEl.value = dest.offset;
          const offsetDisplay = document.querySelector(`.lfo-dest-offset-value[data-lfo="${i}"][data-dest="${d}"]`);
          if (offsetDisplay) offsetDisplay.textContent = dest.offset.toFixed(2);
        }
        
        // Apply to LFO node
        this.app.lfos[i]?.setDestinationEnabled?.(d, dest.enabled);
        if (dest.param && this.app.destinationMap?.[dest.param]) {
          this.app.lfos[i]?.setDestination?.(d, this.app.destinationMap[dest.param], dest.depth, dest.offset, dest.mode);
        }
      });
    });
  }

  // ========== MODULATION MATRIX ==========

  collectModMatrixState() {
    const slots = [];
    
    for (let i = 0; i < 5; i++) {
      slots.push({
        enabled: document.querySelector(`.mod-enable[data-slot="${i}"]`)?.checked || false,
        destination: document.querySelector(`.mod-destination[data-slot="${i}"]`)?.value || '',
        mode: parseInt(document.querySelector(`.mod-mode[data-slot="${i}"]`)?.value || 0),
        depth: parseFloat(document.querySelector(`.mod-depth[data-slot="${i}"]`)?.value || 0.5),
        offset: parseFloat(document.querySelector(`.mod-offset[data-slot="${i}"]`)?.value || 0)
      });
    }
    
    return slots;
  }

  applyModMatrixState(slots) {
    if (!slots || !Array.isArray(slots)) return;
    
    slots.forEach((slot, i) => {
      if (i >= 5) return;
      
      const enableEl = document.querySelector(`.mod-enable[data-slot="${i}"]`);
      if (enableEl) {
        enableEl.checked = slot.enabled;
        const slotEl = document.querySelector(`.mod-slot[data-slot="${i}"]`);
        slotEl?.classList.toggle('active', slot.enabled);
      }
      
      const destEl = document.querySelector(`.mod-destination[data-slot="${i}"]`);
      if (destEl) destEl.value = slot.destination;
      
      const modeEl = document.querySelector(`.mod-mode[data-slot="${i}"]`);
      if (modeEl) modeEl.value = slot.mode;
      
      const depthEl = document.querySelector(`.mod-depth[data-slot="${i}"]`);
      if (depthEl) {
        depthEl.value = slot.depth;
        const depthDisplay = document.querySelector(`.mod-depth-value[data-slot="${i}"]`);
        if (depthDisplay) depthDisplay.textContent = slot.depth.toFixed(2);
      }
      
      const offsetEl = document.querySelector(`.mod-offset[data-slot="${i}"]`);
      if (offsetEl) {
        offsetEl.value = slot.offset;
        const offsetDisplay = document.querySelector(`.mod-offset-value[data-slot="${i}"]`);
        if (offsetDisplay) offsetDisplay.textContent = slot.offset.toFixed(2);
      }
      
      // Apply to modulation matrix
      this.app.modMatrix?.setEnabled?.(i, slot.enabled);
      this.app.modMatrix?.setMode?.(i, slot.mode);
      this.app.modMatrix?.setDepth?.(i, slot.depth);
      this.app.modMatrix?.setOffset?.(i, slot.offset);
      
      if (slot.destination && this.app.destinationMap?.[slot.destination]) {
        this.app.modMatrix?.setDestination?.(i, this.app.destinationMap[slot.destination]);
      }
    });
  }

  // ========== EFFECTS ==========

  collectEffectsState() {
    return {
      djEQ: {
        lowGain: this.getEffectSliderValue('.effect-module.djeq', 'lowGain'),
        midGain: this.getEffectSliderValue('.effect-module.djeq', 'midGain'),
        highGain: this.getEffectSliderValue('.effect-module.djeq', 'highGain'),
        lowKill: this.getEffectCheckboxValue('.effect-module.djeq', 'lowKill'),
        midKill: this.getEffectCheckboxValue('.effect-module.djeq', 'midKill'),
        highKill: this.getEffectCheckboxValue('.effect-module.djeq', 'highKill'),
        bypass: document.querySelector('.effect-module.djeq .bypass-toggle')?.checked || false
      },
      saturation: {
        mode: this.getEffectSelectValue('.effect-module.saturation', 'mode'),
        drive: this.getEffectSliderValue('.effect-module.saturation', 'drive'),
        bias: this.getEffectSliderValue('.effect-module.saturation', 'bias'),
        mix: this.getEffectSliderValue('.effect-module.saturation', 'mix'),
        harmonics: this.getEffectSelectValue('.effect-module.saturation', 'harmonics'),
        bypass: document.querySelector('.effect-module.saturation .bypass-toggle')?.checked || false
      },
      greyhole: {
        mix: this.getEffectSliderValue('.effect-module.greyhole', 'mix'),
        delayTime: this.getEffectSliderValue('.effect-module.greyhole', 'delayTime'),
        size: this.getEffectSliderValue('.effect-module.greyhole', 'size'),
        damping: this.getEffectSliderValue('.effect-module.greyhole', 'damping'),
        diffusion: this.getEffectSliderValue('.effect-module.greyhole', 'diffusion'),
        feedback: this.getEffectSliderValue('.effect-module.greyhole', 'feedback'),
        modDepth: this.getEffectSliderValue('.effect-module.greyhole', 'modDepth'),
        modFreq: this.getEffectSliderValue('.effect-module.greyhole', 'modFreq'),
        bypass: document.querySelector('.effect-module.greyhole .bypass-toggle')?.checked || false
      },
      zita: {
        mix: this.getEffectSliderValue('.effect-module.zita', 'mix'),
        preDel: this.getEffectSliderValue('.effect-module.zita', 'preDel'),
        lfFc: this.getEffectSliderValue('.effect-module.zita', 'lfFc'),
        lowRt60: this.getEffectSliderValue('.effect-module.zita', 'lowRt60'),
        midRt60: this.getEffectSliderValue('.effect-module.zita', 'midRt60'),
        hfDamp: this.getEffectSliderValue('.effect-module.zita', 'hfDamp'),
        bypass: document.querySelector('.effect-module.zita .bypass-toggle')?.checked || false
      },
      mimeophon: this.app.mimeophon?.getState?.() || {}
    };
  }

  getEffectSliderValue(moduleSelector, param) {
    const el = document.querySelector(`${moduleSelector} input[data-param="${param}"]`);
    return el ? parseFloat(el.value) : 0;
  }

  getEffectCheckboxValue(moduleSelector, param) {
    const el = document.querySelector(`${moduleSelector} input[data-param="${param}"]`);
    return el?.checked || false;
  }

  getEffectSelectValue(moduleSelector, param) {
    const el = document.querySelector(`${moduleSelector} select[data-param="${param}"]`);
    return el?.value || '';
  }

  setEffectSliderValue(moduleSelector, param, value) {
    const el = document.querySelector(`${moduleSelector} input[data-param="${param}"]`);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  setEffectCheckboxValue(moduleSelector, param, value) {
    const el = document.querySelector(`${moduleSelector} input[data-param="${param}"]`);
    if (el) {
      el.checked = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  setEffectSelectValue(moduleSelector, param, value) {
    const el = document.querySelector(`${moduleSelector} select[data-param="${param}"]`);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  applyEffectsState(effects) {
    if (!effects) return;
    
    // DJ EQ
    if (effects.djEQ) {
      this.setEffectSliderValue('.effect-module.djeq', 'lowGain', effects.djEQ.lowGain);
      this.setEffectSliderValue('.effect-module.djeq', 'midGain', effects.djEQ.midGain);
      this.setEffectSliderValue('.effect-module.djeq', 'highGain', effects.djEQ.highGain);
      this.setEffectCheckboxValue('.effect-module.djeq', 'lowKill', effects.djEQ.lowKill);
      this.setEffectCheckboxValue('.effect-module.djeq', 'midKill', effects.djEQ.midKill);
      this.setEffectCheckboxValue('.effect-module.djeq', 'highKill', effects.djEQ.highKill);
      
      const bypassEl = document.querySelector('.effect-module.djeq .bypass-toggle');
      if (bypassEl) {
        bypassEl.checked = effects.djEQ.bypass;
        bypassEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    // Saturation
    if (effects.saturation) {
      this.setEffectSelectValue('.effect-module.saturation', 'mode', effects.saturation.mode);
      this.setEffectSliderValue('.effect-module.saturation', 'drive', effects.saturation.drive);
      this.setEffectSliderValue('.effect-module.saturation', 'bias', effects.saturation.bias);
      this.setEffectSliderValue('.effect-module.saturation', 'mix', effects.saturation.mix);
      this.setEffectSelectValue('.effect-module.saturation', 'harmonics', effects.saturation.harmonics);
      
      const bypassEl = document.querySelector('.effect-module.saturation .bypass-toggle');
      if (bypassEl) {
        bypassEl.checked = effects.saturation.bypass;
        bypassEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    // Greyhole
    if (effects.greyhole) {
      this.setEffectSliderValue('.effect-module.greyhole', 'mix', effects.greyhole.mix);
      this.setEffectSliderValue('.effect-module.greyhole', 'delayTime', effects.greyhole.delayTime);
      this.setEffectSliderValue('.effect-module.greyhole', 'size', effects.greyhole.size);
      this.setEffectSliderValue('.effect-module.greyhole', 'damping', effects.greyhole.damping);
      this.setEffectSliderValue('.effect-module.greyhole', 'diffusion', effects.greyhole.diffusion);
      this.setEffectSliderValue('.effect-module.greyhole', 'feedback', effects.greyhole.feedback);
      this.setEffectSliderValue('.effect-module.greyhole', 'modDepth', effects.greyhole.modDepth);
      this.setEffectSliderValue('.effect-module.greyhole', 'modFreq', effects.greyhole.modFreq);
      
      const bypassEl = document.querySelector('.effect-module.greyhole .bypass-toggle');
      if (bypassEl) {
        bypassEl.checked = effects.greyhole.bypass;
        bypassEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    // Zita
    if (effects.zita) {
      this.setEffectSliderValue('.effect-module.zita', 'mix', effects.zita.mix);
      this.setEffectSliderValue('.effect-module.zita', 'preDel', effects.zita.preDel);
      this.setEffectSliderValue('.effect-module.zita', 'lfFc', effects.zita.lfFc);
      this.setEffectSliderValue('.effect-module.zita', 'lowRt60', effects.zita.lowRt60);
      this.setEffectSliderValue('.effect-module.zita', 'midRt60', effects.zita.midRt60);
      this.setEffectSliderValue('.effect-module.zita', 'hfDamp', effects.zita.hfDamp);
      
      const bypassEl = document.querySelector('.effect-module.zita .bypass-toggle');
      if (bypassEl) {
        bypassEl.checked = effects.zita.bypass;
        bypassEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    // Mimeophon
    if (effects.mimeophon && this.app.mimeophon?.setState) {
      this.app.mimeophon.setState(effects.mimeophon);
    }
  }

  // ========== RENÉ SEQUENCER ==========

  collectReneState() {
    const reneState = {
      sequencer: null,
      patterns: null,
      modTargets: [],
      modDepths: []
    };
    
    // Get sequencer state if available
    // Try window.reneSequencer first (set by rene-integration-redesigned.js exports)
    // Also check if the app has a reference
    const reneSeq = window.reneSequencer || this.app.reneSequencer;
    if (reneSeq && typeof reneSeq.getState === 'function') {
      reneState.sequencer = reneSeq.getState();
    }
    
    // Get pattern system state if available
    const patternSys = window.renePatternSystem || this.app.renePatternSystem;
    if (patternSys && typeof patternSys.exportPatterns === 'function') {
      reneState.patterns = patternSys.exportPatterns();
    }
    
    // Get mod targets from UI (4 lanes)
    for (let i = 0; i < 4; i++) {
      const targetSelect = document.getElementById(`modTarget${i}`);
      const depthSlider = document.getElementById(`modDepth${i}`);
      
      reneState.modTargets.push(targetSelect?.value || '');
      reneState.modDepths.push(depthSlider ? parseFloat(depthSlider.value) : 0.5);
    }
    
    return reneState;
  }

  applyReneState(state) {
    if (!state) return;
    
    // Get references to René components
    const reneSeq = window.reneSequencer || this.app.reneSequencer;
    const patternSys = window.renePatternSystem || this.app.renePatternSystem;
    
    // Restore sequencer state
    if (state.sequencer && reneSeq && typeof reneSeq.setState === 'function') {
      reneSeq.setState(state.sequencer);
      
      // Sync UI with restored state
      this.syncReneUIFromState(state.sequencer);
    }
    
    // Restore pattern system
    if (state.patterns && patternSys && typeof patternSys.importPatterns === 'function') {
      patternSys.importPatterns(state.patterns);
      
      // Update pattern grid UI
      this.updatePatternGridUI(state.patterns);
    }
    
    // Restore mod targets and depths
    if (state.modTargets && state.modDepths) {
      for (let i = 0; i < 4; i++) {
        const targetSelect = document.getElementById(`modTarget${i}`);
        const depthSlider = document.getElementById(`modDepth${i}`);
        const depthDisplay = document.getElementById(`modDepthValue${i}`);
        
        if (targetSelect && state.modTargets[i] !== undefined) {
          targetSelect.value = state.modTargets[i];
          targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        if (depthSlider && state.modDepths[i] !== undefined) {
          depthSlider.value = state.modDepths[i];
          if (depthDisplay) depthDisplay.textContent = state.modDepths[i].toFixed(2);
        }
      }
    }
    
    console.log('✓ René state restored');
  }

  syncReneUIFromState(state) {
    if (!state) return;
    
    // Update note values (16 knobs)
    for (let i = 0; i < 16; i++) {
      const cell = document.querySelector(`#noteGrid [data-step="${i}"]`);
      if (cell && state.noteValues) {
        cell.dataset.value = state.noteValues[i];
        const valueDisplay = cell.querySelector('.knob-value');
        if (valueDisplay) valueDisplay.textContent = state.noteValues[i].toFixed(2);
        
        // Update knob rotation
        const knob = cell.querySelector('.knob');
        if (knob) {
          const rotation = (state.noteValues[i] - 0.5) * 270;
          knob.style.transform = `rotate(${rotation}deg)`;
        }
      }
    }
    
    // Update gate enabled states
    for (let i = 0; i < 16; i++) {
      const cell = document.querySelector(`#gateGrid [data-step="${i}"]`);
      if (cell && state.gateEnabled) {
        const isEnabled = state.gateEnabled[i];
        cell.classList.toggle('active', isEnabled);
        const checkbox = cell.querySelector('.gate-checkbox');
        if (checkbox) checkbox.checked = isEnabled;
      }
    }
    
    // Update mod values for all 4 lanes
    if (state.modValues) {
      for (let lane = 0; lane < 4; lane++) {
        for (let step = 0; step < 16; step++) {
          const cell = document.querySelector(`#modGrid${lane} [data-step="${step}"]`);
          if (cell && state.modValues[lane]) {
            cell.dataset.value = state.modValues[lane][step];
            const valueDisplay = cell.querySelector('.knob-value');
            if (valueDisplay) valueDisplay.textContent = state.modValues[lane][step].toFixed(2);
            
            const knob = cell.querySelector('.knob');
            if (knob) {
              const rotation = (state.modValues[lane][step] - 0.5) * 270;
              knob.style.transform = `rotate(${rotation}deg)`;
            }
          }
        }
      }
    }
    
    // Update length sliders
    const noteLengthSlider = document.getElementById('noteLaneLength');
    if (noteLengthSlider && state.noteLength !== undefined) {
      noteLengthSlider.value = state.noteLength;
      const display = document.getElementById('noteLaneLengthValue');
      if (display) display.textContent = state.noteLength;
    }
    
    const gateLengthSlider = document.getElementById('gateLaneLength');
    if (gateLengthSlider && state.gateLength !== undefined) {
      gateLengthSlider.value = state.gateLength;
      const display = document.getElementById('gateLaneLengthValue');
      if (display) display.textContent = state.gateLength;
    }
    
    if (state.modLengths) {
      for (let i = 0; i < 4; i++) {
        const modLengthSlider = document.getElementById(`mod${i}LaneLength`);
        if (modLengthSlider) {
          modLengthSlider.value = state.modLengths[i];
          const display = document.getElementById(`mod${i}LaneLengthValue`);
          if (display) display.textContent = state.modLengths[i];
        }
      }
    }
    
    // Update division dropdowns
    const noteDivSelect = document.getElementById('noteLaneDiv');
    if (noteDivSelect && state.noteDiv) noteDivSelect.value = state.noteDiv;
    
    const gateDivSelect = document.getElementById('gateLaneDiv');
    if (gateDivSelect && state.gateDiv) gateDivSelect.value = state.gateDiv;
    
    if (state.modDivs) {
      for (let i = 0; i < 4; i++) {
        const modDivSelect = document.getElementById(`mod${i}LaneDiv`);
        if (modDivSelect) modDivSelect.value = state.modDivs[i];
      }
    }
    
    // Update snake pattern
    const snakeSelect = document.getElementById('snakePatternSelect');
    if (snakeSelect && state.snakePattern !== undefined) {
      snakeSelect.value = state.snakePattern;
    }
    
    // Update step enabled states
    if (state.stepEnabled) {
      for (let i = 0; i < 16; i++) {
        const checkbox = document.querySelector(`.step-enable-checkbox[data-step="${i}"]`);
        if (checkbox) checkbox.checked = state.stepEnabled[i];
      }
    }
    
    // Update playback mode
    if (state.playbackMode) {
      document.querySelectorAll('.mode-toggle-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.playbackMode);
      });
    }
    
    // Update tempo
    const tempoSlider = document.getElementById('reneTempo');
    if (tempoSlider && state.tempo !== undefined) {
      tempoSlider.value = state.tempo;
      const display = document.getElementById('reneTempoValue');
      if (display) display.textContent = `${state.tempo} BPM`;
    }
  }

  updatePatternGridUI(patternsData) {
    if (!patternsData || !patternsData.patterns) return;
    
    patternsData.patterns.forEach((pattern, i) => {
      const slot = document.querySelector(`.pattern-slot[data-index="${i}"]`);
      if (!slot) return;
      
      const isEmpty = pattern === null;
      slot.classList.toggle('empty', isEmpty);
      
      const nameDisplay = slot.querySelector('.pattern-name');
      if (nameDisplay) {
        nameDisplay.textContent = isEmpty ? 'Empty' : (patternsData.patternNames?.[i] || `Pattern ${i + 1}`);
      }
      
      const repeatsInput = slot.querySelector('.pattern-repeats-input');
      if (repeatsInput && patternsData.patternRepeats) {
        repeatsInput.value = patternsData.patternRepeats[i] || 1;
      }
    });
  }

  // ========== FILE OPERATIONS ==========

  /**
   * Save the current patch to a JSON file
   */
  savePatch(filename = null) {
    const patch = this.collectPatchState();
    
    // Generate filename
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      filename = `phase5-patch-${timestamp}.json`;
    }
    
    // Create blob and download
    const json = JSON.stringify(patch, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    
    console.log(`%c✓ Patch saved: ${filename}`, 'color: green; font-weight: bold');
    return patch;
  }

  /**
   * Load a patch from a JSON file
   */
  loadPatch(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const patch = JSON.parse(e.target.result);
          const success = this.applyPatchState(patch);
          
          if (success) {
            resolve(patch);
          } else {
            reject(new Error('Failed to apply patch'));
          }
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

export default PatchManager;
