import { Player } from "./Entity.js";
import { Chunk } from "./Chunk.js";
import {DecorationGenerator} from "./Decorations.js";
import {CRAFTING_RECIPES, CraftingRecipe} from "./Crafting.js";
import {MinecraftAnimation} from "./App.js";

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
  private action: null | number | ((app: MinecraftAnimation, stack: ItemStack, p: Player) => void);
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
      .catch((error) => {
        this.img = null;
        console.error("Error loading image:", error)
      });
  }

  public setAction(actionType: ItemAction.None): ItemType;
  public setAction(actionType: ItemAction.Equip): ItemType;
  public setAction(
    actionType: ItemAction.Use,
    action: (app: MinecraftAnimation, stack: ItemStack, player: Player) => void,
  ): ItemType;
  public setAction(actionType: ItemAction.Place, blockType: number): ItemType;
  public setAction(
    actionType: ItemAction,
    action?: number | ((app: MinecraftAnimation, stack: ItemStack, p: Player) => void),
  ): ItemType {
    this.actionType = actionType;
    if (action !== undefined) {
      this.action = action;
    } else {
      this.action = null;
    }
    return this;
  }

  public useAction(app: MinecraftAnimation, itemStack: ItemStack, player: Player) {
    if (this.actionType === ItemAction.Use) {
      const actionFunc = this.action as (app: MinecraftAnimation, stack: ItemStack, p: Player) => void;
      actionFunc(app, itemStack, player);
    }
  }

  public getBlockType(): number {
    return this.actionType === ItemAction.Place ? (this.action as number) : -1;
  }
}

export var itemTypes: Map<string, ItemType> = new Map();

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
  registerItem("wood", "Wood").setAction(
      ItemAction.Place,
      DecorationGenerator.blockTypeWood,
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

  registerItem("stick", "Stick");
  registerItem("ammo", "Ammo", 64);
  registerItem("boots", "Jump Boots", 1).setAction(ItemAction.Equip);
  registerItem("jetpack", "Jetpack", 1).setAction(ItemAction.Equip);
  registerItem("blaster", "Blaster", 1).setAction(ItemAction.Use,
      (app: MinecraftAnimation, stack: ItemStack, p: Player) => {
        app.fireBlaster();
      });
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
      case DecorationGenerator.blockTypeDecorRock:
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
      case DecorationGenerator.blockTypeWood:
      case DecorationGenerator.blockTypeBirchWood:
        return new ItemStack(itemTypes.get("wood")!, 1);
      default:
        return null;
    }
  }
}

export class Inventory {
  private items: (ItemStack | null)[];
  public mouseItem: ItemStack | null;
  private equipmentSlots: (ItemStack | null)[];

  public static width = 9;
  public static height = 4;
  public static equipmentCount = 2;

  private craftingRecipes: CraftingRecipe[];
  private selectedCraftingRecipeIdx: number;
  public selectedHotbarIdx: number;

