// ReneSequencer.js
// René-inspired 16-step sequencer with snake patterns and independent lane timing
// UPGRADED: Bug fix for lane lengths + 4 mod lanes with individual destinations

export class ReneSequencer {
  constructor({
    audioContext,
    onNote,     // ({ value, time }) => void
    onGate,     // ({ isOn, time }) => void
    onMod,      // ({ laneIndex, value, time }) => void - NOW includes laneIndex
    onNoteCycle 
  }) {
    this.audioContext = audioContext;
    this.onNote = onNote;
    this.onGate = onGate;
    this.onMod = onMod;
    this.onNoteCycle = onNoteCycle;
    
    // René's own tempo (BPM)
    this.bpm = 120;
    this.basePeriod = this.calculateBasePeriod(this.bpm);
    
    // Scheduling
    this.nextTickTime = 0;
    this.lookahead = 0.1; // seconds
    this.scheduleInterval = null;
    this.isRunning = false;
    
    // 16-step grid data
    this.steps = Array.from({ length: 16 }, () => ({
      enabled: true  // ACCESS control
    }));
    
    // Snake pattern (array of 16 indices defining traversal order)
    this.snakePatterns = this.buildSnakePatterns();
    this.currentSnakeIndex = 0; // Which snake pattern to use (0-15)
    
    // Playback mode
    this.playbackMode = 'forward'; // 'forward', 'reverse', 'pingpong', 'random'
    this.pingPongDirection = 1; // 1 or -1
    
    // Note lane
    this.noteValues = new Array(16).fill(0.5); // 0-1 normalized
    this.noteLength = 16;
    this.noteDiv = '1/4'; // quarter note
    this.notePosition = 0; // Current position in snake pattern
    this.noteDivCounter = 0;
    
    // Gate lane
    this.gateEnabled = new Array(16).fill(true);
    this.gateLength = 16;
    this.gateDiv = '1/4';
    this.gatePosition = 0;
    this.gateDivCounter = 0;
    this.currentGateState = false;
    this.gatePulseWidth = 0.9; // 90% of the step length
    
    // UPGRADED: 4 Mod lanes
    this.modValues = [
      new Array(16).fill(0),
      new Array(16).fill(0),
      new Array(16).fill(0),
      new Array(16).fill(0)
    ];
    this.modLengths = [16, 16, 16, 16];
    this.modDivs = ['1/4', '1/4', '1/4', '1/4'];
    this.modPositions = [0, 0, 0, 0];
    this.modDivCounters = [0, 0, 0, 0];
    
    // Division multipliers relative to base clock (16th notes)
    this.divisionMap = {
      '1/16': 1,    // 1 sixteenth note
      '1/8': 2,     // 2 sixteenth notes
      '1/4': 4,     // 4 sixteenth notes
      '1/2': 8,     // 8 sixteenth notes  
      '1/1': 16,    // 16 sixteenth notes (whole note)
      '2/1': 32,    // 32 sixteenth notes (2 whole notes)
      '2/2': 64     // 64 sixteenth notes (4 whole notes)
    };
    
    console.log('✓ ReneSequencer initialized (4 mod lanes)');
  }
  
  // ========== TEMPO & CLOCK ==========
  
  calculateBasePeriod(bpm) {
    // Convert BPM to seconds per SIXTEENTH NOTE (smallest division)
    const msPerQuarterNote = 60000 / bpm;
    const msPerSixteenthNote = msPerQuarterNote / 4; // 4 sixteenth notes per quarter note
    return msPerSixteenthNote / 1000;
  }
  
  setTempo(bpm) {
    this.bpm = Math.max(10, Math.min(300, bpm));
    this.basePeriod = this.calculateBasePeriod(this.bpm);
    
    // Snap next tick to current time to avoid drift
    if (this.isRunning) {
      this.nextTickTime = this.audioContext.currentTime;
    }
    
    console.log(`René tempo: ${this.bpm} BPM (${(this.basePeriod * 1000).toFixed(1)}ms per 16th note)`);
  }
  
  getTempo() {
    return this.bpm;
  }
  
  // ========== SNAKE PATTERNS ==========
  
