import { Point } from './point'
import { IRaycastObject } from './IRaycastObject'

// Allows live-reload with esbuild
new EventSource("/esbuild").addEventListener("change", () => location.reload());

const skyColorAsInt = 0xff << 24 | 50 << 16 | 50 << 8 | 50;
const skyColor = "rgb(50,50,50)";

let show2DOverlay = false;
let wallTextureIndex = 1;
let printDebugInfoThisFrame = false;

let lightRadius = 8;
const aspectRatio = 16 / 9;
const horizontalResolution = 1080;
const verticalResolution = Math.round(horizontalResolution / aspectRatio);

const body = document.getElementsByTagName("body")[0] as HTMLElement;
body.style.margin = "0px";
body.style.backgroundColor = skyColor;
body.style.overflow = "hidden";
body.style.height = "100vh";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.width = horizontalResolution
canvas.height = verticalResolution

canvas.style.margin = "auto"
canvas.style.display = "block"
canvas.style.backgroundColor = skyColor
canvas.style.imageRendering = "pixelated"
canvas.style.transformOrigin = "top center"

window.onresize = () => {
    const canvasScaleFactor = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
    canvas.style.transform = `scale(${canvasScaleFactor})`
    canvas.style.marginTop = `calc(50vh - ${canvas.height * canvasScaleFactor / 2}px)`
}
window.dispatchEvent(new Event('resize'));

const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

// This is for the double buffer
const bufferCanvas = document.createElement("canvas");
bufferCanvas.height = canvas.height;
bufferCanvas.width = canvas.width;
const bufferCtx = bufferCanvas.getContext("2d") as CanvasRenderingContext2D;
bufferCtx.imageSmoothingEnabled = false;
bufferCtx.translate(.5, .5);

const bufferData = bufferCtx.getImageData(0, 0, canvas.width, canvas.height);
const bufferArray8 = bufferData.data;
const bufferArray32 = new Uint32Array(bufferData.data.buffer);

const room = `
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
X.................X...........X
X..X........XXXX..X..XXXX..XXXX
X..X........X........X..X.....X
XXXX........XXXX..XXXX..XXXX..X
X.....X.....X........X.....X..X
XXXXXXX..XXXX..XXXXXXX..XXXX..X
X.....X..X..............X.....X
X..XXXXXXX..XXXXXXXXXX..XXXX..X
X.....X........X........X.....X
X..XXXXXXX..XXXX..XXXXXXX..XXXX
X..X.....X.....X.....X........X
X..X..XXXXXXXXXXXXXXXXXXXXXX..X
X........X..X..X..X..X.....X..X
X..X..XXXX..X..X..X..XXXX..X..X
X..X.....X.....X..............X
X..XXXX..XXXX..XXXXXXX..X..X..X
X.....X...........X.....X..X..X
X..X..X..XXXX..XXXX..XXXXXXXXXX
X..X..X..X....................X
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`.toUpperCase().trim().split("\n");

const roomHeight = room.length;
const roomWidth = room[0].length;

const TwoPi = 2 * Math.PI;
const camera = {
    pos: new Point(1.5, 1.5),
    radialAngle: Math.PI / 2,
    personalSpace: .25,
    fieldOfView: Math.PI / 3
}

const cellHeight = canvas.height / roomHeight;
const cellWidth = canvas.width / roomWidth;

var keys = {};
window.onkeyup = (e: KeyboardEvent) => { keys[e.key] = false; }
window.onkeydown = (e: KeyboardEvent) => { keys[e.key] = true; /*console.log(e.key);*/ }

const drawCircle = (point: Point, radius: number): void => {
    bufferCtx.beginPath();
    bufferCtx.arc(
        Math.round(point.x), 
        Math.round(point.y), 
        radius, 
        0, 
        TwoPi);
    bufferCtx.stroke();
}

const drawLine = (startPoint: Point, endPoint: Point): void => {
    bufferCtx.beginPath();
    bufferCtx.moveTo(
        Math.round(startPoint.x), 
        Math.round(startPoint.y));
    bufferCtx.lineTo(
        Math.round(endPoint.x),
        Math.round(endPoint.y));
    bufferCtx.stroke();
}

const getShadowColor = (alpha: number): string => {
    return `rgba(0,0,0,${alpha})`
}

const clamp = (num: number, min: number, max: number): number => Math.min(Math.max(num, min), max);

const getGeneralDirection = (angle: number): "l" | "r" | "u" | "d" => {
    if(angle > Math.PI/4 && angle < Math.PI * 3 / 4) {
        return "d";
    } else if(angle >= Math.PI * 3 / 4 && angle <= Math.PI * 5/4) {
        return "l";
    } else if(angle > Math.PI * 5/4 && angle < Math.PI * 7/4) {
        return "u";
    }
    return "r"
}

