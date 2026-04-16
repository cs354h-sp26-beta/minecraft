import { Vec3 } from "../lib/TSM.js";
import { Chunk } from "./Chunk.js";
const MAX_PATHFINDING_ITERATIONS = 500; // safety limit to prevent infinite loops
/**
 * A simple binary min-heap implementation for PathNode objects, used for A* pathfinding
 */
class MinHeap {
    constructor() {
        this.heap = [];
    }
    get size() {
        return this.heap.length;
    }
    left(index) {
        return 2 * index + 1;
    }
    right(index) {
        return 2 * index + 2;
    }
    parent(index) {
        return Math.floor((index - 1) / 2);
    }
    insert(item) {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }
    extractMin() {
        if (this.heap.length === 0) {
            return undefined;
        }
        if (this.heap.length === 1) {
            return this.heap.pop();
        }
        const min = this.heap[0];
        this.heap[0] = this.heap.pop(); // last element becomes new root
        this.bubbleDown(0);
        return min;
    }
    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = this.parent(index);
            if (this.heap[index].f < this.heap[parentIndex].f) {
                [this.heap[index], this.heap[parentIndex]] = [
                    this.heap[parentIndex],
                    this.heap[index],
                ];
                index = parentIndex;
            }
            else {
                break;
            }
        }
    }
    bubbleDown(index) {
        while (true) {
            const leftIndex = this.left(index);
            const rightIndex = this.right(index);
            let smallestIndex = index;
            if (leftIndex < this.heap.length &&
                this.heap[leftIndex].f < this.heap[smallestIndex].f) {
                smallestIndex = leftIndex;
            }
            if (rightIndex < this.heap.length &&
                this.heap[rightIndex].f < this.heap[smallestIndex].f) {
                smallestIndex = rightIndex;
            }
            if (smallestIndex === index) {
                return; // heap property is satisfied
            }
            [this.heap[index], this.heap[smallestIndex]] = [
                this.heap[smallestIndex],
                this.heap[index],
            ];
            index = smallestIndex;
        }
    }
}
/**
 * Uses Manhattan distance as heuristic for A* pathfinding
 * @param ax, ay, az - coordinates of point A
 * @param bx, by, bz - coordinates of point B
 * @returns estimated cost to get from A to B
 */
function heuristic(ax, ay, az, bx, by, bz) {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    const dz = Math.abs(az - bz);
    return dx + dy + dz;
}
export function findPath(start, goal, chunkProvider) {
    // get block coordinates, adjusting for player height
    const startX = Math.round(start.x);
    const startY = Math.round(start.y);
    const startZ = Math.round(start.z);
    const goalX = Math.round(goal.x);
    const goalY = Math.round(goal.y);
    const goalZ = Math.round(goal.z);
    // setup
    const startNode = {
        x: startX,
        y: startY,
        z: startZ,
        g: 0,
        f: heuristic(startX, startY, startZ, goalX, goalY, goalZ),
        parent: null,
    };
    const openSet = new MinHeap();
    openSet.insert(startNode);
    const closedSet = new Set();
    // main loop
    let iterations = 0;
    while (openSet.size > 0) {
        if (++iterations > MAX_PATHFINDING_ITERATIONS) {
            return [];
        }
        const current = openSet.extractMin();
        // goal check
        if (current.x === goalX && current.y === goalY && current.z === goalZ) {
            // reconstruct and return path from current back through parent pointers
            const path = [];
            let node = current;
            while (node !== null) {
                path.push(new Vec3([node.x, node.y, node.z]));
                node = node.parent;
            }
            path.reverse();
            return path;
        }
        // consult and update closed set
        const key = `${current.x},${current.y},${current.z}`;
        if (closedSet.has(key)) {
            continue; // already processed this node
        }
        closedSet.add(key);
        // expand neighbors (for simplicity, we consider 6 orthogonal neighbors)
        for (const [dx, dz] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            // check for walkable neighbor
            const nx = current.x + dx;
            const nz = current.z + dz;
            const isSolid = (x, y, z) => Chunk.isSolidBlockWorldWide(chunkProvider, x, y, z);
            let neighborY = null;
            let moveCost = 1.0;
            // Case A: Flat walk -- air at feet and head, solid block under feet
            if (!isSolid(nx, current.y, nz) &&
                !isSolid(nx, current.y + 1, nz) &&
                isSolid(nx, current.y - 1, nz)) {
                neighborY = current.y;
            }
            // Case B: Step up -- solid at feet level, but air above it (2 blocks)
            else if (!isSolid(nx, current.y + 1, nz) &&
                !isSolid(nx, current.y + 2, nz) &&
                isSolid(nx, current.y, nz)) {
                neighborY = current.y + 1;
                moveCost = 1.5; // stepping up is more costly
            }
            // Case C: Drop down -- scan down up to 3 blocks to find down
            else if (!isSolid(nx, current.y, nz)) {
                for (let dy = -1; dy >= -3; dy--) {
                    if (isSolid(nx, current.y + dy, nz)) {
                        // found ground — enemy stands on block above it
                        neighborY = current.y + dy + 1;
                        moveCost = 1.0 + Math.abs(dy) * 0.5;
                        break;
                    }
                }
            }
            if (neighborY !== null) {
                const nKey = `${nx},${neighborY},${nz}`;
                if (!closedSet.has(nKey)) {
                    const g = current.g + moveCost;
                    openSet.insert({
                        x: nx,
                        y: neighborY,
                        z: nz,
                        g,
                        f: g + heuristic(nx, neighborY, nz, goalX, goalY, goalZ),
                        parent: current,
                    });
                }
            }
        }
    }
    return [];
}
//# sourceMappingURL=Pathfinding.js.map