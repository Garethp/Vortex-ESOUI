import { HttpClient } from "vortex-ext-http";
import { IExtensionApi } from "vortex-api/lib/types/IExtensionContext";
import { ESOUIState, updateModItem, updateModList } from "./actions";

export type ModList = {
  [modId: number]: ModListItem | ModItem;
};

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

type CachedModListItem = ModListItem & {
  cacheTTL: number;
};

let sharedGetAllCall: Promise<ModListItem[]> = null;

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
  ): Promise<ModItem> => {
    const cache = this.getState();

    const cachedMod = this.getState().mods.find(
      (item) => `${item.id}` == `${modId}`
    );

    if (
      !force &&
      cachedMod &&
      cache.cacheExpiry > Date.now() &&
      // @ts-ignore
      cachedMod?.cacheExpiry &&
      // @ts-ignore
      cachedMod.cacheExpiry > Date.now()
    ) {
      return cachedMod as ModItem;
    }

    const mod = (await this.getApiResponse(
      `https://api.mmoui.com/v4/game/ESO/filedetails/${modId}.json`
    ).then((mod: ModItem[]) => mod[0])) as ModItem;

    this.api.store.dispatch(updateModItem(mod));

    return mod;
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
