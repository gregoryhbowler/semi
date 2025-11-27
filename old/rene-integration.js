// rene-integration.js - FIXED with proper JF #1 disconnection
// Integration code for René mode with proper pitch CV routing

import { ReneSequencer } from './ReneSequencer.js';
import { EnvelopeVCANode } from './EnvelopeVCANode.js';

// René mode state and components
let reneMode = false;
let reneSequencer = null;
let envelopeVCA = null;
let modDestinationParam = null;
let modDepthValue = 0.5;

// Current step tracking for UI updates
let currentSteps = { note: 0, gate: 0, mod: 0 };

/**
 * Initialize René mode
 */
export async function initReneMode(app) {
  console.log('Initializing René mode...');
  
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
      // Convert 0-1 value to pitch CV and route through renePitchSource
      // René outputs 0-1, we want 0-4V range (4 octaves)
      const voltage = value * 4.0; // 0-4V
      const normalized = voltage / 5.0; // Normalize for Web Audio (0-0.8)
      
      // Set the constant source value (this will be mixed with JF #1 in quantizer input)
      if (app.renePitchSource) {
        app.renePitchSource.offset.setValueAtTime(normalized, time);
      }
      
      // Update UI
      updateCurrentStepUI('note', step);
    },
    onGate: ({ isOn, time, step }) => {
      // Trigger envelope
      if (isOn) {
        envelopeVCA.triggerGateOn(time);
      } else {
        envelopeVCA.triggerGateOff(time);
      }
      
      // Update UI
      updateCurrentStepUI('gate', step);
    },
    onMod: ({ value, time, step }) => {
      // Apply modulation to target parameter
      if (modDestinationParam) {
        const scaledValue = value * modDepthValue;
        modDestinationParam.setValueAtTime(scaledValue, time);
      }
      
      // Update UI
      updateCurrentStepUI('mod', step);
    }
  });
  
  // Generate UI
  generateReneUI();
  
  // Bind controls
  bindReneControls(app);
  
  console.log('✓ René mode initialized');
}

/**
 * Toggle René mode on/off
 */
export function toggleReneMode(app, enabled) {
  reneMode = enabled;
  
  if (enabled) {
    // Show René panels
    document.getElementById('reneModePanel')?.style.setProperty('display', 'block');
    document.getElementById('envelopePanel')?.style.setProperty('display', 'block');
    
    // Reroute audio graph for René mode
    enableReneRouting(app);
    
    // Update UI
    document.getElementById('reneModeBtn')?.classList.add('active');
    document.getElementById('normalModeBtn')?.classList.remove('active');
    
    console.log('▶ René mode ENABLED');
  } else {
    // Hide René panels
    document.getElementById('reneModePanel')?.style.setProperty('display', 'none');
    document.getElementById('envelopePanel')?.style.setProperty('display', 'none');
    
    // Stop sequencer
    if (reneSequencer) {
      reneSequencer.setRunning(false);
    }
    
    // Restore normal routing
    disableReneRouting(app);
    
    // Update UI
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
  
  // CRITICAL: Disconnect JF #1 from quantizer
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
  // Normal path: Oscillator → Three Sisters
  // René path: Oscillator → Envelope VCA → Three Sisters
  
  // Disconnect normal path
  app.mangroveAGain.disconnect();
  app.jfOscGain.disconnect();
  
  // Connect through envelope
  app.mangroveAGain.connect(envelopeVCA.getInput());
  app.jfOscGain.connect(envelopeVCA.getInput());
  envelopeVCA.getOutput().connect(app.threeSisters.getAudioInput());
  
  console.log('✓ René routing enabled (JF #1 disconnected, CV + envelope active)');
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
  
  // Reset René pitch source to 0
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
  
  console.log('✓ Normal routing restored (JF #1 reconnected)');
}

/**
 * Generate René UI elements
 */
function generateReneUI() {
  // Generate note grid (16 knobs)
  const noteGrid = document.getElementById('noteGrid');
  if (noteGrid) {
    noteGrid.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = createKnobCell(i, 'note', 0.5);
      noteGrid.appendChild(cell);
    }
  }
  
  // Generate gate grid (16 toggles)
  const gateGrid = document.getElementById('gateGrid');
  if (gateGrid) {
    gateGrid.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = createToggleCell(i, 'gate', true);
      gateGrid.appendChild(cell);
    }
  }
  
  // Generate mod grid (16 knobs)
  const modGrid = document.getElementById('modGrid');
  if (modGrid) {
    modGrid.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = createKnobCell(i, 'mod', 0);
      modGrid.appendChild(cell);
    }
  }
}

/**
 * Create a knob cell for note/mod lanes
 */
