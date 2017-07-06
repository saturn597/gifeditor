import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import update from 'immutability-helper'

import {Frame, getGifUrl, getImageData} from './gifs.js';
import {DrawCanvas} from './draw.js';

require('babel-polyfill');


const MAXBRUSHSIZE=99;
const MINBRUSHSIZE=1;

const MAXDELAY=65535;
const MINDELAY=0;


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


function createRoundBrush(diameter, color) {
    // Returns a canvas containing a "circle" of the given color, with about
    // the given diameter. The rest of the canvas outside the circle will be
    // transparent. The canvas will only contain the specified color - other
    // pixels will be fully transparent - no blending/antialiasing (so we can't
    // use the built-in arc drawing method).

    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    c.width = diameter;
    c.height = diameter;

    const center = {x: c.width / 2, y: c.height / 2};
    const radius = diameter / 2;

    const id = ctx.createImageData(c.width, c.height);

    for (let x = 0; x < c.width; x++) {
        for (let y = 0; y < c.height; y++) {
            // Take the distance from the center of our canvas to the "halfway"
            // point of (x, y) - i.e., (x+0.5, y+0.5). If this is less than the
            // radius we want, color that pixel in.
            if ((center.x - x - 0.5)**2 + (center.y - y - 0.5)**2 < radius**2)
            {
                id.data.set(color, y * 4 * c.height + x * 4);
            }
        }
    }

    ctx.putImageData(id, 0, 0);

    return c;
}


class ColorEditor extends React.Component {
    // A tool for selecting colors. Unlike the HTML5 color input, allows only a
    // certain set of colors (specified in props) to be selected (useful for
    // GIFs, which can only have 256 colors in a frame). TODO: could allow full
    // range of 16^3 colors, but then programmatically reduce the colors in the
    // image before converting to a GIF.
    constructor(props) {
        super(props);

        this.state = {expanded: false};

        this.expand = this.expand.bind(this);
    }

    expand() {
        this.setState((state, props) => {
            return {
                expanded: !this.state.expanded,
            };
        });
    }

    render() {
        const divs = [];
        if (this.state.expanded) {
            for (let c of this.props.colors) {
                const style = {
                    backgroundColor: `rgba(${c.toString()})`,
                }
                divs.push(<div
                        className="colorSelection"
                        key={c.toString()}
                        onClick={() => this.props.setColor(c)}
                        style={style}
                        />);
            }
        }
        const colorList = this.state.expanded ?
            <div id="colorList">{divs}</div> :
            null;

        const style = {
            backgroundColor: `rgba(${this.props.currentColor.toString()})`,
        };

        return (
                <span onClick={this.expand}>{this.props.label}
                    <div id="colorPicker" style={style}>
                        {colorList}
                    </div>
                </span>
        );
    }
}

ColorEditor.propTypes =
{
    colors: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)),
    currentColor: PropTypes.arrayOf(PropTypes.number),
    label: PropTypes.string,
    setColor: PropTypes.func.isRequired,
};


