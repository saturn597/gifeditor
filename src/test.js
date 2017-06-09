import React from 'react';
import ReactDOM from 'react-dom';

import {Frame, getGifData} from './gifs.js';

require('babel-polyfill');

// TODO: DATAURLPREFIX is defined in main.js too - consider consolidating.
const DATAURLPREFIX = 'data:image/gif;base64,';


class Test extends React.Component {
    render() {
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
        const b64 = window.btoa(data.map(i =>
                    String.fromCharCode(i)).join(''));
        return <img src={DATAURLPREFIX+b64} />
    }
}

window.addEventListener('load', function() {
    ReactDOM.render(
            <Test />,
            document.getElementById('mount')
            );
});
