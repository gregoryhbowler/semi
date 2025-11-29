// rene-integration-upgraded.js
// UPGRADED Integration for René with 4 mod lanes and pattern system

import { ReneSequencer } from './ReneSequencer.js';
import { RenePatternSystem } from './RenePatternSystem.js';
import { EnvelopeVCANode } from './EnvelopeVCANode.js';
import { 
  initializeEnhancedReneUI, 
  updateCurrentStepHighlight, 
  clearAllStepHighlights,
  updateKnobRotation
} from './rene-ui-enhanced-upgraded.js';

// René mode state and components
let reneMode = false;
let reneSequencer = null;
let renePatternSystem = null;
let envelopeVCA = null;

// UPGRADED: 4 mod destinations
let modDestinations = [null, null, null, null];
let modDepths = [0.5, 0.5, 0.5, 0.5];

/**
 * Initialize René mode with pattern system
 */
export async function initReneMode(app) {
  console.log('Initializing UPGRADED René mode (4 mod lanes + patterns)...');
  
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
    
    // UPGRADED: Mod callback with lane index
    onMod: ({ laneIndex, value, time, step }) => {
      if (modDestinations[laneIndex]) {
        const scaledValue = value * modDepths[laneIndex];
        modDestinations[laneIndex].setValueAtTime(scaledValue, time);
      }
      
      updateCurrentStepHighlight(`mod${laneIndex}`, step);
    },

    // Pattern system support
    onNoteCycle: ({ time }) => {
      // Trigger transpose sequencer if in René clock mode
      if (app.transposeSeq && app.transposeSeq.getClockSource() === 'rene') {
        app.transposeSeq.trigger();
      }
      
      // Advance pattern if in linear playback mode
      if (renePatternSystem) {
        renePatternSystem.onReneCycleComplete();
      }
    }
  });
  
  // UPGRADED: Create pattern system
  renePatternSystem = new RenePatternSystem(reneSequencer, {
    onPatternRecall: (index) => {
      syncReneUIFromState();
      updatePatternUI();
      console.log(`✓ UI updated after pattern ${index + 1} recall`);
    }
  });
  
  // Initialize enhanced UI
  initializeEnhancedReneUI(reneSequencer);
  
  // Initialize pattern system UI
  initPatternSystemUI(app);
  
  // Bind controls
  bindReneControls(app);
  
  console.log('✓ UPGRADED René mode initialized');
}

/**
 * Initialize pattern system UI
 */