class NumberEditor extends React.Component {
    // A component to allow the user to set a number within a specific range,
    // with a specific step.
    //
    // Provide an onChange function in props to receive newly set values - by
    // default this will only be called when the user enters valid input.
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
        } else {
            this.props.onChange(null);
        }
    }

    render() {
        const valid = this.state.valid;
        return (
           <div id={this.props.id}>
               <label>{this.props.label}
                   <input
                       type="number"
                       className={valid ? "validInput" : "invalidInput"}
                       max={this.props.max}
                       min={this.props.min}
                       onChange={this.onChange}
                       onClick={this.props.onInputClick}
                       required={this.props.required}
                       step={this.props.step}
                       value={this.state.value}
                   />
               </label>
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
    onInputClick: PropTypes.func,
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

                <NumberEditor
                        initialValue={this.props.frame.delay}
                        label="Duration:"
                        max={MAXDELAY}
                        min={MINDELAY}
                        onChange={this.props.onDelayChange}
                        onInputClick={this.stopPropagation}
                        required={true}
                        step={1}
                />

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
            color: [0, 0, 0, 255],
            currentFrame: 0,
            frameData,
            gifData: ''
        };

        this.addFrame = this.addFrame.bind(this);
        this.changeBrushSize = this.changeBrushSize.bind(this);
        this.changeDelay = this.changeDelay.bind(this);
        this.drawingUpdated = this.drawingUpdated.bind(this);
        this.setColor = this.setColor.bind(this);
        this.updateGif = this.updateGif.bind(this);
    }

    addFrame() {
        this.setState((state, props) => ({
            frameData: state.frameData.concat(this.newFrameData(props))
        }));
    }

    drawingUpdated(newCanvas) {
        this.setState((state) => {
            // We want to update our frame's canvas to contain the updated
            // drawing. If we cached our imageData, null it here because it's
            // no longer valid.
            const ind = state.currentFrame;
            const currentFrame = state.frameData[ind];
            const newFrame = update(currentFrame,
                    {canvas: {$set: newCanvas}, imageData: {$set: null}});

            const frameData = update(state.frameData,
                    {$splice: [[ind, 1, newFrame]]});

            return {frameData};
        });
    }

    changeBrushSize(value) {
        this.setState({'brushSize': value});
    }

    changeDelay(index, value) {
        this.setState((state) => {
            const frame = state.frameData[index];
            const newFrame = update(frame,
                    {delay: {$set: value}});

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
            imageData: null,
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

    setColor(color) {
        this.setState({color});
    }

    updateGif() {
        this.setState((state, props) => {
            // The task of constructing the image data for each frame is the
            // most time consuming part of making a GIF, so if the frame data
            // doesn't already have the data we need, cache the result there.
            // That cache will be valid until the user draws again in the
            // frame.
            const newFrameData = state.frameData.map(f => {
                if (!f.imageData) {
                    f = update(f, {imageData: {$set: getImageData(f.canvas)}});
                }
                return f;
            });

            // Note, the "number" input allows scientific notation, but
            // parseInt doesn't get it.  (It interprets 1e3 as 1, for example).
            // parseFloat works better.  TODO: could do some validation of
            // delay values here, in case the user's browser doesn't support
            // number inputs.
            const frames = newFrameData.map((f, i) =>
                    new Frame(
                        f.imageData,
                        Math.floor(parseFloat(f.delay, 10)),
                        f.disposal));

            const gifData = getGifUrl(
                    frames,
                    0,
                    props.width,
                    props.height);

            return {gifData, frameData: newFrameData};
        });
    }

    render() {
        const warnings = [];

        if (this.state.brushSize === null) {
            warnings.push(`Brush size must be an integer between ${MINBRUSHSIZE} and ${MAXBRUSHSIZE} inclusive.`);
        }

        const invalidFrames = this.state.frameData.some((f) =>
                f.delay === null);
        if (invalidFrames) {
            warnings.push(`Durations must be integers between ${MINDELAY} and ${MAXDELAY} inclusive.`);
        }

        let warningList = null;
        if (warnings.length > 0) {
            warningList = (
                <div id="warnings">
                    <h1>Whoops!</h1>
                    <ul>
                        {warnings.map(w => <li key={w}>{w}</li>)}
                    </ul>
                </div>
            );
        }

        const currentFrame = this.state.frameData[this.state.currentFrame];

        const frameListItems = [];
        let i = 0;
        for (let f of this.state.frameData) {
            const frameNum = i;
            frameListItems.push(<FrameInfo
                    frame={f}
                    key={i}
                    onDelayChange={(value) =>
                        this.changeDelay(frameNum, value)}
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

        // Rough way of filling in some color options. TODO: could see if there
        // are better ways of picking a palette.
        const colorOptions = [
            [255, 255, 255, 255],
            [200, 200, 200, 255],
            [150, 150, 150, 255],
            [100, 100, 100, 255],
            [50, 50, 50, 255],
        ];

        for (let r = 0; r < 6; r++) {
            for (let g = 0; g < 8; g++) {
                for (let b = 0; b < 5; b++) {
                    colorOptions.push([
                            Math.floor(256 / 6 * r),
                            Math.floor(256 / 8 * g),
                            Math.floor(256 / 5 * b),
                            255,
                    ]);
                }
            }
        }

        const brush = this.state.brushSize === null ?
            null :
            createRoundBrush(this.state.brushSize, this.state.color);


        return (
            <main>
            {warningList}
            <div id="editor">
                <NumberEditor
                    id="brushSize"
                    label="Brush size: "
                    max={MAXBRUSHSIZE}
                    min={MINBRUSHSIZE}
                    onChange={this.changeBrushSize}
                    required={true}
                    step={1}
                    initialValue={this.state.brushSize}
                />

                <ColorEditor
                    colors={colorOptions}
                    currentColor={this.state.color}
                    label="Color: "
                    setColor={this.setColor}
                />

                <DrawCanvas
                    brush={brush}
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
