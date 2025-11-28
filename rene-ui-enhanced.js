// rene-ui-enhanced-upgraded.js
// UPGRADED: Enhanced René UI with rotary knobs (supports 4 mod lanes)

/**
 * Update rotary knob visual rotation based on value
 */
export function updateKnobRotation(cell, value) {
  const indicator = cell.querySelector('.knob-indicator');
  if (!indicator) return;
  
  // Map 0-1 to -135deg to +135deg (270 degree range)
  const minAngle = -135;
  const maxAngle = 135;
  const angle = minAngle + (value * (maxAngle - minAngle));
  
  indicator.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}

/**
 * Create enhanced rotary knob cell structure
 */
export function createEnhancedKnobCell(index, lane, defaultValue) {
  const cell = document.createElement('div');
  cell.className = 'rene-knob-cell';
  cell.dataset.lane = lane;
  cell.dataset.step = index;
  cell.dataset.value = defaultValue;
  
  const noteNames = ['C0', 'D0', 'E0', 'F0', 'G0', 'A0', 'B0', 'C1', 
                     'D1', 'E1', 'F1', 'G1', 'A1', 'B1', 'C2', 'D2'];
  
  cell.innerHTML = `
    <span class="knob-label">${noteNames[index]}</span>
    <div class="knob-rotary">
      <div class="knob-circle">
        <div class="knob-indicator"></div>
      </div>
    </div>
    <span class="knob-value">${defaultValue.toFixed(2)}</span>
  `;
  
  // Set initial rotation
  updateKnobRotation(cell, defaultValue);
  
  // Add drag interaction
  const knobRotary = cell.querySelector('.knob-rotary');
  const valueDisplay = cell.querySelector('.knob-value');
  
  let isDragging = false;
  let startY = 0;
  let startValue = defaultValue;
  
  const handleMouseDown = (e) => {
    isDragging = true;
    startY = e.clientY;
    startValue = parseFloat(cell.dataset.value);
    knobRotary.style.cursor = 'grabbing';
    e.preventDefault();
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    const deltaY = startY - e.clientY;
    const sensitivity = 0.005;
    let newValue = startValue + (deltaY * sensitivity);
    
    newValue = Math.max(0, Math.min(1, newValue));
    
    cell.dataset.value = newValue;
    valueDisplay.textContent = newValue.toFixed(2);
    updateKnobRotation(cell, newValue);
    
    const changeEvent = new CustomEvent('knobchange', {
      detail: { value: newValue, lane, step: index }
    });
    cell.dispatchEvent(changeEvent);
  };
  
  const handleMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      knobRotary.style.cursor = 'grab';
    }
  };
  
  knobRotary.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  
  // Touch support
  const handleTouchStart = (e) => {
    isDragging = true;
    startY = e.touches[0].clientY;
    startValue = parseFloat(cell.dataset.value);
    e.preventDefault();
  };
  
  const handleTouchMove = (e) => {
    if (!isDragging) return;
    
    const deltaY = startY - e.touches[0].clientY;
    const sensitivity = 0.005;
    let newValue = startValue + (deltaY * sensitivity);
    
    newValue = Math.max(0, Math.min(1, newValue));
    
    cell.dataset.value = newValue;
    valueDisplay.textContent = newValue.toFixed(2);
    updateKnobRotation(cell, newValue);
    
    const changeEvent = new CustomEvent('knobchange', {
      detail: { value: newValue, lane, step: index }
    });
    cell.dispatchEvent(changeEvent);
    
    e.preventDefault();
  };
  
  const handleTouchEnd = () => {
    isDragging = false;
  };
  
  knobRotary.addEventListener('touchstart', handleTouchStart, { passive: false });
  knobRotary.addEventListener('touchmove', handleTouchMove, { passive: false });
  knobRotary.addEventListener('touchend', handleTouchEnd);
  
  knobRotary.style.cursor = 'grab';
  
  return cell;
}

/**
 * Create enhanced gate toggle cell structure
 */