  constructor() {
    this.items = new Array(Inventory.width * Inventory.height).fill(null);
    this.mouseItem = null;
    this.equipmentSlots = new Array(Inventory.equipmentCount).fill(null);

    this.craftingRecipes = CRAFTING_RECIPES;
    this.selectedCraftingRecipeIdx = 0;
    this.selectedHotbarIdx = 0;
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

  public insertItemById(itemId: string, count: number): boolean {
    const itemType = itemTypes.get(itemId);
    if (!itemType) {
      throw Error("Item type not found: " + itemType);
    }
    return this.insertStack(new ItemStack(itemType, 1));
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

  public removeItemById(itemId: string, count: number): boolean {
    const itemType = itemTypes.get(itemId);
    if (!itemType) {
      throw Error("Item type not found: " + itemType);
    }
    return this.removeItem(itemType, 1);
  }

  public static slotIndex(x: number, y: number): number {
    return y * Inventory.width + x;
  }

  public static equipmentIndex(i: number): number {
    return 1000 + i;
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
    } else {
      throw new Error(`Invalid inventory slot index: ${index}`);
    }
  }

  public hasEquipment(itemType: ItemType): boolean {
    return this.equipmentSlots.filter(i => i && i.itemType.id === itemType.id).length > 0;
  }

  public hasEquipmentById(itemId: string): boolean {
    const itemType = itemTypes.get(itemId);
    if (!itemType) {
      throw Error("Item type not found: " + itemType);
    }
    return this.hasEquipment(itemType);
  }

  public getHeldItem(): ItemStack | null {
    return this.getItemStack(Inventory.slotIndex(this.selectedHotbarIdx, 0));
  }

  public dropHeldItem(): void {
    const index = Inventory.slotIndex(this.selectedHotbarIdx, 0);
    const item = this.getItemStack(index);
    if (item) {
      this.editSlotCount(index, item.count - 1);
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
    } else {
      throw new Error(`Invalid inventory slot index: ${index}`);
    }
  }

  public countItem(itemId: string): number {
    let total = 0;
    for (const stack of this.items) {
      if (stack && stack.itemType.id === itemId) {
        total += stack.count;
      }
    }
    return total;
  }

  public hasItem(itemId: string, count: number): boolean {
    return this.countItem(itemId) >= count;
  }

  public canFitStack(itemStack: ItemStack | null): boolean {
    if (itemStack === null) {
      return true;
    }

    const itemType = itemStack.itemType;
    let count = itemStack.count;

    for (const stack of this.items) {
      if (!stack) {
        return true;
      } else if (stack.itemType.id === itemType.id && stack.count < itemType.maxStackSize) {
        const spaceLeft = itemType.maxStackSize - stack.count;
        count -= Math.min(spaceLeft, count);
        if (count <= 0) {
          return true;
        }
      }
    }
    return false;
  }

  public canFitItemById(itemId: string, count: number): boolean {
    const itemType = itemTypes.get(itemId);
    if (!itemType) {
      throw Error("Item type not found: " + itemType);
    }
    return this.canFitStack(new ItemStack(itemType, 1));
  }

  private static readonly SLOT_SIZE = 60;
  private static readonly SLOT_GAP = 10;
  private static readonly INV_PADDING = 15;
  private static readonly HOTBAR_GAP = 30;

  /** Iterates over all inventory slots, calling cb with (col, invRow, x, y) relative to grid origin. */
  private forEachInventorySlot(
    cb: (col: number, invRow: number, x: number, y: number) => void,
  ): void {
    const { SLOT_SIZE, SLOT_GAP, HOTBAR_GAP } = Inventory;
    const cols = Inventory.width;
    const rows = Inventory.height;

    for (let row = 0; row < rows; row++) {
      const invRow = row < rows - 1 ? row + 1 : 0;
      const y =
        row < rows - 1
          ? row * (SLOT_SIZE + SLOT_GAP)
          : row * SLOT_SIZE + (rows - 2) * SLOT_GAP + HOTBAR_GAP;

      for (let col = 0; col < cols; col++) {
        cb(col, invRow, col * (SLOT_SIZE + SLOT_GAP), y);
      }
    }
  }

  private static readonly PANEL_GAP = 50;
  private static readonly CRAFTING_PANEL_HEIGHT = 280;
  private static readonly CRAFTING_PANEL_GAP = 75;

  /** Returns the width of the inventory grid. */
  private static invGridWidth(): number {
    return (
      Inventory.width * Inventory.SLOT_SIZE +
      (Inventory.width - 1) * Inventory.SLOT_GAP
    );
  }

  /** Returns the height of the inventory grid (including hotbar gap). */
  private static invGridHeight(): number {
    return (
      Inventory.height * Inventory.SLOT_SIZE +
      (Inventory.height - 2) * Inventory.SLOT_GAP +
      Inventory.HOTBAR_GAP
    );
  }

  /** Height of the equipment column. */
  private static equipmentHeight(): number {
    return (
      Inventory.equipmentCount * Inventory.SLOT_SIZE +
      (Inventory.equipmentCount - 1) * Inventory.SLOT_GAP
    );
  }

  /** Returns the origin (top-left) of the inventory grid. */
  private gridOrigin(
    canvasWidth: number,
    canvasHeight: number,
  ): [number, number] {
    const gridWidth = Inventory.invGridWidth();
    const equipW = Inventory.SLOT_SIZE;
    // Total layout width: equipment + padding + gap + inventory
    const totalWidth =
      equipW + Inventory.INV_PADDING * 2 + Inventory.PANEL_GAP + gridWidth;
    const totalHeight =
      Inventory.invGridHeight() +
      Inventory.CRAFTING_PANEL_GAP +
      Inventory.CRAFTING_PANEL_HEIGHT;
    // Left edge of total layout
    const layoutX = (canvasWidth - totalWidth) / 2;
    // Inventory grid is positioned to the right of equipment panel
    const invX =
      layoutX + equipW + Inventory.INV_PADDING * 2 + Inventory.PANEL_GAP;
    const invY = (canvasHeight - totalHeight) / 2;
    return [invX, invY];
  }

  /** Draws a single inventory slot by index. */
  private drawSlot(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    index: number,
    highlight: boolean,
  ): void {
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

  private drawItem(
    ctx: CanvasRenderingContext2D,
    item: ItemStack,
    x: number,
    y: number,
  ): void {
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

  public drawHotbar(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const { SLOT_SIZE, SLOT_GAP } = Inventory;
    const cols = Inventory.width;
    const hotbarWidth = cols * SLOT_SIZE + (cols - 1) * SLOT_GAP;
    const hotbarX = (canvasWidth - hotbarWidth) / 2;
    const hotbarY = canvasHeight - SLOT_SIZE - 35;

    const selectedItem = this.getItemStack(
      Inventory.slotIndex(this.selectedHotbarIdx, 0),
    );
    ctx.font = "16px monospace";
    const titleHeight = selectedItem ? 18 : 0;

    ctx.save();
    ctx.translate(hotbarX, hotbarY);

    // background (extended upward for title)
    ctx.beginPath();
    ctx.roundRect(
      -15,
      -15 - titleHeight,
      hotbarWidth + 30,
      SLOT_SIZE + 30 + titleHeight,
      6,
    );
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
      this.drawSlot(
        ctx,
        i * (SLOT_SIZE + SLOT_GAP),
        0,
        Inventory.slotIndex(i, 0),
        i === this.selectedHotbarIdx,
      );
    }

    ctx.restore();
  }

  /** Draws a labeled panel background. */
  private drawPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    centerLabel: boolean = false,
  ): void {
    const { INV_PADDING } = Inventory;
    ctx.beginPath();
    ctx.roundRect(
      x - INV_PADDING,
      y - INV_PADDING,
      w + INV_PADDING * 2,
      h + INV_PADDING * 2,
      6,
    );
    ctx.strokeStyle = "#737981";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(21,27,41,0.85)";
    ctx.fill();
    ctx.stroke();

    ctx.font = "18px monospace";
    ctx.fillStyle = "#e1d8b7";
    ctx.textBaseline = "bottom";
    if (centerLabel) {
      ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y - INV_PADDING - 4);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(label, x, y - INV_PADDING - 4);
    }
  }