const handleCollision = (desiredPostion: Point, radius: number, headingDirection: number) : void => {
    const desiredCellX = Math.floor(desiredPostion.x);
    const desiredCellY = Math.floor(desiredPostion.y);
    const neighbors = [
        [desiredCellX - 1, desiredCellY - 1],
        [desiredCellX - 1, desiredCellY],
        [desiredCellX - 1, desiredCellY + 1],
        [desiredCellX, desiredCellY - 1],
        [desiredCellX, desiredCellY + 1],
        [desiredCellX + 1, desiredCellY - 1],
        [desiredCellX + 1, desiredCellY],
        [desiredCellX + 1, desiredCellY + 1]
    ]

    // when intersecting 2 walls at once it can get a little stuck.
    // So you decide to handle the Y axis or X axis collion offsets first
    // rather than applying the whole vector offset at once
    const direction = getGeneralDirection(headingDirection);
    const order = direction === "u" || direction == "d" 
        ? ["y","x"]
        : ["x","y"]

        order.forEach(axis => {
            neighbors.forEach(n => {
                if(room[n[1]][n[0]] != '.') {
        
                    const closestPointOnWall = new Point(
                        clamp(desiredPostion.x, n[0], n[0] + 1),
                        clamp(desiredPostion.y, n[1], n[1] + 1)
                    );
        
                    let dist = closestPointOnWall.distanceTo(desiredPostion);
                    if(dist <= radius) {
                        let offset = closestPointOnWall.vectorBetweenPoints(desiredPostion).getNormalized().magnify(radius - dist);
                        desiredPostion[axis] -= offset[axis];
                        return
                    }
                }
            });
        })
}

const handleInput = (elapsed: number) => {

    // Uncomment to make the room breathe
    //camera.fieldOfView = Math.PI / 3 + (Math.cos(Date.now()/2000) / 20)

    if(keys["a"] || keys["d"]) {
        const direction = keys["a"] ? -1 : 1;
        camera.radialAngle = (camera.radialAngle  + 0.075 * direction) % TwoPi;
    }

    if(keys["ArrowDown"]) {
        keys["ArrowDown"] = false;
        lightRadius = Math.max(lightRadius - .1, 0);
    }

    if(keys["ArrowUp"]) {
        keys["ArrowUp"] = false;
        lightRadius += .1;
    }

    if(keys["w"] || keys["s"]) {
        const cameraAngleCos = Math.cos(camera.radialAngle);
        const cameraAngleSin = Math.sin(camera.radialAngle);
        const speed = .003 * elapsed;
        const direction =  keys["s"] ? -1 : 1;

        const desiredPostion = new Point(
            camera.pos.x + speed * direction * cameraAngleCos,
            camera.pos.y + speed * direction * cameraAngleSin
        );

        handleCollision(desiredPostion, camera.personalSpace, camera.radialAngle)
        camera.pos = desiredPostion;
    }

    if(keys[' ']) {
        keys[' '] = false;
        show2DOverlay = !show2DOverlay;
    }

    if(keys['t']) {
        keys['t'] = false;
        wallTextureIndex++;
    }

    if(keys['e']) {
        keys['e'] = false;
        printDebugInfoThisFrame = true;
    }
}

