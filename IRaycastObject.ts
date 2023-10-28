import { Point } from "./point";

export interface IRaycastObject {
    index: number;
    rayAngle: number;
    stepEndPoint: Point;
    planarDistance: number; 
    tile: string;
    wallFace: 0 | 1 | 2 | 3
    sideDist: number
    hitPoint: Point;
}