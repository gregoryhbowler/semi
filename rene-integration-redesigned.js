// rene-integration-redesigned.js
// UPGRADED Integration for René with 4 mod lanes, pattern system, Pattern/Edit modes, and drum machine clock
// FIXED: Note range now ±2 octaves centered at 12 o'clock
// UPGRADED: Mod lanes now have access to ALL destinations (same as LFOs)

import { ReneSequencer } from './ReneSequencer.js';
import { RenePatternSystem } from './RenePatternSystem.js';
import { EnvelopeVCANode } from './EnvelopeVCANode.js';
import { 
  initializeEnhancedReneUI, 
  updateCurrentStepHighlight, 
  clearAllStepHighlights,
  updateKnobRotation
} from './rene-ui-enhanced.js';

// René mode state and components
let reneMode = false;
let reneSequencer = null;
let renePatternSystem = null;
let envelopeVCA = null;

// Store app reference for accessing destinationMap
let appReference = null;

// UPGRADED: 4 mod destinations
let modDestinations = [null, null, null, null];
let modDepths = [0.5, 0.5, 0.5, 0.5];

// Pattern mode state
let patternMode = false; // false = Edit Mode, true = Pattern Mode

/**
 * Initialize René mode with pattern system
 */
export async function initReneMode(app) {
  console.log('Initializing UPGRADED René mode (4 mod lanes + patterns + drum clock)...');
  
  // Store app reference for destinationMap access
  appReference = app;
  
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
    
    // FIXED: Note values now bipolar with ±2 octave range
    onNote: ({ value, time, step }) => {
      // Convert 0-1 value to BIPOLAR pitch CV (centered at 0.5)
      // 0 = -2 octaves, 0.5 = center (no transpose), 1 = +2 octaves
      const bipolarValue = (value - 0.5) * 2; // -1 to +1
      const octaves = bipolarValue * 2.0; // -2 to +2 octaves
      
      // Send directly to quantizer - quantizer will detect negative values
      // and treat them as octave offsets (with depth=1)
      if (app.renePitchSource) {
        app.renePitchSource.offset.setValueAtTime(octaves, time);
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
    },
    
    // NEW: 16th note callback for drum machine
    on16thNote: ({ time }) => {
      // Only send pulses if drums are set to René clock mode
      if (app.drumClockSource === 'rene' && app.triggerReneClockPulse) {
        // Trigger a buffer-based pulse at the scheduled time
        app.triggerReneClockPulse(time);
      }
    }
  });
  
  // UPGRADED: Create pattern system with live UI update callback
  renePatternSystem = new RenePatternSystem(reneSequencer, {
    onPatternRecall: (index) => {
      // In Pattern Mode, sync UI whenever pattern changes
      if (patternMode) {
        syncReneUIFromState();
        updatePatternUI();
        console.log(`✓ UI updated for pattern ${index + 1}`);
      }
    }
  });
  
  // Initialize enhanced UI
  initializeEnhancedReneUI(reneSequencer);
  
  // Initialize pattern system UI
  initPatternSystemUI(app);
  
  // Bind controls
  bindReneControls(app);
  
  console.log('✓ UPGRADED René mode initialized with drum machine clock');
  console.log('✓ Note range: ±2 octaves (knob center = no transpose)');
  console.log('✓ Mod lanes now have full destination access (same as LFOs)');
}

/**
 * Toggle between Pattern Mode and Edit Mode
 */