const draw = () => {

    // erase ceiling
    for(let row = 0; row < bufferArray32.length; row++) {
        bufferArray32[row] = skyColorAsInt;
    }
    // ground distance shadow
    //const shadowBandHeight = canvas.height / (2 * noShadowDist);
    //const numberOfSteps = shadowBandHeight / baseScanlineWidth;
    //for(let i = 0; i < numberOfSteps; i++) {
    //    bufferCtx.fillStyle = getShadowColor(1 - (i/numberOfSteps))
    //    bufferCtx.fillRect(0, (i * baseScanlineWidth) + (canvas.height/2) , canvas.width, baseScanlineWidth)
    // }

    // cast rays and draw
    const cellOffsetXRight = 1 - (camera.pos.x % 1);
    const cellOffsetXLeft = camera.pos.x % 1;
    const cellOffsetYDown = 1 - (camera.pos.y % 1);
    const cellOffsetYUp = (camera.pos.y % 1);

    const rays: Array<IRaycastObject> = []
    for(var i = 0; i < horizontalResolution; i++) {
        let rayAngle = camera.radialAngle - (camera.fieldOfView/2) + (camera.fieldOfView / horizontalResolution * i);
        if(rayAngle < 0) { rayAngle += TwoPi }
        if(rayAngle >= TwoPi) { rayAngle -= TwoPi }

        const facingLeft = rayAngle > Math.PI / 2 && rayAngle < Math.PI * 3/2;
        const facingDown = rayAngle > 0 && rayAngle < Math.PI;

        const dx = Math.cos(rayAngle);
        const dy = Math.sin(rayAngle);
        const stepX = Math.sqrt(1 + (dy/dx)*(dy/dx));
        const stepY = Math.sqrt(1 + (dx/dy)*(dx/dy));

        let sideDistX = stepX * (facingLeft ? cellOffsetXLeft : cellOffsetXRight);
        let sideDistY = stepY * (facingDown ? cellOffsetYDown : cellOffsetYUp);

        let currentPos = camera.pos.floor();

        while (currentPos.x >= 0 && currentPos.x < roomWidth && currentPos.y >= 0 && currentPos.y < roomHeight) {
            currentPos.x += sideDistX <= sideDistY ? (facingLeft ? -1 : 1) : 0;
            currentPos.y += sideDistX > sideDistY ? (facingDown ? 1 : -1) : 0;
            const sideDist = Math.min(sideDistX, sideDistY);
            const stepEndPoint = new Point(
                camera.pos.x + (dx * sideDist),
                camera.pos.y + (dy * sideDist)
            )
            const tile = room[currentPos.y][currentPos.x]
            if(tile !== '.') {
                const wallFace = sideDistX <= sideDistY
                    ? (facingLeft ? 'w' : 'e')
                    : (facingDown ? 'n' : 's')
                const planarDistance = sideDist * Math.cos(camera.radialAngle - rayAngle)
                rays.push({
                    index: i,
                    rayAngle,
                    stepEndPoint, 
                    planarDistance, 
                    tile, 
                    wallFace,
                    sideDist,
                    hitPoint: new Point(currentPos.x, currentPos.y)
                });
                
                break;
            }

            if(sideDistX <= sideDistY) 
                sideDistX += stepX;
            else 
                sideDistY += stepY;
        }
    }

    for(var i = 0; i < rays.length; i++) 
    {
        const ray = rays[i] as IRaycastObject;

        const lineHeight = Math.round(canvas.height * 1.5 / ray.planarDistance);
        const wallTopY = Math.round(canvas.height/2 - lineHeight/2);
        const loopStart = Math.max(0, wallTopY);
        const wallBottomY = wallTopY + lineHeight;
        const loopEnd = Math.min(verticalResolution, wallBottomY);
        const pixelsAboveWall = wallTopY - loopStart
        const horizontalResolutionX4 = horizontalResolution * 4;
        const rayIndexX4 = ray.index * 4;

        const wallShadowFactor = (1/Math.max(ray.planarDistance/lightRadius, 1));

        if(wallTextureIndex % wallTextures.length === 0) {
            var wallColor = (0xff << 24 | 40 * wallShadowFactor << 16 | 200 * wallShadowFactor << 8 | 25 * wallShadowFactor)
            for(let row = 0; row < loopEnd - loopStart; row++) {
                bufferArray32[horizontalResolution * (row + loopStart) + ray.index] = wallColor;
            }
        } else {

            const texture = wallTextures[wallTextureIndex % wallTextures.length] as TextureInfo;
            const texWidth = texture.canvas.width;
            const texHeight = texture.canvas.height;

            let startTextureOffset = ['n','s'].includes(ray.wallFace)
                ? ray.stepEndPoint.x % 1
                : 1 - (ray.stepEndPoint.y % 1)

            const textureXOffsetX4 = Math.round((texWidth * startTextureOffset)) * 4;
            const textureWidhtX4 = texWidth * 4;
            for(let row = 0; row < loopEnd - loopStart; row++) {
                const sampleCoord = textureWidhtX4 * Math.floor(texHeight * (row - pixelsAboveWall)/(wallBottomY - wallTopY)) + textureXOffsetX4
                const r = texture.imageData8[sampleCoord] * wallShadowFactor;
                const g = texture.imageData8[sampleCoord + 1] * wallShadowFactor;
                const b = texture.imageData8[sampleCoord + 2] * wallShadowFactor;

                const finalPixel = horizontalResolutionX4 * (row + loopStart) + rayIndexX4;
                bufferArray8[finalPixel] =  r;
                bufferArray8[finalPixel + 1] =  g;
                bufferArray8[finalPixel + 2] =  b;
            }
        }

        // draw floor
        const texture = wallTextures[4] as TextureInfo;
        const raFix = Math.cos(camera.radialAngle - ray.rayAngle);
        const rayAngleCos = Math.cos(ray.rayAngle);
        const rayAngleSin = Math.sin(ray.rayAngle);
        const canvasWidthX4 = 4 * texture.canvas.width;
        const magicNumberPos = camera.pos.scale(450); // 420 is some magic number that makes the floor stop moving
        const precalculatedXThing = rayAngleCos * texture.canvas.width;
        const precalculatedYThing = rayAngleSin * texture.canvas.height;
        for (let y = wallTopY + lineHeight; y < verticalResolution; y++) {

            const dy = y - (verticalResolution/2);
            const crapIDontUnderstand = 255 / dy / raFix;
            const tx = Math.round(magicNumberPos.x + precalculatedXThing * crapIDontUnderstand);
            const ty = Math.round(magicNumberPos.y + precalculatedYThing * crapIDontUnderstand);
            const texturePos = Math.abs((ty * canvasWidthX4 + tx * 4) % texture.imageData8.length);
            
            const r = texture.imageData8[texturePos];
            const g = texture.imageData8[texturePos + 1];
            const b = texture.imageData8[texturePos + 2];
            const pixelIndex = y * horizontalResolutionX4 + rayIndexX4;
            bufferArray8[pixelIndex] = r;
            bufferArray8[pixelIndex + 1] = g;
            bufferArray8[pixelIndex + 2] = b;
        }
    }

    /*
    if(true || show2DOverlay) {
        const scaleFactor = .25;
        bufferCtx.strokeStyle = "white"

        const scaledDown = new Point(camera.pos.x * cellWidth * scaleFactor, camera.pos.y * cellHeight * scaleFactor)

        // draw player
        drawCircle(scaledDown, camera.personalSpace * Math.min(cellHeight, cellWidth) * scaleFactor);

        // draw Map
        for(let y = 0; y < room.length; y++) {
            for(let x = 0; x < room[y].length; x++) {
                if(room[y][x] != ".") {
                    bufferCtx.strokeRect(
                        Math.round(x * cellWidth * scaleFactor), 
                        Math.round(y * cellHeight * scaleFactor), 
                        Math.round(cellWidth * scaleFactor), 
                        Math.round(cellHeight * scaleFactor)
                    );
                }
            }
        }
    
        // rays
        rays.forEach(ray => {
            drawLine(scaledDown, new Point(
                ray.stepEndPoint.x * cellWidth * scaleFactor, 
                ray.stepEndPoint.y * cellHeight * scaleFactor));
                bufferCtx.strokeStyle = "white"
        })

        //bufferCtx.strokeText(`camera.radialAngle: ${camera.radialAngle} ${getGeneralDirection(camera.radialAngle)}`,10,10)
    }
    */

    // transfer the buffer over to the visible context in one fell swoop

    ctx.putImageData(bufferData,0,0);

    // Can do non-intense stuff after
    ctx.strokeStyle = "white"
    ctx.strokeText(`${verticalResolution}`,10,10)
}

