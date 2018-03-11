import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import update from 'immutability-helper'

import {canvasDataToGIFData, Frame, getGifUrl, getImageData} from './gifs.js';
import {DrawCanvas} from './draw.js';

require('babel-polyfill');

import Worker from 'worker-loader!./imagedata.js';

const DEFAULTHEIGHT=200;
const DEFAULTWIDTH=250;

const MAXBRUSHSIZE=99;
const MINBRUSHSIZE=1;

const MAXDELAY=65535;
const MINDELAY=0;

const MAXHEIGHT=999;
const MAXWIDTH=999;


document.addEventListener('DOMContentLoaded', function() {
    ReactDOM.render(
            <App />,
            document.getElementById('mount')
            );
});

class App extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            height: DEFAULTHEIGHT,
            width: DEFAULTWIDTH,

            drawingStarted: false,
        };

        this.changeHeight = this.changeHeight.bind(this);
        this.changeWidth = this.changeWidth.bind(this);
        this.startDrawing = this.toggleDrawing.bind(this, true);
        this.stopDrawing = this.toggleDrawing.bind(this, false);
    }

    changeHeight(h) {
        if (h !== null) {
            this.setState({height: h});
        }
    }

    changeWidth(w) {
        if (w !== null) {
            this.setState({width: w});
        }
    }

    toggleDrawing(s) {
        this.setState({drawingStarted: s});
    }

    render() {
        const previewStyle = {
            height: this.state.height,
            width: this.state.width
        };

        if (!this.state.drawingStarted) {
            return (<div id="sizeEditor">
                        <div className="description">
                            Set the height and width of your GIF.
                            Width must be no larger than {MAXWIDTH}.
                            Height must be no larger than {MAXHEIGHT}.
                        </div>
                        <NumberEditor
                            initialValue={this.state.width}
                            label="Width:"
                            max={MAXWIDTH}
                            min={1}
                            onChange={this.changeWidth}
                            required={true}
                            step={1}
                        />
                        <NumberEditor
                            initialValue={this.state.height}
                            label="Height:"
                            max={MAXHEIGHT}
                            min={1}
                            onChange={this.changeHeight}
                            required={true}
                            step={1}
                        />
                        <button
                            className="bigButton"
                            onClick={this.startDrawing}>
                            Go!
                        </button>
                        <div id="sizePreview" style={previewStyle} />
                    </div>
                );
        }

        return (
            <GifEditor
                defaultDelay={10}
                defaultDisposal={1}
                initialFrameCount={3}

                abort={this.stopDrawing}

                height={this.state.height}
                width={this.state.width}
            />
        );
    }
}


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

