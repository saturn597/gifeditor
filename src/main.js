import React from 'react';
import ReactDOM from 'react-dom';
import update from 'immutability-helper'

import {Frame, getGifUrl} from './gifs.js';
import {DrawCanvas} from './draw.js';

require('babel-polyfill');


document.addEventListener('DOMContentLoaded', function() {
    ReactDOM.render(
            <GifEditor
                defaultDelay={1}
                defaultDisposal={1}
                initialFrameCount={3}

                width={700}
                height={500} />,
            document.getElementById('mount')
            );
});


class FrameInfo extends React.Component {
    stopPropagation(e) {
        e.stopPropagation();
    }

    render() {
        const id = this.props.selected ? 'selected' : null;

        const myDelayChange = (e) =>
            this.props.onDelayChange(
                    e.target.value,
                    e.target.checkValidity());

        const myRemoveFrame = (e) => {
            e.stopPropagation();
            this.props.removeFrame();
        };

        return (
            <div className="frameInfo"
                id={id}
                onClick={this.props.selectFrame}>

                Duration: <input type="number"
                    className={this.props.frame.valid ? "validInput" :
                        "invalidInput"}
                    max={65535}
                    min={0}
                    onChange={myDelayChange}
                    onClick={this.stopPropagation}
                    required={true}
                    step={1}
                    value={this.props.frame.delay} />

                <Preview
                    canvas={this.props.frame.canvas}
                    width="100"
                    height="100" />
                <button onClick={myRemoveFrame}>
                    Remove Frame
                </button>
            </div>
        );
    }
}

class GifEditor extends React.Component {
    constructor(props) {
        super(props);

        const frameData = [];
        for (let i = 0; i < this.props.initialFrameCount; i++) {
            frameData.push(this.newFrameData(this.props));
        }

        this.state = {
            currentFrame: 0,
            frameData,
            gifData: ''
        };

        this.addFrame = this.addFrame.bind(this);
        this.changeDelay = this.changeDelay.bind(this);
        this.drawingUpdated = this.drawingUpdated.bind(this);
        this.updateGif = this.updateGif.bind(this);
    }

    addFrame() {
        this.setState((state, props) => ({
            frameData: state.frameData.concat(this.newFrameData(props))
        }));
    }

    drawingUpdated(newCanvas) {
        this.setState((state) => {
            const ind = state.currentFrame;
            const currentFrame = state.frameData[ind];
            const newFrame = update(currentFrame, {canvas: {$set: newCanvas}});

            const frameData = update(state.frameData,
                    {$splice: [[ind, 1, newFrame]]});

            return {frameData};
        });
    }

    changeDelay(index, value, valid) {
        this.setState((state) => {
            const frame = state.frameData[index];
            const newFrame = update(frame,
                    {delay: {$set: value}, valid: {$set: valid}});

            const frameData = update(state.frameData,
                    {$splice: [[index, 1, newFrame]]});

            return {frameData};
        });
    }

    newFrameData(props) {
        const c = document.createElement('canvas');
        c.width = props.width;
        c.height = props.height;

        // TODO: For now, we'll fill everything in with a background color, so
        // that there are no transparent areas.  We COULD allow transparency in
        // the GIFs.  But there are a couple of problems for now:
        //
        // 1) Animating with a disposal method of "1" means that new frames
        // just get "added" to the last one, so if there's transparency you can
        // still see the old frame underneath, which doesn't seem right. This
        // might be fixable by using a disposal method of 2 (which restores to
        // background color after the frame) and setting a background color
        // that's also transparent. This will require adding a global color
        // table, since the background color comes from the global color table.
        //
        // 2) The lines we're drawing on canvas are "fuzzy", containing areas
        // of partial but not complete transparency. GIFs appear to only
        // support pixels that are either opaque or transparent, not in
        // between. By filling everything up with white to begin with, we
        // prevent any areas of the canvas from having partial transparency.
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, c.width, c.height);

        return {
            canvas: c,
            delay: props.defaultDelay,
            disposal: props.defaultDisposal,
            valid: true,
        };
    }

    removeFrame(k) {
        this.setState((state) => {
            if (state.frameData.length === 1) {
                return;
            }

            let currentFrame = state.currentFrame;
            if (k <= currentFrame && currentFrame > 0) {
                currentFrame -= 1;
            }

            return {
                frameData: update(state.frameData, {$splice: [[k, 1]]}),
                currentFrame,
            };
        });
    }

    updateGif() {
        this.setState((state, props) => {
            // Note, the "number" input allows scientific notation, but
            // parseInt doesn't get it.  (It interprets 1e3 as 1, for example).
            // parseFloat works better.  TODO: could do some validation of
            // delay values here, in case the user's browser doesn't support
            // number inputs.
            const frames = state.frameData.map((f) =>
                    new Frame(
                        f.canvas,
                        Math.floor(parseFloat(f.delay, 10)),
                        f.disposal));

            const gifData = getGifUrl(
                    frames,
                    0,
                    props.width,
                    props.height);

            return {gifData};
        });
    }

    render() {
        const invalidFrames = this.state.frameData.some((f) => !f.valid);
        const warning = invalidFrames ?
            'Durations must be integers between 0 and 65535 inclusive' :
            null;

        const currentFrame = this.state.frameData[this.state.currentFrame];

        const frameDisplay = [];
        let i = 0;
        for (let f of this.state.frameData) {
            const frameNum = i;
            frameDisplay.push(<FrameInfo
                    frame={f}
                    key={i}
                    onDelayChange={(value, valid) =>
                        this.changeDelay(frameNum, value, valid)}
                    selectFrame={() => this.setState({currentFrame: frameNum})}
                    removeFrame={() => this.removeFrame(frameNum)}
                    selected={f === currentFrame} />);
            i++;
        }

        return <div>
            <DrawCanvas
                drawingUpdated={this.drawingUpdated}
                content={currentFrame.canvas}
                width={this.props.width}
                height={this.props.height} />
            {frameDisplay}
            {warning}
            <button onClick={this.addFrame}>Add frame</button>
            <button onClick={this.updateGif} disabled={invalidFrames}>
                Update GIF
            </button>
            <img src={this.state.gifData} />
        </div>;
    }
}


class Preview extends React.Component {
    shouldComponentUpdate(nextProps, nextState) {
        if (this.props.canvas === nextProps.canvas &&
                this.props.width === nextProps.width &&
                this.props.height === nextProps.height) {
            return false;
        }
        return true;
    }

    render() {
        return <img
            src={this.props.canvas.toDataURL()}
            width={this.props.width}
            height={this.props.height} />;
    }
}
