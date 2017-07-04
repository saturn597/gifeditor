import React from 'react';
import ReactDOM from 'react-dom';

// TODO: Drawing to the canvas takes place outside React. This doesn't seem
// right. My program is dealing explicitly with a lot of "procedural" things
// (like when to update which canvas), rather than just having a render method
// that knows how to update based on states and props. For now this doesn't
// seem to be an issue but this approach might need to be reconsidered. Is this
// an appropriate use of React?


function lineCoords(pt1, pt2) {
    // We want to find a set of coordinates between pt1 and pt2 so that, if we
    // draw a pixel at each coordinate, it looks like there's a continuous line
    // between the points.
    //
    // To do this, imagine an "ideal" line that goes through those points.
    //
    // Now, pick a dependent and independent axis.
    //
    // For the independent axis, we'll take a value for every increment of 1
    // between pt1 and pt2.
    //
    // At each of those values, calculate where on the dependent axis the ideal
    // line falls. This tells us where we should put the next point.
    //
    // For this to work, the values along the dependent axis can't increase by
    // more than 1 for each increment along the independent axis (otherwise, it
    // would look discontinuous). So, set the axes so that the slope is <= 1.

    let m = (pt2.y - pt1.y) / (pt2.x - pt1.x);

    let independent = 'x';
    let dependent = 'y';
    if (Math.abs(m) > 1) {
        dependent = 'x';
        independent = 'y';
        m = 1 / m;
    }

    const start = Math.min(pt1[independent], pt2[independent]);
    const end = Math.max(pt1[independent], pt2[independent]);

    let iterable = {};

    iterable[Symbol.iterator] = function* () {
        for (let i = start; i <= end; i++) {
            let result = {};
            result[independent] = i;
            result[dependent] = m * (i - pt1[independent]) + pt1[dependent];
            yield result;
        }
    }

    return iterable;
}


class DrawCanvas extends React.Component {
    // React component for mouse drawing on a canvas. It needs these props:
    //
    // - a width and height for the dimensions of the drawing area in pixels
    //
    // - content, to specify what the canvas should look like before drawing
    // takes place. Can be any object that's drawable by
    // canvasContext.drawImage, including a canvas. The canvas will revert to
    // the specified content when it is re-rendered.
    //
    // - a drawingUpdated method. This gets called every time the user finishes
    // drawing a line (after the tracking canvas is updated).
    //
    // - a brush - this can be any object that's drawable by canvasContext.drawImage.

    constructor(props) {
        super(props);

        this.mouseDown = this.mouseDown.bind(this);
        this.mouseMove = this.mouseMove.bind(this);
        this.mouseOut = this.mouseOut.bind(this);
        this.mouseUp = this.mouseUp.bind(this);

        this.mouseIsDown = false;
        this.lastPoint = {x: 0, y: 0};
    }

    componentDidMount() {
        // Image smoothing can introduce semi-transparent pixels (which GIFs
        // can't handle), and increases the number of colors (which we might
        // not want because GIFs can only handle 256 colors in a given frame).
        // TODO: Caution, further investigation may be warranted since
        // imageSmoothingEnabled is "experimental":
        // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled
        this.context.imageSmoothingEnabled = false;

        this.context.drawImage(this.props.content, 0, 0);
    }

    componentDidUpdate() {
        // Make sure we're updated with the content.
        const canv = this.context.canvas;
        this.context.clearRect(0, 0, canv.width, canv.height);
        this.context.drawImage(this.props.content, 0, 0);
    }

    draw(pts) {
        if (!this.props.brush) {
            return;
        }
        const context = this.context;
        context.beginPath();
        const brush = this.props.brush;
        for (let pt of pts) {
            // Take Math.floor so we're not placing at fractional pixels (which
            // would have weird results).
            context.drawImage(
                    brush,
                    Math.floor(pt.x - brush.width / 2),
                    Math.floor(pt.y - brush.height / 2)
            );
            /*context.arc(
                    pt.x,
                    pt.y,
                    1,
                    0,
                    2 * Math.PI
                   );*/
            //context.rect(pt.x, pt.y, 5, 5);
        }
        context.fill();
    }

    mouseDown(e) {
        e.nativeEvent.preventDefault();

        this.mouseIsDown = true;

        this.lastPoint = {
            'x': e.nativeEvent.offsetX,
            'y': e.nativeEvent.offsetY
        };

        this.draw([this.lastPoint]);
    }

    mouseMove(e) {
        if (!this.mouseIsDown) {
            return;
        }

        const currentPoint = {'x': e.nativeEvent.offsetX, 'y': e.nativeEvent.offsetY};;
        this.draw(lineCoords(this.lastPoint, currentPoint));
        this.lastPoint = currentPoint;
    }

    mouseOut() {
        // If the user clicks the mouse, moves it out of the canvas, then
        // mouses up, we won't catch the mouse up event because it wasn't in
        // the canvas. So just pretend we got a mouse up when the mouse leaves
        // the canvas.
        if (this.mouseIsDown) {
            this.mouseUp();
        }
    }

    mouseUp() {
        this.mouseIsDown = false;

        // drawingUpdated could maybe be signaled in mouseMove or draw but that
        // makes line drawing feel unresponsive.
        // TODO: does it work better/faster to pass a canvas or an image to
        // drawingUpdated?
        const c = this.context.canvas;
        const newC = document.createElement('canvas');
        newC.width = c.width;
        newC.height = c.height;
        const newCtx = newC.getContext('2d');
        newCtx.drawImage(c, 0, 0);
        this.props.drawingUpdated(newC);
    }

    render() {
        return <canvas
            onMouseDown={this.mouseDown}
            onMouseUp={this.mouseUp}
            onMouseMove={this.mouseMove}
            onMouseOut={this.mouseOut}
            ref={c => {
                if (c) {
                    this.context = c.getContext('2d');
                }
            }}
            width={this.props.width}
            height={this.props.height}
        ></canvas>
    }
}


export {DrawCanvas};
