import { Player } from "./Entity.js";
import { Chunk } from "./Chunk.js";

export enum ItemAction {
  None,
  Use,
  Place,
  Equip,
}

export class ItemType {
  public id: string;
  public name: string;
  public maxStackSize: number;
  public actionType: ItemAction;
  private action: null | number | ((stack: ItemStack, p: Player) => void);
  public img: ImageBitmap | null;

  constructor(id: string, name: string, image: string, maxStackSize: number) {
    this.id = id;
    this.name = name;
    this.maxStackSize = maxStackSize;
    this.actionType = ItemAction.None;

    this.img = null;

    // Read a file from the filesystem and create an ImageBitmap from it
    fetch(image)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.statusText}`);
        }
        return response.blob();
      })
      .then(createImageBitmap)
      .then((img) => {
        this.img = img;
      })
      .catch((error) => console.error("Error loading image:", error));
  }

  public setAction(actionType: ItemAction.None): ItemType;
  public setAction(
    actionType: ItemAction.Use,
    action: (stack: ItemStack, player: Player) => void,
  ): ItemType;
  public setAction(actionType: ItemAction.Place, blockType: number): ItemType;
  public setAction(
    actionType: ItemAction,
    action?: number | ((stack: ItemStack, p: Player) => void),
  ): ItemType {
    this.actionType = actionType;
    if (action !== undefined) {
      this.action = action;
    } else {
      this.action = null;
    }
    return this;
  }

  public useAction(itemStack: ItemStack, player: Player) {
    if (this.actionType === ItemAction.Use) {
      const actionFunc = this.action as (stack: ItemStack, p: Player) => void;
      actionFunc(itemStack, player);
    }
  }

  public getBlockType(): number {
    return this.actionType === ItemAction.Place ? (this.action as number) : -1;
  }
}

export var itemTypes: Map<string, ItemType> = new Map();
export var recipes: Recipe[] = new Array();

export function registerItemTypes() {
  const registerItem = (
    id: string,
    name: string,
    maxStackSize: number = 16,
  ): ItemType => {
    const imagePath = `./static/assets/items/${id}.png`;
    itemTypes.set(id, new ItemType(id, name, imagePath, maxStackSize));
    return itemTypes.get(id)!;
  };
  registerItem("dirt", "Dirt").setAction(ItemAction.Place, Chunk.blockTypeDirt);
  registerItem("cobble", "Cobblestone").setAction(
    ItemAction.Place,
    Chunk.blockTypeCobble,
  );
  registerItem("bedrock", "Bedrock").setAction(
    ItemAction.Place,
    Chunk.blockTypeBedrock,
  );
  registerItem("sand", "Sand").setAction(ItemAction.Place, Chunk.blockTypeSand);
  registerItem("sandstone", "Sandstone").setAction(
    ItemAction.Place,
    Chunk.blockTypeSandstone,
  );
  registerItem("snow", "Snow").setAction(ItemAction.Place, Chunk.blockTypeSnow);
  registerItem("netherite", "Netherite").setAction(
    ItemAction.Place,
    Chunk.blockTypeNetherite,
  );

  registerItem("water_bucket", "Water Bucket", 1).setAction(
    ItemAction.Place,
    Chunk.blockTypeWater,
  );

  registerItem("coal", "Coal");
  registerItem("iron", "Iron");
  registerItem("gold", "Gold");
  registerItem("diamond", "Diamond");
}

export function registerRecipes() {
  const registerRecipe = (
      outputType: string, outputCount: number, inputs: {type: string, count: number}[]) => {
    recipes.push(new Recipe(
        new ItemStack(itemTypes.get(outputType)!, outputCount),
        inputs.map(i => new ItemStack(itemTypes.get(i.type)!, i.count))));
  };

  registerRecipe("sandstone", 1, [{type: "sand", count: 1}, {type: "sand", count: 1}, {type: "sand", count: 1}, {type: "sand", count: 1}]);
}

export class ItemStack {
  public itemType: ItemType;
  public count: number;

  constructor(itemType: ItemType, count: number) {
    this.itemType = itemType;
    this.count = count;
  }

  static dropsFrom(blockType: number): ItemStack | null {
    switch (blockType) {
      case Chunk.blockTypeDirt:
        return new ItemStack(itemTypes.get("dirt")!, 1);
      case Chunk.blockTypeCobble:
        return new ItemStack(itemTypes.get("cobble")!, 1);
      case Chunk.blockTypeCoalOre:
        return new ItemStack(itemTypes.get("coal")!, 1);
      case Chunk.blockTypeIronOre:
        return new ItemStack(itemTypes.get("iron")!, 1);
      case Chunk.blockTypeGoldOre:
        return new ItemStack(itemTypes.get("gold")!, 1);
      case Chunk.blockTypeDiamondOre:
        return new ItemStack(itemTypes.get("diamond")!, 1);
      case Chunk.blockTypeGrass:
        return new ItemStack(itemTypes.get("dirt")!, 1);
      case Chunk.blockTypeBedrock:
        return new ItemStack(itemTypes.get("bedrock")!, 1);
      case Chunk.blockTypeSand:
        return new ItemStack(itemTypes.get("sand")!, 1);
      case Chunk.blockTypeSandstone:
        return new ItemStack(itemTypes.get("sandstone")!, 1);
      case Chunk.blockTypeSnow:
        return new ItemStack(itemTypes.get("snow")!, 1);
      case Chunk.blockTypeNetherite:
        return new ItemStack(itemTypes.get("netherite")!, 1);
      default:
        return null;
    }
  }
}

export class Recipe {
  public output: ItemStack;
  public inputs: ItemStack[];

  constructor(output: ItemStack, inputs: ItemStack[]) {
      this.output = output;
      this.inputs = inputs;
  }
}

export class Inventory {
  private items: (ItemStack | null)[];
  public mouseItem: ItemStack | null;
  private craftingSlots: (ItemStack | null)[];
  private outputSlot: ItemStack | null;
  private equipmentSlots: (ItemStack | null)[];

  public static width = 9;
  public static height = 4;
  public static equipmentCount = 2;

  private activeRecipe: Recipe | null;

  constructor() {
    this.items = new Array(Inventory.width * Inventory.height).fill(null);
    this.mouseItem = null;
    this.craftingSlots = new Array(4).fill(null);
    this.outputSlot = null;
    this.equipmentSlots = new Array(Inventory.equipmentCount).fill(null);
    this.activeRecipe = null;
  }

  public insertStack(itemStack: ItemStack | null): boolean {
    if (itemStack === null) {
      return true;
    }

    const itemType = itemStack.itemType;
    let count = itemStack.count;

    for (let itemStack of this.items) {
      if (
        itemStack &&
        itemStack!.itemType.id === itemType.id &&
        itemStack!.count < itemType.maxStackSize
      ) {
        const spaceLeft = itemType.maxStackSize - itemStack!.count;
        const toAdd = Math.min(spaceLeft, count);
        itemStack!.count += toAdd;
        count -= toAdd;
        if (count <= 0) return true;
      }
    }
    for (let i = 0; i < this.items.length; i++) {
      if (!this.items[i]) {
        const toAdd = Math.min(itemType.maxStackSize, count);
        this.items[i] = new ItemStack(itemType, toAdd);
        count -= toAdd;
        if (count <= 0) return true;
      }
    }
    return false;
  }

  public removeItem(itemType: ItemType, count: number): boolean {
    for (let i = 0; i < this.items.length; i++) {
      let itemStack = this.items[i];
      if (itemStack && itemStack!.itemType.id === itemType.id) {
        if (itemStack!.count > count) {
          itemStack!.count -= count;
          return true;
        } else {
          count -= itemStack!.count;
          this.items[i] = null;
          i--;
          if (count <= 0) return true;
        }
      }
    }
    return false;
  }

  public static slotIndex(x: number, y: number): number {
    return y * Inventory.width + x;
  }

  public static equipmentIndex(i: number): number {
    return 1000 + i;
  }

  public static craftingIndex(x: number, y: number): number {
    return 2000 + y * 2 + x;
  }

  public static outputIndex(): number {
    return 3000;
  }

  public editSlotCount(index: number, count: number): void {
    if (count <= 0) {
      this.setItemStack(index, null);
    } else {
      const stack = this.getItemStack(index);
      stack!.count = count;
    }
  }

  public getItemStack(index: number): ItemStack | null {
    if (index < 1000) {
      if (index < 0 || index >= Inventory.width * Inventory.height) {
        throw new Error(`Invalid inventory slot index: ${index}`);
      }
      return this.items[index];
    } else if (index < 2000) {
      const equipIndex = index - 1000;
      if (equipIndex < 0 || equipIndex >= Inventory.equipmentCount) {
        throw new Error(`Invalid equipment slot index: ${equipIndex}`);
      }
      return this.equipmentSlots[equipIndex];
    } else if (index < 3000) {
      const craftIndex = index - 2000;
      if (craftIndex < 0 || craftIndex >= 4) {
        throw new Error(`Invalid crafting slot index: ${craftIndex}`);
      }
      return this.craftingSlots[craftIndex];
    } else if (index === 3000) {
      return this.outputSlot;
    } else {
      throw new Error(`Invalid inventory slot index: ${index}`);
    }
  }

  public setItemStack(index: number, itemStack: ItemStack | null): void {
    if (index < 1000) {
      if (index < 0 || index >= Inventory.width * Inventory.height) {
        throw new Error(`Invalid inventory slot index: ${index}`);
      }
      this.items[index] = itemStack;
    } else if (index < 2000) {
      const equipIndex = index - 1000;
      if (equipIndex < 0 || equipIndex >= Inventory.equipmentCount) {
        throw new Error(`Invalid equipment slot index: ${equipIndex}`);
      }
      this.equipmentSlots[equipIndex] = itemStack;
    } else if (index < 3000) {
      const craftIndex = index - 2000;
      if (craftIndex < 0 || craftIndex >= 4) {
        throw new Error(`Invalid crafting slot index: ${craftIndex}`);
      }
      this.craftingSlots[craftIndex] = itemStack;
    } else if (index === 3000) {
      this.outputSlot = itemStack;
    } else {
        throw new Error(`Invalid inventory slot index: ${index}`);
    }
  }

  private static readonly SLOT_SIZE = 60;
  private static readonly SLOT_GAP = 10;
  private static readonly INV_PADDING = 15;
  private static readonly HOTBAR_GAP = 30;

  /** Iterates over all inventory slots, calling cb with (col, invRow, x, y) relative to grid origin. */
  private forEachInventorySlot(cb: (col: number, invRow: number, x: number, y: number) => void): void {
    const { SLOT_SIZE, SLOT_GAP, HOTBAR_GAP } = Inventory;
    const cols = Inventory.width;
    const rows = Inventory.height;

    for (let row = 0; row < rows; row++) {
      const invRow = row < rows - 1 ? row + 1 : 0;
      const y = row < rows - 1
        ? row * (SLOT_SIZE + SLOT_GAP)
        : row * SLOT_SIZE + (rows - 2) * SLOT_GAP + HOTBAR_GAP;

      for (let col = 0; col < cols; col++) {
        cb(col, invRow, col * (SLOT_SIZE + SLOT_GAP), y);
      }
    }
  }

  private static readonly LOWER_PANEL_GAP = 65;

  /** Returns the width of the inventory grid. */
  private static invGridWidth(): number {
    return Inventory.width * Inventory.SLOT_SIZE + (Inventory.width - 1) * Inventory.SLOT_GAP;
  }

  /** Returns the height of the inventory grid (including hotbar gap). */
  private static invGridHeight(): number {
    return Inventory.height * Inventory.SLOT_SIZE + (Inventory.height - 2) * Inventory.SLOT_GAP + Inventory.HOTBAR_GAP;
  }

  /** Height of the lower panels (equipment / crafting). */
  private static lowerPanelHeight(): number {
    return 2 * Inventory.SLOT_SIZE + Inventory.SLOT_GAP;
  }

  private gridOrigin(canvasWidth: number, canvasHeight: number): [number, number] {
    const gridWidth = Inventory.invGridWidth();
    const totalHeight = Inventory.invGridHeight() + Inventory.LOWER_PANEL_GAP + Inventory.lowerPanelHeight();
    return [
      (canvasWidth - gridWidth) / 2,
      (canvasHeight - totalHeight) / 2,
    ];
  }

  /** Draws a single inventory slot by index. */
  private drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number, index: number, highlight: boolean): void {
    const { SLOT_SIZE } = Inventory;

    ctx.beginPath();
    ctx.roundRect(x, y, SLOT_SIZE, SLOT_SIZE, 4);
    ctx.fillStyle = "rgba(15,15,25,0.6)";
    ctx.fill();
    ctx.strokeStyle = highlight ? "#e1d8b7" : "#1b1717";
    ctx.lineWidth = highlight ? 4 : 2;
    ctx.stroke();

    const item = this.getItemStack(index);
    if (item) {
      this.drawItem(ctx, item, x, y);
    }
  }

  private drawItem(ctx: CanvasRenderingContext2D, item: ItemStack, x: number, y: number): void {
    const { SLOT_SIZE } = Inventory;
    const img = item.itemType.img;
    if (img) {
      ctx.drawImage(img, x + 9, y + 9, SLOT_SIZE - 18, SLOT_SIZE - 18);
    } else {
      ctx.fillStyle = "#d81cd5";
      ctx.fillRect(x + 9, y + 9, SLOT_SIZE - 18, SLOT_SIZE - 18);
    }

    if (item.count > 1) {
      ctx.fillStyle = "#fff6d7";
      ctx.font = "16px monospace";
      ctx.textBaseline = "bottom";
      ctx.textAlign = "right";
      ctx.fillText(String(item.count), x + SLOT_SIZE - 8, y + SLOT_SIZE - 6);
    }
  }

  public drawHotbar(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, selectedHotbarIdx: number): void {
    const { SLOT_SIZE, SLOT_GAP } = Inventory;
    const cols = Inventory.width;
    const hotbarWidth = cols * SLOT_SIZE + (cols - 1) * SLOT_GAP;
    const hotbarX = (canvasWidth - hotbarWidth) / 2;
    const hotbarY = canvasHeight - SLOT_SIZE - 35;

    const selectedItem = this.getItemStack(Inventory.slotIndex(selectedHotbarIdx, 0));
    ctx.font = "16px monospace";
    const titleHeight = selectedItem ? 18 : 0;

    ctx.save();
    ctx.translate(hotbarX, hotbarY);

    // background (extended upward for title)
    ctx.beginPath();
    ctx.roundRect(-15, -15 - titleHeight, hotbarWidth + 30, SLOT_SIZE + 30 + titleHeight, 6);
    ctx.strokeStyle = "#737981";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(21,27,41,0.6)";
    ctx.fill();
    ctx.stroke();

    // item title
    if (selectedItem) {
      ctx.fillStyle = "#e1d8b7";
      ctx.textBaseline = "bottom";
      ctx.textAlign = "center";
      ctx.fillText(selectedItem!.itemType.name, hotbarWidth / 2, -8);
    }

    for (let i = 0; i < cols; i++) {
      this.drawSlot(ctx, i * (SLOT_SIZE + SLOT_GAP), 0, Inventory.slotIndex(i, 0), i === selectedHotbarIdx);
    }

    ctx.restore();
  }

  /** Draws a labeled panel background. */
  private drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string): void {
    const { INV_PADDING } = Inventory;
    ctx.beginPath();
    ctx.roundRect(x - INV_PADDING, y - INV_PADDING, w + INV_PADDING * 2, h + INV_PADDING * 2, 6);
    ctx.strokeStyle = "#737981";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(21,27,41,0.85)";
    ctx.fill();
    ctx.stroke();

    ctx.font = "18px monospace";
    ctx.fillStyle = "#e1d8b7";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(label, x, y - INV_PADDING - 4);
  }

  public drawInventoryScreen(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, selectedHotbarIdx: number, mouseX: number, mouseY: number): void {
    const { SLOT_SIZE, SLOT_GAP, LOWER_PANEL_GAP } = Inventory;
    const gridWidth = Inventory.invGridWidth();
    const gridHeight = Inventory.invGridHeight();
    const lowerH = Inventory.lowerPanelHeight();

    const [originX, originY] = this.gridOrigin(canvasWidth, canvasHeight);

    ctx.save();
    ctx.translate(originX, originY);

    // Inventory panel
    this.drawPanel(ctx, 0, 0, gridWidth, gridHeight, "Inventory");

    this.forEachInventorySlot((col, invRow, x, y) => {
      this.drawSlot(ctx, x, y, Inventory.slotIndex(col, invRow), invRow === 0 && col === selectedHotbarIdx);
    });

    // Lower panels Y
    const lowerY = gridHeight + LOWER_PANEL_GAP;

    // Equipment panel (left) — 1 column, 2 rows
    const equipW = SLOT_SIZE;
    this.drawPanel(ctx, 0, lowerY, equipW, lowerH, "Equipment");
    for (let i = 0; i < Inventory.equipmentCount; i++) {
      this.drawSlot(ctx, 0, lowerY + i * (SLOT_SIZE + SLOT_GAP), Inventory.equipmentIndex(i), false);
    }

    // Crafting panel (right) — 2x2 grid + output slot
    const craftCols = 2;
    const craftW = craftCols * SLOT_SIZE + (craftCols - 1) * SLOT_GAP + SLOT_GAP + SLOT_SIZE; // 2x2 + gap + output
    const craftX = gridWidth - craftW;
    this.drawPanel(ctx, craftX, lowerY, craftW, lowerH, "Crafting");
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        this.drawSlot(
          ctx,
          craftX + col * (SLOT_SIZE + SLOT_GAP),
          lowerY + row * (SLOT_SIZE + SLOT_GAP),
          Inventory.craftingIndex(col, row),
          false,
        );
      }
    }
    // Output slot (centered vertically, to the right of the 2x2 grid)
    const outputX = craftX + craftCols * (SLOT_SIZE + SLOT_GAP);
    const outputY = lowerY + (lowerH - SLOT_SIZE) / 2;
    this.drawSlot(ctx, outputX, outputY, Inventory.outputIndex(), false);

    // Draw item held by mouse
    if (this.mouseItem) {
      const mx = mouseX - originX - SLOT_SIZE / 2;
      const my = mouseY - originY - SLOT_SIZE / 2;
      this.drawItem(ctx, this.mouseItem, mx, my);
    }

    ctx.restore();
  }

  private isInSlot(relX: number, relY: number, x: number, y: number): boolean {
    const { SLOT_SIZE } = Inventory;
    return relX >= x && relX < x + SLOT_SIZE && relY >= y && relY < y + SLOT_SIZE;
  }

  public handleClick(mouseX: number, mouseY: number, canvasWidth: number, canvasHeight: number, button: number): void {
    const { SLOT_SIZE, SLOT_GAP, LOWER_PANEL_GAP } = Inventory;
    const [originX, originY] = this.gridOrigin(canvasWidth, canvasHeight);
    const relX = mouseX - originX;
    const relY = mouseY - originY;
    const gridWidth = Inventory.invGridWidth();
    const gridHeight = Inventory.invGridHeight();
    const lowerH = Inventory.lowerPanelHeight();
    const lowerY = gridHeight + LOWER_PANEL_GAP;

    // Inventory grid
    this.forEachInventorySlot((col, invRow, x, y) => {
      if (this.isInSlot(relX, relY, x, y)) {
        this.clickSlot(Inventory.slotIndex(col, invRow), button);
      }
    });

    // Equipment slots
    for (let i = 0; i < Inventory.equipmentCount; i++) {
      if (this.isInSlot(relX, relY, 0, lowerY + i * (SLOT_SIZE + SLOT_GAP))) {
        this.clickSlot(Inventory.equipmentIndex(i), button);
        return;
      }
    }

    // Crafting slots
    const craftCols = 2;
    const craftW = craftCols * SLOT_SIZE + (craftCols - 1) * SLOT_GAP + SLOT_GAP + SLOT_SIZE;
    const craftX = gridWidth - craftW;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        if (this.isInSlot(relX, relY, craftX + col * (SLOT_SIZE + SLOT_GAP), lowerY + row * (SLOT_SIZE + SLOT_GAP))) {
          this.clickSlot(Inventory.craftingIndex(col, row), button);
          return;
        }
      }
    }

    // Output slot
    const outputX = craftX + craftCols * (SLOT_SIZE + SLOT_GAP);
    const outputY = lowerY + (lowerH - SLOT_SIZE) / 2;
    if (this.isInSlot(relX, relY, outputX, outputY)) {
      this.clickSlot(Inventory.outputIndex(), button);
    }
  }

  public clickSlot(index: number, button: number): void {
    const slotItem = this.getItemStack(index);

    const canUseSlot = !this.mouseItem || !(1000 <= index && index < 2000 && this.mouseItem.itemType.actionType !== ItemAction.Equip);

    if (index === Inventory.outputIndex()) {
      if (slotItem && (!this.mouseItem ||
            (this.mouseItem && slotItem.itemType.id === this.mouseItem.itemType.id && this.mouseItem.count + slotItem.count <= slotItem.itemType.maxStackSize))) {
        this.mouseItem = new ItemStack(slotItem.itemType, this.mouseItem ? this.mouseItem.count + slotItem.count : slotItem.count);
        this.setItemStack(index, null);
        this.useUpCrafingInputs();
      }
    } else if (button === 0) {
      if (this.mouseItem && slotItem && this.mouseItem.itemType.id === slotItem.itemType.id) {
        // If same item type, try to merge mouse item into slot item
        const spaceLeft = slotItem.itemType.maxStackSize - slotItem.count;
        const toAdd = Math.min(spaceLeft, this.mouseItem.count);
        slotItem.count += toAdd;
        this.mouseItem.count -= toAdd;
        if (this.mouseItem.count <= 0) {
          this.mouseItem = null;
        }
      } else if (canUseSlot) {
        // Left click: swap mouse item with slot item
        const temp = this.getItemStack(index);
        this.setItemStack(index, this.mouseItem);
        this.mouseItem = temp;
      }
    } else if (button === 2) {
      // Right click: if mouse item is null, take half of slot item; else try to add one to slot item

      if (this.mouseItem === null && slotItem) {
        const halfCount = Math.ceil(slotItem.count / 2);
        this.mouseItem = new ItemStack(slotItem.itemType, halfCount);
        slotItem.count -= halfCount;
        if (slotItem.count <= 0) {
          this.setItemStack(index, null);
        }
      } else if (this.mouseItem && !slotItem && canUseSlot) {
        // If slot is empty, place one item from mouse item into slot
        this.setItemStack(index, new ItemStack(this.mouseItem.itemType, 1));
        this.mouseItem.count -= 1;
        if (this.mouseItem.count <= 0) {
          this.mouseItem = null;
        }
      } else if (this.mouseItem && slotItem
            && slotItem.itemType.id === this.mouseItem.itemType.id
            && slotItem.count < slotItem.itemType.maxStackSize) {
        slotItem.count += 1;
        this.mouseItem.count -= 1;
        if (this.mouseItem.count <= 0) {
          this.mouseItem = null;
        }
      }
    }

    this.updateCraftingOutput();
  }

  public closeInventory() {
    this.insertStack(this.mouseItem);
    this.mouseItem = null;

    for (let i = 0; i < 4; i++) {
      const craftIndex = Inventory.craftingIndex(i % 2, Math.floor(i / 2));
      this.insertStack(this.getItemStack(craftIndex));
      this.setItemStack(craftIndex, null);
    }
    this.activeRecipe = null;
    this.outputSlot = null;
  }

  private updateCraftingOutput() {
    for (let recipe of recipes) {
      let matches = true;
      let used = [false, false, false, false];
      for (let input of recipe.inputs) {
        let found = false;
        for (let i = 0; i < 4; i++) {
          const craftIndex = Inventory.craftingIndex(i % 2, Math.floor(i / 2));
          const slotItem = this.getItemStack(craftIndex);
          if (!used[i] && slotItem && slotItem.itemType.id === input.itemType.id && slotItem.count >= input.count) {
            found = true;
            used[i] = true;
            break;
          }
        }
        if (!found) {
          matches = false;
          break;
        }
      }
      if (matches) {
        this.setItemStack(Inventory.outputIndex(), new ItemStack(recipe.output.itemType, recipe.output.count));
        this.activeRecipe = recipe;
        return;
      }
    }
    this.activeRecipe = null;
    this.setItemStack(Inventory.outputIndex(), null);
  }

  private useUpCrafingInputs() {
    if (!this.activeRecipe) { return; }
    let used = [false, false, false, false];
    for (let input of this.activeRecipe.inputs) {
      for (let i = 0; i < 4; i++) {
        const craftIndex = Inventory.craftingIndex(i % 2, Math.floor(i / 2));
        const slotItem = this.getItemStack(craftIndex);
        if (!used[i] && slotItem && slotItem.itemType.id === input.itemType.id && slotItem.count >= input.count) {
          this.editSlotCount(craftIndex, slotItem.count - input.count);
          used[i] = true;
        }
      }
    }
  }
}
