// Module for constructing a (possibly animated) GIF out of images stored in
// HTML5 canvases.

// To make a GIF, first create one or more instances of Frame to represent the
// individual frame(s) of the animation, then pass those frames to getGifData.


/************* Public interface *************/
class Frame {
    // Class for objects corresponding to one frame of a GIF. These objects can
    // be passed to getGifData to actually retrieve the binary data for a GIF.

    constructor(canvas, delay, disposal) {
        // Canvas indicates which canvas to reference when pulling image data
        // for this frame. When getData is called, the image data will pulled
        // from that canvas.
        //
        // Delay is how long the frame lasts in hundredths of a second (greater
        // than or equal to 0 and less than 256 ** 2).
        //
        // Disposal is an integer 0-7 and specifies what to do with this frame
        // when advancing to the next frame. 0 means we have a static image, so
        // we won't advance to another frame. 1 means draw the next image on
        // top of this one, 2 means restore all pixels to the background color,
        // 3 (not widely supported) means go back to the state before the
        // current frame was drawn. 4-7 are not yet defined.

        this.canvas = canvas;
        this.setDelay(delay);
        this.setDisposal(disposal);
    }

    getData() {
        const imageLeft = 0;
        const imageTop = 0;

        const ctx = this.canvas.getContext('2d');
        const {indices, colors} = toIndices(ctx);

        if (colors.length > 256) {
            throw 'Too many colors in frame.';
        }

        let result = [];

        const {
            colorTable,
            encodedColorTableSize,
            minCodeSize
        } = getColorData(colors);

        // Push the image descriptor section
        result.push(
            0x2c,  // Image separator - begins each image descriptor
            ...getBytes(imageLeft, 2),
            ...getBytes(imageTop, 2),
            ...getBytes(this.canvas.width, 2),
            ...getBytes(this.canvas.height, 2),
            pack([
                    [colorTable.length > 0 ? 1 : 0, 1],  // Local color table present?
                    [0, 1],  // Interlace flag. Currently ignoring.
                    [0, 1],  // Sort flag. Currently ignoring.
                    [0, 2],  // "Reserved for future use" in GIF standard.
                    [encodedColorTableSize, 3]  // Size of local color table.
            ])
        );

        // Push the color table
        if (colorTable.length > 0) {
            result.push(...colorTable);
        }

        // Gather what we need for the image data section.
        const cr = getCodeReader(indices, minCodeSize);

        const data = chunkify(Array.from(getByteReader(cr, 8)), 255);

        // The image data section starts with the minimum code size, then byte
        // representations of the actual image data (a chunk size, then the
        // byte representation of the codes, then another chunk size if there's
        // more data left, etc.)
        result.push(minCodeSize);
        for (let d of data) {
            if (!Number.isInteger(d) || d > 255 || d < 0) {
                throw "Invalid data point!";
            }
        }
        // Note, using result.push(...data) results in "maximum call stack size
        // exceeded" in Chromium with larger images - can't call a method with
        // that many arguments.
        result = result.concat(data);
        result.push(0);


        return result;
    }

    setDelay(delay) {
        if (!Number.isInteger(delay) || delay < 0 || delay >= 256 ** 2) {
            throw "invalid delay value";
        }
        this.delay = delay;
    }

    setDisposal(disposal) {
        if (!Number.isInteger(disposal) || disposal < 0 || disposal > 7) {
            throw "invalid disposal method";
        }
        this.disposal = disposal;
    }

}


