require('babel-polyfill');
import {canvasDataToGIFData} from './gifs.js';

onmessage = (e) => {
    const { width, height, data } = e.data
    postMessage(canvasDataToGIFData(data, width, height));
};
