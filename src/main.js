import React from 'react';
import ReactDOM from 'react-dom';
import update from 'immutability-helper'

import {Frame, getGifData} from './gifs.js';
import {DrawCanvas} from './draw.js';

require('babel-polyfill');

const DATAURLPREFIX = 'data:image/gif;base64,';


window.addEventListener('load', function() {
	// TODO: should consider switching to document.addEventListener, and use
	// DOMContentLoaded instead of load (load waits until EVERYTHING is loaded
	// which is more necessary for my tests than it might be for the actual
	// application).
    ReactDOM.render(
            <GifEditor
                defaultDelay={1}
                initialFrameCount={3}

                width={700}
                height={500}></GifEditor>,
            document.getElementById('mount')
            );
});


class FrameInfo extends React.Component {
    render() {
        return <div className="frameInfo" onClick={this.props.onClick}>
            Duration: {this.props.frame.delay}
            <img src={this.props.frame.canvas.toDataURL()} width="100" height="100"></img>
        </div>;
    }
}

class GifEditor extends React.Component {
    constructor(props) {
        super(props);

        const frameData = [];
        for (let i = 0; i < this.props.initialFrameCount; i++) {
            const c = document.createElement('canvas');
            c.width = this.props.width;
            c.height = this.props.height;

            const ctx = c.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, c.width, c.height);

            frameData.push({
                canvas: c,
                delay: this.props.defaultDelay,
                disposal: 1});
        }

        this.state = {
            currentFrame: 0,
            frameData,
            gifData: ''
        };

        this.drawingUpdated = this.drawingUpdated.bind(this);
        this.updateGif = this.updateGif.bind(this);
    }

    drawingUpdated(newCanvas) {
        const ind = this.state.currentFrame;
        const currentFrame = this.state.frameData[ind];
        const newFrame = update(currentFrame, {canvas: {$set: newCanvas}});

        const newFrameData = update(this.state.frameData,
                {$splice: [[ind, 1, newFrame]]});

        this.setState({frameData: newFrameData});
    }

    updateGif() {
        const frames = this.state.frameData.map((f) =>
                new Frame(f.canvas, f.delay, f.disposal));

        const data = getGifData(frames, 0, this.props.width,
                this.props.height);

        // One might consider just using:
        //
        // const b64 = window.btoa(String.fromCharCode(...data));
        //
        // BUT data could be very large, and browsers can't handle that many
        // arguments. So doing that leads to max call stack size exceeded
        // errors when using larger images.
        const b64 = window.btoa(data.map(i => String.fromCharCode(i)).join(''));
        this.setState({gifData: DATAURLPREFIX+b64});
    }

    render() {
        let b64 = '';

        const animCanvas = [];
        const animImg = [];
        const animCtx = [];
        let testFrames = [];
        for (let i = 0; i < 3; i++) {
            animCanvas[i] = document.createElement('canvas');
            animImg[i] = document.getElementById('animation' + (i + 1));
            animCanvas[i].width = animImg[i].width;
            animCanvas[i].height = animImg[i].height;
            animCtx[i] = animCanvas[i].getContext('2d');
            animCtx[i].drawImage(animImg[i], 0, 0);
            testFrames[i] = new Frame(animCanvas[i], Math.floor(Math.random() * 100 + 1), 1);
        }
        testFrames = [testFrames[1], testFrames[2], testFrames[1], testFrames[2], testFrames[0]];

        const data = getGifData(testFrames, 0);

        // One might consider just using:
        //
        // const b64 = window.btoa(String.fromCharCode(...data));
        //
        // BUT data could be very large, and browsers can't handle that many
        // arguments. So doing that leads to max call stack size exceeded
        // errors when using larger images.
        b64 = window.btoa(data.map(i => String.fromCharCode(i)).join(''));

        const frameDisplay = [];
        let i = 0;
        for (let f of this.state.frameData) {
            frameDisplay.push(<FrameInfo
                    frame={f}
                    key={i}
                    onClick={((i) => this.setState({currentFrame: i})).bind(this, i)}>
                </FrameInfo>);
            i++;
        }

        const currentFrame = this.state.frameData[this.state.currentFrame];
        return <div>
            Animation:<img src={DATAURLPREFIX+b64}></img>
            <DrawCanvas
                drawingUpdated={this.drawingUpdated}
                content={currentFrame.canvas}
                width={this.props.width}
                height={this.props.height}>
            </DrawCanvas>
            {frameDisplay}
            <button onClick={this.updateGif}>Update GIF</button>
            <img src={this.state.gifData}></img>
        </div>;
    }
}
