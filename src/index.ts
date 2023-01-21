import { actions, selectors, util } from "vortex-api";
import {
  IExtensionApi,
  IExtensionContext,
} from "vortex-api/lib/types/IExtensionContext";
import ModList from "./ModList/ModList";
import {
  IMod,
  IModRepoId,
} from "vortex-api/lib/extensions/mod_management/types/IMod";
import ESOUIClient from "./ESOUIClient";
import { IModLookupResult } from "vortex-api/lib/types/IModLookupResult";
import * as path from "path";
import * as fs from "fs";
import { getDependantMods } from "./utils";
import { IState } from "vortex-api/lib/types/IState";
import { installMod } from "./install";
import { esoUIReducer } from "./redux/main-state";
import Settings from "./Settings/Settings";
import { settingsReducer } from "./redux/settings";

function makeRepositoryLookup(api: IExtensionApi) {
  return async (repoInfo: IModRepoId): Promise<IModLookupResult[]> => {
    const modId = parseInt(repoInfo.modId, 10);

    const client = new ESOUIClient(api);
    const modDetails = await client.getModDetails(modId);

    const res: IModLookupResult = {
      key: `${repoInfo.gameId}_${modDetails.title}_${modDetails.version}`,
      value: {
        fileName: modDetails.fileName,
        fileSizeBytes: 1,
        fileVersion: modDetails.version,
        gameId: "teso",
        domainName: "teso",
        sourceURI: modDetails.downloadUri,
        source: "esoui",
        logicalFileName: repoInfo.fileId,
        archived: false,
        rules: [],
        details: {
          modId: repoInfo.modId,
          fileId: repoInfo.fileId,
          author: modDetails.author,
          category: "",
          description: "",
          homepage: modDetails.downloadUri,
        },
      },
    };

    return [res];
  };
}

const checkForUpdates =
  (api: IExtensionApi) =>
  async (gameId: string, mods: { [id: string]: IMod }) => {
    if (gameId !== "teso") return;

    const filteredMods = Object.values(mods)
      .filter(
        (mod) => util.getSafe(mod.attributes, ["source"], undefined) == "esoui"
      )
      .filter((mod) => {
        return util.getSafe(mod.attributes, ["lastUpdate"], null) != null;
      });

    if (!filteredMods.length) return;

    const client = new ESOUIClient(api);

    const modIds = filteredMods
      .map((mod) => util.getSafe(mod.attributes, ["modId"], null))
      .filter((id) => !!id);

    const modsToUpdate = await client
      .getManyModDetails(modIds, true)
      .then((modDetails) => {
        return Object.values(modDetails);
      })
      .then((modDetails) => {
        return modDetails.map((modDetail) => ({
          details: modDetail,
          mod: filteredMods.find(
            (mod) =>
              `${util.getSafe(mod.attributes, ["modId"], null)}` ==
              `${modDetail.id}`
          ),
        }));
      })
      .then((mod) =>
        mod.filter(
          (mod) =>
            mod.details.lastUpdate >
            util.getSafe(mod.mod.attributes, ["lastUpdate"], null)
        )
      );

    modsToUpdate.forEach((mod) => {
      api.store.dispatch(
        actions.setModAttribute(
          gameId,
          mod.mod.id,
          "newestVersion",
          mod.details.version
        )
      );
    });

    return modsToUpdate.reduce((allIds, mod) => [...allIds, mod.mod.id], []);

    // @TODO: Throw some progress notifications in here maybe
  };

// @TODO: When a dependency is updated, the mods that depend on it don't update their reference idHint
const installUpdates =
  (api: IExtensionApi) => async (gameId: string, modId: string) => {
    if (gameId !== "teso") return;

    const mods = api.getState().persistent.mods["teso"];
    const mod =
      mods[modId] ??
      Object.values(mods).find(
        (mod) => util.getSafe(mod.attributes, ["modId"], "") == modId
      );

    if (util.getSafe(mod.attributes, ["source"], undefined) !== "esoui") {
      return;
    }

    const client = new ESOUIClient(api);

    await installMod(
      await client.getModDetails(
        util.getSafe(mod.attributes, ["modId"], null),
        true
      ),
      api
    );
  };

