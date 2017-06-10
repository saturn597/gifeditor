import React from 'react';
import ReactDOM from 'react-dom';

import {Frame, getGifUrl} from './gifs.js';

require('babel-polyfill');


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

        const data = getGifUrl(testFrames, 0);
        return <img src={getGifUrl(testFrames, 0)} />
    }
}

window.addEventListener('load', function() {
    ReactDOM.render(
            <Test />,
            document.getElementById('mount')
            );
});