let prev = 0;
const gameLoop = (timeStamp: number) => {

    var elapsed = timeStamp - prev;

    window.document.title = 'FPS: ' + Math.floor(1000 / elapsed);
    prev = timeStamp;
    handleInput(elapsed);
    draw();

    printDebugInfoThisFrame = false;
    // Keep requesting new frames
    window.requestAnimationFrame(gameLoop);
}

const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
            resolve(image);
        };
        image.src = url; 
    });
}


// Start the game when all images are loaded

interface TextureInfo {
    canvas: HTMLCanvasElement;
    imageData8: Uint8ClampedArray;
    imageData32: Uint32Array;
}

let wallTextures: Array<null | TextureInfo> = []

const main = async () => {

    const wallImagePromises: Promise<null | HTMLImageElement>[] = [
        null,
        "brick.jpg",
        "firewall.png",
        "fleshwall.jpg",
        "stoneFloor.png"
    ].map(fileName => {
        if(!fileName) {
            return Promise.resolve(null) as Promise<null>;
        }
        return loadImage(`textures/${fileName}`);
    })

    const wallImages = await Promise.all(wallImagePromises);
    wallTextures = wallImages.map(image => {
        if(image === null) {
            return null;
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
            ctx.drawImage(image, 0,0);
            const imageData8 = ctx.getImageData(0,0,canvas.width, canvas.height).data;
            const imageData32 = new Uint32Array(imageData8.buffer);
            return { canvas, imageData8, imageData32 };
        }
    });

    requestAnimationFrame(gameLoop);
}

main();