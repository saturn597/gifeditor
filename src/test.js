import React from 'react';
import ReactDOM from 'react-dom';

import {Frame, getGifUrl} from './gifs.js';

require('babel-polyfill');


function getImage(src) {
    // Return a promise to load an image - useful for preloading.

    return new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = resolve;
        i.onerror = reject;
        i.src = src;
    });
}


class Test extends React.Component {
    render() {

        const tests = [
            {
                desc: 'Basic GIF.',
                frames: [{src: 'data:image/gif;base64,R0lGODlhCgAKAJEAAP////8AAAAA/wAAACH5BAAAAAAALAAAAAAKAAoAAAIWjC2Zhyoc3DOgAnXslfqo3mCMBJFMAQA7'}],
            },

            {
                desc: 'Only one color.',
                frames: [{src: 'images/onecolor.png'}],
            },

            {
                desc: 'Two colors.',
                frames: [{src: 'images/twocolors.png'}],
            },

            {
                desc: 'Basic animation.',
                frames: [
                    {src: 'images/animation1.gif', delay: 1},
                    {src: 'images/animation2.gif', delay: 1},
                    {src: 'images/animation3.gif', delay: 1},
                ],
            },
        ];

        const testers = tests.map((t, k) =>
                <GifTester
                    key={k}
                    frames={t.frames}
                    desc={t.desc}
                    show={true} />);

        return (
            <div>
                Legend:
                <div className="test">
                    Description.
                    <div className="testImages">Base image(s)</div>
                    <div className="testGif">Gif created</div>
                </div>
                Tests: {testers}
            </div>
        )
    }
}


class GifTester extends React.Component {
    constructor(props) {
        super(props);
        this.state = {imagesLoaded: false};
        const promises = this.props.frames.map((i) => getImage(i.src));
        Promise.all(promises).then(() => this.setState({imagesLoaded: true}));

        this.gifSrc = '';
    }

    componentWillUpdate(nextProps, nextState) {
        if (nextState.imagesLoaded) {
            const frames = nextProps.frames.map((image) => {
                const i = new Image();
                i.src = image.src;

                const c = document.createElement('canvas');
                c.width = i.width;
                c.height = i.height;

                const ctx = c.getContext('2d');
                ctx.drawImage(i, 0, 0);

                return new Frame(c, image.delay || 50, 1);
            });
            this.gifSrc = getGifUrl(frames, 0);
        }
    }

    render() {
        if (!this.props.show) {
            return <div />
        }

        const images = this.props.frames.map((i, k) =>
            <img src={i.src} key={k} />);

        return (
            <div className="test">
                {this.props.desc}
                <div className="testImages">
                    {images}
                </div>
                <div className="testGif">
                    {
                        this.state.imagesLoaded ?
                            <img src={this.gifSrc} /> :
                            'GIF in process...'
                    }
                </div>
            </div>
        );
    }
}


document.addEventListener('DOMContentLoaded', function() {
    ReactDOM.render(
            <Test />,
            document.getElementById('mount')
            );
});