function createKnobCell(index, lane, defaultValue) {
  const cell = document.createElement('div');
  cell.className = 'rene-knob-cell';
  cell.dataset.lane = lane;
  cell.dataset.step = index;
  
  const noteNames = ['C0', 'D0', 'E0', 'F0', 'G0', 'A0', 'B0', 'C1', 
                     'D1', 'E1', 'F1', 'G1', 'A1', 'B1', 'C2', 'D2'];
  
  cell.innerHTML = `
    <span class="knob-label">${noteNames[index]}</span>
    <span class="knob-value">${defaultValue.toFixed(2)}</span>
    <input type="range" 
           class="rene-knob-input" 
           data-lane="${lane}" 
           data-step="${index}"
           min="0" 
           max="1" 
           step="0.01" 
           value="${defaultValue}">
  `;
  
  // Bind input event
  const input = cell.querySelector('input');
  input.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    const valueDisplay = cell.querySelector('.knob-value');
    valueDisplay.textContent = value.toFixed(2);
    
    // Update sequencer
    if (reneSequencer) {
      if (lane === 'note') {
        const values = [...reneSequencer.noteValues];
        values[index] = value;
        reneSequencer.setNoteValues(values);
      } else if (lane === 'mod') {
        const values = [...reneSequencer.modValues];
        values[index] = value;
        reneSequencer.setModValues(values);
      }
    }
  });
  
  return cell;
}

/**
 * Create a toggle cell for gate lane
 */
function createToggleCell(index, lane, defaultValue) {
  const cell = document.createElement('div');
  cell.className = 'gate-toggle-cell';
  if (defaultValue) cell.classList.add('active');
  cell.dataset.lane = lane;
  cell.dataset.step = index;
  
  cell.innerHTML = `
    <span class="knob-label">${index + 1}</span>
    <input type="checkbox" 
           class="gate-checkbox" 
           data-lane="${lane}" 
           data-step="${index}"
           ${defaultValue ? 'checked' : ''}>
  `;
  
  // Bind change event
  const checkbox = cell.querySelector('input');
  checkbox.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    cell.classList.toggle('active', enabled);
    
    // Update sequencer
    if (reneSequencer) {
      const values = [...reneSequencer.gateEnabled];
      values[index] = enabled;
      reneSequencer.setGateValues(values);
    }
  });
  
  return cell;
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
    const target = e.target.value;
    setModTarget(app, target);
  });
  
  // Mod depth
  const modDepth = document.getElementById('modDepth');
  const modDepthValueDisplay = document.getElementById('modDepthValue');
  modDepth?.addEventListener('input', (e) => {
    modDepthValue = parseFloat(e.target.value);
    modDepthValueDisplay.textContent = modDepthValue.toFixed(2);
  });
  
  // Snake pattern
  document.querySelectorAll('.snake-pattern-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pattern = parseInt(e.target.dataset.pattern);
      
      document.querySelectorAll('.snake-pattern-btn').forEach(b => 
        b.classList.remove('active'));
      e.target.classList.add('active');
      
      if (reneSequencer) {
        reneSequencer.setSnakePattern(pattern);
      }
    });
  });
  
  // Playback mode
  document.querySelectorAll('.playback-mode-btn-rene').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.target.dataset.mode;
      
      document.querySelectorAll('.playback-mode-btn-rene').forEach(b => 
        b.classList.remove('active'));
      e.target.classList.add('active');
      
      if (reneSequencer) {
        reneSequencer.setPlaybackMode(mode);
      }
    });
  });
  
  // Transport
  document.getElementById('renePlayBtn')?.addEventListener('click', () => {
    if (reneSequencer) {
      reneSequencer.setRunning(true);
    }
  });
  
  document.getElementById('reneStopBtn')?.addEventListener('click', () => {
    if (reneSequencer) {
      reneSequencer.setRunning(false);
    }
  });
  
  document.getElementById('reneResetBtn')?.addEventListener('click', () => {
    if (reneSequencer) {
      reneSequencer.reset();
      clearCurrentStepUI();
    }
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
 * Set modulation target
 */
function setModTarget(app, target) {
  modDestinationParam = null;
  
  if (!target) return;
  
  // Map target string to audio parameter
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
 * Update current step UI highlight
 */
function updateCurrentStepUI(lane, step) {
  currentSteps[lane] = step;
  
  // Remove previous highlights
  document.querySelectorAll(`.rene-knob-cell[data-lane="${lane}"]`).forEach(cell => {
    cell.classList.remove('current');
  });
  
  document.querySelectorAll(`.gate-toggle-cell[data-lane="${lane}"]`).forEach(cell => {
    cell.classList.remove('current');
  });
  
  // Add new highlight
  const currentCell = document.querySelector(
    `.rene-knob-cell[data-lane="${lane}"][data-step="${step}"], ` +
    `.gate-toggle-cell[data-lane="${lane}"][data-step="${step}"]`
  );
  
  if (currentCell) {
    currentCell.classList.add('current');
  }
}

/**
 * Clear all current step highlights
 */
function clearCurrentStepUI() {
  document.querySelectorAll('.rene-knob-cell, .gate-toggle-cell').forEach(cell => {
    cell.classList.remove('current');
  });
}

/**
 * Export for use in main.js
 */
export { reneSequencer, envelopeVCA };
