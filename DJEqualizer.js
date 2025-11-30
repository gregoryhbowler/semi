/**
 * DJEqualizer
 * DJ-style 3-band equalizer with kill switches
 * 
 * Features:
 * - Low shelf (100 Hz default)
 * - Mid peak (1000 Hz default)
 * - High shelf (5000 Hz default)
 * - Individual gain control per band (-24 to +12 dB)
 * - Kill switches for instant muting of frequency bands
 * - Smooth parameter changes with exponential ramping
 * 
 * Usage:
 *   const eq = new DJEqualizer(audioContext);
 *   sourceNode.connect(eq.input);
 *   eq.output.connect(destination);
 *   eq.setLowGain(6);
 *   eq.setMidKill(true);
 */
export class DJEqualizer {
    /**
     * @param {AudioContext} ctx - Web Audio context
     * @param {Object} options - Configuration options
     * @param {number} options.lowFreq - Low shelf frequency (default: 100 Hz)
     * @param {number} options.midFreq - Mid peak frequency (default: 1000 Hz)
     * @param {number} options.highFreq - High shelf frequency (default: 5000 Hz)
     * @param {number} options.midQ - Mid band Q factor (default: 1.0)
     */
    constructor(ctx, options = {}) {
        this.ctx = ctx;
        
        // Configuration
        this.config = {
            lowFreq: options.lowFreq || 100,
            midFreq: options.midFreq || 1000,
            highFreq: options.highFreq || 5000,
            midQ: options.midQ || 1.0
        };
        
        // === Input ===
        this.input = ctx.createGain();
        this.input.gain.value = 1.0;
        
        // === LOW BAND (Shelf) ===
        this.lowFilter = ctx.createBiquadFilter();
        this.lowFilter.type = 'lowshelf';
        this.lowFilter.frequency.value = this.config.lowFreq;
        this.lowFilter.gain.value = 0;
        
        this.lowGain = ctx.createGain();
        this.lowGain.gain.value = 1.0;
        
        this.lowKilled = false;
        this.lowAmount = 0;
        
        // === MID BAND (Peak) ===
        this.midFilter = ctx.createBiquadFilter();
        this.midFilter.type = 'peaking';
        this.midFilter.frequency.value = this.config.midFreq;
        this.midFilter.Q.value = this.config.midQ;
        this.midFilter.gain.value = 0;
        
        this.midGain = ctx.createGain();
        this.midGain.gain.value = 1.0;
        
        this.midKilled = false;
        this.midAmount = 0;
        
        // === HIGH BAND (Shelf) ===
        this.highFilter = ctx.createBiquadFilter();
        this.highFilter.type = 'highshelf';
        this.highFilter.frequency.value = this.config.highFreq;
        this.highFilter.gain.value = 0;
        
        this.highGain = ctx.createGain();
        this.highGain.gain.value = 1.0;
        
        this.highKilled = false;
        this.highAmount = 0;
        
        // === Output ===
        this.output = ctx.createGain();
        this.output.gain.value = 1.0;
        
        // === Signal Routing ===
        // Input → Low Filter → Low Gain → Mid Filter → Mid Gain → High Filter → High Gain → Output
        this.input.connect(this.lowFilter);
        this.lowFilter.connect(this.lowGain);
        this.lowGain.connect(this.midFilter);
        this.midFilter.connect(this.midGain);
        this.midGain.connect(this.highFilter);
        this.highFilter.connect(this.highGain);
        this.highGain.connect(this.output);
    }
    
    /**
     * Set low band gain in dB
     * @param {number} gainDB - Gain in decibels (-24 to +12)
     */
    setLowGain(gainDB) {
        const now = this.ctx.currentTime;
        this.lowAmount = gainDB;
        
        if (!this.lowKilled) {
            this.lowFilter.gain.setTargetAtTime(gainDB, now, 0.01);
        }
    }
    
