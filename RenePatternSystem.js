// RenePatternSystem.js
// Pattern management system for René sequencer
// 8 patterns with linear playback (with repeats) or manual trigger mode

export class RenePatternSystem {
  constructor(reneSequencer, options = {}) {
    this.reneSequencer = reneSequencer;
    
    // 8 pattern slots
    this.patterns = Array.from({ length: 8 }, () => null);
    
    // Pattern metadata
    this.patternNames = Array.from({ length: 8 }, (_, i) => `Pattern ${i + 1}`);
    
    // Playback state
    this.playbackEnabled = false;
    this.playbackMode = 'linear'; // 'linear' or 'manual'
    this.currentPatternIndex = 0;
    this.patternRepeats = [1, 1, 1, 1, 1, 1, 1, 1]; // How many times each pattern repeats
    this.currentRepeatCount = 0;
    
    // Clipboard for copy/paste
    this.clipboard = null;
    
    // Callback when pattern is recalled (for UI updates)
    this.onPatternRecall = options.onPatternRecall || null;
    
    console.log('✓ René Pattern System initialized (8 patterns)');
  }
  
  // ========== PATTERN OPERATIONS ==========
  
  /**
   * Capture current René state to a pattern slot
   */
  setPattern(index) {
    if (index < 0 || index >= 8) return;
    
    this.patterns[index] = this.reneSequencer.getState();
    console.log(`✓ Pattern ${index + 1} set`);
    
    return true;
  }
  
  /**
   * Load a pattern into René
   */
  recallPattern(index) {
    if (index < 0 || index >= 8) return false;
    if (!this.patterns[index]) {
      console.warn(`Pattern ${index + 1} is empty`);
      return false;
    }
    
    this.reneSequencer.setState(this.patterns[index]);
    this.currentPatternIndex = index;
    this.currentRepeatCount = 0;
    
    console.log(`✓ Pattern ${index + 1} recalled`);
    
    // Trigger callback for UI updates
    if (this.onPatternRecall) {
      this.onPatternRecall(index);
    }
    
    return true;
  }
  
  /**
   * Copy a pattern to clipboard
   */
  copyPattern(index) {
    if (index < 0 || index >= 8) return false;
    if (!this.patterns[index]) {
      console.warn(`Pattern ${index + 1} is empty`);
      return false;
    }
    
    this.clipboard = JSON.parse(JSON.stringify(this.patterns[index]));
    console.log(`✓ Pattern ${index + 1} copied to clipboard`);
    return true;
  }
  
  /**
   * Paste clipboard contents to a pattern slot
   */
  pastePattern(index) {
    if (index < 0 || index >= 8) return false;
    if (!this.clipboard) {
      console.warn('Clipboard is empty');
      return false;
    }
    
    this.patterns[index] = JSON.parse(JSON.stringify(this.clipboard));
    console.log(`✓ Clipboard pasted to Pattern ${index + 1}`);
    return true;
  }
  
  /**
   * Delete a pattern (set to null)
   */
  deletePattern(index) {
    if (index < 0 || index >= 8) return false;
    
    this.patterns[index] = null;
    console.log(`✓ Pattern ${index + 1} deleted`);
    return true;
  }
  
  /**
   * Clear all patterns
   */
  clearAllPatterns() {
    this.patterns = Array.from({ length: 8 }, () => null);
    this.clipboard = null;
    console.log('✓ All patterns cleared');
    return true;
  }
  
  /**
   * Check if a pattern slot is empty
   */
  isPatternEmpty(index) {
    if (index < 0 || index >= 8) return true;
    return this.patterns[index] === null;
  }
  
  /**
   * Set pattern name
   */
  setPatternName(index, name) {
    if (index < 0 || index >= 8) return false;
    this.patternNames[index] = name || `Pattern ${index + 1}`;
    return true;
  }
  
  /**
   * Get pattern name
   */
  getPatternName(index) {
    if (index < 0 || index >= 8) return '';
    return this.patternNames[index];
  }
  
  /**
   * Set how many times a pattern repeats before advancing
   */
  setPatternRepeats(index, repeats) {
    if (index < 0 || index >= 8) return false;
    this.patternRepeats[index] = Math.max(1, Math.min(99, repeats));
    return true;
  }
  
