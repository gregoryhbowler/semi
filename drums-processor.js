class DrumsProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'kickPitch', defaultValue: 50 },
            { name: 'kickDecay', defaultValue: 0.5 },
            { name: 'snarePitch', defaultValue: 220 },
            { name: 'snareDecay', defaultValue: 0.2 },
        ];
    }

    constructor() {
        super();
        
        // Kick State
        this.kPhase = 0;
        this.kEnvVal = 0;
        
        // Snare State
        this.sPhase = 0;
        this.sEnvVal = 0;
        
        // Filter State (for Snare Highpass)
        this.hpX1 = 0;
        this.hpY1 = 0;
        
        // Constants
        this.twoPI = 2 * Math.PI;
    }

    process(inputs, outputs, parameters) {
        const outputL = outputs[0][0];
        const outputR = outputs[0][1];
        
        // Inputs from DrumsSequencerNode
        // input[0] channel 0 is kick trigger, channel 1 is snare trigger
        const input = inputs[0];
        const kickTrig = input && input.length > 0 ? input[0] : null;
        const snareTrig = input && input.length > 1 ? input[1] : null;

        // Params (k-rate processing for efficiency on envelopes/pitch)
        const kPitch = parameters.kickPitch[0];
        const kDecay = parameters.kickDecay[0];
        const sPitch = parameters.snarePitch[0];
        const sDecay = parameters.snareDecay[0];

        // Envelope Coefficients (Simple Exponential Decay)
        // Formula: val *= coeff
        const kEnvCoeff = Math.exp(-1 / (sampleRate * kDecay));
        const sEnvCoeff = Math.exp(-1 / (sampleRate * sDecay));

        // Highpass Filter Coeffs (Simple 1st order approx for 1400Hz)
        // Faust: fi.resonhp(si.smoo(1400),.7,.6) -> roughly a HPF
        // Simplified to basic HP for clean code
        const hpCutoff = 1400;
        const rc = 1.0 / (hpCutoff * 2 * Math.PI);
        const dt = 1.0 / sampleRate;
        const hpAlpha = rc / (rc + dt);

        for (let i = 0; i < outputL.length; i++) {
            
            // --- KICK SYNTHESIS ---
            // Trigger check
            if (kickTrig && kickTrig[i] > 0.5) {
                this.kEnvVal = 1.0;
                this.kPhase = 0; // Reset phase for consistent click
            }

            // Envelope decay
            this.kEnvVal *= kEnvCoeff;

            // Pitch modulation (Acidwerk logic: pitch envelope + base pitch)
            // Original: os.oscsin((en.ar(...)*p/2))
            // We use the envelope to sweep pitch down
            const currentKickFreq = kPitch + (kPitch * 4 * this.kEnvVal);
            
            // Oscillator
            this.kPhase += (currentKickFreq / sampleRate);
            if (this.kPhase > 1) this.kPhase -= 1;
            const kickOsc = Math.sin(this.kPhase * this.twoPI);

            // Apply Amp Envelope (Squared for punch, similar to Faust implementation)
            const kickOutSignal = kickOsc * this.kEnvVal * this.kEnvVal;


            // --- SNARE SYNTHESIS ---
            if (snareTrig && snareTrig[i] > 0.5) {
                this.sEnvVal = 1.0;
                this.sPhase = 0;
            }

            this.sEnvVal *= sEnvCoeff;

            // Snare Tone (Sine)
            // Pitch mod slightly less aggressive than kick
            const currentSnareFreq = sPitch + (sPitch * 0.5 * this.sEnvVal);
            this.sPhase += (currentSnareFreq / sampleRate);
            if (this.sPhase > 1) this.sPhase -= 1;
            const snareTone = Math.sin(this.sPhase * this.twoPI);

            // Snare Noise (White Noise)
            const noise = (Math.random() * 2) - 1;

            // Mix Tone and Noise
            let snareRaw = (noise * 0.8) + (snareTone * 0.2);

            // Apply Envelope
            snareRaw *= this.sEnvVal;

            // Highpass Filter (Basic 1st order implementation)
            // y[i] := α * (y[i-1] + x[i] - x[i-1])
            const hpY = hpAlpha * (this.hpY1 + snareRaw - this.hpX1);
            this.hpX1 = snareRaw;
            this.hpY1 = hpY;
            const snareOutSignal = hpY;

            // --- MIX & OUTPUT ---
            // Summing to mono for now, then copying to stereo out
            const mix = (kickOutSignal * 0.8) + (snareOutSignal * 0.6);
            
            // Soft Clipping (simple tanh distortion characteristic of Acidwerk)
            // process = aa.tanh1(...)
            const distorted = Math.tanh(mix * 1.5); 

            outputL[i] = distorted;
            outputR[i] = distorted;
        }

        return true;
    }
}

registerProcessor('drums-processor', DrumsProcessor);