function initPatternSystemUI(app) {
  const patternGrid = document.getElementById('patternGrid');
  if (!patternGrid) return;
  
  // Track selected pattern (for Set/Copy/Paste operations)
  let selectedPatternIndex = 0;
  
  // Generate 8 pattern slots
  patternGrid.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const slot = document.createElement('div');
    slot.className = 'pattern-slot empty';
    if (i === 0) slot.classList.add('selected'); // First slot selected by default
    slot.dataset.index = i;
    
    slot.innerHTML = `
      <div class="pattern-slot-header">
        <span class="pattern-number">${i + 1}</span>
        <div class="pattern-status"></div>
      </div>
      <div class="pattern-name">Empty</div>
      <div class="pattern-repeats">
        <span class="pattern-repeats-label">×</span>
        <input type="number" class="pattern-repeats-input" 
               data-index="${i}" min="1" max="99" value="1">
      </div>
    `;
    
    patternGrid.appendChild(slot);
    
    // SINGLE CLICK: Select pattern (for Set/Copy/Paste operations)
    slot.addEventListener('click', (e) => {
      if (e.target.classList.contains('pattern-repeats-input')) return;
      
      // Remove selected class from all slots
      document.querySelectorAll('.pattern-slot').forEach(s => s.classList.remove('selected'));
      
      // Add selected class to clicked slot
      slot.classList.add('selected');
      selectedPatternIndex = i;
      
      console.log(`Pattern ${i + 1} selected`);
    });
    
    // DOUBLE CLICK: Recall pattern (load into René)
    slot.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('pattern-repeats-input')) return;
      if (renePatternSystem && !renePatternSystem.isPatternEmpty(i)) {
        renePatternSystem.recallPattern(i);
        syncReneUIFromState(); // Sync UI with new state
        updatePatternUI();
        console.log(`Pattern ${i + 1} recalled and UI updated`);
      }
    });
  }
  
  // Bind pattern repeat inputs
  document.querySelectorAll('.pattern-repeats-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const index = parseInt(e.target.dataset.index);
      const repeats = parseInt(e.target.value);
      if (renePatternSystem) {
        renePatternSystem.setPatternRepeats(index, repeats);
      }
    });
  });
  
  // Helper to get selected pattern index
  function getSelectedPatternIndex() {
    const selectedSlot = document.querySelector('.pattern-slot.selected');
    return selectedSlot ? parseInt(selectedSlot.dataset.index) : 0;
  }
  
  // Bind control buttons - USE SELECTED PATTERN
  document.getElementById('patternSetBtn')?.addEventListener('click', () => {
    const selectedIndex = getSelectedPatternIndex();
    if (renePatternSystem) {
      renePatternSystem.setPattern(selectedIndex);
      updatePatternUI();
      console.log(`✓ Current state saved to Pattern ${selectedIndex + 1}`);
    }
  });
  
  document.getElementById('patternCopyBtn')?.addEventListener('click', () => {
    const selectedIndex = getSelectedPatternIndex();
    if (renePatternSystem) {
      if (renePatternSystem.copyPattern(selectedIndex)) {
        console.log(`✓ Pattern ${selectedIndex + 1} copied to clipboard`);
      }
    }
  });
  
  document.getElementById('patternPasteBtn')?.addEventListener('click', () => {
    const selectedIndex = getSelectedPatternIndex();
    if (renePatternSystem) {
      if (renePatternSystem.pastePattern(selectedIndex)) {
        updatePatternUI();
        console.log(`✓ Clipboard pasted to Pattern ${selectedIndex + 1}`);
      }
    }
  });
  
  document.getElementById('patternClearAllBtn')?.addEventListener('click', () => {
    if (confirm('Clear all patterns? This cannot be undone.')) {
      if (renePatternSystem) {
        renePatternSystem.clearAllPatterns();
        updatePatternUI();
      }
    }
  });
  
  // Playback toggle
  const playbackBtn = document.getElementById('patternPlaybackBtn');
  playbackBtn?.addEventListener('click', () => {
    if (!renePatternSystem) return;
    
    const isEnabled = !renePatternSystem.playbackEnabled;
    renePatternSystem.setPlaybackEnabled(isEnabled);
    
    playbackBtn.textContent = isEnabled ? '⏸ Disable Playback' : '▶ Enable Playback';
    playbackBtn.classList.toggle('active', isEnabled);
  });
  
  // Playback mode buttons
  document.querySelectorAll('.pattern-mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.target.dataset.mode;
      
      document.querySelectorAll('.pattern-mode-btn').forEach(b => 
        b.classList.remove('active'));
      e.target.classList.add('active');
      
      if (renePatternSystem) {
        renePatternSystem.setPlaybackMode(mode);
      }
    });
  });
  
  console.log('✓ Pattern system UI initialized');
}

/**
 * Update pattern system UI to reflect current state
 */
function updatePatternUI() {
  if (!renePatternSystem) return;
  
  const info = renePatternSystem.getAllPatternInfo();
  
  info.forEach((pattern, i) => {
    const slot = document.querySelector(`.pattern-slot[data-index="${i}"]`);
    if (!slot) return;
    
    slot.classList.toggle('empty', pattern.isEmpty);
    slot.classList.toggle('current', pattern.isCurrent);
    
    const nameDisplay = slot.querySelector('.pattern-name');
    if (nameDisplay) {
      nameDisplay.textContent = pattern.isEmpty ? 'Empty' : pattern.name;
    }
    
    const repeatsInput = slot.querySelector('.pattern-repeats-input');
    if (repeatsInput) {
      repeatsInput.value = pattern.repeats;
    }
  });
}

/**
 * Sync René UI elements with sequencer state
 * Called after pattern recall to update all visual controls
 */
