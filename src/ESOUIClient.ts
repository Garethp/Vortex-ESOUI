import { HttpClient } from "vortex-ext-http";
import { IExtensionApi } from "vortex-api/lib/types/IExtensionContext";
import { ESOUIState, updateModItem, updateModList } from "./redux/main-state";

type ModAddon = {
  path: string;
  addOnVersion: string;
  apiVersion: string;
  requiredDependencies?: string[];
  optionalDependencies?: string[];
};

export type ModListItem = {
  id: number;
  categoryId: number;
  version: string;
  lastUpdate: number;
  title: string;
  author: string;
  fileInfoUri: string;
  downloads: number;
  downloadsMonthly: number;
  favorites: number;
  addons: ModAddon[];
  checksum: string;
};

export type ModItem = ModListItem & {
  cacheExpiry: number;
  description: string;
  changeLog: string;
  downloadUri: string;
  images?: Image[];
  fileName: string;
};

export type Image = {
  thumbUrl: string;
  imageUrl: string;
  description: string;
};

function isCachedModItem(mod: ModListItem | ModItem): mod is ModItem {
  return (mod as ModItem).cacheExpiry !== undefined;
}

function areAllModsItemsCached(
  mods: Array<ModListItem | ModItem>
): mods is ModItem[] {
  return !mods.some((mod) => !isCachedModItem(mod));
}

export default class ESOUIClient extends HttpClient {
  private api: IExtensionApi;

  constructor(api: IExtensionApi) {
    super("ESOUI");

    this.api = api;
  }

  private getState(): ESOUIState | null {
    return this.api.store.getState().persistent.esoui as ESOUIState;
  }

  getAllMods = async (force?: boolean): Promise<ModListItem[]> => {
    const cache = this.getState();

    if (!force && cache && cache.cacheExpiry > Date.now()) {
      return cache.mods;
    }

    const mods = (await this.getApiResponse(
      "https://api.mmoui.com/v4/game/ESO/filelist.json"
    )) as ModListItem[];

    window.setTimeout(() => this.api.store.dispatch(updateModList(mods)), 1);
    return mods;
  };

  getModDetails = async (
    modId: number | string,
    force?: boolean
  ): Promise<ModItem> =>
    this.getManyModDetails([modId], force).then((mods) => mods[`${modId}`]);

  getManyModDetails = async (
    modIds: Array<number | string>,
    force?: boolean
  ): Promise<{ [id: string]: ModItem }> => {
    const cache = this.getState();

    const getAllCachedItems = (
      modIds: Array<number | string>
    ): { [id: string]: ModItem } | null => {
      const mods = modIds.map((modId) =>
        this.getState().mods.find((item) => `${item.id}` == `${modId}`)
      );

      const now = Date.now();

      if (!mods.every((mod) => !!mod)) return null;
      if (!areAllModsItemsCached(mods)) return null;
      if (mods.some((mod) => mod.cacheExpiry <= now)) return null;

      return mods.reduce(
        (allMods, mod) => ({ ...allMods, [`${mod.id}`]: mod }),
        {}
      );
    };

    const cachedMods = getAllCachedItems(modIds);

    if (!force && cache.cacheExpiry > Date.now() && !!cachedMods) {
      return cachedMods;
    }

    const mods: ModItem[] = await this.getApiResponse(
      `https://api.mmoui.com/v4/game/ESO/filedetails/${modIds.join(",")}.json`
    );

    mods.forEach((mod) => {
      this.api.store.dispatch(updateModItem(mod));
    });

    return mods.reduce(
      (allMods, mod) => ({ ...allMods, [`${mod.id}`]: mod }),
      {}
    );
  };

  getDependentMods = async (
    path: string,
    version: string = "",
    force?: boolean
  ): Promise<ModListItem[]> =>
    this.getAllMods(force).then((mods) =>
      mods.filter(
        (mod) =>
          !!mod.addons?.filter(
            (addon) =>
              addon.path === path &&
              (version == "" ||
                addon.addOnVersion == "" ||
                parseInt(version) <= parseInt(addon.addOnVersion))
          )?.length
      )
    );
}