  public drawInventoryScreen(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    mouseX: number,
    mouseY: number,
  ): void {
    const { SLOT_SIZE, SLOT_GAP, INV_PADDING, PANEL_GAP, CRAFTING_PANEL_HEIGHT, CRAFTING_PANEL_GAP } = Inventory;
    const gridWidth = Inventory.invGridWidth();
    const gridHeight = Inventory.invGridHeight();
    const equipH = Inventory.equipmentHeight();

    const [originX, originY] = this.gridOrigin(canvasWidth, canvasHeight);

    ctx.save();
    ctx.translate(originX, originY);

    // Inventory panel (top center)
    this.drawPanel(ctx, 0, 0, gridWidth, gridHeight, "Inventory");
    this.forEachInventorySlot((col, invRow, x, y) => {
      this.drawSlot(
        ctx,
        x,
        y,
        Inventory.slotIndex(col, invRow),
        invRow === 0 && col === this.selectedHotbarIdx,
      );
    });

    // Equipment panel (left of inventory, top aligned with inventory)
    const equipW = SLOT_SIZE;
    const equipX = -(equipW + INV_PADDING * 2 + PANEL_GAP) + INV_PADDING;
    const equipY = 0;
    this.drawPanel(ctx, equipX, equipY, equipW, equipH, "Equipment", true);
    for (let i = 0; i < Inventory.equipmentCount; i++) {
      this.drawSlot(
        ctx,
        equipX,
        equipY + i * (SLOT_SIZE + SLOT_GAP),
        Inventory.equipmentIndex(i),
        false,
      );
    }

    // Crafting panel (below, spanning both equipment and inventory)
    const craftX = equipX;
    const craftW = gridWidth + equipW + INV_PADDING * 2 + PANEL_GAP;
    const craftY = gridHeight + CRAFTING_PANEL_GAP;
    this.drawPanel(ctx, craftX, craftY, craftW, CRAFTING_PANEL_HEIGHT, "Crafting");
    this.drawCraftingContents(ctx, craftX, craftY, craftW, CRAFTING_PANEL_HEIGHT);

    // Draw item held by mouse
    if (this.mouseItem) {
      const mx = mouseX - originX - SLOT_SIZE / 2;
      const my = mouseY - originY - SLOT_SIZE / 2;
      this.drawItem(ctx, this.mouseItem, mx, my);
    }

    ctx.restore();
  }