function syncReneUIFromState() {
  if (!reneSequencer) return;
  
  const state = reneSequencer.getState();
  
  // Update note values (16 knobs)
  for (let i = 0; i < 16; i++) {
    const cell = document.querySelector(`#noteGrid [data-step="${i}"]`);
    if (cell) {
      updateKnobRotation(cell, state.noteValues[i]);
    }
  }
  
  // Update gate enabled states (16 buttons)
  for (let i = 0; i < 16; i++) {
    const cell = document.querySelector(`#gateGrid [data-step="${i}"]`);
    if (cell) {
      if (state.gateEnabled[i]) {
        cell.classList.add('on');
      } else {
        cell.classList.remove('on');
      }
    }
  }
  
  // Update mod values for all 4 lanes
  for (let lane = 0; lane < 4; lane++) {
    for (let step = 0; step < 16; step++) {
      const cell = document.querySelector(`#modGrid${lane} [data-step="${step}"]`);
      if (cell) {
        updateKnobRotation(cell, state.modValues[lane][step]);
      }
    }
  }
  
  // Update length sliders
  const noteLengthSlider = document.getElementById('noteLength');
  if (noteLengthSlider) {
    noteLengthSlider.value = state.noteLength;
    const display = document.getElementById('noteLengthDisplay');
    if (display) display.textContent = state.noteLength;
  }
  
  const gateLengthSlider = document.getElementById('gateLength');
  if (gateLengthSlider) {
    gateLengthSlider.value = state.gateLength;
    const display = document.getElementById('gateLengthDisplay');
    if (display) display.textContent = state.gateLength;
  }
  
  for (let i = 0; i < 4; i++) {
    const modLengthSlider = document.getElementById(`modLength${i}`);
    if (modLengthSlider) {
      modLengthSlider.value = state.modLengths[i];
      const display = document.getElementById(`modLengthDisplay${i}`);
      if (display) display.textContent = state.modLengths[i];
    }
  }
  
  // Update division dropdowns
  const noteDivSelect = document.getElementById('noteDiv');
  if (noteDivSelect) noteDivSelect.value = state.noteDiv;
  
  const gateDivSelect = document.getElementById('gateDiv');
  if (gateDivSelect) gateDivSelect.value = state.gateDiv;
  
  for (let i = 0; i < 4; i++) {
    const modDivSelect = document.getElementById(`modDiv${i}`);
    if (modDivSelect) modDivSelect.value = state.modDivs[i];
  }
  
  // Update snake pattern
  const snakeSelect = document.getElementById('snakePattern');
  if (snakeSelect) snakeSelect.value = state.snakePattern;
  
  // Update step enabled states
  for (let i = 0; i < 16; i++) {
    const checkbox = document.querySelector(`input[name="stepEnabled"][value="${i}"]`);
    if (checkbox) {
      checkbox.checked = state.stepEnabled[i];
    }
  }
  
  // Update playback mode
  const playbackModeSelect = document.getElementById('playbackMode');
  if (playbackModeSelect) playbackModeSelect.value = state.playbackMode;
  
  // Update tempo
  const tempoSlider = document.getElementById('tempo');
  if (tempoSlider) {
    tempoSlider.value = state.tempo;
    const display = document.getElementById('tempoDisplay');
    if (display) display.textContent = `${state.tempo} BPM`;
  }
  
  console.log('✓ René UI synced with pattern state');
}

/**
 * Toggle René mode on/off
 */
