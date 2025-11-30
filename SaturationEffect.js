/**
 * SaturationEffect
 * Culture Vulture-inspired saturation/distortion effect
 * 
 * Features:
 * - Multiple saturation modes: tape, triode, pentode, transformer
 * - Drive control (0-1) with automatic gain compensation
 * - Bias control (-1 to +1) for asymmetric clipping
 * - Dry/wet mix control
 * - Harmonic emphasis: even, odd, or both
 * - Parallel wet/dry routing for transparent mixing
 * 
 * Usage:
 *   const sat = new SaturationEffect(audioContext);
 *   sourceNode.connect(sat.input);
 *   sat.output.connect(destination);
 *   sat.setMode('triode');
 *   sat.setDrive(0.5);
 *   sat.setBias(0.2);
 */
export class SaturationEffect {
    /**
     * @param {AudioContext} ctx - Web Audio context
     * @param {Object} options - Configuration options
     * @param {string} options.mode - Initial mode: 'tape', 'triode', 'pentode', 'transformer'
     * @param {number} options.drive - Initial drive (0-1, default: 0)
     * @param {number} options.bias - Initial bias (-1 to 1, default: 0)
     * @param {number} options.mix - Initial dry/wet mix (0-1, default: 1)
     * @param {string} options.harmonics - Initial harmonics: 'even', 'odd', 'both'
     */
    constructor(ctx, options = {}) {
        this.ctx = ctx;
        
        // === Input ===
        this.input = ctx.createGain();
        this.input.gain.value = 1.0;
        
        // === Saturation Parameters ===
        this.mode = options.mode || 'tape';
        this.drive = options.drive !== undefined ? options.drive : 0;
        this.bias = options.bias !== undefined ? options.bias : 0;
        this.mix = options.mix !== undefined ? options.mix : 1.0;
        this.harmonics = options.harmonics || 'even';
        
        // === Saturation Chain ===
        this.inputGain = ctx.createGain();
        this.inputGain.gain.value = 1.0;
        
        this.shaper = ctx.createWaveShaper();
        this.shaper.oversample = '4x'; // High quality oversampling
        
        this.outputGain = ctx.createGain();
        this.outputGain.gain.value = 1.0;
        
        // === Parallel Dry/Wet Routing ===
        this.dryGain = ctx.createGain();
        this.dryGain.gain.value = 0;
        
        this.wetGain = ctx.createGain();
        this.wetGain.gain.value = 1.0;
        
        // === Output ===
        this.output = ctx.createGain();
        this.output.gain.value = 1.0;
        
        // === Signal Routing ===
        // Dry path: Input → Dry Gain → Output
        this.input.connect(this.dryGain);
        this.dryGain.connect(this.output);
        
        // Wet path: Input → Input Gain → Shaper → Output Gain → Wet Gain → Output
        this.input.connect(this.inputGain);
        this.inputGain.connect(this.shaper);
        this.shaper.connect(this.outputGain);
        this.outputGain.connect(this.wetGain);
        this.wetGain.connect(this.output);
        
        // Initialize waveshaping curve
        this.updateCurve();
    }
    
    /**
     * Set saturation mode
     * @param {string} mode - 'tape', 'triode', 'pentode', or 'transformer'
     */
    setMode(mode) {
        const validModes = ['tape', 'triode', 'pentode', 'transformer'];
        if (!validModes.includes(mode)) {
            console.warn(`Invalid saturation mode: ${mode}. Using 'tape'.`);
            mode = 'tape';
        }
        
        this.mode = mode;
        this.updateCurve();
    }
    
    /**
     * Set drive amount
     * @param {number} drive - Drive amount (0-1)
     */
    setDrive(drive) {
        this.drive = Math.max(0, Math.min(1, drive));
        this.updateCurve();
    }
    
    /**
     * Set bias (asymmetric clipping)
     * @param {number} bias - Bias amount (-1 to 1)
     */
    setBias(bias) {
        this.bias = Math.max(-1, Math.min(1, bias));
        this.updateCurve();
    }
    
    /**
     * Set dry/wet mix
     * @param {number} mix - Mix amount (0 = dry, 1 = wet)
     */
    setMix(mix) {
        this.mix = Math.max(0, Math.min(1, mix));
        this.updateMix();
    }
    
    /**
     * Set harmonic emphasis
     * @param {string} harmonics - 'even', 'odd', or 'both'
     */
    setHarmonics(harmonics) {
        const validHarmonics = ['even', 'odd', 'both'];
        if (!validHarmonics.includes(harmonics)) {
            console.warn(`Invalid harmonics: ${harmonics}. Using 'even'.`);
            harmonics = 'even';
        }
        
        this.harmonics = harmonics;
        this.updateCurve();
    }
    
