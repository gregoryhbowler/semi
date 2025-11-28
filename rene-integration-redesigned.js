// rene-integration-redesigned.js
// Integration code for René mode with enhanced rotary knob UI

import { ReneSequencer } from './ReneSequencer.js';
import { EnvelopeVCANode } from './EnvelopeVCANode.js';
import { 
  initializeEnhancedReneUI, 
  updateCurrentStepHighlight, 
  clearAllStepHighlights 
} from './rene-ui-enhanced.js';

// René mode state and components
let reneMode = false;
let reneSequencer = null;
let envelopeVCA = null;
let modDestinationParam = null;
let modDepthValue = 0.5;

/**
 * Initialize René mode
 */
export async function initReneMode(app) {
  console.log('Initializing René mode with enhanced UI...');
  
  // Create envelope/VCA
  envelopeVCA = new EnvelopeVCANode(app.audioContext);
  
  // Set default envelope parameters
  envelopeVCA.setMode('ASR');
  envelopeVCA.setCurve('exponential');
  envelopeVCA.setAttack(0.03);
  envelopeVCA.setDecay(0.5);
  envelopeVCA.setSustain(0.7);
  
  // Create René sequencer with callbacks
  reneSequencer = new ReneSequencer({
    audioContext: app.audioContext,
    onNote: ({ value, time, step }) => {
      // Convert 0-1 value to pitch CV
      const voltage = value * 4.0; // 0-4V range
      const normalized = voltage / 5.0; // Normalize for Web Audio
      
      if (app.renePitchSource) {
        app.renePitchSource.offset.setValueAtTime(normalized, time);
      }
      
      updateCurrentStepHighlight('note', step);
    },
    onGate: ({ isOn, time, step }) => {
      if (isOn) {
        envelopeVCA.triggerGateOn(time);
      } else {
        envelopeVCA.triggerGateOff(time);
      }
      
      updateCurrentStepHighlight('gate', step);
    },
    onMod: ({ value, time, step }) => {
      if (modDestinationParam) {
        const scaledValue = value * modDepthValue;
        modDestinationParam.setValueAtTime(scaledValue, time);
      }
      
      updateCurrentStepHighlight('mod', step);
    },

    // NEW: Add note cycle callback
    onNoteCycle: ({ time }) => {
    // When René completes a note sequence cycle, trigger transpose sequencer
    // BUT ONLY if transpose sequencer is in René clock mode
    if (app.transposeSeq && app.transposeSeq.getClockSource() === 'rene') {
      app.transposeSeq.trigger();
      console.log('🔄 René cycle → Transpose sequencer advanced');
    }
  }
  });
  
  // Initialize enhanced UI
  initializeEnhancedReneUI(reneSequencer);
  
  // Bind controls
  bindReneControls(app);
  
  console.log('✓ René mode initialized with enhanced UI');
}

/**
 * Toggle René mode on/off
 */
export function toggleReneMode(app, enabled) {
  reneMode = enabled;
  
  if (enabled) {
    document.getElementById('reneModePanel')?.style.setProperty('display', 'block');
    document.getElementById('envelopePanel')?.style.setProperty('display', 'block');
    
    enableReneRouting(app);
    
    document.getElementById('reneModeBtn')?.classList.add('active');
    document.getElementById('normalModeBtn')?.classList.remove('active');
    
    console.log('▶ René mode ENABLED');
  } else {
    document.getElementById('reneModePanel')?.style.setProperty('display', 'none');
    document.getElementById('envelopePanel')?.style.setProperty('display', 'none');
    
    if (reneSequencer) {
      reneSequencer.setRunning(false);
    }
    
    disableReneRouting(app);
    
    document.getElementById('reneModeBtn')?.classList.remove('active');
    document.getElementById('normalModeBtn')?.classList.add('active');
    
    console.log('⏸ René mode DISABLED');
  }
}

/**
 * Enable René signal routing
 */
function enableReneRouting(app) {
  const now = app.audioContext.currentTime;
  
  // Disconnect JF #1 from quantizer
  if (app.jf1ToQuantGain) {
    app.jf1ToQuantGain.gain.cancelScheduledValues(now);
    app.jf1ToQuantGain.gain.setValueAtTime(app.jf1ToQuantGain.gain.value, now);
    app.jf1ToQuantGain.gain.linearRampToValueAtTime(0, now + 0.05);
  }
  
  // Enable René pitch CV routing
  if (app.renePitchGain) {
    app.renePitchGain.gain.cancelScheduledValues(now);
    app.renePitchGain.gain.setValueAtTime(app.renePitchGain.gain.value, now);
    app.renePitchGain.gain.linearRampToValueAtTime(1.0, now + 0.05);
  }
  
  // Insert envelope/VCA into signal path
  app.mangroveAGain.disconnect();
  app.jfOscGain.disconnect();
  
  app.mangroveAGain.connect(envelopeVCA.getInput());
  app.jfOscGain.connect(envelopeVCA.getInput());
  envelopeVCA.getOutput().connect(app.threeSisters.getAudioInput());
  
  console.log('✓ René routing enabled');
}

