console.log('yes');

const imgData = "47 49 46 38 39 61 0A 00 0A 00 91 00 00 FF FF FF FF 00 00 00 00 FF 00 00 00 21 F9 04 00 00 00 00 00 2C 00 00 00 00 0A 00 0A 00 00 02 16 8C 2D 99 87 2A 1C DC 33 A0 02 75 EC 95 FA A8 DE 60 8C 04 91 4C 01 00 3B";

const b64 = window.btoa(String.fromCharCode(...imgData.split(' ').map(b => parseInt(b, 16))));
console.log(b64);

const img = new Image();

img.src = 'data:image/gif;base64,' + b64;

document.getElementsByTagName('body')[0].appendChild(img);