export function toggleReneMode(app, enabled) {
  reneMode = enabled;
  
  if (enabled) {
    document.getElementById('reneModePanel')?.style.setProperty('display', 'block');
    document.getElementById('envelopePanel')?.style.setProperty('display', 'block');
    document.getElementById('renePatternSystem')?.style.setProperty('display', 'block');
    
    enableReneRouting(app);
    
    document.getElementById('reneModeBtn')?.classList.add('active');
    document.getElementById('normalModeBtn')?.classList.remove('active');
    
    console.log('▶ UPGRADED René mode ENABLED');
  } else {
    document.getElementById('reneModePanel')?.style.setProperty('display', 'none');
    document.getElementById('envelopePanel')?.style.setProperty('display', 'none');
    document.getElementById('renePatternSystem')?.style.setProperty('display', 'none');
    
    if (reneSequencer) {
      reneSequencer.setRunning(false);
    }
    
    if (renePatternSystem) {
      renePatternSystem.setPlaybackEnabled(false);
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
 * UPGRADED: Set modulation target for specific lane
 */
function setModTarget(app, laneIndex, target) {
  modDestinations[laneIndex] = null;
  
  if (!target) return;
  
  const targetMap = {
    'ma.air': app.mangroveA?.params?.airKnob,
    'ma.formant': app.mangroveA?.params?.formantKnob,
    'ma.barrel': app.mangroveA?.params?.barrelKnob,
    'ts.freq': app.threeSisters?.params?.freq,
    'ts.span': app.threeSisters?.params?.span,
    'ts.quality': app.threeSisters?.params?.quality,
    // Add more destinations as needed
  };
  
  modDestinations[laneIndex] = targetMap[target];
  
  if (modDestinations[laneIndex]) {
    console.log(`Mod ${laneIndex + 1} target: ${target}`);
  }
}

/**
 * UPGRADED: Populate mod target dropdowns for all 4 lanes
 */
function populateModTargetOptions() {
  const options = `
    <option value="">-- none --</option>
    <optgroup label="Mangrove A">
      <option value="ma.air">Air</option>
      <option value="ma.formant">Formant</option>
      <option value="ma.barrel">Barrel</option>
    </optgroup>
    <optgroup label="Three Sisters">
      <option value="ts.freq">Freq</option>
      <option value="ts.span">Span</option>
      <option value="ts.quality">Quality</option>
    </optgroup>
  `;
  
  for (let i = 0; i < 4; i++) {
    const select = document.getElementById(`modTarget${i}`);
    if (select) {
      select.innerHTML = options;
    }
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
  
  // Lane tabs (UPGRADED: 4 mod lanes)
  document.querySelectorAll('.rene-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const lane = e.target.dataset.lane;
      switchLane(lane);
    });
  });
  
  // Lane length/division controls
  bindLaneControl('note');
  bindLaneControl('gate');
  bindLaneControl('mod0');
  bindLaneControl('mod1');
  bindLaneControl('mod2');
  bindLaneControl('mod3');
  
  // UPGRADED: Mod targets and depths for 4 lanes
  populateModTargetOptions();
  
  for (let i = 0; i < 4; i++) {
    const modTarget = document.getElementById(`modTarget${i}`);
    modTarget?.addEventListener('change', (e) => {
      setModTarget(app, i, e.target.value);
    });
    
    const modDepth = document.getElementById(`modDepth${i}`);
    const modDepthValueDisplay = document.getElementById(`modDepthValue${i}`);
    modDepth?.addEventListener('input', (e) => {
      modDepths[i] = parseFloat(e.target.value);
      if (modDepthValueDisplay) {
        modDepthValueDisplay.textContent = modDepths[i].toFixed(2);
      }
    });
  }
  
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

  // Clock source toggle for transpose sequencer
  const clockSourceToggle = document.getElementById('transposeClockSource');
  if (clockSourceToggle) {
    if (app.transposeSeq) {
      const currentSource = app.transposeSeq.getClockSource();
      clockSourceToggle.value = currentSource;
    }
    
    clockSourceToggle.addEventListener('change', (e) => {
      const source = e.target.value;
      
      if (app.transposeSeq) {
        app.transposeSeq.setClockSource(source);
        
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
    if (lengthValue) lengthValue.textContent = length;
    
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
 * UPGRADED: Switch active lane tab (includes 4 mod lanes)
 */
function switchLane(lane) {
  // Update tabs
  document.querySelectorAll('.rene-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.lane === lane);
  });
  
  // Show/hide lane sections
  document.getElementById('reneLaneNote').style.display = lane === 'note' ? 'block' : 'none';
  document.getElementById('reneLaneGate').style.display = lane === 'gate' ? 'block' : 'none';
  document.getElementById('reneLaneMod0').style.display = lane === 'mod0' ? 'block' : 'none';
  document.getElementById('reneLaneMod1').style.display = lane === 'mod1' ? 'block' : 'none';
  document.getElementById('reneLaneMod2').style.display = lane === 'mod2' ? 'block' : 'none';
  document.getElementById('reneLaneMod3').style.display = lane === 'mod3' ? 'block' : 'none';
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
    if (attackValue) attackValue.textContent = value.toFixed(3);
    
    if (envelopeVCA) {
      envelopeVCA.setAttack(value);
    }
  });
  
  // Decay
  const decaySlider = document.getElementById('envDecay');
  const decayValue = document.getElementById('envDecayValue');
  
  decaySlider?.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    if (decayValue) decayValue.textContent = value.toFixed(3);
    
    if (envelopeVCA) {
      envelopeVCA.setDecay(value);
    }
  });
  
  // Sustain
  const sustainSlider = document.getElementById('envSustain');
  const sustainValue = document.getElementById('envSustainValue');
  
  sustainSlider?.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    if (sustainValue) sustainValue.textContent = value.toFixed(2);
    
    if (envelopeVCA) {
      envelopeVCA.setSustain(value);
    }
  });
}

/**
 * Export for use in main.js
 */
export { reneSequencer, renePatternSystem, envelopeVCA };
