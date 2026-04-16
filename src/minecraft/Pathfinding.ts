import { Vec3 } from "../lib/TSM.js";
import { Chunk } from "./Chunk.js";

const MAX_PATHFINDING_ITERATIONS = 500; // safety limit to prevent infinite loops

interface PathNode {
  x: number;
  y: number;
  z: number;
  g: number; // cost from start
  f: number; // g + heuristic (this is what the heap sorts by)
  parent: PathNode | null;
}

/**
 * A simple binary min-heap implementation for PathNode objects, used for A* pathfinding
 */
class MinHeap {
  /**
   * binary heap
   * root is index 0
   * children of index i are 2i + 1 and 2i + 2
   * parent of index i is floor((i - 1) / 2)
   */
  private heap: PathNode[];

  constructor() {
    this.heap = [];
  }

  get size(): number {
    return this.heap.length;
  }

  left(index: number): number {
    return 2 * index + 1;
  }

  right(index: number): number {
    return 2 * index + 2;
  }

  parent(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  insert(item: PathNode) {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  extractMin(): PathNode | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }
    if (this.heap.length === 1) {
      return this.heap.pop()!;
    }
    const min = this.heap[0];
    this.heap[0] = this.heap.pop()!; // last element becomes new root
    this.bubbleDown(0);
    return min;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parentIndex = this.parent(index);
      if (this.heap[index].f < this.heap[parentIndex].f) {
        [this.heap[index], this.heap[parentIndex]] = [
          this.heap[parentIndex],
          this.heap[index],
        ];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number) {
    while (true) {
      const leftIndex = this.left(index);
      const rightIndex = this.right(index);
      let smallestIndex = index;

      if (
        leftIndex < this.heap.length &&
        this.heap[leftIndex].f < this.heap[smallestIndex].f
      ) {
        smallestIndex = leftIndex;
      }
      if (
        rightIndex < this.heap.length &&
        this.heap[rightIndex].f < this.heap[smallestIndex].f
      ) {
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
function heuristic(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  const dz = Math.abs(az - bz);
  return dx + dy + dz;
}

export function findPath(
  start: Vec3,
  goal: Vec3,
  chunkProvider: Chunk.ColumnProvider,
): Vec3[] {
  // get block coordinates, adjusting for player height
  const startX = Math.round(start.x);
  const startY = Math.round(start.y);
  const startZ = Math.round(start.z);
  const goalX = Math.round(goal.x);
  const goalY = Math.round(goal.y);
  const goalZ = Math.round(goal.z);

  // setup
  const startNode: PathNode = {
    x: startX,
    y: startY,
    z: startZ,
    g: 0,
    f: heuristic(startX, startY, startZ, goalX, goalY, goalZ),
    parent: null,
  };
  const openSet = new MinHeap();
  openSet.insert(startNode);
  const closedSet = new Set<string>();

  // main loop
  let iterations = 0;
  while (openSet.size > 0) {
    if (++iterations > MAX_PATHFINDING_ITERATIONS) {
      return [];
    }

    const current = openSet.extractMin()!;

    // goal check
    if (current.x === goalX && current.y === goalY && current.z === goalZ) {
      // reconstruct and return path from current back through parent pointers
      const path: Vec3[] = [];
      let node: PathNode | null = current;
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
      const isSolid = (x: number, y: number, z: number) =>
        Chunk.isSolidBlockWorldWide(chunkProvider, x, y, z);

      let neighborY: number | null = null;
      let moveCost = 1.0;

      // Case A: Flat walk -- air at feet and head, solid block under feet
      if (
        !isSolid(nx, current.y, nz) &&
        !isSolid(nx, current.y + 1, nz) &&
        isSolid(nx, current.y - 1, nz)
      ) {
        neighborY = current.y;
      }
      // Case B: Step up -- solid at feet level, but air above it (2 blocks)
      else if (
        !isSolid(nx, current.y + 1, nz) &&
        !isSolid(nx, current.y + 2, nz) &&
        isSolid(nx, current.y, nz)
      ) {
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