  buildSnakePatterns() {
    // Based on René manual page 15
    // Returns 16 different snake patterns as arrays of indices 0-15
    return [
      // Pattern 0: Simple forward
      [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      
      // Pattern 1: Classic snake (row by row, alternating direction)
      [0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12],
      
      // Pattern 2: Vertical snake
      [0,4,8,12,13,9,5,1,2,6,10,14,15,11,7,3],
      
      // Pattern 3: Diagonal
      [0,1,4,8,5,2,3,6,9,12,13,10,7,11,14,15],
      
      // Pattern 4: Spiral inward
      [0,1,2,3,7,11,15,14,13,12,8,4,5,6,10,9],
      
      // Pattern 5: Spiral outward
      [5,6,9,10,4,7,8,11,1,2,13,14,0,3,12,15],
      
      // Pattern 6: Zigzag horizontal
      [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      
      // Pattern 7: Zigzag vertical
      [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15],
      
      // Pattern 8: Double spiral
      [0,1,5,4,8,9,13,12,3,2,6,7,11,10,14,15],
      
      // Pattern 9: Corners
      [0,3,12,15,1,2,13,14,4,7,8,11,5,6,9,10],
      
      // Pattern 10: X pattern
      [0,1,2,3,5,9,6,10,4,8,7,11,12,13,14,15],
      
      // Pattern 11: Checkerboard
      [0,2,4,6,8,10,12,14,1,3,5,7,9,11,13,15],
      
      // Pattern 12: L-shapes
      [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15],
      
      // Pattern 13: Random-ish
      [0,5,10,15,3,6,9,12,1,4,7,14,2,11,8,13],
      
      // Pattern 14: Triangular
      [0,1,4,2,5,8,3,6,9,12,7,10,13,11,14,15],
      
      // Pattern 15: Complex weave
      [0,2,1,3,8,10,9,11,4,6,5,7,12,14,13,15]
    ];
  }
  
  setSnakePattern(index) {
    this.currentSnakeIndex = Math.max(0, Math.min(15, index));
    console.log(`Snake pattern: ${this.currentSnakeIndex}`);
  }
  
  getSnakePattern() {
    return this.snakePatterns[this.currentSnakeIndex];
  }
  
  // ========== PLAYBACK MODE ==========
  
  setPlaybackMode(mode) {
    const validModes = ['forward', 'reverse', 'pingpong', 'random'];
    if (validModes.includes(mode)) {
      this.playbackMode = mode;
      console.log(`Playback mode: ${mode}`);
    }
  }
  
  // ========== DATA SETTERS ==========
  
  setNoteValues(valuesArray) {
    if (valuesArray.length === 16) {
      this.noteValues = [...valuesArray];
    }
  }
  
  setGateValues(booleanArray) {
    if (booleanArray.length === 16) {
      this.gateEnabled = [...booleanArray];
    }
  }
  
  // UPGRADED: Set mod values for specific lane
  setModValues(laneIndex, valuesArray) {
    if (laneIndex >= 0 && laneIndex < 4 && valuesArray.length === 16) {
      this.modValues[laneIndex] = [...valuesArray];
    }
  }
  
  setStepEnabled(arrayOfBooleans) {
    if (arrayOfBooleans.length === 16) {
      for (let i = 0; i < 16; i++) {
        this.steps[i].enabled = arrayOfBooleans[i];
      }
    }
  }
  
  setLaneTiming({ lane, length, division }) {
    if (lane === 'note') {
      if (length !== undefined) this.noteLength = Math.max(1, Math.min(16, length));
      if (division !== undefined) this.noteDiv = division;
    } else if (lane === 'gate') {
      if (length !== undefined) this.gateLength = Math.max(1, Math.min(16, length));
      if (division !== undefined) this.gateDiv = division;
    } else if (lane.startsWith('mod')) {
      // Parse lane index: 'mod0', 'mod1', 'mod2', 'mod3'
      const laneIndex = parseInt(lane.replace('mod', ''));
      if (laneIndex >= 0 && laneIndex < 4) {
        if (length !== undefined) this.modLengths[laneIndex] = Math.max(1, Math.min(16, length));
        if (division !== undefined) this.modDivs[laneIndex] = division;
      }
    }
  }
  
  // ========== STEP ADVANCE LOGIC (BUG FIXED) ==========
  
  advancePosition(currentPos, length, mode) {
    const pattern = this.getSnakePattern();
    
    if (mode === 'random') {
      // Pick random enabled step within length
      const validIndices = [];
      for (let i = 0; i < length; i++) {
        const patternIdx = pattern[i];  // FIX: only use indices 0 to length-1
        if (this.steps[patternIdx].enabled) {
          validIndices.push(i);
        }
      }
      
      if (validIndices.length === 0) return 0;
      return validIndices[Math.floor(Math.random() * validIndices.length)];
    }
    
    if (mode === 'reverse') {
      let nextPos = currentPos - 1;
      if (nextPos < 0) nextPos = length - 1;
      
      // Skip disabled steps
      let attempts = 0;
      while (!this.steps[pattern[nextPos]].enabled && attempts < length) {  // FIX
        nextPos--;
        if (nextPos < 0) nextPos = length - 1;
        attempts++;
      }
      
      return nextPos;
    }
    
    if (mode === 'pingpong') {
      let nextPos = currentPos + this.pingPongDirection;
      
      // Bounce at boundaries
      if (nextPos >= length) {
        nextPos = length - 2;
        this.pingPongDirection = -1;
        if (nextPos < 0) nextPos = 0;
      } else if (nextPos < 0) {
        nextPos = 1;
        this.pingPongDirection = 1;
        if (nextPos >= length) nextPos = length - 1;
      }
      
      // Skip disabled steps
      let attempts = 0;
      while (!this.steps[pattern[nextPos]].enabled && attempts < length) {  // FIX
        nextPos += this.pingPongDirection;
        
        if (nextPos >= length) {
          nextPos = length - 2;
          this.pingPongDirection = -1;
        } else if (nextPos < 0) {
          nextPos = 1;
          this.pingPongDirection = 1;
        }
        
        attempts++;
        if (attempts >= length) break;
      }
      
      return Math.max(0, Math.min(length - 1, nextPos));
    }
    
    // Forward (default)
    let nextPos = (currentPos + 1) % length;
    
    // Skip disabled steps
    let attempts = 0;
    while (!this.steps[pattern[nextPos]].enabled && attempts < length) {  // FIX
      nextPos = (nextPos + 1) % length;
      attempts++;
    }
    
    return nextPos;
  }
  
  // ========== SCHEDULING ==========
  
  schedule() {
    const currentTime = this.audioContext.currentTime;
    
    while (this.nextTickTime < currentTime + this.lookahead) {
      // Process each lane
      this.processTick(this.nextTickTime);
      
      // Advance to next tick
      this.nextTickTime += this.basePeriod;
    }
  }
  
  processTick(time) {
    const pattern = this.getSnakePattern();
    
    // Note lane
    this.noteDivCounter++;
    if (this.noteDivCounter >= this.divisionMap[this.noteDiv]) {
      this.noteDivCounter = 0;
      
      const stepIdx = pattern[this.notePosition];
      if (this.steps[stepIdx].enabled) {
        const value = this.noteValues[stepIdx];
        if (this.onNote) {
          this.onNote({ value, time, step: stepIdx });
        }
      }
      
      // Store position before advancing
      const oldPosition = this.notePosition;
      
      // Advance to next position
      this.notePosition = this.advancePosition(this.notePosition, this.noteLength, this.playbackMode);
      
      // Detect when we've wrapped back to position 0 (cycle complete)
      if (this.notePosition === 0 && oldPosition !== 0) {
        if (this.onNoteCycle) {
          this.onNoteCycle({ time });
        }
      }
    }
    
    // Gate lane
    this.gateDivCounter++;
    if (this.gateDivCounter >= this.divisionMap[this.gateDiv]) {
      this.gateDivCounter = 0;

      const stepIdx = pattern[this.gatePosition];
      const shouldBeOn = this.steps[stepIdx].enabled && this.gateEnabled[stepIdx];

      if (this.onGate) {
        if (shouldBeOn) {
          // Always send a pulse per step so the envelope retriggers even on consecutive gates
          this.onGate({ isOn: true, time, step: stepIdx });

          const gatePeriod = this.basePeriod * this.divisionMap[this.gateDiv];
          const gateOffTime = time + (gatePeriod * this.gatePulseWidth);
          this.onGate({ isOn: false, time: gateOffTime, step: stepIdx });
          this.currentGateState = true;
        } else if (this.currentGateState) {
          // Ensure we release if a previously high gate turns off
          this.onGate({ isOn: false, time, step: stepIdx });
          this.currentGateState = false;
        }
      }

      this.gatePosition = this.advancePosition(this.gatePosition, this.gateLength, this.playbackMode);
    }
    
    // UPGRADED: 4 Mod lanes
    for (let laneIndex = 0; laneIndex < 4; laneIndex++) {
      this.modDivCounters[laneIndex]++;
      if (this.modDivCounters[laneIndex] >= this.divisionMap[this.modDivs[laneIndex]]) {
        this.modDivCounters[laneIndex] = 0;
        
        const stepIdx = pattern[this.modPositions[laneIndex]];
        if (this.steps[stepIdx].enabled) {
          const value = this.modValues[laneIndex][stepIdx];
          if (this.onMod) {
            this.onMod({ laneIndex, value, time, step: stepIdx });
          }
        }
        
        this.modPositions[laneIndex] = this.advancePosition(
          this.modPositions[laneIndex], 
          this.modLengths[laneIndex], 
          this.playbackMode
        );
      }
    }
  }
  
  // ========== TRANSPORT ==========
  
  setRunning(isRunning) {
    if (isRunning === this.isRunning) return;
    
    this.isRunning = isRunning;
    
    if (isRunning) {
      this.nextTickTime = this.audioContext.currentTime;
      this.scheduleInterval = setInterval(() => this.schedule(), 25); // Check every 25ms
      console.log('▶ René sequencer started');
    } else {
      if (this.scheduleInterval) {
        clearInterval(this.scheduleInterval);
        this.scheduleInterval = null;
      }
      
      // Send gate off
      if (this.currentGateState && this.onGate) {
        this.onGate({ isOn: false, time: this.audioContext.currentTime });
      }
      this.currentGateState = false;
      
      console.log('⏸ René sequencer stopped');
    }
  }
  
  reset() {
    this.notePosition = 0;
    this.gatePosition = 0;
    this.modPositions = [0, 0, 0, 0];
    this.noteDivCounter = 0;
    this.gateDivCounter = 0;
    this.modDivCounters = [0, 0, 0, 0];
    this.pingPongDirection = 1;
    
    // Send gate off
    if (this.currentGateState && this.onGate) {
      this.onGate({ isOn: false, time: this.audioContext.currentTime });
    }
    this.currentGateState = false;
    
    console.log('↻ René sequencer reset');
  }
  
  // ========== STATE GETTERS ==========
  
  getCurrentSteps() {
    const pattern = this.getSnakePattern();
    return {
      note: pattern[this.notePosition],
      gate: pattern[this.gatePosition],
      mod0: pattern[this.modPositions[0]],
      mod1: pattern[this.modPositions[1]],
      mod2: pattern[this.modPositions[2]],
      mod3: pattern[this.modPositions[3]]
    };
  }
  
  // ========== PATTERN SYSTEM SUPPORT ==========
  
  getState() {
    return {
      noteValues: [...this.noteValues],
      gateEnabled: [...this.gateEnabled],
      modValues: this.modValues.map(arr => [...arr]),
      noteLength: this.noteLength,
      gateLength: this.gateLength,
      modLengths: [...this.modLengths],
      noteDiv: this.noteDiv,
      gateDiv: this.gateDiv,
      modDivs: [...this.modDivs],
      snakePattern: this.currentSnakeIndex,
      playbackMode: this.playbackMode,
      stepEnabled: this.steps.map(s => s.enabled),
      tempo: this.bpm
    };
  }
  
  setState(state) {
    if (state.noteValues) this.noteValues = [...state.noteValues];
    if (state.gateEnabled) this.gateEnabled = [...state.gateEnabled];
    if (state.modValues) this.modValues = state.modValues.map(arr => [...arr]);
    if (state.noteLength !== undefined) this.noteLength = state.noteLength;
    if (state.gateLength !== undefined) this.gateLength = state.gateLength;
    if (state.modLengths) this.modLengths = [...state.modLengths];
    if (state.noteDiv) this.noteDiv = state.noteDiv;
    if (state.gateDiv) this.gateDiv = state.gateDiv;
    if (state.modDivs) this.modDivs = [...state.modDivs];
    if (state.snakePattern !== undefined) this.setSnakePattern(state.snakePattern);
    if (state.playbackMode) this.setPlaybackMode(state.playbackMode);
    if (state.stepEnabled) this.setStepEnabled(state.stepEnabled);
    if (state.tempo !== undefined) this.setTempo(state.tempo);
    
    console.log('✓ René state restored from pattern');
  }
}
