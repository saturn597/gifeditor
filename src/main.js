import React from 'react';
import ReactDOM from 'react-dom';

import {getGifData, makeFrame} from './gifs.js';

require('babel-polyfill');

const DATAURLPREFIX = 'data:image/gif;base64,';


window.addEventListener('load', function() {
	// TODO: should consider switching to document.addEventListener, and use
	// DOMContentLoaded instead of load (load waits until EVERYTHING is loaded
	// which is more necessary for my tests than it might be for the actual
	// application).
    ReactDOM.render(
            React.createElement(GifEditor),
            document.getElementById('mount')
            );
});


class GifEditor extends React.Component {
    render() {
        const animCanvas = [];
        const animImg = [];
        const animCtx = [];
        let frames = [];
        for (let i = 0; i < 3; i++) {
            animCanvas[i] = document.createElement('canvas');
            animImg[i] = document.getElementById('animation' + (i + 1));
            animCanvas[i].width = animImg[i].width;
            animCanvas[i].height = animImg[i].height;
            animCtx[i] = animCanvas[i].getContext('2d');
            animCtx[i].drawImage(animImg[i], 0, 0);
            frames[i] = makeFrame(animCanvas[i], Math.floor(Math.random() * 100 + 1), 1);
        }
        frames = [frames[1], frames[2], frames[1], frames[2], frames[0]];

        const data = getGifData(frames, 0);

        // One might consider just using:
        //
        // const b64 = window.btoa(String.fromCharCode(...data));
        //
        // BUT data could be very large, and browsers can't handle that many
        // arguments. So doing that leads to max call stack size exceeded
        // errors when using larger images.
        const b64 = window.btoa(data.map(i => String.fromCharCode(i)).join(''));

        return <img src={DATAURLPREFIX+b64}></img>
    }
}
