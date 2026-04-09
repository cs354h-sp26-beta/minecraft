import { Vec3 } from "./Vec3.js";
import { epsilon } from "./Constants.js";
/**
 * A 2x1 Vector of numbers.
 */
export class Vec2 {
    /**
     * Swizzle Operators
     */
    get x() {
        return this.values[0];
    }
    get y() {
        return this.values[1];
    }
    get xy() {
        return [this.values[0], this.values[1]];
    }
    set x(value) {
        this.values[0] = value;
    }
    set y(value) {
        this.values[1] = value;
    }
    set xy(values) {
        this.values[0] = values[0];
        this.values[1] = values[1];
    }
    /**
     * Computes the cross product the two vectors as if they were
     * Vec3s with a 0 z component. Places result in dest. If dest
     * is not provided then a new Vec3 is created and returned.
     */
    static cross(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec3();
        }
        const x = vector.x;
        const y = vector.y;
        const x2 = vector2.x;
        const y2 = vector2.y;
        const z = x * y2 - y * x2;
        dest.x = 0;
        dest.y = 0;
        dest.z = z;
        return dest;
    }
    /**
     * Computes the dot product of the two vectors
     */
    static dot(vector, vector2) {
        return vector.x * vector2.x + vector.y * vector2.y;
    }
    /**
     * Computes the head to head distance from vector to vector2
     */
    static distance(vector, vector2) {
        return Math.sqrt(this.squaredDistance(vector, vector2));
    }
    /**
     * Computes the square of the head to head distance from
     * vector to vector2.
     */
    static squaredDistance(vector, vector2) {
        const x = vector2.x - vector.x;
        const y = vector2.y - vector.y;
        return x * x + y * y;
    }
    /**
     * Computes a unit vector in the direction from vector2 to vector.
     * Places result in dest. If dest is not provided then a new Vec2
     * is created and returned.
     */
    static direction(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec2();
        }
        const x = vector.x - vector2.x;
        const y = vector.y - vector2.y;
        let length = Math.sqrt(x * x + y * y);
        if (length === 0) {
            dest.x = 0;
            dest.y = 0;
            return dest;
        }
        length = 1 / length;
        dest.x = x * length;
        dest.y = y * length;
        return dest;
    }
    /**
     * Performs a linear interpolation between the two vectors.
     * If time == 0, you get the equivalent of vector.
     * If time == 1, you get the equivalent of vector2.
     * Otherwise, it is an interpolation from vector to vector2.
     * The result is put into dest. If dest is not provided then
     * a new Vec4 is created and returned.
     */
    static lerp(vector, vector2, time, dest) {
        if (!dest) {
            dest = new Vec2();
        }
        const x = vector.x;
        const y = vector.y;
        const x2 = vector2.x;
        const y2 = vector2.y;
        dest.x = x + time * (x2 - x);
        dest.y = y + time * (y2 - y);
        return dest;
    }
    /**
     * Computes the sum of the two vectors and puts the result in dest.
     * If dest is not provided then a new Vec2 is created and returned.
     */
    static sum(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec2();
        }
        dest.x = vector.x + vector2.x;
        dest.y = vector.y + vector2.y;
        return dest;
    }
    /**
     * Computes the difference of the two vectors and puts the result in dest.
     * If dest is not provided then a new Vec2 is created and returned.
     */
    static difference(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec2();
        }
        dest.x = vector.x - vector2.x;
        dest.y = vector.y - vector2.y;
        return dest;
    }
    /**
     * Computes the element wise product and puts the result in dest.
     * If dest is not provided then a new Vec2 is created and returned.
     */
    static product(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec2();
        }
        dest.x = vector.x * vector2.x;
        dest.y = vector.y * vector2.y;
        return dest;
    }
    /**
     * Computes the element wise quotient and puts the result in dest.
     * If dest is not provided then a new Vec2 is created and returned.
     */
    static quotient(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec2();
        }
        dest.x = vector.x / vector2.x;
        dest.y = vector.y / vector2.y;
        return dest;
    }
    /**
     * Creates a new Vec2. If values is provided then the Vec3
     * is initialized to those values, otherwise, the Vec3 is
     * initialized with all zeros.
     */
    constructor(values) {
        this.values = new Float32Array(2);
        if (values !== undefined) {
            this.xy = values;
        }
    }
    /**
     * Returns the element at the given index.
     */
    at(index) {
        return this.values[index];
    }
    /**
     * Sets all elements to 0.
     */
    reset() {
        this.x = 0;
        this.y = 0;
    }
    /**
     * Copies the calling Vec2 into dest.
     * If dest is not provided then a new Vec2 is created.
     * Returns the copied Vec2.
     */
    copy(dest) {
        if (!dest) {
            dest = new Vec2();
        }
        dest.x = this.x;
        dest.y = this.y;
        return dest;
    }
    /**
     * Negates every element.
     * If dest is provided then the result is placed into dest.
     * Otherwise, the calling Vec2 is modified.
     */
    negate(dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = -this.x;
        dest.y = -this.y;
        return dest;
    }
    /**
     * Returns a boolean if each element of the given vector
     * is within the threshold of the calling vector.
     * Threshold defaults to the library's epsilon constant.
     */
    equals(vector, threshold = epsilon) {
        if (Math.abs(this.x - vector.x) > threshold) {
            return false;
        }
        if (Math.abs(this.y - vector.y) > threshold) {
            return false;
        }
        return true;
    }
    /**
     * Returns the length of the vector.
     */
    length() {
        return Math.sqrt(this.squaredLength());
    }
    /**
     * Returns the square of the length of the vector.
     */
    squaredLength() {
        const x = this.x;
        const y = this.y;
        return x * x + y * y;
    }
    /**
     * Adds the given vector to the calling vector.
     * If dest is not provided then the calling vector is modified
     */
    add(vector, dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = this.x + vector.x;
        dest.y = this.y + vector.y;
        return dest;
    }
    /**
     * Subtracts the given vector from the calling vector.
     * If dest is not provided then the calling vector is modified.
     */
    subtract(vector, dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = this.x - vector.x;
        dest.y = this.y - vector.y;
        return dest;
    }
    /**
     * Element wise product.
     * If dest is not provided then the calling vector is modified.
     */
    multiply(vector, dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = this.x * vector.x;
        dest.y = this.y * vector.y;
        return dest;
    }
    /**
     * Element wise division.
     * If dest is not provided then the calling vector is modified.
     */
    divide(vector, dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = this.x / vector.x;
        dest.y = this.y / vector.y;
        return dest;
    }
    /**
     * Scales this vector by multiplying each element
     * by the given value. If dest is provided then
     * the result is placed in dest and the calling Vec2
     * is not modified.
     */
    scale(value, dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = this.x * value;
        dest.y = this.y * value;
        return dest;
    }
    /**
     * Normalizes the Vec2 so that the length is 1.
     * If dest is provided then the result is placed
     * in dest and the calling Vec2 is not modified.
     */
    normalize(dest) {
        if (!dest) {
            dest = this;
        }
        let length = this.length();
        if (length === 1) {
            dest.xy = this.xy;
            return dest;
        }
        if (length === 0) {
            dest.x = 0;
            dest.y = 0;
            return dest;
        }
        length = 1.0 / length;
        dest.x = this.x * length;
        dest.y = this.y * length;
        return dest;
    }
    /**
     * Multiplies the vector with the given matrix as such: M * this.
     * If dest is not provided then the calling vector is modified.
     */
    multiplyMat2(matrix, dest) {
        if (!dest) {
            dest = this;
        }
        return matrix.multiplyVec2(this, dest);
    }
    /**
     * Multiplies the vector with the given matrix as such: M * [this, 1].
     * Only returns the Vec2 portion of the result.
     * If dest is not provided then the calling vector is modified.
     */
    multiplyMat3(matrix, dest) {
        if (!dest) {
            dest = this;
        }
        return matrix.multiplyVec2(this, dest);
    }
}
/** All elements are 0. */
Vec2.zero = new Vec2([0, 0]);
/** All elements are 1. */
Vec2.one = new Vec2([1, 1]);
//# sourceMappingURL=Vec2.js.map