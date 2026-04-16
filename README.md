# minecraft

> Group Beta Pruning
>
> CS 354H: Spring 2026

## Basic Gameplay
### Controls
- WASD to move, Space to jump
- Click on the canvas to lock the mouse, and move it to look around
- Left click a block to mine it or an enemy to attack it
- Right click with a block to place it or with an item to use it
- Use the 1-9 keys to select hotbar slots
- Press Q to drop a held item
- Press E to open the inventory for the item and crafting menu
  - It can be navigated with the mouse
- Press G for a list of acheivements
- Press P to cheat in items
- Press R to respawn/reset

### Gameplay elements
- Jetpacks and Boots are equippable in the inventory screen
  - Hold space to use jetpack, boots give double-jump
- Hunger goes down over time; eat food from enemies to replenish it

### Portals
- Build a 4x5 vertical frame of portal blocks to create a portal
- Building two portals will link the two
- Building one portal and then right-clicking it with a nether star will
spawn a portal to the nether, another dimension


## Known Issues/Quirks

- Though the spec says to use the constants 9.8 units/sec and 10 units/sec for gravity and jump acceleration, we found these numbers to lead to strange-feeling results for the player. So, we tuned these manually.
- Mining on top of large structures (i.e., mountains) is known to be slower due to our undermined block detection algorithm.
- Portals between dimensions will not render the other dimension correctly

## Build

To build, the easiest way is to use the provided script:

```sh
./scripts/build-and-serve.sh
```

This will rebuild using [`./scripts/make-minecraft.py`](./scripts/make-minecraft.py) and then serve the result using `http-server`.