function setPatternMode(enabled) {
  patternMode = enabled;
  
  const editModeBtn = document.getElementById('patternEditModeBtn');
  const patternModeBtn = document.getElementById('patternPlaybackModeBtn');
  const modeIndicator = document.getElementById('reneModeIndicator');
  const reneMainContent = document.querySelector('.rene-main-content');
  
  if (enabled) {
    // PATTERN MODE: UI syncs with playing patterns
    editModeBtn?.classList.remove('active');
    patternModeBtn?.classList.add('active');
    
    if (modeIndicator) {
      modeIndicator.textContent = '⏵ Pattern Mode';
      modeIndicator.className = 'mode-indicator pattern-mode';
    }
    
    if (reneMainContent) {
      reneMainContent.classList.add('pattern-mode');
      reneMainContent.classList.remove('edit-mode');
    }
    
    // Sync UI with current pattern
    if (renePatternSystem && !renePatternSystem.isPatternEmpty(renePatternSystem.currentPatternIndex)) {
      syncReneUIFromState();
      updatePatternUI();
    }
    
    console.log('▶ Pattern Mode: UI syncs with patterns');
  } else {
    // EDIT MODE: Live editing, UI controls work normally
    editModeBtn?.classList.add('active');
    patternModeBtn?.classList.remove('active');
    
    if (modeIndicator) {
      modeIndicator.textContent = '✎ Edit Mode';
      modeIndicator.className = 'mode-indicator edit-mode';
    }
    
    if (reneMainContent) {
      reneMainContent.classList.add('edit-mode');
      reneMainContent.classList.remove('pattern-mode');
    }
    
    console.log('✎ Edit Mode: Live René editing');
  }
}

/**
 * Reset to blank/live mode - exits patterns and loads default state
 */
