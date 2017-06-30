import PropTypes from 'prop-types';
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


function createRoundBrush(radius, color = [0, 0, 0, 255]) {
    // Returns a canvas containing a "circle" of the given color, with about
    // the given radius. The rest of the canvas outside the circle will be
    // transparent. The canvas will only contain the specified color - other
    // pixels will be fully transparent - no blending/antialiasing (so we can't
    // use the built-in arc drawing method).
    //
    // Color defaults to opaque black if unspecified.
    //
    // TODO: the circles produced could probably be closer to the specified
    // radius.

    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');

    c.width = radius * 2;
    c.height = radius * 2;

    const id = ctx.createImageData(c.width, c.height);

    for (let x = 0; x < c.width; x++) {
        for (let y = 0; y < c.height; y++) {
            // If the distance from (x, y) to the center of our canvas is less
            // than the radius we want, then color that pixel in.
            if ((c.width / 2 - x)**2 + (c.height / 2 - y)**2 < radius**2) {
                id.data.set(color, y * 4 * c.height + x * 4);
            }
        }
    }

    ctx.putImageData(id, 0, 0);

    return c;
}


class NumberEditor extends React.Component {
    // A component to allow the user to set a number within a specific range,
    // with a specific step.
    //
    // Provide an onChange function in props to receive newly set values - by
    // default this will only be called when the user enters valid input.
    //
    // TODO: consider using this class for the duration control
    constructor(props) {
        super(props);
        this.state = {
            'valid': true,
            'value': props.initialValue,
        };

        this.onChange = this.onChange.bind(this);
    }

    onChange(e) {
        const valid = e.target.checkValidity();

        this.setState({
            valid,
            'value': e.target.value,
        });

        if (valid) {
            this.props.onChange(e.target.valueAsNumber);
        } else if (this.props.updateWhenInvalid) {
            this.props.onChange(null);
        }
    }

    render() {
        const valid = this.state.valid;
        return (
           <div>
               <label>{this.props.label}
                   <input
                       type="number"
                       className={valid ? "validInput" : "invalidInput"}
                       max={this.props.max}
                       min={this.props.min}
                       onChange={this.onChange}
                       required={this.props.required}
                       step={this.props.step}
                       value={this.state.value}
                   />
               </label>
               <div className="warning">{valid ? null : this.props.usage}</div>
           </div>
        );
    }

}

NumberEditor.propTypes =
{
    initialValue: PropTypes.number,
    label: PropTypes.string,
    max: PropTypes.number,
    min: PropTypes.number,
    onChange: PropTypes.func.isRequired,
    required: PropTypes.bool,
    step: PropTypes.number,
    updateWhenInvalid: PropTypes.bool,
}


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
            <li className="frameInfo"
                id={id}
                onClick={this.props.selectFrame}>

                <Preview
                    canvas={this.props.frame.canvas}
                    width="100"
                    height="100" />

                <div className="delayControl">
                    <label>Duration:
                        <input type="number"
                        className={this.props.frame.valid ? "validInput" :
                            "invalidInput"}
                        max={65535}
                        min={0}
                        onChange={myDelayChange}
                        onClick={this.stopPropagation}
                        required={true}
                        step={1}
                        value={this.props.frame.delay} />
                    </label>
                </div>

                <button onClick={myRemoveFrame}>
                    Remove Frame
                </button>
            </li>
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
            brushSize: 5,
            currentFrame: 0,
            frameData,
            gifData: ''
        };

        this.addFrame = this.addFrame.bind(this);
        this.changeBrushSize = this.changeBrushSize.bind(this);
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

    changeBrushSize(value) {
        this.setState({'brushSize': value});
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
        // NOTE: May not REQUIRE adding a global color table. When restoring to
        // background color, a transparent background color appears be assumed
        // in the absence of a global color table, at least in Firefox, Chrome,
        // ImageMagick in Ubuntu.
        //
        // 2) GIFs appear to only support pixels that are either opaque or
        // transparent, not in between. The canvas interface wants to
        // smooth/antialias everything, which can lead to semi-transparent
        // areas. By filling everything up with white to begin with, we prevent
        // any areas of the canvas from having partial transparency.  However,
        // we are now preventing this altogether by drawing the brush with
        // context.drawImage and setting imageSmoothingEnabled to false. (Note
        // this may not work in all browsers).
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

        const frameListItems = [];
        let i = 0;
        for (let f of this.state.frameData) {
            const frameNum = i;
            frameListItems.push(<FrameInfo
                    frame={f}
                    key={i}
                    onDelayChange={(value, valid) =>
                        this.changeDelay(frameNum, value, valid)}
                    selectFrame={() => this.setState({currentFrame: frameNum})}
                    removeFrame={() => this.removeFrame(frameNum)}
                    selected={f === currentFrame} />);
            i++;
        }

        const gif = this.state.gifData ?
            <img src={this.state.gifData} /> :
            null;

        const gifContainerStyle = {
            "width": this.props.width,
            "height": this.props.height,
        };

        return (
            <main>
            <div id="editor">
                <NumberEditor
                    label="Brush size: "
                    max={99}
                    min={1}
                    onChange={this.changeBrushSize}
                    required={true}
                    step={1}
                    initialValue={this.state.brushSize}
                    usage="Brush size must be an integer from 1 to 99."
                />

                <DrawCanvas
                    brush={createRoundBrush(this.state.brushSize)}
                    drawingUpdated={this.drawingUpdated}
                    content={currentFrame.canvas}
                    width={this.props.width}
                    height={this.props.height} />
                <ol id="frameList">
                    {frameListItems}
                </ol>
                <div id="frameControls">
                    <button onClick={this.addFrame}>Add frame</button>
                </div>
                {warning}
            </div>
            <div id="output">
                <button onClick={this.updateGif} disabled={invalidFrames}
                    className="bigButton">
                    {this.state.gifData ? 'Update GIF' : 'Create GIF'}
                </button>
                <div id="downArrow">
                    ▼
                </div>
                <div id="gifContainer" style={gifContainerStyle}>{gif}</div>
            </div>
            </main>
        );
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
