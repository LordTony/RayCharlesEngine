export class Point {
	x: number;
	y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	floor() {
		return new Point(Math.floor(this.x), Math.floor(this.y));
	}

	distanceTo(other: Point) {
		const dx = this.x - other.x;
		const dy = this.y - other.y;

		return Math.sqrt( dx * dx + dy * dy );
	}

	add(vector: Vec) {
		this.x += vector.x;
		this.y += vector.y;
	}

	sub(vector: Vec) {
		this.x -= vector.x;
		this.y -= vector.y;
	}

	vectorBetweenPoints(other: Point): Vec {
		const dx = this.x - other.x;
		const dy = this.y - other.y;
		const unitVector = new Vec(dx, dy)
		return unitVector;
	  }

	scale(factor: number) {
		return new Point(this.x * factor, this.y * factor);
	}
}

export class Vec {
	static ZeroVec = Object.freeze(new Vec(0,0));
	x: number;
	y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	getNormalized(): Vec {
		const magnitude = Math.sqrt(this.x * this.x + this.y * this.y);
		return magnitude !== 0 
			? new Vec(this.x / magnitude, this.y / magnitude)
			: Vec.ZeroVec
	  }

	add(other: Vec): void {
		this.x += other.x;
		this.y += other.y;
	}

	magnitude(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}

	magnify(magnitude: number): Vec {
		return new Vec(this.x * magnitude, this.y * magnitude);
	}

	ToAngle(): number {
		let angle = Math.atan2(this.y, this.x);

		if (angle < 0) {
			angle += 2 * Math.PI;
		}
		
		return angle;
	}
}