    /**
     * Set low band frequency
     * @param {number} freq - Frequency in Hz
     */
    setLowFrequency(freq) {
        const now = this.ctx.currentTime;
        this.config.lowFreq = freq;
        this.lowFilter.frequency.setTargetAtTime(freq, now, 0.01);
    }
    
    /**
     * Toggle low band kill switch
     * @param {boolean} kill - True to kill/mute the band
     */
    setLowKill(kill) {
        const now = this.ctx.currentTime;
        this.lowKilled = kill;
        this.lowGain.gain.setTargetAtTime(kill ? 0 : 1, now, 0.01);
    }
    
    /**
     * Set mid band gain in dB
     * @param {number} gainDB - Gain in decibels (-24 to +12)
     */
    setMidGain(gainDB) {
        const now = this.ctx.currentTime;
        this.midAmount = gainDB;
        
        if (!this.midKilled) {
            this.midFilter.gain.setTargetAtTime(gainDB, now, 0.01);
        }
    }
    
    /**
     * Set mid band frequency
     * @param {number} freq - Frequency in Hz
     */
    setMidFrequency(freq) {
        const now = this.ctx.currentTime;
        this.config.midFreq = freq;
        this.midFilter.frequency.setTargetAtTime(freq, now, 0.01);
    }
    
    /**
     * Set mid band Q (bandwidth)
     * @param {number} q - Q factor (0.1 to 10, default 1.0)
     */
    setMidQ(q) {
        const now = this.ctx.currentTime;
        this.config.midQ = q;
        this.midFilter.Q.setTargetAtTime(q, now, 0.01);
    }
    
    /**
     * Toggle mid band kill switch
     * @param {boolean} kill - True to kill/mute the band
     */
    setMidKill(kill) {
        const now = this.ctx.currentTime;
        this.midKilled = kill;
        this.midGain.gain.setTargetAtTime(kill ? 0 : 1, now, 0.01);
    }
    
    /**
     * Set high band gain in dB
     * @param {number} gainDB - Gain in decibels (-24 to +12)
     */
    setHighGain(gainDB) {
        const now = this.ctx.currentTime;
        this.highAmount = gainDB;
        
        if (!this.highKilled) {
            this.highFilter.gain.setTargetAtTime(gainDB, now, 0.01);
        }
    }
    
    /**
     * Set high band frequency
     * @param {number} freq - Frequency in Hz
     */
    setHighFrequency(freq) {
        const now = this.ctx.currentTime;
        this.config.highFreq = freq;
        this.highFilter.frequency.setTargetAtTime(freq, now, 0.01);
    }
    
    /**
     * Toggle high band kill switch
     * @param {boolean} kill - True to kill/mute the band
     */
    setHighKill(kill) {
        const now = this.ctx.currentTime;
        this.highKilled = kill;
        this.highGain.gain.setTargetAtTime(kill ? 0 : 1, now, 0.01);
    }
    
    /**
     * Reset all bands to flat response
     */
    reset() {
        this.setLowGain(0);
        this.setMidGain(0);
        this.setHighGain(0);
        this.setLowKill(false);
        this.setMidKill(false);
        this.setHighKill(false);
    }
    
    /**
     * Get current state of all parameters
     * @returns {Object} Current parameter values
     */
    getState() {
        return {
            low: {
                gain: this.lowAmount,
                frequency: this.config.lowFreq,
                killed: this.lowKilled
            },
            mid: {
                gain: this.midAmount,
                frequency: this.config.midFreq,
                q: this.config.midQ,
                killed: this.midKilled
            },
            high: {
                gain: this.highAmount,
                frequency: this.config.highFreq,
                killed: this.highKilled
            }
        };
    }
    
    /**
     * Disconnect and cleanup
     */
    destroy() {
        this.input.disconnect();
        this.lowFilter.disconnect();
        this.lowGain.disconnect();
        this.midFilter.disconnect();
        this.midGain.disconnect();
        this.highFilter.disconnect();
        this.highGain.disconnect();
        this.output.disconnect();
    }
}