  /** Layout for the crafting panel contents (relative to panel origin). */
  private craftingLayout(panelX: number, panelY: number, panelW: number, panelH: number) {
    const innerPad = 14;
    const recipeListX = panelX + innerPad;
    const recipeListY = panelY + innerPad;
    const recipeListW = Math.floor(panelW * 0.45);
    const recipeListH = panelH - innerPad * 2;
    const recipeRowH = 42;

    const detailX = recipeListX + recipeListW + innerPad;
    const detailY = recipeListY;
    const detailW = panelW - innerPad * 3 - recipeListW;
    const detailH = recipeListH;

    const craftButtonH = 36;
    const craftButtonW = detailW - innerPad;
    const craftButtonX = detailX + (detailW - craftButtonW) / 2;
    const craftButtonY = detailY + detailH - craftButtonH - 4;

    return {
      recipeListX, recipeListY, recipeListW, recipeListH, recipeRowH,
      detailX, detailY, detailW, detailH,
      craftButtonX, craftButtonY, craftButtonW, craftButtonH,
    };
  }

  private drawCraftingContents(
    ctx: CanvasRenderingContext2D,
    panelX: number,
    panelY: number,
    panelW: number,
    panelH: number,
  ): void {
    const layout = this.craftingLayout(panelX, panelY, panelW, panelH);

    ctx.save();

    // Recipe list
    ctx.font = "13px monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (let i = 0; i < this.craftingRecipes.length; i++) {
      const recipe = this.craftingRecipes[i];
      const rowY = layout.recipeListY + i * layout.recipeRowH;
      const selected = i === this.selectedCraftingRecipeIdx;

      ctx.fillStyle = selected ? "rgba(225,216,183,0.22)" : "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.roundRect(layout.recipeListX, rowY, layout.recipeListW, layout.recipeRowH - 6, 8);
      ctx.fill();

      ctx.fillStyle = selected ? "#fff6d7" : "#f0eee6";
      ctx.font = "13px monospace";
      ctx.fillText(recipe.title, layout.recipeListX + 10, rowY + 6);
      ctx.fillStyle = "#c9d1d9";
      ctx.font = "11px monospace";
      ctx.fillText(recipe.description, layout.recipeListX + 10, rowY + 22);
    }

