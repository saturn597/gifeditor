import React from 'react';
import ReactDOM from 'react-dom';

// TODO: Drawing to the canvas takes place outside React. This doesn't seem
// right. I don't know if there's any guarantee React won't, say, decide at
// some point to render a new canvas element with blank image data (though
// maybe it won't as long as nothing changes about the canvas' properties since
// "React only updates what's necessary). For now this doesn't seem to be an
// issue but this approach might need to be reconsidered. Is this an
// appropriate use of React?


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
    constructor(props) {
        super(props);
        this.state = {mouseDown: false};
    }

    componentDidMount() {
        // Initial line for testing line drawing:
        const coords = lineCoords({
            'x': 200,
            'y': 500
        },
        {
            'x': 200,
            'y': 0
        });
        this.draw(coords);
    }

    draw(pts) {
        const context = this.context;
        context.beginPath();
        for (let pt of pts) {
            /*context.arc(
                    pt.x,
                    pt.y,
                    1,
                    0,
                    2 * Math.PI
                   );*/
            context.rect(pt.x, pt.y, 1, 1);
        }
        context.fill();
    }

    mouseDown(e) {
        const startPoint = {'x': e.nativeEvent.offsetX, 'y': e.nativeEvent.offsetY};
        this.draw([startPoint]);
        this.setState({lastPoint: startPoint, mouseDown: true});
    }

    mouseUp() {
        this.setState({mouseDown: false});
    }

    mouseMove(e) {
        if (!this.state.mouseDown) {
            return;
        }

        const currentPoint = {'x': e.nativeEvent.offsetX, 'y': e.nativeEvent.offsetY};;
        this.draw(lineCoords(this.state.lastPoint, currentPoint));
        this.setState({'lastPoint': currentPoint});
    }

    render() {
        return <canvas
            width="700"
            height="500"
            onMouseDown={this.mouseDown.bind(this)}
            onMouseUp={this.mouseUp.bind(this)}
            onMouseMove={this.mouseMove.bind(this)}
            ref={c => {
                if (c) {
                    this.context = c.getContext('2d');
                }
            }}
        ></canvas>
    }
}


export {DrawCanvas};