function getGifData(frames, repeats, width, height) {
    // Returns an array of integers 0-255. Each integer represents 1 byte of
    // the binary data representing a GIF.
    //
    // frames: image and timing data for each frame.
    // repeats: number of times to repeat the animation. 0 to repeat forever.
    // width: sets the width listed in the GIF's logical screen descriptor
    // section.
    // height: sets the height listed in the GIF's logical screen descriptor
    // section.
    //
    // The width and height in the logical screen descriptor are largely
    // ignored by GIF clients. If they're unspecified, the relevant section
    // of the GIF output will just be zeroed.

    if (width === undefined) {
        width = 0;
    }

    if (height === undefined) {
        height = 0;
    }

    if (!Number.isInteger(repeats) || repeats < 0 || repeats > 65535) {
        throw 'Invalid number of repeats';
    }

    if (!Number.isInteger(width) || width < 0 || width > 65535) {
        throw 'Invalid width';
    }

    if (!Number.isInteger(height) || height < 0 || height > 65535) {
        throw 'Invalid height';
    }

    const globalColors = [];  // Currently not using global color table
    // TODO: might be good to have one for some cases?

    const {
        colorTable,
        encodedColorTableSize,
    } = getColorData(globalColors);

    const bgColorIndex = 0;  // index to use for pixels not specified in image data. 0 if no global color table.

    // http://stackoverflow.com/questions/7128265/purpose-of-color-resolution-bits-in-a-gif
    // (I'm not really setting this correctly).
    const colorResolution = encodedColorTableSize;

    const pixelAspectRatio = 0;

    // First 6 bytes identify this as a GIF, version 89a
    let data = toCharCodes('GIF89a');

    // Now the logical screen descriptor.
    data.push(
        ...getBytes(width, 2),
        ...getBytes(height, 2),
        pack([
            [colorTable.length > 0 ? 1 : 0, 1],  // global color table present?
            [colorResolution, 3],
            [0, 1],  // this is the sort flag, which is now largely ignored
            [encodedColorTableSize, 3],  // global color table size
        ]),
        bgColorIndex,
        pixelAspectRatio
    );

    // Add global color data if present.
    if (colorTable.length > 0) {
        data.push(...colorTable);
    }

    // If we have multiple frames, add the application extension block required
    // for animation. Application extension blocks are supposed to be used for
    // "application specific information." The information they convey in
    // modern GIFs is usually about how many times the animation repeats. This
    // was originally specific to Netscape, hence the required NETSCAPE2.0
    // label.
    if (frames.length > 1) {
        data.push(...[
                0x21,  // Extension introducer.
                0xff,  // Labels this as an application extension.
                0x0b,  // We'll need 0x0b (11) bytes for the NETSCAPE2.0 label.
                ...toCharCodes('NETSCAPE2.0'),
                0x03,  // Indicates 3 bytes of data follow.
                0x01,  // This is always 1.
                ...getBytes(repeats, 2),  // Number of repeats.
                0x00  // Block terminator.
        ]);
    }

    for (let frame of frames) {
        // TODO: getGCE could probably be folded in as a frame method, and the
        // results included in frame.getData. Also, getGCE doesn't need to be
        // there if the GIF has only 1 frame. Also, frame.disposal should
        // technically be 0 if there's only 1 frame - maybe generate an
        // exception?
        data.push(...getGCE(frame.delay, frame.disposal));
        data = data.concat(frame.getData());
    }

    data.push(0x3b);  // 0x3b signals end of GIF

    return data;
}


/************* GIF-related helper functions *************/
// To generate GIF image data, we need three steps - 1) represent the color of
// each pixel as an "index" in a color table. 2) Compress those indices to
// "codes", where each code represents some series of indices, according to the
// LZW compression method. 3) Convert those codes to actual bytes, where the
// size of each code in the byte can vary within a single image. The actual
// stream of bytes is divided into "chunks" of no more than 255 bytes, each of
// which is prefaced by a byte giving the length of the following chunk. Each
// frame of the GIF is prefaced by a Graphic Control extension with a
// standardized format.

function chunkify(arr, maxSize) {
    const chunkified = [];
    let remaining = arr.length;
    let chunkSize = 0;

    // TODO: maybe more efficient to do with splices/slices?
    for (let i of arr) {
        if (chunkSize === 0) {
            chunkified.push(Math.min(maxSize, remaining));
        }
        chunkified.push(i);

        remaining -= 1;
        chunkSize += 1;
        if (chunkSize >= maxSize) {
            chunkSize = 0;
        }
    }

    return chunkified;
}


function getByteReader(items, outSize) {
    let currentPiece = 0;
    let currentPieceSize = 0;
    let remainder = 0;
    let remainderSize = 0;

    let reader = {};

    reader[Symbol.iterator] = function* () {
        for (let [code, size] of items) {
            currentPiece += code * 2**currentPieceSize;
            currentPieceSize += size;
            while (currentPieceSize >= outSize) {
                yield currentPiece & (2 ** outSize - 1);
                currentPiece = currentPiece >> outSize;
                currentPieceSize -= outSize;
            }
        }

        if (currentPieceSize > 0) {
            yield currentPiece;
        }
    };

    return reader;
}


