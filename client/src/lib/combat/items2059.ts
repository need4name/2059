import type { Item } from "./types";
import { normaliseItem } from "./augments";
import rawItems from "../../content/items.json";

// Every implant and stim lives in content/items.json. `npm run check:content`
// (part of `npm run verify`) rejects bad entries before they can ship.
export const BASE_ITEMS = rawItems as unknown as Item[];

/** All items, with implants brought into the power band for their rarity. */
export const ITEMS_2059: Item[] = BASE_ITEMS.map(normaliseItem);
