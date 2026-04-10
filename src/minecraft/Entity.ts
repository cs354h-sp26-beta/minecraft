import { Vec3 } from "../lib/TSM.js";

export class Player {
    // The player's head position in world coordinates.
    //
    // Player should extend two units down from this location and 0.4 units radially.
    private position: Vec3;

    // The velocity of the player in units/sec.
    private velocity: Vec3;

    constructor(position: Vec3) {
        this.position = position;
        this.velocity = new Vec3([0.0, 0.0, 0.0]);
    }

    // Adds the input to the current player position.
    public addToPosition(d: Vec3) { 
        this.position.add(d);
    }

    // Overrides the player position.
    public setPosition(d: Vec3) {
    }

    // Gets the current player position.
    public getPosition(): Vec3 {
        return this.position;
    }

    // Changes the players velocity by the input delta in units/sec.
    public addToVelocity(d: Vec3) {
        this.velocity.add(d);
    }

    // Overrides the player velocity.
    public setVelocity(d: Vec3) {
        this.velocity = d;
    }

    // Gets the player velocity.
    public getVelocity(): Vec3 {
        return this.velocity;
    }
}