function getCodeReader(indices, minCodeSize) {
    // Returns an iterator through a series of codes representing the image
    // data in a GIF. To compute the codes, we use the GIF version of LZW
    // compression to compress the indices we are given.
    //
    // These codes will need to be converted to bits in order to output GIF
    // data. The number of bits each code takes up - the code size - changes as
    // we build the GIF. So at each iteration, our iterator yields both the
    // code itself and the size of that code.
    //
    // indices: the data being compressed. Each index should be an integer
    // ranging from 0 to 2 ** minCodeSize - 1.
    // minCodeSize: the minimum code size. The initial code size will be
    // minCodeSize + 1 (to allow for the "clear" and "end" codes).

    const codes = [];
    const codeTable = new Map();

    let codeSize;
    let nextCode;

    function initializeCodeTable() {
        codeSize = minCodeSize + 1;
        codeTable.clear();

        // We allow indices from 0 to 2**minCodeSize - 1. Populate our initial
        // code table with a code for each possible index. We'll populate it
        // later with codes representing sequences of multiple indices.
        for (let i = 0; i < 2**minCodeSize; i++) {
            codeTable.set(i.toString(10), i);
        }
        codeTable.set('clear', 2**minCodeSize);
        codeTable.set('end', 2**minCodeSize + 1);
        nextCode = codeTable.get('end') + 1;
    }
    initializeCodeTable();

    const reader = {};
    reader[Symbol.iterator] = function* () {
        let indexBuffer = [indices[0]];
        let indexBufferString = indices[0].toString(10);

        yield [codeTable.get('clear'), codeSize];

        for (let index of indices.slice(1)) {
            indexBufferString += ',' + index;
            indexBuffer.push(index);
            if (codeTable.get(indexBufferString) === undefined) {
                yield [codeTable.get(indexBuffer.slice(0, -1).join(',')),
                    codeSize];

                codeTable.set(indexBufferString, nextCode);
                indexBuffer = indexBuffer.slice(-1);
                indexBufferString = indexBuffer.toString();
                if (nextCode === 2**codeSize) {
                    codeSize += 1;
                }

                nextCode++;
                if (nextCode === 4096) {
                    // The GIF code table can only have up to 4095 entries, so
                    // if we exceed this, issue the code to clear the table.
                    yield [codeTable.get('clear'), codeSize];
                    initializeCodeTable();
                }
            }
        }

        yield [codeTable.get(indexBuffer.join(',')), codeSize];

        yield [codeTable.get('end'), codeSize];

    };

    return reader;
}


function getColorData(colors) {
    // Takes an array of colors (where each element is a 3-array containing the
    // red, green, and blue components of the color, in that order, and where
    // each component is between 0 and 255). Outputs an object that represents
    // information we need to represent our colors in a GIF.

    // We might not have any colors, so we want to allow an empty color
    // table. Handle that separately.
    if (colors.length === 0) {
        return {
            colorTable: [],
            encodedColorTableSize: 0,
            minCodeSize: 2
        };
    }

     // We also don't want to deal with a color table of length 1 - GIF parsers
     // seem to expect at least a couple of colors (even if the image only
     // contains one).
    if (colors.length === 1) {
        colors.push([0, 0, 0]);
    }

    // GIFs can only have up to 256 colors.
    if (colors.length > 256) {
        throw 'too many colors';
    }

    // When we construct a GIF, we'll need to assign a binary code to each
    // color. How many bits wide should those codes be to uniquely represent
    // all of the colors?
    const baseCodeSize = Math.ceil(Math.log2(colors.length));

    // Experimenting (and checking GIFs exported from GIMP) suggests that GIF
    // parsers may expect an actual minimum code size of at least 2 (though the
    // color table can still contain only 2 colors, which could be represented
    // with one bit).
    const minCodeSize = Math.max(2, baseCodeSize);

    // Since the color table size must be a power of two, the size of the color
    // table may be larger than the length of the colors array we were passed.
    const actualColorCount = 2 ** baseCodeSize;

    // We need to list the color table size in the GIF, encoded (for both local
    // and global color tables) as an integer "n" between 0 and 7, where the
    // actual number of colors is 2 ^ (n + 1).
    const encodedColorTableSize = baseCodeSize - 1;

    // To produce a usable color table we'll need it to contain a number of
    // colors that's an integer power of two.
    const padding = Array(actualColorCount - colors.length).fill([0, 0, 0]);

    // The final color table must be a flat array where every three elements
    // represent a color. Pad and then flatten the colors array to get a color
    // table we can insert into our GIF data.
    const colorTable = [].concat(...colors.concat(...padding));

    return {
        colorTable,
        encodedColorTableSize,
        minCodeSize
    };
}