function resetToBlankMode() {
  // Stop playback
  if (renePatternSystem) {
    renePatternSystem.setPlaybackEnabled(false);
    const playbackBtn = document.getElementById('patternPlaybackBtn');
    if (playbackBtn) {
      playbackBtn.textContent = '▶ Enable Playback';
      playbackBtn.classList.remove('active');
    }
  }
  
  // Enter Edit Mode
  setPatternMode(false);
  
  // Load default blank state into René
  if (reneSequencer) {
    const blankState = {
      noteValues: new Array(16).fill(0.5), // Center = no transpose
      gateEnabled: new Array(16).fill(true),
      modValues: [
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0),
        new Array(16).fill(0)
      ],
      noteLength: 16,
      gateLength: 16,
      modLengths: [16, 16, 16, 16],
      noteDiv: '1/4',
      gateDiv: '1/4',
      modDivs: ['1/4', '1/4', '1/4', '1/4'],
      snakePattern: 0,
      playbackMode: 'forward',
      stepEnabled: new Array(16).fill(true),
      tempo: 120
    };
    
    reneSequencer.setState(blankState);
    syncReneUIFromState();
  }
  
  // Clear pattern selection visuals
  document.querySelectorAll('.pattern-slot').forEach(slot => {
    slot.classList.remove('selected', 'playing');
  });
  
  updatePatternUI();
  
  console.log('⚪ Blank Mode: Ready for live playing');
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
    
    // SINGLE CLICK: Select and preview pattern
    slot.addEventListener('click', (e) => {
      if (e.target.classList.contains('pattern-repeats-input')) return;
      
      // Remove selected class from all slots
      document.querySelectorAll('.pattern-slot').forEach(s => s.classList.remove('selected'));
      
      // Add selected class to clicked slot
      slot.classList.add('selected');
      selectedPatternIndex = i;
      
      // PREVIEW: Load pattern into René and sync UI
      if (!renePatternSystem.isPatternEmpty(i)) {
        renePatternSystem.recallPattern(i);
        syncReneUIFromState();
        updatePatternUI();
        console.log(`Pattern ${i + 1} previewed`);
      } else {
        console.log(`Pattern ${i + 1} selected (empty)`);
      }
    });
    
    // DOUBLE CLICK: Recall pattern and enter Pattern Mode
    slot.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('pattern-repeats-input')) return;
      if (renePatternSystem && !renePatternSystem.isPatternEmpty(i)) {
        renePatternSystem.recallPattern(i);
        syncReneUIFromState();
        updatePatternUI();
        setPatternMode(true); // Enter Pattern Mode
        console.log(`Pattern ${i + 1} recalled - Pattern Mode enabled`);
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
  
  // Mode toggle buttons
  document.getElementById('patternEditModeBtn')?.addEventListener('click', () => {
    setPatternMode(false); // Edit Mode
  });
  
  document.getElementById('patternPlaybackModeBtn')?.addEventListener('click', () => {
    setPatternMode(true); // Pattern Mode
  });
  
  // Blank button - reset to live mode
  document.getElementById('patternBlankBtn')?.addEventListener('click', () => {
    resetToBlankMode();
  });
  
  // Playback toggle
  const playbackBtn = document.getElementById('patternPlaybackBtn');
  playbackBtn?.addEventListener('click', () => {
    if (!renePatternSystem) return;
    
    const isEnabled = !renePatternSystem.playbackEnabled;
    renePatternSystem.setPlaybackEnabled(isEnabled);
    
    playbackBtn.textContent = isEnabled ? '⏸ Disable Playback' : '▶ Enable Playback';
    playbackBtn.classList.toggle('active', isEnabled);
    
    // Auto-enter Pattern Mode when enabling playback
    if (isEnabled) {
      setPatternMode(true);
    }
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
  
  // Set Edit Mode by default
  setPatternMode(false);
  
  console.log('✓ Pattern system UI initialized');
}

/**
 * Update pattern system UI to reflect current state
 */
function updatePatternUI() {
  if (!renePatternSystem) return;
  
  const info = renePatternSystem.getAllPatternInfo();
  const playbackState = renePatternSystem.getPlaybackState();
  
  info.forEach((pattern, i) => {
    const slot = document.querySelector(`.pattern-slot[data-index="${i}"]`);
    if (!slot) return;
    
    slot.classList.toggle('empty', pattern.isEmpty);
    
    // Show 'playing' state only when playback is enabled
    const isPlaying = playbackState.enabled && pattern.isCurrent;
    slot.classList.toggle('playing', isPlaying);
    
    const nameDisplay = slot.querySelector('.pattern-name');
    if (nameDisplay) {
      nameDisplay.textContent = pattern.isEmpty ? 'Empty' : pattern.name;
    }
    
    const repeatsInput = slot.querySelector('.pattern-repeats-input');
    if (repeatsInput) {
      repeatsInput.value = pattern.repeats;
    }
  });
  
  // Update playback indicator if in pattern mode
  if (patternMode && playbackState.enabled) {
    const indicator = document.getElementById('reneModeIndicator');
    if (indicator) {
      indicator.textContent = `⏵ Pattern ${playbackState.currentPattern + 1} (${playbackState.repeatCount + 1}/${playbackState.maxRepeats})`;
    }
  }
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
      const valueDisplay = cell.querySelector('.knob-value');
      if (valueDisplay) valueDisplay.textContent = state.noteValues[i].toFixed(2);
      cell.dataset.value = state.noteValues[i];
    }
  }
  
  // Update gate enabled states (16 buttons)
  for (let i = 0; i < 16; i++) {
    const cell = document.querySelector(`#gateGrid [data-step="${i}"]`);
    if (cell) {
      const isEnabled = state.gateEnabled[i];
      cell.classList.toggle('active', isEnabled);
      const checkbox = cell.querySelector('.gate-checkbox');
      if (checkbox) checkbox.checked = isEnabled;
    }
  }
  
  // Update mod values for all 4 lanes
  for (let lane = 0; lane < 4; lane++) {
    for (let step = 0; step < 16; step++) {
      const cell = document.querySelector(`#modGrid${lane} [data-step="${step}"]`);
      if (cell) {
        updateKnobRotation(cell, state.modValues[lane][step]);
        const valueDisplay = cell.querySelector('.knob-value');
        if (valueDisplay) valueDisplay.textContent = state.modValues[lane][step].toFixed(2);
        cell.dataset.value = state.modValues[lane][step];
      }
    }
  }
  
  // Update length sliders
  const noteLengthSlider = document.getElementById('noteLaneLength');
  if (noteLengthSlider) {
    noteLengthSlider.value = state.noteLength;
    const display = document.getElementById('noteLaneLengthValue');
    if (display) display.textContent = state.noteLength;
  }
  
  const gateLengthSlider = document.getElementById('gateLaneLength');
  if (gateLengthSlider) {
    gateLengthSlider.value = state.gateLength;
    const display = document.getElementById('gateLaneLengthValue');
    if (display) display.textContent = state.gateLength;
  }
  
  for (let i = 0; i < 4; i++) {
    const modLengthSlider = document.getElementById(`mod${i}LaneLength`);
    if (modLengthSlider) {
      modLengthSlider.value = state.modLengths[i];
      const display = document.getElementById(`mod${i}LaneLengthValue`);
      if (display) display.textContent = state.modLengths[i];
    }
  }
  
  // Update division dropdowns
  const noteDivSelect = document.getElementById('noteLaneDiv');
  if (noteDivSelect) noteDivSelect.value = state.noteDiv;
  
  const gateDivSelect = document.getElementById('gateLaneDiv');
  if (gateDivSelect) gateDivSelect.value = state.gateDiv;
  
  for (let i = 0; i < 4; i++) {
    const modDivSelect = document.getElementById(`mod${i}LaneDiv`);
    if (modDivSelect) modDivSelect.value = state.modDivs[i];
  }
  
  // Update snake pattern
  const snakeSelect = document.getElementById('snakePatternSelect');
  if (snakeSelect) snakeSelect.value = state.snakePattern;
  
  // Update step enabled states
  for (let i = 0; i < 16; i++) {
    const checkbox = document.querySelector(`input[name="stepEnabled"][value="${i}"]`);
    if (checkbox) {
      checkbox.checked = state.stepEnabled[i];
    }
  }
  
  // Update playback mode
  document.querySelectorAll('.mode-toggle-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.playbackMode);
  });
  
  // Update tempo
  const tempoSlider = document.getElementById('reneTempo');
  if (tempoSlider) {
    tempoSlider.value = state.tempo;
    const display = document.getElementById('reneTempoValue');
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
 * Now uses the full destinationMap from the app for comprehensive modulation routing
 */
function setModTarget(app, laneIndex, target) {
  modDestinations[laneIndex] = null;
  
  if (!target) return;
  
  // Use the app's comprehensive destinationMap
  if (app.destinationMap && app.destinationMap[target]) {
    modDestinations[laneIndex] = app.destinationMap[target];
    console.log(`Mod ${laneIndex + 1} target: ${target}`);
  } else {
    console.warn(`Unknown mod target: ${target}`);
  }
}

/**
 * UPGRADED: Generate destination options HTML
 * Matches the comprehensive list available in the LFO system
 */
function generateModDestinationOptions() {
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
      options: [
        { value: 'lfo1.rate', label: 'LFO 1: Rate' },
        { value: 'lfo1.phase', label: 'LFO 1: Phase' },
        { value: 'lfo2.rate', label: 'LFO 2: Rate' },
        { value: 'lfo2.phase', label: 'LFO 2: Phase' },
        { value: 'lfo3.rate', label: 'LFO 3: Rate' },
        { value: 'lfo3.phase', label: 'LFO 3: Phase' },
        { value: 'lfo4.rate', label: 'LFO 4: Rate' },
        { value: 'lfo4.phase', label: 'LFO 4: Phase' },
        { value: 'lfo5.rate', label: 'LFO 5: Rate' },
        { value: 'lfo5.phase', label: 'LFO 5: Phase' },
        { value: 'lfo6.rate', label: 'LFO 6: Rate' },
        { value: 'lfo6.phase', label: 'LFO 6: Phase' },
        { value: 'lfo7.rate', label: 'LFO 7: Rate' },
        { value: 'lfo7.phase', label: 'LFO 7: Phase' }
      ]
    },
    {
      label: 'Master',
      options: [
        { value: 'master.volume', label: 'Volume' }
      ]
    }
  ];
  
  // Generate HTML
  let html = '<option value="">-- none --</option>';
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

/**
 * UPGRADED: Populate mod target dropdowns for all 4 lanes
 * Now uses the comprehensive destination list matching the LFO system
 */
function populateModTargetOptions() {
  const optionsHTML = generateModDestinationOptions();
  
  for (let i = 0; i < 4; i++) {
    const select = document.getElementById(`modTarget${i}`);
    if (select) {
      select.innerHTML = optionsHTML;
    }
  }
  
  console.log('✓ Mod target dropdowns populated with full destination list');
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
    tempoValue.textContent = `${bpm} BPM`;
    
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
