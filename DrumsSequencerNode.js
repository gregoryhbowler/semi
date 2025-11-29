export class DrumsSequencerNode extends AudioWorkletNode {
    constructor(context) {
        super(context, 'drums-sequencer-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2] // Stereo output: Left=KickTrigger, Right=SnareTrigger
        });
    }

    randomizePattern() {
        this.port.postMessage({ type: 'randomizePattern' });
    }

    randomizeGroove() {
        this.port.postMessage({ type: 'randomizeGroove' });
    }
}