    // Detail panel background
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(layout.detailX, layout.detailY, layout.detailW, layout.detailH, 8);
    ctx.fill();

    const recipe = this.currentCraftingRecipe();
    ctx.fillStyle = "#fff6d7";
    ctx.font = "14px monospace";
    ctx.fillText(recipe.title, layout.detailX + 12, layout.detailY + 10);

    ctx.fillStyle = "#d8dee9";
    ctx.font = "12px monospace";
    ctx.fillText("Inputs:", layout.detailX + 12, layout.detailY + 36);
    const inputs = recipe.ingredients
      .map((ing) => `${ing.itemId} x${ing.count} (${this.countItem(ing.itemId)})`)
      .join(", ");
    ctx.fillText(inputs, layout.detailX + 12, layout.detailY + 54);
    ctx.fillText(
      `Output: ${recipe.outputItemId} x${recipe.outputCount}`,
      layout.detailX + 12,
      layout.detailY + 82,
    );

    // Craft button
    const canCraft = this.canCraftRecipe(recipe);
    ctx.fillStyle = canCraft ? "rgba(84, 190, 120, 0.9)" : "rgba(190, 84, 84, 0.9)";
    ctx.beginPath();
    ctx.roundRect(layout.craftButtonX, layout.craftButtonY, layout.craftButtonW, layout.craftButtonH, 8);
    ctx.fill();

