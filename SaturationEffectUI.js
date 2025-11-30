/**
 * SaturationEffectUI - Saturation effect with UI
 */
import { SaturationEffect } from './SaturationEffect.js';

export class SaturationEffectUI {
    constructor(audioContext) {
        this.context = audioContext;
        this.sat = new SaturationEffect(audioContext);
        this.bypassed = true;
        this.uiContainer = null;
        
        this.input = audioContext.createGain();
        this.output = audioContext.createGain();
        this.dryGain = audioContext.createGain();
        this.wetGain = audioContext.createGain();
        
        this.input.connect(this.dryGain);
        this.dryGain.connect(this.output);
        this.dryGain.gain.value = 1;
        this.wetGain.gain.value = 0;
        
        this.input.connect(this.sat.input);
        this.sat.output.connect(this.wetGain);
        this.wetGain.connect(this.output);
    }
    
    setBypass(bypassed) {
        this.bypassed = bypassed;
        const now = this.context.currentTime;
        
        if (bypassed) {
            this.dryGain.gain.linearRampToValueAtTime(1, now + 0.02);
            this.wetGain.gain.linearRampToValueAtTime(0, now + 0.02);
        } else {
            this.dryGain.gain.linearRampToValueAtTime(0, now + 0.02);
            this.wetGain.gain.linearRampToValueAtTime(1, now + 0.02);
        }
        
        if (this.uiContainer) {
            this.uiContainer.classList.toggle('bypassed', this.bypassed);
        }
    }
    
    createUI() {
        if (this.uiContainer) return this.uiContainer;
        
        const container = document.createElement('div');
        container.className = 'effect-module saturation';
        container.classList.toggle('bypassed', this.bypassed);
        
        container.innerHTML = `
            <div class="effect-header">
                <h3 class="effect-title">Saturation</h3>
                <label class="effect-bypass">
                    <input type="checkbox" class="bypass-toggle" ${this.bypassed ? 'checked' : ''}>
                    <span>Bypass</span>
                </label>
            </div>
            
            <div class="effect-controls">
                <div class="mode-selector">
                    <button class="mode-btn active" data-mode="tape">Tape</button>
                    <button class="mode-btn" data-mode="triode">Triode</button>
                    <button class="mode-btn" data-mode="pentode">Pentode</button>
                    <button class="mode-btn" data-mode="transformer">Transformer</button>
                </div>
                
                <div class="param-control">
                    <label>Drive</label>
                    <input type="range" class="drive-control" min="0" max="1" step="0.01" value="0">
                    <span class="param-value">0%</span>
                </div>
                
                <div class="param-control">
                    <label>Bias</label>
                    <input type="range" class="bias-control" min="-1" max="1" step="0.01" value="0">
                    <span class="param-value">0.00</span>
                </div>
                
                <div class="param-control">
                    <label>Mix</label>
                    <input type="range" class="mix-control" min="0" max="1" step="0.01" value="1">
                    <span class="param-value">100%</span>
                </div>
                
                <div class="harmonics-selector">
                    <label>Harmonics:</label>
                    <button class="harm-btn active" data-harm="even">Even</button>
                    <button class="harm-btn" data-harm="odd">Odd</button>
                    <button class="harm-btn" data-harm="both">Both</button>
                </div>
            </div>
        `;
        
        this.uiContainer = container;
        this.attachListeners();
        return container;
    }
    
    attachListeners() {
        const container = this.uiContainer;
        
        container.querySelector('.bypass-toggle').addEventListener('change', (e) => {
            this.setBypass(e.target.checked);
        });
        
        // Mode buttons
        container.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                container.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.sat.setMode(btn.dataset.mode);
            });
        });
        
        // Drive
        const drive = container.querySelector('.drive-control');
        drive.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.sat.setDrive(val);
            e.target.nextElementSibling.textContent = `${Math.round(val * 100)}%`;
        });
        
        // Bias
        const bias = container.querySelector('.bias-control');
        bias.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.sat.setBias(val);
            e.target.nextElementSibling.textContent = val.toFixed(2);
        });
        
        // Mix
        const mix = container.querySelector('.mix-control');
        mix.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.sat.setMix(val);
            e.target.nextElementSibling.textContent = `${Math.round(val * 100)}%`;
        });
        
        // Harmonics
        container.querySelectorAll('.harm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                container.querySelectorAll('.harm-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.sat.setHarmonics(btn.dataset.harm);
            });
        });
    }
}
