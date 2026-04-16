export type CraftIngredient = {
  itemId: string;
  count: number;
};

export type CraftingRecipe = {
  id: string;
  title: string;
  outputItemId: string;
  outputCount: number;
  ingredients: CraftIngredient[];
  description: string;
};

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: "sticks",
    title: "Sticks",
    outputItemId: "stick",
    outputCount: 4,
    ingredients: [{ itemId: "cobble", count: 2 }],
    description: "Crude handles for tools and weapons.",
  },
  {
    id: "sandstone",
    title: "Sandstone",
    outputItemId: "sandstone",
    outputCount: 4,
    ingredients: [{ itemId: "sand", count: 4 }],
    description: "A more decorative placeable block.",
  },
  {
    id: "boots",
    title: "Jump Boots",
    outputItemId: "boots",
    outputCount: 1,
    ingredients: [
      { itemId: "stick", count: 2 },
      { itemId: "iron", count: 2 },
    ],
    description: "Grants one extra jump while airborne.",
  },
  {
    id: "jetpack",
    title: "Jetpack",
    outputItemId: "jetpack",
    outputCount: 1,
    ingredients: [
      { itemId: "stick", count: 4 },
      { itemId: "iron", count: 4 },
      { itemId: "coal", count: 2 },
    ],
    description: "Hold Space to boost upward using fuel.",
  },
  {
    id: "ammo",
    title: "Ammo",
    outputItemId: "ammo",
    outputCount: 16,
    ingredients: [
      { itemId: "cobble", count: 1 },
      { itemId: "coal", count: 1 },
    ],
    description: "Consumes quickly when firing the blaster.",
  },
  {
    id: "blaster",
    title: "Blaster",
    outputItemId: "blaster",
    outputCount: 1,
    ingredients: [
      { itemId: "stick", count: 2 },
      { itemId: "iron", count: 2 },
      { itemId: "ammo", count: 8 },
    ],
    description: "A ranged weapon that damages enemies from afar.",
  },
];
