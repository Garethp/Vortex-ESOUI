import { getDependantMods } from "./utils";
import { IExtensionApi } from "vortex-api/lib/types/IExtensionContext";
import ESOUIClient, { ModItem } from "./ESOUIClient";
import { actions, util } from "vortex-api";
import { IMod } from "vortex-api/lib/extensions/mod_management/types/IMod";

export const installMod = async (mod: ModItem, api: IExtensionApi) => {
  const client = new ESOUIClient(api);
  const allMods = await client.getAllMods();

  const modListItem = allMods.find((item) => item.id == mod.id);

  const requiredDependencies = modListItem.addons.reduce(
    (mods, addon) => [...mods, ...(addon.requiredDependencies ?? [])],
    [] as string[]
  );

  const modsToInstall: {
    id: number;
    title: string;
    downloadUri: string;
    modPage: string;
    fileName: string;
  }[] = [];

  const unresolvedMods: {
    id: number;
    title: string;
    downloadUri: string;
    modPage: string;
    fileName: string;
  }[] = [];

  unresolvedMods.push({
    id: mod.id,
    title: mod.title,
    downloadUri: mod.downloadUri,
    modPage: allMods.find((m) => m.id === mod.id).fileInfoUri,
    fileName: mod.fileName,
  });

  const addedIds = getAddedModIds(api);

  while (unresolvedMods.length > 0) {
    const modToResolve = unresolvedMods[0];

    unresolvedMods.shift();

    const unresolvedModListItem = allMods.find(
      (item) => item.id == modToResolve.id
    );

    // Prevent queuing up multiple of the same dependencies
    if (
      !!modsToInstall.find((item) => item.id === unresolvedModListItem.id) ||
      (!!addedIds.includes(unresolvedModListItem.id) &&
        unresolvedModListItem.id != mod.id)
    )
      continue;

    const requiredDependencies = unresolvedModListItem.addons.reduce(
      (mods, addon) => [...mods, ...(addon.requiredDependencies ?? [])],
      [] as string[]
    );

    for (const modToInstall of requiredDependencies) {
      const [name, version] = modToInstall.split(">=");
      const mod = await getDependantMods(api, name, version ?? "", true);

      if (mod.length !== 1) continue;

      const modItem = allMods.find((m) => `${m.id}` === mod[0].id);

      // Prevent queuing up multiple of the same dependencies
      if (
        !!unresolvedMods.find((item) => item.id === modItem.id) ||
        !!modsToInstall.find((item) => item.id === modItem.id) ||
        !!addedIds.includes(modItem.id)
      )
        continue;

      const modItemWithInfo = await client.getModDetails(modItem.id);

      unresolvedMods.push({
        id: modItemWithInfo.id,
        title: modItemWithInfo.title,
        modPage: modItem.fileInfoUri,
        downloadUri: modItemWithInfo.downloadUri,
        fileName: modItemWithInfo.fileName,
      });
    }

    modsToInstall.push(modToResolve);
  }

  modsToInstall.forEach((mod) => {
    api.events.emit(
      "start-download",
      [mod.downloadUri],
      {
        game: "teso",
        name: mod.title,
        source: "esoui",
        modId: mod.id,
        modPage: mod.modPage,
      },
      mod.fileName,
      (err: Error, downloadId: string) => {
        if (err !== null) return;
        if (addedIds.includes(mod.id)) {
          api.store.dispatch(
            actions.setDownloadModInfo(downloadId, "startedAsUpdate", true)
          );
        }

        api.events.emit("start-install-download", downloadId);
      },
      undefined,
      {
        allowInstall: "force",
      }
    );
  });
};

export const getAddedModIds = (api: IExtensionApi): number[] => {
  const installedMods: { [id: string]: IMod } =
    api.store.getState().persistent.mods.teso ?? {};

  const installedIds = Object.values(installedMods)
    .filter((mod) => util.getSafe(mod.attributes, ["source"], null) === "esoui")
    .filter((mod) => util.getSafe(mod.attributes, ["modId"], null) != null)
    .map((mod) => util.getSafe(mod.attributes, ["modId"], null));

  const downloadedMods = api.store.getState().persistent.downloads.files ?? {};
  const downloadedIds = Object.values(downloadedMods)
    .filter(
      (mod) => util.getSafe(mod, ["modInfo", "source"], undefined) === "esoui"
    )
    .filter((mod) => util.getSafe(mod, ["modInfo", "modId"], null) != null)
    .map((mod) => util.getSafe(mod, ["modInfo", "modId"], null));

  return [...installedIds, ...downloadedIds];
};
