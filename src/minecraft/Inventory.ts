import {Player} from "./Entity.js";
import {Chunk} from "./Chunk.js";

export enum ItemAction {
    None,
    Use,
    Place
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
            .then(response => {
                if (!response.ok) { throw new Error(`Failed to load image: ${response.statusText}`); }
                return response.blob();
            })
            .then(createImageBitmap)
            .then(img => {
                this.img = img;
            })
            .catch(error => console.error("Error loading image:", error));
    }

    public setAction(actionType: ItemAction.None): ItemType;
    public setAction(actionType: ItemAction.Use, action: (stack: ItemStack, player: Player) => void): ItemType;
    public setAction(actionType: ItemAction.Place, blockType: number): ItemType;
    public setAction(actionType: ItemAction, action?: number | ((stack: ItemStack, p: Player) => void)): ItemType {
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
        return this.actionType === ItemAction.Place ? this.action as number : -1;
    }
}

export var itemTypes: Map<string, ItemType> = new Map();

export function registerItemTypes() {
    const registerItem = (id: string, name: string, maxStackSize: number = 16): ItemType => {
        const imagePath = `./static/assets/items/${id}.png`;
        itemTypes.set(id, new ItemType(id, name, imagePath, maxStackSize));
        return itemTypes.get(id);
    }
    registerItem("dirt", "Dirt").setAction(ItemAction.Place, Chunk.blockTypeDirt);
    registerItem("cobble", "Cobblestone").setAction(ItemAction.Place, Chunk.blockTypeCobble);

    registerItem("water_bucket", "Water Bucket", 1).setAction(ItemAction.Place, Chunk.blockTypeWater);

    registerItem("coal", "Coal");
    registerItem("iron", "Iron");
    registerItem("gold", "Gold");
    registerItem("diamond", "Diamond");
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
            case Chunk.blockTypeDirt: return new ItemStack(itemTypes.get("dirt")!, 1);
            case Chunk.blockTypeCobble: return new ItemStack(itemTypes.get("cobble")!, 1);
            case Chunk.blockTypeCoalOre: return new ItemStack(itemTypes.get("coal")!, 1);
            case Chunk.blockTypeIronOre: return new ItemStack(itemTypes.get("iron")!, 1);
            case Chunk.blockTypeGoldOre: return new ItemStack(itemTypes.get("gold")!, 1);
            case Chunk.blockTypeDiamondOre: return new ItemStack(itemTypes.get("diamond")!, 1);
            default: return null;
        }
    }
}

export class Inventory {
    private items: (ItemStack | null)[];

    public static width = 9;
    public static height = 4;

    constructor() {
        this.items = new Array(Inventory.width * Inventory.height);
        for (let i = 0; i < this.items.length; i++) {
            this.items[i] = null;
        }
    }

    public insertStack(itemStack?: ItemStack): boolean {
        if (!itemStack) { return true; }

        const itemType = itemStack.itemType;
        let count = itemStack.count;

        for (let itemStack of this.items) {
            if (itemStack && itemStack!.itemType.id === itemType.id && itemStack!.count < itemType.maxStackSize) {
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

    public editSlotCount(x: number, y: number, count: number): void {
        const index = y * Inventory.width + x;
        if (index < 0 || index >= this.items.length) {
            throw new Error(`Invalid inventory coordinates: (${x}, ${y})`);
        }
        if (this.items[index] === null) {
            throw new Error(`No item stack at inventory coordinates: (${x}, ${y})`);
        }
        if (count <= 0) {
            this.items[index] = null;
        } else {
            this.items[index]!.count = count;
        }
    }

    public getItemStack(x: number, y: number): ItemStack | null {
        const index = y * Inventory.width + x;
        if (index < 0 || index >= this.items.length) {
            throw new Error(`Invalid inventory coordinates: (${x}, ${y})`);
        }
        return this.items[index];
    }
}
