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
    render() {
        const id = this.props.selected ? 'selected' : null;
        const removeFrame = (e) => {
            e.stopPropagation();
            this.props.removeFrame();
        };

        return (
            <div className="frameInfo"
                id={id}
                onClick={this.props.selectFrame}>

                Duration: {this.props.frame.delay}
                <img src={this.props.frame.canvas.toDataURL()}
                    width="100"
                    height="100" />
                <button onClick={removeFrame}>
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
            const frames = state.frameData.map((f) =>
                    new Frame(f.canvas, f.delay, f.disposal));

            const gifData = getGifUrl(
                    frames,
                    0,
                    props.width,
                    props.height);

            return {gifData};
        });
    }

    render() {
        const currentFrame = this.state.frameData[this.state.currentFrame];

        const frameDisplay = [];
        let i = 0;
        for (let f of this.state.frameData) {
            const frameNum = i;
            frameDisplay.push(<FrameInfo
                    frame={f}
                    key={i}
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
            <button onClick={this.addFrame}>Add frame</button>
            <button onClick={this.updateGif}>Update GIF</button>
            <img src={this.state.gifData} />
        </div>;
    }
}