    ctx.fillStyle = "#fff6d7";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      canCraft ? "Craft (Enter)" : "Need more materials",
      layout.craftButtonX + layout.craftButtonW / 2,
      layout.craftButtonY + layout.craftButtonH / 2,
    );

    ctx.restore();
  }

  public selectCraftingRecipe(delta: number): void {
    const len = this.craftingRecipes.length;
    if (len === 0) {
      this.selectedCraftingRecipeIdx = 0;
      return;
    }
    this.selectedCraftingRecipeIdx =
        (this.selectedCraftingRecipeIdx + delta + len) % len;
  }

  private currentCraftingRecipe(): CraftingRecipe {
    if (this.craftingRecipes.length === 0) {
      throw new Error("No crafting recipes registered.");
    }
    return this.craftingRecipes[this.selectedCraftingRecipeIdx];
  }

  private canCraftRecipe(recipe: CraftingRecipe): boolean {
    for (const ingredient of recipe.ingredients) {
      if (!this.hasItem(ingredient.itemId, ingredient.count)) {
        return false;
      }
    }

    return this.canFitItemById(
        recipe.outputItemId,
        recipe.outputCount,
    );
  }

  public craftSelectedRecipe(): boolean {
    const recipe = this.currentCraftingRecipe();
    if (!this.canCraftRecipe(recipe)) {
      return false;
    }

    for (const ingredient of recipe.ingredients) {
      if (!this.removeItemById(ingredient.itemId, ingredient.count)) {
        return false;
      }
    }

    return this.insertItemById(
        recipe.outputItemId,
        recipe.outputCount,
    );
  }
  
  // private seedStarterInventory(): void {
  //   const starters: Array<[string, number]> = [
  //     ["dirt", 16],
  //     ["grass", 16],
  //     ["cobble", 16],
  //     ["sand", 16],
  //     ["coal", 16],
  //     ["iron", 16],
  //     ["stick", 8],
  //     ["ammo", 16],
  //     ["water_bucket", 1],
  //   ];
  //
  //   for (const [itemId, count] of starters) {
  //     this.inventory.insertItemById(itemId, count);
  //   }
  // }

  private isInSlot(relX: number, relY: number, x: number, y: number): boolean {
    const { SLOT_SIZE } = Inventory;
    return (
      relX >= x && relX < x + SLOT_SIZE && relY >= y && relY < y + SLOT_SIZE
    );
  }

  public handleClick(
    mouseX: number,
    mouseY: number,
    canvasWidth: number,
    canvasHeight: number,
    button: number,
  ): void {
    const { SLOT_SIZE, SLOT_GAP, INV_PADDING, PANEL_GAP, CRAFTING_PANEL_HEIGHT, CRAFTING_PANEL_GAP } = Inventory;
    const [originX, originY] = this.gridOrigin(canvasWidth, canvasHeight);
    const relX = mouseX - originX;
    const relY = mouseY - originY;
    const gridWidth = Inventory.invGridWidth();
    const gridHeight = Inventory.invGridHeight();

    // Inventory grid
    this.forEachInventorySlot((col, invRow, x, y) => {
      if (this.isInSlot(relX, relY, x, y)) {
        this.clickSlot(Inventory.slotIndex(col, invRow), button);
      }
    });

    // Equipment slots (left of inventory, top aligned)
    const equipW = SLOT_SIZE;
    const equipX = -(equipW + INV_PADDING * 2 + PANEL_GAP) + INV_PADDING;
    const equipY = 0;
    for (let i = 0; i < Inventory.equipmentCount; i++) {
      if (this.isInSlot(relX, relY, equipX, equipY + i * (SLOT_SIZE + SLOT_GAP))) {
        this.clickSlot(Inventory.equipmentIndex(i), button);
        return;
      }
    }

    // Crafting panel (below, spans equipment + inventory)
    const craftX = equipX;
    const craftW = gridWidth + equipW + INV_PADDING * 2 + PANEL_GAP;
    const craftY = gridHeight + CRAFTING_PANEL_GAP;
    if (relX >= craftX && relX < craftX + craftW && relY >= craftY && relY < craftY + CRAFTING_PANEL_HEIGHT) {
      this.handleCraftingClick(relX, relY, craftX, craftY, craftW, CRAFTING_PANEL_HEIGHT);
    }
  }

  private handleCraftingClick(
    relX: number,
    relY: number,
    panelX: number,
    panelY: number,
    panelW: number,
    panelH: number,
  ): void {
    const layout = this.craftingLayout(panelX, panelY, panelW, panelH);

    // Recipe list selection
    if (
      relX >= layout.recipeListX &&
      relX < layout.recipeListX + layout.recipeListW &&
      relY >= layout.recipeListY &&
      relY < layout.recipeListY + layout.recipeRowH * this.craftingRecipes.length
    ) {
      const idx = Math.floor((relY - layout.recipeListY) / layout.recipeRowH);
      if (idx >= 0 && idx < this.craftingRecipes.length) {
        this.selectedCraftingRecipeIdx = idx;
      }
      return;
    }

    // Craft button
    if (
      relX >= layout.craftButtonX &&
      relX < layout.craftButtonX + layout.craftButtonW &&
      relY >= layout.craftButtonY &&
      relY < layout.craftButtonY + layout.craftButtonH
    ) {
      this.craftSelectedRecipe();
    }
  }

  public clickSlot(index: number, button: number): void {
    const slotItem = this.getItemStack(index);

    const canUseSlot =
      !this.mouseItem ||
      !(
        1000 <= index &&
        index < 2000 &&
        this.mouseItem.itemType.actionType !== ItemAction.Equip
      );

    if (button === 0) {
      if (
        this.mouseItem &&
        slotItem &&
        this.mouseItem.itemType.id === slotItem.itemType.id
      ) {
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
      } else if (
        this.mouseItem &&
        slotItem &&
        slotItem.itemType.id === this.mouseItem.itemType.id &&
        slotItem.count < slotItem.itemType.maxStackSize
      ) {
        slotItem.count += 1;
        this.mouseItem.count -= 1;
        if (this.mouseItem.count <= 0) {
          this.mouseItem = null;
        }
      }
    }
  }

  public closeInventory() {
    this.insertStack(this.mouseItem);
    this.mouseItem = null;
  }
}
