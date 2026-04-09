import { epsilon } from "./Constants.js";
/**
 * A 3x1 Vector of numbers.
 */
export class Vec3 {
    /**
     * Swizzle operators.
     */
    set x(value) {
        this.values[0] = value;
    }
    get x() {
        return this.values[0];
    }
    set y(value) {
        this.values[1] = value;
    }
    get y() {
        return this.values[1];
    }
    set z(value) {
        this.values[2] = value;
    }
    get z() {
        return this.values[2];
    }
    set xy(values) {
        this.values[0] = values[0];
        this.values[1] = values[1];
    }
    get xy() {
        return [this.values[0], this.values[1]];
    }
    set xyz(values) {
        this.values[0] = values[0];
        this.values[1] = values[1];
        this.values[2] = values[2];
    }
    get xyz() {
        return [this.values[0], this.values[1], this.values[2]];
    }
    /**
     * Computes the cross product of the vectors: vector x vector2.
     * The result is placed in dest. If dest is not supplied then
     * a new Vec3 is created and returned with the result.
     */
    static cross(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec3();
        }
        const x = vector.x;
        const y = vector.y;
        const z = vector.z;
        const x2 = vector2.x;
        const y2 = vector2.y;
        const z2 = vector2.z;
        dest.x = y * z2 - z * y2;
        dest.y = z * x2 - x * z2;
        dest.z = x * y2 - y * x2;
        return dest;
    }
    /**
     * Computes the dot product of the two vectors: vector * vector2.
     */
    static dot(vector, vector2) {
        const x = vector.x;
        const y = vector.y;
        const z = vector.z;
        const x2 = vector2.x;
        const y2 = vector2.y;
        const z2 = vector2.z;
        return x * x2 + y * y2 + z * z2;
    }
    /**
     * Computes the head to head distance between the vectors.
     */
    static distance(vector, vector2) {
        return Math.sqrt(this.squaredDistance(vector, vector2));
    }
    /**
     * Computes the square of the head to head distance between the vectors.
     */
    static squaredDistance(vector, vector2) {
        const x = vector2.x - vector.x;
        const y = vector2.y - vector.y;
        const z = vector2.z - vector.z;
        return x * x + y * y + z * z;
    }
    /**
     * Returns a unit vector in the direction from vector2 to vector and puts
     * the result in dest. If dest is not provided then a new Vec3 is created
     * and returned.
     */
    static direction(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec3();
        }
        const x = vector.x - vector2.x;
        const y = vector.y - vector2.y;
        const z = vector.z - vector2.z;
        let length = Math.sqrt(x * x + y * y + z * z);
        if (length === 0) {
            dest.x = 0;
            dest.y = 0;
            dest.z = 0;
            return dest;
        }
        length = 1 / length;
        dest.x = x * length;
        dest.y = y * length;
        dest.z = z * length;
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
            dest = new Vec3();
        }
        dest.x = vector.x + time * (vector2.x - vector.x);
        dest.y = vector.y + time * (vector2.y - vector.y);
        dest.z = vector.z + time * (vector2.z - vector.z);
        return dest;
    }
    /**
     * Computes the sum of the two vectors and puts the result in dest.
     * If dest is not provided then a new Vec3 is created and returned.
     */
    static sum(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec3();
        }
        dest.x = vector.x + vector2.x;
        dest.y = vector.y + vector2.y;
        dest.z = vector.z + vector2.z;
        return dest;
    }
    /**
     * Computes the difference of the two vectors and puts the result in dest.
     * If dest is not provided then a new Vec3 is created and returned.
     */
    static difference(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec3();
        }
        dest.x = vector.x - vector2.x;
        dest.y = vector.y - vector2.y;
        dest.z = vector.z - vector2.z;
        return dest;
    }
    /**
     * Computes the element wise product and puts the result in dest.
     * If dest is not provided then a new Vec3 is created and returned.
     */
    static product(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec3();
        }
        dest.x = vector.x * vector2.x;
        dest.y = vector.y * vector2.y;
        dest.z = vector.z * vector2.z;
        return dest;
    }
    /**
     * Computes the element wise quotient and puts the result in dest.
     * If dest is not provided then a new Vec3 is created and returned.
     */
    static quotient(vector, vector2, dest) {
        if (!dest) {
            dest = new Vec3();
        }
        dest.x = vector.x / vector2.x;
        dest.y = vector.y / vector2.y;
        dest.z = vector.z / vector2.z;
        return dest;
    }
    /**
     * Creates a new Vec3. If values is provided then the Vec3
     * is initialized to those values, otherwise, the Vec3 is
     * initialized with all zeros.
     */
    constructor(values) {
        this.values = new Float32Array(3);
        if (values !== undefined) {
            this.xyz = values;
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
        this.z = 0;
    }
    /**
     * Copies the calling Vec3 into dest.
     * If dest is not provided then a new Vec3 is created.
     * Returns the copied Vec3.
     */
    copy(dest) {
        if (!dest) {
            dest = new Vec3();
        }
        dest.x = this.x;
        dest.y = this.y;
        dest.z = this.z;
        return dest;
    }
    /**
     * Negates every element.
     * If dest is provided then the result is placed into dest.
     * Otherwise, the calling Vec3 is modified.
     */
    negate(dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = -this.x;
        dest.y = -this.y;
        dest.z = -this.z;
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
        if (Math.abs(this.z - vector.z) > threshold) {
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
        const z = this.z;
        return x * x + y * y + z * z;
    }
    /**
     * Adds the given vector to the calling vector.
     * If dest is not provided then the calling vector is modified.
     */
    add(vector, dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = this.x + vector.x;
        dest.y = this.y + vector.y;
        dest.z = this.z + vector.z;
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
        dest.z = this.z - vector.z;
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
        dest.z = this.z * vector.z;
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
        dest.z = this.z / vector.z;
        return dest;
    }
    /**
     * Scales this vector by multiplying each element
     * by the given value. If dest is provided then
     * the result is placed in dest and the calling Vec3
     * is not modified.
     */
    scale(value, dest) {
        if (!dest) {
            dest = this;
        }
        dest.x = this.x * value;
        dest.y = this.y * value;
        dest.z = this.z * value;
        return dest;
    }
    /**
     * Normalizes the Vec3 so that the length is 1.
     * If dest is provided then the result is placed
     * in dest and the calling Vec3 is not modified.
     */
    normalize(dest) {
        if (!dest) {
            dest = this;
        }
        let length = this.length();
        if (length === 1) {
            dest.xyz = this.xyz;
            return dest;
        }
        if (length === 0) {
            dest.x = 0;
            dest.y = 0;
            dest.z = 0;
            return dest;
        }
        length = 1.0 / length;
        dest.x = this.x * length;
        dest.y = this.y * length;
        dest.z = this.z * length;
        return dest;
    }
    /**
     * Multiplies the vector as such: M * this.
     * If dest is not provided then the calling vector is modified
     */
    multiplyMat3(matrix, dest) {
        if (!dest) {
            dest = this;
        }
        return matrix.multiplyVec3(this, dest);
    }
    /**
     * Performs the operation q x v x q* where q is this quaternion, v
     * is the given vector and q* is the conjugate of this quaternion.
     * This uses the Hamiltonian product where successive rotations are
     * with respect to fixed space, not relative to rotating space.
     * The result is put into dest. If dest is not provided then
     * the calling Vec3 is used as the dest.
     */
    multiplyByQuat(Quaternion, dest) {
        if (!dest) {
            dest = this;
        }
        return Quaternion.multiplyVec3(this, dest);
    }
}
/** Every element is 0. */
Vec3.zero = new Vec3([0, 0, 0]);
/** Every element is 1. */
Vec3.one = new Vec3([1, 1, 1]);
/** y element is 1. */
Vec3.up = new Vec3([0, 1, 0]);
/** x element is 1. */
Vec3.right = new Vec3([1, 0, 0]);
/** z element is 1. */
Vec3.forward = new Vec3([0, 0, 1]);
//# sourceMappingURL=Vec3.js.map