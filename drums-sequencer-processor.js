class DrumsSequencerProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'tempo', defaultValue: 120, minValue: 60, maxValue: 200 }
        ];
    }

    constructor() {
        super();
        this.currentStep = 0;
        this.phase = 0;
        this.sampleRate = 44100; // Default, will be updated by global scope
        this.steps = 16; // Standard 16 step sequencer
        
        // The pattern arrays (1 = trigger, 0 = silence)
        this.kickPattern = new Array(16).fill(0);
        this.snarePattern = new Array(16).fill(0);
        
        // The Groove Mask
        // In the original code: vk = ba.if(tabk==1 & kk == 1,0,tabk)
        // This masked specific subdivisions. We represent this as an array of length 4 (16th notes in a beat)
        // 1 = Allowed, 0 = Masked (Muted)
        this.grooveMask = [1, 0, 1, 1]; // Default acidwerk feel: mute the 'e' of '1 e & a'

        this.port.onmessage = (event) => {
            if (event.data.type === 'randomizePattern') {
                this.generatePattern();
            }
            if (event.data.type === 'randomizeGroove') {
                this.generateGroove();
            }
        };
        
        this.generatePattern();
    }

    generatePattern() {
        for (let i = 0; i < 16; i++) {
            // Bias kick towards downbeats (0, 4, 8, 12) for more coherence
            let kickProb = (i % 4 === 0) ? 0.8 : 0.3;
            this.kickPattern[i] = Math.random() < kickProb ? 1 : 0;

            // Bias snare towards backbeats (4, 12)
            let snareProb = (i % 8 === 4) ? 0.9 : 0.2;
            this.snarePattern[i] = Math.random() < snareProb ? 1 : 0;
        }
    }

    generateGroove() {
        // Randomize the coherence mask
        // Always keep the downbeat (index 0) allowed to keep it grounded
        this.grooveMask = [
            1, 
            Math.random() > 0.5 ? 1 : 0, 
            Math.random() > 0.5 ? 1 : 0, 
            Math.random() > 0.5 ? 1 : 0
        ];
    }

    process(inputs, outputs, parameters) {
        const kickOut = outputs[0][0]; // Output Channel 0: Kick Trigger
        const snareOut = outputs[0][1]; // Output Channel 1: Snare Trigger
        
        const tempo = parameters.tempo[0];
        // Calculate seconds per 16th note
        // 1 minute / tempo / 4 (beats) = quarter note duration
        // quarter note / 4 = 16th note
        const secondsPerStep = (60 / tempo) / 4;
        const samplesPerStep = secondsPerStep * sampleRate;

        for (let i = 0; i < kickOut.length; i++) {
            this.phase++;

            if (this.phase >= samplesPerStep) {
                this.phase -= samplesPerStep;
                this.currentStep = (this.currentStep + 1) % 16;
            }

            // Only trigger on the very first sample of the step
            if (this.phase < 1) {
                // Determine position within the beat (0, 1, 2, 3)
                const subDivision = this.currentStep % 4;
                
                // Check Groove Mask (The Coherence Logic)
                const isAllowed = this.grooveMask[subDivision];

                if (isAllowed) {
                    kickOut[i] = this.kickPattern[this.currentStep];
                    snareOut[i] = this.snarePattern[this.currentStep];
                } else {
                    kickOut[i] = 0;
                    snareOut[i] = 0;
                }
            } else {
                kickOut[i] = 0;
                snareOut[i] = 0;
            }
        }

        return true;
    }
}

registerProcessor('drums-sequencer-processor', DrumsSequencerProcessor);