/**
 * Disable René signal routing
 */
function disableReneRouting(app) {
  const now = app.audioContext.currentTime;
  
  // Re-enable JF #1 to quantizer
  if (app.jf1ToQuantGain) {
    app.jf1ToQuantGain.gain.cancelScheduledValues(now);
    app.jf1ToQuantGain.gain.setValueAtTime(app.jf1ToQuantGain.gain.value, now);
    app.jf1ToQuantGain.gain.linearRampToValueAtTime(1.0, now + 0.05);
  }
  
  // Disable René pitch CV routing
  if (app.renePitchGain) {
    app.renePitchGain.gain.cancelScheduledValues(now);
    app.renePitchGain.gain.setValueAtTime(app.renePitchGain.gain.value, now);
    app.renePitchGain.gain.linearRampToValueAtTime(0, now + 0.05);
  }
  
  // Reset René pitch source
  if (app.renePitchSource) {
    app.renePitchSource.offset.setValueAtTime(0, now);
  }
  
  // Restore normal routing
  app.mangroveAGain.disconnect();
  app.jfOscGain.disconnect();
  
  if (envelopeVCA) {
    envelopeVCA.getInput().disconnect();
    envelopeVCA.getOutput().disconnect();
  }
  
  app.mangroveAGain.connect(app.threeSisters.getAudioInput());
  app.jfOscGain.connect(app.threeSisters.getAudioInput());
  
  console.log('✓ Normal routing restored');
}

/**
 * Set modulation target
 */
function setModTarget(app, target) {
  modDestinationParam = null;
  
  if (!target) return;
  
  const targetMap = {
    'ma.air': app.mangroveA?.params?.airKnob,
    'ma.formant': app.mangroveA?.params?.formantKnob,
    'ma.barrel': app.mangroveA?.params?.barrelKnob,
    'ts.freq': app.threeSisters?.params?.freq,
    'ts.span': app.threeSisters?.params?.span,
    'ts.quality': app.threeSisters?.params?.quality
  };
  
  modDestinationParam = targetMap[target];
  
  if (modDestinationParam) {
    console.log(`Mod target: ${target}`);
  }
}

/**
 * Bind René control events
 */
function bindReneControls(app) {
  // Mode toggle
  document.getElementById('normalModeBtn')?.addEventListener('click', () => {
    toggleReneMode(app, false);
  });
  
  document.getElementById('reneModeBtn')?.addEventListener('click', () => {
    toggleReneMode(app, true);
  });
  
  // Tempo control
  const tempoSlider = document.getElementById('reneTempo');
  const tempoValue = document.getElementById('reneTempoValue');
  
  tempoSlider?.addEventListener('input', (e) => {
    const bpm = parseInt(e.target.value);
    tempoValue.textContent = bpm;
    
    if (reneSequencer) {
      reneSequencer.setTempo(bpm);
    }
  });
  
  // Lane tabs
  document.querySelectorAll('.rene-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const lane = e.target.dataset.lane;
      switchLane(lane);
    });
  });
  
  // Lane length/division controls
  bindLaneControl('note');
  bindLaneControl('gate');
  bindLaneControl('mod');
  
  // Mod target
  const modTarget = document.getElementById('modTarget');
  modTarget?.addEventListener('change', (e) => {
    setModTarget(app, e.target.value);
  });
  
  // Mod depth
  const modDepth = document.getElementById('modDepth');
  const modDepthValueDisplay = document.getElementById('modDepthValue');
  modDepth?.addEventListener('input', (e) => {
    modDepthValue = parseFloat(e.target.value);
    modDepthValueDisplay.textContent = modDepthValue.toFixed(2);
  });
  
  // Playback mode
  document.querySelectorAll('.mode-toggle-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.target.dataset.mode;
      
      document.querySelectorAll('.mode-toggle-option').forEach(b => 
        b.classList.remove('active'));
      e.target.classList.add('active');
      
      if (reneSequencer) {
        reneSequencer.setPlaybackMode(mode);
      }
    });
  });
  
  // Transport (both mini and regular)
  const playButtons = ['renePlayBtn', 'renePlayBtnMini'];
  const stopButtons = ['reneStopBtn', 'reneStopBtnMini'];
  const resetButtons = ['reneResetBtn', 'reneResetBtnMini'];
  
  playButtons.forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (reneSequencer) {
        reneSequencer.setRunning(true);
      }
    });
  });
  
  stopButtons.forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (reneSequencer) {
        reneSequencer.setRunning(false);
      }
    });
  });
  
  resetButtons.forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (reneSequencer) {
        reneSequencer.reset();
        clearAllStepHighlights();
      }
    });
  });
  
  // Step enable checkboxes
  document.querySelectorAll('.step-enable-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const step = parseInt(e.target.dataset.step);
      const enabled = e.target.checked;
      
      if (reneSequencer) {
        const enabledArray = new Array(16).fill(false);
        document.querySelectorAll('.step-enable-checkbox').forEach((cb, i) => {
          enabledArray[i] = cb.checked;
        });
        reneSequencer.setStepEnabled(enabledArray);
      }
    });
  });

    // NEW: Clock source toggle for transpose sequencer
  const clockSourceToggle = document.getElementById('transposeClockSource');
  if (clockSourceToggle) {
    // Set initial state based on app.transposeSeq
    if (app.transposeSeq) {
      const currentSource = app.transposeSeq.getClockSource();
      clockSourceToggle.value = currentSource;
    }
    
    clockSourceToggle.addEventListener('change', (e) => {
      const source = e.target.value;
      
      if (app.transposeSeq) {
        app.transposeSeq.setClockSource(source);
        
        // Update UI feedback
        const indicator = document.getElementById('clockSourceIndicator');
        if (indicator) {
          indicator.textContent = source === 'jf' ? 'Clocked by Just Friends' : 'Clocked by René cycles';
          indicator.className = `clock-indicator ${source}`;
        }
      }
    });
  }
  
  // Envelope controls
  bindEnvelopeControls();
}