  // ========== PLAYBACK CONTROL ==========
  
  /**
   * Enable/disable pattern playback
   */
  setPlaybackEnabled(enabled) {
    this.playbackEnabled = enabled;
    
    if (enabled) {
      // Start from first non-empty pattern
      this.currentPatternIndex = 0;
      for (let i = 0; i < 8; i++) {
        if (!this.isPatternEmpty(i)) {
          this.currentPatternIndex = i;
          break;
        }
      }
      this.currentRepeatCount = 0;
      this.recallPattern(this.currentPatternIndex);
      console.log('▶ Pattern playback enabled');
    } else {
      console.log('⏸ Pattern playback disabled');
    }
  }
  
  /**
   * Set playback mode
   */
  setPlaybackMode(mode) {
    if (mode === 'linear' || mode === 'manual') {
      this.playbackMode = mode;
      console.log(`Pattern playback mode: ${mode}`);
    }
  }
  
  /**
   * Manually trigger next pattern (manual mode)
   */
  triggerNextPattern() {
    if (!this.playbackEnabled || this.playbackMode !== 'manual') return;
    
    this.advanceToNextPattern();
  }
  
  /**
   * Manually trigger specific pattern (manual mode)
   */
  triggerPattern(index) {
    if (!this.playbackEnabled || this.playbackMode !== 'manual') return;
    if (index < 0 || index >= 8) return;
    if (this.isPatternEmpty(index)) return;
    
    this.recallPattern(index);
  }
  
  /**
   * Called by René when it completes a cycle (for linear playback)
   */
  onReneCycleComplete() {
    if (!this.playbackEnabled || this.playbackMode !== 'linear') return;
    
    this.currentRepeatCount++;
    
    if (this.currentRepeatCount >= this.patternRepeats[this.currentPatternIndex]) {
      // Move to next pattern
      this.advanceToNextPattern();
    } else {
      console.log(`Pattern ${this.currentPatternIndex + 1} repeat ${this.currentRepeatCount}/${this.patternRepeats[this.currentPatternIndex]}`);
    }
  }
  
  /**
   * Advance to next non-empty pattern
   */
  advanceToNextPattern() {
    let startIndex = this.currentPatternIndex;
    let nextIndex = (this.currentPatternIndex + 1) % 8;
    
    // Find next non-empty pattern
    while (nextIndex !== startIndex) {
      if (!this.isPatternEmpty(nextIndex)) {
        this.recallPattern(nextIndex);
        return;
      }
      nextIndex = (nextIndex + 1) % 8;
    }
    
    // If we're back at start, just repeat current pattern
    this.currentRepeatCount = 0;
    console.log('↻ Pattern sequence looped');
  }
  
  // ========== STATE GETTERS ==========
  
  getCurrentPatternIndex() {
    return this.currentPatternIndex;
  }
  
  getPlaybackState() {
    return {
      enabled: this.playbackEnabled,
      mode: this.playbackMode,
      currentPattern: this.currentPatternIndex,
      repeatCount: this.currentRepeatCount,
      maxRepeats: this.patternRepeats[this.currentPatternIndex]
    };
  }
  
  getAllPatternInfo() {
    return this.patterns.map((pattern, i) => ({
      index: i,
      name: this.patternNames[i],
      isEmpty: pattern === null,
      repeats: this.patternRepeats[i],
      isCurrent: i === this.currentPatternIndex
    }));
  }
  
  // ========== SAVE/LOAD ==========
  
  /**
   * Export all patterns to JSON
   */
  exportPatterns() {
    return {
      patterns: this.patterns,
      patternNames: this.patternNames,
      patternRepeats: this.patternRepeats
    };
  }
  
  /**
   * Import patterns from JSON
   */
  importPatterns(data) {
    if (!data) return false;
    
    if (data.patterns) this.patterns = data.patterns;
    if (data.patternNames) this.patternNames = data.patternNames;
    if (data.patternRepeats) this.patternRepeats = data.patternRepeats;
    
    console.log('✓ Patterns imported');
    return true;
  }
}