export function createEnhancedGateCell(index, lane, defaultValue) {
  const cell = document.createElement('div');
  cell.className = 'gate-toggle-cell';
  if (defaultValue) cell.classList.add('active');
  cell.dataset.lane = lane;
  cell.dataset.step = index;
  
  cell.innerHTML = `
    <span class="knob-label">${index + 1}</span>
    <div class="gate-button"></div>
    <input type="checkbox" 
           class="gate-checkbox" 
           data-lane="${lane}" 
           data-step="${index}"
           ${defaultValue ? 'checked' : ''}>
  `;
  
  cell.addEventListener('click', () => {
    const checkbox = cell.querySelector('.gate-checkbox');
    checkbox.checked = !checkbox.checked;
    cell.classList.toggle('active', checkbox.checked);
    
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  
  return cell;
}

/**
 * Generate snake pattern options for dropdown
 */
export function getSnakePatternOptions() {
  return [
    { value: 0, name: 'Forward' },
    { value: 1, name: 'Classic Snake' },
    { value: 2, name: 'Vertical Snake' },
    { value: 3, name: 'Diagonal' },
    { value: 4, name: 'Spiral Inward' },
    { value: 5, name: 'Spiral Outward' },
    { value: 6, name: 'Zigzag Horizontal' },
    { value: 7, name: 'Zigzag Vertical' },
    { value: 8, name: 'Double Spiral' },
    { value: 9, name: 'Corners' },
    { value: 10, name: 'X Pattern' },
    { value: 11, name: 'Checkerboard' },
    { value: 12, name: 'L-Shapes' },
    { value: 13, name: 'Random-ish' },
    { value: 14, name: 'Triangular' },
    { value: 15, name: 'Complex Weave' }
  ];
}

/**
 * UPGRADED: Initialize all enhanced UI elements (supports 4 mod lanes)
 */
export function initializeEnhancedReneUI(reneSequencer) {
  // Generate note grid
  const noteGrid = document.getElementById('noteGrid');
  if (noteGrid) {
    noteGrid.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = createEnhancedKnobCell(i, 'note', 0.5);
      noteGrid.appendChild(cell);
      
      cell.addEventListener('knobchange', (e) => {
        const { value } = e.detail;
        if (reneSequencer) {
          const values = [...reneSequencer.noteValues];
          values[i] = value;
          reneSequencer.setNoteValues(values);
        }
      });
    }
  }
  
  // Generate gate grid
  const gateGrid = document.getElementById('gateGrid');
  if (gateGrid) {
    gateGrid.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const cell = createEnhancedGateCell(i, 'gate', true);
      gateGrid.appendChild(cell);
      
      const checkbox = cell.querySelector('.gate-checkbox');
      checkbox.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        if (reneSequencer) {
          const values = [...reneSequencer.gateEnabled];
          values[i] = enabled;
          reneSequencer.setGateValues(values);
        }
      });
    }
  }
  
  // UPGRADED: Generate 4 mod grids
  for (let laneIndex = 0; laneIndex < 4; laneIndex++) {
    const modGrid = document.getElementById(`modGrid${laneIndex}`);
    if (modGrid) {
      modGrid.innerHTML = '';
      for (let i = 0; i < 16; i++) {
        const cell = createEnhancedKnobCell(i, `mod${laneIndex}`, 0);
        modGrid.appendChild(cell);
        
        cell.addEventListener('knobchange', (e) => {
          const { value } = e.detail;
          if (reneSequencer) {
            const values = [...reneSequencer.modValues[laneIndex]];
            values[i] = value;
            reneSequencer.setModValues(laneIndex, values);
          }
        });
      }
    }
  }
  
  // Populate snake pattern dropdown
  const snakeSelect = document.getElementById('snakePatternSelect');
  if (snakeSelect) {
    snakeSelect.innerHTML = '';
    getSnakePatternOptions().forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.name;
      snakeSelect.appendChild(opt);
    });
    
    snakeSelect.addEventListener('change', (e) => {
      const pattern = parseInt(e.target.value);
      if (reneSequencer) {
        reneSequencer.setSnakePattern(pattern);
      }
    });
  }
  
  console.log('✓ Enhanced René UI initialized (4 mod lanes)');
}

/**
 * Update current step highlight
 */
export function updateCurrentStepHighlight(lane, step) {
  // Remove previous highlights for this lane
  document.querySelectorAll(`[data-lane="${lane}"]`).forEach(cell => {
    if (cell.classList.contains('rene-knob-cell') || cell.classList.contains('gate-toggle-cell')) {
      cell.classList.remove('current');
    }
  });
  
  // Add new highlight
  const currentCell = document.querySelector(
    `[data-lane="${lane}"][data-step="${step}"].rene-knob-cell, ` +
    `[data-lane="${lane}"][data-step="${step}"].gate-toggle-cell`
  );
  
  if (currentCell) {
    currentCell.classList.add('current');
  }
}

/**
 * Clear all step highlights
 */
export function clearAllStepHighlights() {
  document.querySelectorAll('.rene-knob-cell, .gate-toggle-cell').forEach(cell => {
    cell.classList.remove('current');
  });
}
