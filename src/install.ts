import { getDependantMods } from "./utils";
import { IExtensionApi } from "vortex-api/lib/types/IExtensionContext";
import ESOUIClient, { ModItem } from "./ESOUIClient";
import { actions, selectors } from "vortex-api";
import { IMod } from "vortex-api/lib/extensions/mod_management/types/IMod";
import { GAME_ID } from "./constants";
import { getAddedModIds } from "./redux/selectors";

export const installMod = async (mod: ModItem, api: IExtensionApi) =>
  installMods([mod], api);

export const installMods = async (mods: ModItem[], api: IExtensionApi) => {
  const client = new ESOUIClient(api);
  const allMods = await client.getAllMods();

  const modsToInstall: {
    id: number;
    title: string;
    downloadUri: string;
    modPage: string;
    fileName: string;
    installDisabled: boolean;
  }[] = [];

  const unresolvedMods: {
    id: number;
    title: string;
    downloadUri: string;
    modPage: string;
    fileName: string;
    installDisabled: boolean;
  }[] = [];

  mods.forEach((mod) => {
    unresolvedMods.push({
      id: mod.id,
      title: mod.title,
      downloadUri: mod.downloadUri,
      modPage: allMods.find((m) => m.id === mod.id).fileInfoUri,
      fileName: mod.fileName,
      installDisabled: mod.installDisabled ?? false,
    });
  });

  const addedIds = getAddedModIds(api.getState());

  while (unresolvedMods.length > 0) {
    const modToResolve = unresolvedMods[0];

    unresolvedMods.shift();

    const unresolvedModListItem = allMods.find(
      (item) => item.id == modToResolve.id
    );

    // Prevent queuing up multiple of the same dependencies
    if (
      // If our list of mods to install already includes this item
      !!modsToInstall.find((item) => item.id === unresolvedModListItem.id) ||
      // Or if we've already added the mod **and the mod isn't in our explicitly install list**
      (!!addedIds.includes(unresolvedModListItem.id) &&
        !mods.find((mod) => unresolvedModListItem.id == mod.id))
    ) {
      continue;
    }

    const requiredDependencies = unresolvedModListItem.addons.reduce(
      (mods, addon) => [...mods, ...(addon.requiredDependencies ?? [])],
      [] as string[]
    );

    for (const modToInstall of requiredDependencies) {
      const [name, version] = modToInstall.split(">=");
      const mod = await getDependantMods(api, name, version ?? "", true);

      if (mod.length !== 1) continue;

      const modItem = allMods.find((m) => `${m.id}` === mod[0].id);

      // If we've already resolved a dependency and this mod isn't meant to be installed disabled, make sure the dependency isn't either
      if (
        unresolvedMods.find((item) => item.id === modItem.id) &&
        !modToResolve.installDisabled
      ) {
        unresolvedMods.find((item) => item.id === modItem.id).installDisabled =
          false;
      }

      // If we've already added a dependency and this mod isn't meant to be installed disabled, make sure the dependency isn't either
      if (
        modsToInstall.find((item) => item.id === modItem.id) &&
        !modToResolve.installDisabled
      ) {
        modsToInstall.find((item) => item.id === modItem.id).installDisabled =
          false;
      }

      // Prevent queuing up multiple of the same dependencies
      if (
        !!unresolvedMods.find((item) => item.id === modItem.id) ||
        !!modsToInstall.find((item) => item.id === modItem.id) ||
        !!addedIds.includes(modItem.id)
      ) {
        continue;
      }

      const modItemWithInfo = await client.getModDetails(modItem.id);

      unresolvedMods.push({
        id: modItemWithInfo.id,
        title: modItemWithInfo.title,
        modPage: modItem.fileInfoUri,
        downloadUri: modItemWithInfo.downloadUri,
        fileName: modItemWithInfo.fileName,
        installDisabled: modToResolve.installDisabled,
      });
    }

    modsToInstall.push(modToResolve);
  }

  const settings = api.getState().settings;
  const autoEnable = settings.automation.enable;

  modsToInstall.forEach((mod) => {
    const isAnUpdate = addedIds.includes(mod.id);

    // @TODO: Trying to make this more synchronous might not be a bad idea.
    api.events.emit(
      "start-download",
      [mod.downloadUri],
      {
        game: GAME_ID,
        name: mod.title,
        source: "esoui",
        modId: mod.id,
        modPage: mod.modPage,
      },
      mod.fileName,
      (err: Error, downloadId: string) => {
        const state = api.getState();
        const downloads = state.persistent.downloads.files;
        if (err !== null) return;
        if (downloads[downloadId]?.state === "finished") {
          const mods: { [id: string]: IMod } = state.persistent.mods.teso ?? {};

          const alreadyInstalledMods = Object.values(mods).filter(
            (modAttr) => `${modAttr.attributes["modId"]}` == `${mod.id}`
          );

          const modIsActive = alreadyInstalledMods.some(
            (alreadyInstalledMod) =>
              selectors.activeProfile(state).modState[alreadyInstalledMod.id]
                ?.enabled === true
          );

          api.events.emit(
            "start-install-download",
            downloadId,
            {
              allowAutoEnable:
                !mod.installDisabled &&
                (!alreadyInstalledMods.length || modIsActive),
              unattended: true,
            },
            (err, modId) => {
              if (!!err) return;
              if (
                !autoEnable &&
                isAnUpdate &&
                modIsActive &&
                !mod.installDisabled
              ) {
                actions.setModsEnabled(
                  api,
                  selectors.activeProfile(api.getState()).id,
                  [modId],
                  true,
                  { willBeReplaced: true }
                );
              }

              if (isAnUpdate && modIsActive) {
                alreadyInstalledMods.forEach((alreadyInstalledMod) => {
                  const modIsActive = alreadyInstalledMods.some(
                    (alreadyInstalledMod) =>
                      selectors.activeProfile(state).modState[
                        alreadyInstalledMod.id
                      ]?.enabled === true
                  );

                  if (!modIsActive) return;

                  actions.setModsEnabled(
                    api,
                    selectors.activeProfile(api.getState()).id,
                    [alreadyInstalledMod.id],
                    false,
                    {
                      willBeReplaced: true,
                    }
                  );
                });
              }
            }
          );
        }
      },
      "replace",
      {
        allowInstall: false,
      }
    );
  });
};
