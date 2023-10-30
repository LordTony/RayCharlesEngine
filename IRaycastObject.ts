import { Point } from "./point";

export interface IRaycastObject {
    index: number;
    rayAngle: number;
    stepEndPoint: Point;
    planarDistance: number; 
    tile: string;
    wallFace: 'n' | 's' | 'e' | 'w'
    sideDist: number
    hitPoint: Point;
}