/**
 * Bind lane-specific controls
 */
function bindLaneControl(lane) {
  const lengthSlider = document.getElementById(`${lane}LaneLength`);
  const lengthValue = document.getElementById(`${lane}LaneLengthValue`);
  const divSelect = document.getElementById(`${lane}LaneDiv`);
  
  lengthSlider?.addEventListener('input', (e) => {
    const length = parseInt(e.target.value);
    lengthValue.textContent = length;
    
    if (reneSequencer) {
      reneSequencer.setLaneTiming({ lane, length });
    }
  });
  
  divSelect?.addEventListener('change', (e) => {
    const division = e.target.value;
    
    if (reneSequencer) {
      reneSequencer.setLaneTiming({ lane, division });
    }
  });
}

/**
 * Switch active lane tab
 */
function switchLane(lane) {
  // Update tabs
  document.querySelectorAll('.rene-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.lane === lane);
  });
  
  // Show/hide lane sections
  document.getElementById('reneLaneNote').style.display = lane === 'note' ? 'block' : 'none';
  document.getElementById('reneLaneGate').style.display = lane === 'gate' ? 'block' : 'none';
  document.getElementById('reneLaneMod').style.display = lane === 'mod' ? 'block' : 'none';
}

/**
 * Bind envelope controls
 */
function bindEnvelopeControls() {
  // Mode buttons
  document.querySelectorAll('.env-mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.target.dataset.mode;
      
      document.querySelectorAll('.env-mode-btn').forEach(b => 
        b.classList.remove('active'));
      e.target.classList.add('active');
      
      if (envelopeVCA) {
        envelopeVCA.setMode(mode);
      }
    });
  });
  
  // Curve buttons
  document.querySelectorAll('.curve-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const curve = e.target.dataset.curve;
      
      document.querySelectorAll('.curve-btn').forEach(b => 
        b.classList.remove('active'));
      e.target.classList.add('active');
      
      if (envelopeVCA) {
        envelopeVCA.setCurve(curve);
      }
    });
  });
  
  // Attack
  const attackSlider = document.getElementById('envAttack');
  const attackValue = document.getElementById('envAttackValue');
  
  attackSlider?.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    attackValue.textContent = value.toFixed(3);
    
    if (envelopeVCA) {
      envelopeVCA.setAttack(value);
    }
  });
  
  // Decay
  const decaySlider = document.getElementById('envDecay');
  const decayValue = document.getElementById('envDecayValue');
  
  decaySlider?.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    decayValue.textContent = value.toFixed(3);
    
    if (envelopeVCA) {
      envelopeVCA.setDecay(value);
    }
  });
  
  // Sustain
  const sustainSlider = document.getElementById('envSustain');
  const sustainValue = document.getElementById('envSustainValue');
  
  sustainSlider?.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    sustainValue.textContent = value.toFixed(2);
    
    if (envelopeVCA) {
      envelopeVCA.setSustain(value);
    }
  });
}

/**
 * Export for use in main.js
 */
export { reneSequencer, envelopeVCA };