    /**
     * Update the waveshaping curve based on current parameters
     */
    updateCurve() {
        const samples = 2048;
        const curve = new Float32Array(samples);
        
        // Drive maps to pre-gain (1-20x)
        const preGain = 1 + this.drive * 19;
        
        for (let i = 0; i < samples; i++) {
            let x = (i * 2 / (samples - 1)) - 1;
            
            // Apply bias (DC offset before clipping)
            x += this.bias * 0.3;
            
            // Apply pre-gain
            x *= preGain;
            
            // Apply saturation formula based on mode
            let y;
            switch(this.mode) {
                case 'tape':
                    y = this._tapeFormula(x);
                    break;
                case 'triode':
                    y = this._triodeFormula(x);
                    break;
                case 'pentode':
                    y = this._pentodeFormula(x);
                    break;
                case 'transformer':
                    y = this._transformerFormula(x);
                    break;
                default:
                    y = x;
            }
            
            // Remove bias from output
            y -= this.bias * 0.2;
            
            // Soft limit final output
            y = Math.tanh(y);
            
            curve[i] = y;
        }
        
        this.shaper.curve = curve;
        this.updateMix();
    }
    
    /**
     * Update dry/wet mix and gain compensation
     */
    updateMix() {
        const now = this.ctx.currentTime;
        
        // Set dry/wet levels
        this.wetGain.gain.setTargetAtTime(this.mix, now, 0.01);
        this.dryGain.gain.setTargetAtTime(1 - this.mix, now, 0.01);
        
        // Gain compensation based on drive
        // As drive increases, reduce output gain to maintain perceived loudness
        const driveCompensation = 1 / (1 + this.drive * 0.3);
        this.outputGain.gain.setTargetAtTime(driveCompensation, now, 0.01);
    }
    
    /**
     * Tape saturation formula - gentle, musical compression
     */
    _tapeFormula(x) {
        // Gentle arctan-based saturation
        let y = (2 / Math.PI) * Math.atan(x * 1.5);
        
        if (this.harmonics === 'even') {
            // Emphasize even harmonics (square the signal gently)
            y = Math.sign(y) * Math.pow(Math.abs(y), 0.8);
        } else if (this.harmonics === 'odd') {
            // Emphasize odd harmonics (cube the signal)
            y = Math.pow(y, 3) * 0.7 + y * 0.3;
        }
        
        return y;
    }
    
    /**
     * Triode tube formula - warm, asymmetric, even harmonics
     */
    _triodeFormula(x) {
        let y;
        
        if (x > 0) {
            // Positive side: softer, more compressed
            y = 1.2 * x / (1 + Math.abs(x * 1.2));
        } else {
            // Negative side: slightly harder
            y = 1.5 * x / (1 + Math.abs(x * 1.5));
        }
        
        if (this.harmonics === 'even') {
            // Even harmonics: square law
            y = Math.sign(y) * Math.pow(Math.abs(y), 0.75);
        }
        
        return y * 0.9;
    }
    
    /**
     * Pentode tube formula - brighter, more aggressive
     */
    _pentodeFormula(x) {
        // Sharper, more aggressive clipping
        let y = 1.8 * x / (1 + Math.pow(Math.abs(x), 1.5));
        
        if (this.harmonics === 'odd') {
            // Odd harmonics: add some cubic
            y = y * 0.7 + Math.pow(y, 3) * 0.3;
        }
        
        return y;
    }
    
    /**
     * Transformer saturation formula - thick, symmetric compression
     */
    _transformerFormula(x) {
        // Symmetric, hard clipping with soft knee
        const knee = 0.5;
        let y;
        
        if (Math.abs(x) < knee) {
            y = x;
        } else {
            y = Math.sign(x) * (knee + (Math.abs(x) - knee) / (1 + Math.pow((Math.abs(x) - knee) * 2, 2)));
        }
        
        if (this.harmonics === 'both') {
            // Both even and odd
            y = y * 0.6 + Math.pow(y, 2) * Math.sign(y) * 0.2 + Math.pow(y, 3) * 0.2;
        }
        
        return y;
    }
    
    /**
     * Get current state of all parameters
     * @returns {Object} Current parameter values
     */
    getState() {
        return {
            mode: this.mode,
            drive: this.drive,
            bias: this.bias,
            mix: this.mix,
            harmonics: this.harmonics
        };
    }
    
    /**
     * Reset to default values
     */
    reset() {
        this.setMode('tape');
        this.setDrive(0);
        this.setBias(0);
        this.setMix(1.0);
        this.setHarmonics('even');
    }
    
    /**
     * Disconnect and cleanup
     */
    destroy() {
        this.input.disconnect();
        this.inputGain.disconnect();
        this.shaper.disconnect();
        this.outputGain.disconnect();
        this.dryGain.disconnect();
        this.wetGain.disconnect();
        this.output.disconnect();
    }
}