function getGCE(delay, disposal, transparentIndex) {
    // Build a graphic control extension (GCE) for a single frame of a GIF.
    //
    // Delay is how long this frame should last in 100ths of a second. Disposal
    // is what happens to the image in this frame when we advance to the next
    // (the meaning of each disposal value is discussed in the Frame
    // constructor).
    //
    // The transparent index in a GIF says which index corresponds to a
    // transparent pixel in the image data that's to follow. Must be 0-255. If
    // this is unspecified, we'll output data indicating that we won't use
    // transparency.

    if (!Number.isInteger(disposal) || disposal < 0 ||
            disposal > 7) {
        throw "invalid disposal method";
    }

    if (!Number.isInteger(delay) || delay < 0 || delay >= 256 ** 2) {
        throw "invalid delay value";
    }

    let transparency = true;
    if (transparentIndex === undefined) {
        transparentIndex = 0;
        transparency = false;
    }

    if (!Number.isInteger(transparentIndex) || transparentIndex >= 256) {
        throw "invalid transparentIndex value";
    }

    // Now return the graphic control extension (GCE).
    return [
        0x21,  // Begin header. 0x21 marks the beginning of an extension block.
        0xf9,  // Identifies this block as a GCE.
        0x04,  // Header ends with number of bytes that follow.
        pack(
                [[0, 3],   // Reserved for future use in GIF standard.
                [disposal, 3],  // Disposal method gets 3 bits.
                [0, 1],  // "User input flag" - not widely used, just 0.
                [transparency ? 1 : 0, 1]]),  // Do we use transparency?
        ...getBytes(delay, 2),  // 2 bytes for the delay time.
        transparentIndex,  // Image data index representing transparent pixel.
        0x00  // Block terminator.
    ];
}


function toIndices(ctx) {
    // Convert a canvas context to a series of "indices."
    //
    // Each index is a number corresponding to one pixel read from the canvas.
    //
    // The value of the index depends on the color of the pixel.
    //
    // Return an object containing:
    //
    // 1) the array of indices themselves, ordered from the top left of the
    // image to the bottom right.
    //
    // 2) an array listing each color that appears in the image. This is a key
    // showing which index represents which color. The 0th element is the color
    // represented by indices of "0", etc. Each color is represented as a 3
    // element array (containing the red, green, and blue components of the
    // color, in that order).

    const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;

    const colors = [];
    const colorMap = new Map();

    const indices = [];

    let opacityWarningShown = false;
    for (let i = 0; i < d.length; i+=4) {
        if (!opacityWarningShown && d[i+3] !== 255) {  // TODO: could support transparent pixels
            console.log('warning! non-opaque pixels');
            opacityWarningShown = true;
        }

        const current = [d[i], d[i+1], d[i+2]];

        let index = colorMap.get(current.join(','));
        if (index === undefined) {
            index = colors.length;
            colors.push(current);
            colorMap.set(current.join(','), index);
        }
        indices.push(index);
    }

    return {indices, colors};
}


/************* Helper functions for handling binary data *************/
function getBytes(integer, numBytes) {
    // Take an integer representing a series of bytes.  Return an array of
    // integers, where each represents one of the bytes. Note, the most
    // significant bytes will be LAST (this is how GIFs do things).

    if (integer > 2 ** (8 * numBytes) - 1) {
        throw 'Insufficient bytes for number given.';
    }

    const byteMask = 255;  // i.e., 11111111
    const output = [];
    for (let i = 0; i < numBytes; i++) {
        output.push(integer & byteMask);
        integer = integer >> 8;
    }

    return output;
}


function pack(data) {
    // "Pack" a series of integer values into a single integer, based on
    // how many bits each value takes up.
    //
    // Data is an array. Each element is an array containing two elements:
    // the first a value, and the second says how many bits that value takes
    // up. Proceeding through data, the first part will take up the most
    // significant bits, and the later parts take up less significant bits.

    let currentPosition = 0;
    let b = 0;

    for (let [value, size] of data.reverse()) {
        if (!Number.isInteger(value) || value < 0 || value >= 2 ** size) {
            throw "Can't pack value into byte";
        }
        b += value * 2 ** currentPosition;
        currentPosition += size;
    }

    return b;
}


function toCharCodes(str) {
    return str.split('').map(c => c.charCodeAt(0));
}


export {Frame, getGifData};
