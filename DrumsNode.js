export class DrumsNode extends AudioWorkletNode {
    constructor(context) {
        super(context, 'drums-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });
    }
}
