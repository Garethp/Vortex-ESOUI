import { IReducerSpec } from "vortex-api/lib/types/IExtensionContext";
import { createAction } from "redux-act";
import { util } from "vortex-api";
import { ModItem, ModListItem } from "../ESOUIClient";

export type ESOUIState = {
  cacheExpiry: number;
  mods: Array<ModListItem | ModItem>;
};

export const clearEsoUICache = createAction("ESO_UI_CACHE_CLEAR", () => ({}));

export const updateModList = createAction(
  "ESO_UI_UPDATE_MOD_LIST",
  (mods: ModListItem[]) => mods
);

export const updateModItem = createAction(
  "ESO_UI_UPDATE_MOD_ITEM",
  (mod: ModItem) => mod
);

export const esoUIReducer: IReducerSpec = {
  reducers: {
    [updateModList as any]: (state, mods: ModListItem[]): ESOUIState => {
      return {
        cacheExpiry: Date.now() + 60 * 60 * 1000,
        mods,
      };
    },
    [updateModItem as any]: (state: ESOUIState, mod: ModItem): ESOUIState => {
      const modKey = state.mods.findIndex((item) => item.id === mod.id);

      return util.merge(state, ["mods", modKey], {
        cacheExpiry: Date.now() + 60 * 60 * 1000,
        ...mod,
      }) as ESOUIState;
    },
    [clearEsoUICache as any]: (state): ESOUIState => {
      return { cacheExpiry: 0, mods: [] };
    },
  },
  defaults: {
    cacheExpiry: 0,
    mods: [],
  } as ESOUIState,
};
