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
                initialFrameCount={3}

                width={700}
                height={500} />,
            document.getElementById('mount')
            );
});


class FrameInfo extends React.Component {
    render() {
        return <div className="frameInfo" onClick={this.props.onClick}>
            Duration: {this.props.frame.delay}
            <img src={this.props.frame.canvas.toDataURL()} width="100" height="100" />
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

        const url = getGifUrl(frames, 0, this.props.width, this.props.height);

        this.setState({gifData: url});
    }

    render() {
        const frameDisplay = [];
        let i = 0;
        for (let f of this.state.frameData) {
            frameDisplay.push(<FrameInfo
                    frame={f}
                    key={i}
                    onClick={((i) => this.setState({currentFrame: i})).bind(this, i)} />);
            i++;
        }

        const currentFrame = this.state.frameData[this.state.currentFrame];
        return <div>
            <DrawCanvas
                drawingUpdated={this.drawingUpdated}
                content={currentFrame.canvas}
                width={this.props.width}
                height={this.props.height} />
            {frameDisplay}
            <button onClick={this.updateGif}>Update GIF</button>
            <img src={this.state.gifData} />
        </div>;
    }
}