let _currentId = -1;
function sequentialId() {
    _currentId++;
    return _currentId;
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


class Hideable extends React.Component {
    constructor(props) {
        super(props);
        this.state = {'visible': false};
        this.toggle = this.toggle.bind(this);
    }

    toggle() {
        this.setState((state, props) => {
            return {visible: !state.visible};
        });
    }

    render() {
        const content = this.state.visible ? this.props.children : '';
        const toggleText = this.state.visible ? this.props.hideText : this.props.showText;
        return (
            <div className="description">
                {content}
                <button onClick={this.toggle}>{toggleText}</button>
            </div>
        );
    }
}


class NumberEditor extends React.Component {
    // A component to allow the user to set a number within a specific range,
    // with a specific step.
    //
    // Provide an onChange function in props to receive newly set values.
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
           <div className="numberEditor" id={this.props.id}>
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


class ConfirmButton extends React.Component {
    constructor(props) {
        super(props);
        this.state = {clicked: false};

        this.toggle = this.toggle.bind(this);
    }

    toggle() {
        this.setState((state, props) => ({clicked: !state.clicked}));
    }

    render() {
        if (this.state.clicked) {
            return (
                       <span id={this.props.id}>
                           {this.props.confirmText}
                           <button onClick={this.props.action}>Yes</button>
                           <button onClick={this.toggle}>No</button>
                       </span>
                   );
        }
        return (
                    <span id={this.props.id}>
                        <button onClick={this.toggle}>
                            {this.props.children}
                        </button>
                    </span>
               );
    }
}

ConfirmButton.propTypes = {
    action: PropTypes.func.isRequired,
    confirmText: PropTypes.string,
    id: PropTypes.string,
};

ConfirmButton.defaultProps = {
    confirmText: "Are you sure?",
};


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
            gifData: '',
            updatingGif: false,
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

    getColorOptions() {
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

        return colorOptions;
    }

    getFrameList() {
        const currentFrame = this.state.frameData[this.state.currentFrame];
        const frameList = [];
        let i = 0;
        for (let f of this.state.frameData) {
            const frameNum = i;
            frameList.push(<FrameInfo
                    frame={f}
                    key={f.key}
                    onDelayChange={(value) =>
                        this.changeDelay(frameNum, value)}
                    selectFrame={() => this.setState({currentFrame: frameNum})}
                    removeFrame={() => this.removeFrame(frameNum)}
                    selected={f === currentFrame} />);
            i++;
        }
        return frameList;
    }

    getWarnings() {
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
                <div id="messages">
                    <h1>Whoops!</h1>
                    <ul>
                        {warnings.map(w => <li key={w}>{w}</li>)}
                    </ul>
                </div>
            );
        }

        return warningList;
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
            key: sequentialId(),
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
        // This function updates the GIF based the image data on each frame.
        //
        // Processing each frame and turning the canvas data into GIF data is
        // the most time consuming part of making a GIF. So...
        //
        // 1) Do it in a web worker so it doesn't block.
        //
        // 2) Cache the result as 'frame.imageData'. If the user doesn't change
        // a given frame, we don't have to reprocess that frame next time they
        // update the GIF.
        //
        // TODO: Currently this isn't very "thread-safe"- if the user makes
        // modifications to the frames or images while the GIF is being built,
        // it won't work quite right. For now, using a big overlay div to
        // prevent edits.
        //
        // The issue is that the result that comes back from the web worker is
        // missing important information (frame duration and disposal method)
        // that's in the state.frameData. So, when it does come back, we need
        // to look through the frameData to get that information, and we need
        // all the frames to still be in the frameData (and in the same order)
        // to correctly retrieve it. Instead, we should give the web worker all
        // the information that was in the frame data so that it comes back and
        // we don't need to reconstruct it.
        //
        // Also, we're caching the GIF data back into the frameData structure.
        // This again requires that the frameData have all the same elements it
        // did when we started constructing the GIF, so that we can cache the
        // right date with the right frame. Maybe we can store the cache as its
        // own data structure instead. This would require a means of matching
        // the cached data with the correct frame without it all being in the
        // same number/order (maybe each frame gets a unique id that updates
        // whenever a drawing gets updated, which can also be used to
        // validate/invalidate the cache).
        //
        // TODO: add progress indicator.

        this.setState({updatingGif: true});
        const promises = this.state.frameData.map(frame => {
            return new Promise((resolve, reject) => {
                if (frame.imageData) {
                    resolve(frame.imageData);
                } else {
                    const w = new Worker;
                    const c = frame.canvas;
                    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
                    w.onmessage = m => resolve(m.data);
                    w.postMessage({
                        'width': c.width,
                        'height': c.height,
                        'data': d.data,
                    });
                }
            });
        });

        Promise.all(promises).then(newImageData => {
            // TODO: Need to lock edits to the gifs while this is going on.
            // Just in case, maybe handle case where there are more frames than
            // we had going in.
            this.setState((state, props) => {
                const newFrameData = state.frameData.map((f, i) => {
                    return update(f, {imageData: {$set: newImageData[i]}});
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
                        this.props.width,
                        this.props.height);

                return {gifData, frameData: newFrameData, updatingGif: false};
            });
        });
    }


    render() {
        const overlay = this.state.updatingGif ? <div id="overlay">Working...</div> : null;

        const invalidFrames = this.state.frameData.some((f) =>
                f.delay === null);
        const warnings = this.getWarnings();

        const currentFrame = this.state.frameData[this.state.currentFrame];
        const frameList = this.getFrameList();

        const gif = this.state.gifData ?
            <img src={this.state.gifData} /> :
            null;

        const gifContainerStyle = {
            "width": this.props.width,
            "height": this.props.height,
        };

        const brush = this.state.brushSize === null ?
            null :
            createRoundBrush(this.state.brushSize, this.state.color);

        return (
            <main>
            {overlay}
            <Hideable showText="Help!" hideText="Hide help">
                <p>You're now editing a GIF. You can draw in the red-outlined area
                below using your mouse. Change your brush size and color using
                the controls immediately above the drawing area.</p>
                <p>Below the drawing area, you can see your frames, displayed
                in order left to right. The current frame is darker blue.
                Switch to a different frame by clicking on it.</p>
                <p>Change the "Duration" setting for a given frame to change
                how long that frame will be displayed in each animation loop.
                Durations are in hundredths of a second.</p>
                <p>To stitch your frames into an animated GIF, click the blue
                "Create GIF" button. Your GIF will display in the blue-outlined
                area underneath. If your GIF is especially wide and/or tall,
                this may take a few moments.</p>
                <p>To save your work, right or control click the GIF you've
                created and click save.</p>
                <p>Have fun!</p>
            </Hideable>
            {warnings}
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
                    colors={this.getColorOptions()}
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

                <p>▲Draw in the area outlined in <span
                className="red">red</span> above.</p>

                <p>▼Switch the active frame by clicking the one you want
                below.</p>

                <ol id="frameList">
                    {frameList}
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
            <ConfirmButton action={this.props.abort}>
                Abort GIF
            </ConfirmButton>
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