const init = (context: IExtensionContext) => {
  context.registerModSource(
    "esoui",
    "ESO UI",
    () => {
      context.api.store.dispatch(
        actions.showURL("https://www.esoui.com/addons.php")
      );
    },
    {
      condition: () =>
        selectors.activeGameId(context.api.store.getState()) === "teso",
      icon: "idea",
    }
  );

  context.registerMainPage("search", "ESO UI", ModList, {
    group: "per-game",
    visible: () =>
      selectors.activeGameId(context.api.store.getState()) == "teso",
    props: () => ({ api: context.api, mods: [] }),
  });

  context.registerAttributeExtractor(50, async (input: any) => {
    // @TODO: Could we move this into the installer?
    if (
      !["teso", "esoui.com"].includes(input.meta?.gameId) &&
      input.download?.modInfo?.source !== "esoui"
    )
      return;

    const client = new ESOUIClient(context.api);

    const checksum = input.download?.fileMD5 ?? "";

    if (!checksum) {
      return;
    }

    const foundMod = await client
      .getAllMods()
      .then((mods) => mods.find((mod) => mod.checksum == checksum));

    if (!foundMod) return;

    const attributes = {
      author: foundMod.author,
      version: foundMod.version,
      modId: foundMod.id,
      name: foundMod.title,
      downloadGame: "teso",
      lastUpdate: foundMod.lastUpdate,
      modPage: foundMod.fileInfoUri,
      fileId: foundMod.addons[0].path,
    };

    if (input.download?.installed?.modId) {
      context.api.store.dispatch(
        actions.setModAttributes(
          "teso",
          input.download?.installed?.modId,
          attributes
        )
      );
    }

    return attributes;
  });

  context.registerInstaller(
    "esoui",
    50,
    async () => ({
      supported: selectors.activeGameId(context.api.getState()) === "teso",
      requiredFiles: [],
    }),
    async (files: string[], destinationPath: string) => {
      /**
       * The dependency mapping for ESO UI Mods are very messy. We should account for not being able to find some
       * and show an info in that case, letting the user find them instead.
       *
       * The dependencies can be just the mod-name with no version or >= with a version.
       *
       * The name and version should be matched from item.addons[index], not item.title and item.version.
       *
       * Turns out that multiple mods can have the same addons. For example, LibAddonMenu-2.0 is bundled with Teammate Radar.
       * That's gonna be a problem, since almost everything requires LibAddonMenu-2.0 and we should probably have some
       * matching logic. Here's how I think we're gonna be going about trying to decide which mod to install:
       *
       * 1. If the list of compatible mods is only 1, problem solved
       * 2. If the list of compatible mods includes the mod we're currently installing, we can just ignore that dependency
       * 3. Sort by addon version and pick the highest
       * 4. If they're equal, pick the one with the most downloads, that should be the most popular
       */
      let dependencies: {
        type: string;
        id: string;
        path: string;
        checksum: string;
      }[] = [];

      // Only look for files in the mods folder where the File.txt name matches the folder name. IE: AddonName\\AddonName.txt
      const infoFiles = files.filter((file) =>
        file.match(/^([^\\]+)\\\1\.txt/g)
      );

      for (const infoFile of infoFiles) {
        const modData = fs
          .readFileSync(path.join(destinationPath, infoFile))
          .toString();

        const [, requiredMods] =
          modData.match(`## DependsOn: ((([^\\s]+) ?)+)`) ?? [];

        const requiredModsList = !!requiredMods ? requiredMods.split(" ") : [];

        dependencies = [
          ...dependencies,
          ...(
            await Promise.all(
              requiredModsList.map((mod) => {
                const [name, version] = mod.split(">=");
                return getDependantMods(
                  context.api,
                  name,
                  version ?? "",
                  false
                );
              })
            )
          ).reduce((prev, curr) => [...prev, ...curr], []),
        ];
      }

      return Promise.resolve({
        message: "Success",
        instructions: [
          ...files
            .filter((name: string) => !name.endsWith(path.sep))
            .map((name: string) => ({
              type: "copy",
              source: name,
              destination: name,
            })),
          ...dependencies.map((dependency) => ({
            type: "rule",
            rule: {
              type: dependency.type,
              reference: {
                logicalFileName: dependency.path,
                // md5Hint: dependency.checksum,
                gameId: "teso",
                repo: {
                  repository: "esoui",
                  modId: dependency.id,
                  fileId: dependency.path,
                },
              },
            },
          })),
        ],
      });
    }
  );

  context.registerReducer(["persistent", "esoui"], esoUIReducer);
  context.registerReducer(["settings", "esoui"], settingsReducer);

  context.registerSettings("Download", Settings, undefined, undefined, 100);

  context.once(() => {
    context.api.registerProtocol("vortex-esoui", true, async (url) => {
      if (!url.match("^vortex-esoui://install/([\\d]+)$")) {
        return;
      }

      const [_, id] = url.match("^vortex-esoui://install/([\\d]+)$");
      const client = new ESOUIClient(context.api);

      const mod = await client.getModDetails(id);

      if (!mod) return;
      return installMod(mod, context.api);
    });
    context.api.setStylesheet("esoui", path.join(__dirname, "index.scss"));
    context.api.events.on("check-mods-version", checkForUpdates(context.api));
    context.api.events.on("mod-update", installUpdates(context.api));

    context.api.registerRepositoryLookup(
      "esoui",
      true,
      makeRepositoryLookup(context.api)
    );

    context.api.events.on("gamemode-activated", (gameMode: string) => {
      // We do this to pre-warm the cache
      new ESOUIClient(context.api).getAllMods();

      const settings = context.api.getState().settings;
      const autoUpdate =
        settings["esoui"]["autoDownload"] && settings.automation.enable;

      if (!autoUpdate) return;
      if (gameMode !== "teso") return;

      context.api
        .emitAndAwait(
          "check-mods-version",
          "teso",
          util.getSafe(
            context.api.getState(),
            ["persistent", "mods", "teso"],
            {}
          )
        )
        .then(() => {
          const modsToUpdate = Object.values(
            context.api.getState().persistent.mods?.teso ?? {}
          ).filter(
            (mod) =>
              !!mod.attributes?.newestVersion &&
              !!mod.attributes?.version &&
              mod.attributes?.newestVersion !== mod.attributes.version
          );

          const updateEvents = modsToUpdate.map((mod) =>
            context.api.emitAndAwait(
              "mod-update",
              "teso",
              mod.id,
              mod.attributes?.newestVersion,
              mod.attributes?.source
            )
          );

          return Promise.all(updateEvents);
        });
    });
  });

  context.registerAction(
    "mods-action-icons",
    999,
    "esoui",
    {},
    "Open on ESO UI",
    (instanceIds) => {
      const state: IState = context.api.store.getState();
      const gameMode = selectors.activeGameId(state);

      const modPage =
        util.getSafe(
          state.persistent.mods,
          [gameMode, instanceIds[0], "attributes", "modPage"],
          undefined
        ) ??
        util.getSafe(
          state.persistent.downloads,
          ["files", instanceIds[0], "modInfo", "modPage"],
          undefined
        );

      if (!modPage) return;

      util.opn(modPage);
    },
    (instanceIds) => {
      const state: IState = context.api.store.getState();
      const gameMode = selectors.activeGameId(state);

      let modSource = util.getSafe(
        state.persistent.mods,
        [gameMode, instanceIds[0], "attributes", "source"],
        undefined
      );
      if (modSource === undefined) {
        modSource = util.getSafe(
          state.persistent.downloads,
          ["files", instanceIds[0], "modInfo", "source"],
          undefined
        );
      }

      return modSource === "esoui";
    }
  );
};

module.exports = { default: init };
