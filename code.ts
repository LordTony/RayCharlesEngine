import { Point } from './point'

["html","body"].forEach(item => {
    const html: any = document.getElementsByTagName(item)[0];
    html.style.margin = "0px";
    html.style.padding = "0px";
});

let show2DOverlay = false;
let wallTextureIndex = 1;
let printDebugInfoThisFrame = false;

const numberOfRays = 640;
const noShadowDist = 3;
const fullShadowDist = 10;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
canvas.style.margin = "auto"
//canvas.style.padding = "0"
canvas.style.display = "block"
canvas.style.backgroundColor = "rgb(50,50,50)"
canvas.style.imageRendering = "pixelated"
canvas.style.transformOrigin = "top center"
canvas.style.transform = "scale(2)"
canvas.width = 640;
canvas.height = 300;

const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

const bufferCanvas = document.createElement("canvas");
bufferCanvas.height = canvas.height;
bufferCanvas.width = canvas.width;
const bufferCtx = bufferCanvas.getContext("2d") as CanvasRenderingContext2D;
bufferCtx.imageSmoothingEnabled = false;
bufferCtx.translate(.5, .5);

const room = `
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
X........X........X...........X
X..X..X..X..XXXX..X..XXXX..XXXX
X..X..X.....X........X..X.....X
XXXX..XXXX..XXXX..XXXX..XXXX..X
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

const tileInfo = {
    // 'tileCharacter': [north, south, east, west]
    'X': ['green', 'green', 'darkgreen', 'darkgreen']
}

const roomHeight = room.length;
const roomWidth = room[0].length;

const TwoPi = 2 * Math.PI;
const camera = {
    pos: new Point(1.5, 1.5),
    radialAngle: Math.PI / 4,
    personalSpace: .25,
    fieldOfView: Math.PI / 3
}

const cellHeight = canvas.height / roomHeight;
const cellWidth = canvas.width / roomWidth;
const incrament = camera.fieldOfView / numberOfRays;
const baseScanlineWidth = canvas.width / numberOfRays;

var keys = {};
window.onkeyup = (e) => { keys[e.key] = false; }
window.onkeydown = (e) => { keys[e.key] = true; }

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
    if(keys["a"] || keys["d"]) {
        const direction = keys["a"] ? -1 : 1;
        camera.radialAngle += 0.075 * direction;
        if(camera.radialAngle < 0) { camera.radialAngle += TwoPi; }
        if(camera.radialAngle >= TwoPi) { camera.radialAngle -= TwoPi; }
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
    bufferCtx.clearRect(0,0,canvas.width,canvas.height)

    // ground
    bufferCtx.fillStyle = "brown"
    bufferCtx.fillRect(0, cellHeight * roomHeight/2, cellWidth * roomWidth, cellHeight * roomHeight/2)

    // ground distance shadow
    const shadowBandHeight = canvas.height / (2 * noShadowDist);
    const numberOfSteps = shadowBandHeight / baseScanlineWidth;
    for(let i = 0; i < numberOfSteps; i++) {
        bufferCtx.fillStyle = getShadowColor(1 - (i/numberOfSteps))
        bufferCtx.fillRect(0, (i * baseScanlineWidth) + (canvas.height/2) , canvas.width, baseScanlineWidth)
    }

    // cast rays and draw
    const cellOffsetXRight = 1 - (camera.pos.x % 1);
    const cellOffsetXLeft = camera.pos.x % 1;
    const cellOffsetYDown = 1 - (camera.pos.y % 1);
    const cellOffsetYUp = (camera.pos.y % 1);

    const rays = []
    for(var i = 0; i < numberOfRays; i++) {
        let rayAngle = camera.radialAngle - (camera.fieldOfView/2) + (incrament * i);
        if(rayAngle < 0) { rayAngle += TwoPi }
        if(rayAngle >= TwoPi) { rayAngle -= TwoPi }

        let adjustedAngle = (camera.radialAngle - rayAngle)
        if(adjustedAngle < 0) { adjustedAngle += TwoPi }
        if(adjustedAngle >= TwoPi) { adjustedAngle -= TwoPi }

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
                    ? (facingLeft ? 2 : 3)
                    : (facingDown ? 0 : 1)
                const planarDistance = sideDist * Math.sin((Math.PI / 2) - adjustedAngle);

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

    //rays.sort((a,b) => b.planarDistance > a.planarDistance).forEach(ray => {
    for(var i = 0; i < rays.length; i++) 
    {
        const ray = rays[i] as any;

        const lineHeight = canvas.height / ray.planarDistance
        if(wallTextureIndex % wallTextures.length === 0) {
            bufferCtx.fillStyle = tileInfo[ray.tile][ray.wallFace];
            bufferCtx.fillRect(
                Math.round(ray.index * baseScanlineWidth), 
                Math.round(canvas.height/2 - lineHeight/2), 
                Math.round(baseScanlineWidth),
                lineHeight);
        } else {
            let startTextureOffset = ray.wallFace < 2
                ? ray.stepEndPoint.x % 1
                : 1 - (ray.stepEndPoint.y % 1)

            const texture = wallTextures[wallTextureIndex % wallTextures.length] as HTMLImageElement;
            if (printDebugInfoThisFrame) {
                /* anything you want to print for this frame goes here */
            }

            // fill up gaps between textures wherever the texture sampling would run past the bounds of the image
            const textureEndPoint = startTextureOffset * texture.width + baseScanlineWidth;
            const backup = Math.max(textureEndPoint - texture.width, 0);

            bufferCtx.drawImage(
                texture,
                startTextureOffset * texture.width - backup,
                0,
                1,
                texture.height,
                Math.round(ray.index * baseScanlineWidth), 
                Math.round(canvas.height/2 - lineHeight/2), 
                Math.round(baseScanlineWidth), 
                Math.round(lineHeight)
            )
        }

        
        if(ray.planarDistance > noShadowDist) {
            const shadowWeight = (ray.planarDistance - noShadowDist)/(fullShadowDist - noShadowDist)
            bufferCtx.fillStyle = getShadowColor(shadowWeight)
            bufferCtx.fillRect(
                Math.round(ray.index * baseScanlineWidth), 
                Math.round(canvas.height/2 - lineHeight/2), 
                Math.round(baseScanlineWidth), 
                Math.round(lineHeight)
            )
        }
        
    }

    bufferCtx.fillStyle = "white";
    //bufferCtx.strokeText(`duplicate Cols: ${colDupes} out of ${rays.length}`, 10, 10)

    if(show2DOverlay) {
        const scaleFactor = 1;
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

        bufferCtx.strokeText(`camera.radialAngle: ${camera.radialAngle} ${getGeneralDirection(camera.radialAngle)}`,10,10)
    }

    // transfer the buffer over to the visible context in one fell swoop
    ctx.clearRect(0,0,canvas.width, canvas.height);
    ctx.drawImage(bufferCanvas, 0, 0);
}

let prev = 0;
const gameLoop = (timeStamp: number) => {

    var elapsed = timeStamp - prev;

    window.document.title = 'fps: ' + Math.floor(1000 / elapsed);
    prev = timeStamp;
    handleInput(elapsed);
    draw();

    printDebugInfoThisFrame = false;
    // Keep requesting new frames
    window.requestAnimationFrame(gameLoop);
}

// Start the game when all images are loaded

const brickImage = new Image();
const hedgeImage = new Image();
const firewallImage = new Image();

hedgeImage.src = "hedge.png";
brickImage.src = "brick.jpg";
firewallImage.src = "firewall.png"

const wallTextures : Array<HTMLImageElement | null> = [
    null,
    brickImage, 
    hedgeImage,
    firewallImage
]

let loadedTextures = 1;

brickImage.onload = () => {
    loadedTextures++;
    if(loadedTextures == wallTextures.length) {
        window.requestAnimationFrame(gameLoop);
    }
}

hedgeImage.onload = () => {
    loadedTextures++;
    if(loadedTextures == wallTextures.length) {
        window.requestAnimationFrame(gameLoop);
    }
}

firewallImage.onload = () => {
    loadedTextures++;
    if(loadedTextures == wallTextures.length) {
        window.requestAnimationFrame(gameLoop);
    }
}