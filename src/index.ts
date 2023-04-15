import { actions, selectors, util } from "vortex-api";
import {
  IExtensionApi,
  IExtensionContext,
} from "vortex-api/lib/types/IExtensionContext";
import ModList from "./ModList/ModList";
import { IMod } from "vortex-api/lib/extensions/mod_management/types/IMod";
import ESOUIClient from "./ESOUIClient";
import * as path from "path";
import * as fs from "fs";
import { getDependantMods } from "./utils";
import { IState } from "vortex-api/lib/types/IState";
import { installMod } from "./install";
import { esoUIReducer } from "./redux/main-state";
import Settings from "./Settings/Settings";
import { settingsReducer } from "./redux/settings";
import {
  getDependencyRulesForMod,
  getModsToUpdate,
  isTESOActiveGame,
} from "./redux/selectors";
import { GAME_ID } from "./constants";
import { repositoryLookupFactory } from "./repositoryLookup";
import { IGame } from "vortex-api/lib/types/IGame";

const protocolHandlerFactory = (api: IExtensionApi) => {
  return async (url) => {
    if (!url.match("^vortex-esoui://install/([\\d]+)$")) {
      return;
    }

    const [_, id] = url.match("^vortex-esoui://install/([\\d]+)$");
    const client = new ESOUIClient(api);

    const mod = await client.getModDetails(id);

    if (!mod) return;
    return installMod(mod, api);
  };
};

const checkForUpdates =
  (api: IExtensionApi) =>
  async (gameId: string, mods: { [id: string]: IMod }) => {
    if (gameId !== GAME_ID) return;

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

const installUpdates =
  (api: IExtensionApi) => async (gameId: string, modId: string) => {
    // @TODO: Check if we already have an update installed and just enable that instead of re-installing it

    if (gameId !== GAME_ID) return;

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
      condition: () => isTESOActiveGame(context.api.getState()),
      icon: "idea",
    }
  );

  context.registerMainPage("search", "ESO UI", ModList, {
    group: "per-game",
    visible: () => isTESOActiveGame(context.api.getState()),
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
      supported: selectors.activeGameId(context.api.getState()) === GAME_ID,
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

        const [...allRequiredMods] =
          // @ts-ignore
          modData.matchAll(`## DependsOn: ((([^\\s]+) ?)+)`) ?? [];
        const requiredMods = allRequiredMods.map((match) => match[1]).join(" ");

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
                md5Hint:
                  // By default, the given checksum will always be for the latest version of the addon, since it's being
                  // pulled from the API. If we have an installed, enabled, older version of that addon we want to use
                  // that as the dependency
                  getCurrentEnabledModForAddon(context.api, dependency.id)
                    ?.attributes?.fileMD5 ?? dependency.checksum,
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
    context.api.registerProtocol(
      "vortex-esoui",
      true,
      protocolHandlerFactory(context.api)
    );

    context.api.setStylesheet("esoui", path.join(__dirname, "index.scss"));
    context.api.events.on("check-mods-version", checkForUpdates(context.api));
    context.api.events.on("mod-update", installUpdates(context.api));

    context.api.registerRepositoryLookup(
      "esoui",
      true,
      repositoryLookupFactory(context.api)
    );

    context.api.events.on(
      "mods-enabled",
      (modIds: string[], enabled: boolean, gameId: string) => {
        if (!enabled || gameId !== GAME_ID) return;
        modIds.forEach((modId) => {
          const api = context.api;
          const mod = api.getState().persistent.mods[gameId][modId];
          if (!mod) return;

          const md5Hint =
            api.getState().persistent.mods[gameId][modId]?.attributes?.fileMD5;

          if (!md5Hint) return;

          getDependencyRulesForMod(
            api.getState(),
            mod.attributes.modId
          ).forEach(({ modId, rule }) => {
            api.store.dispatch(actions.removeModRule(gameId, modId, rule));
            api.store.dispatch(
              actions.addModRule(gameId, modId, {
                ...rule,
                reference: {
                  ...rule.reference,
                  idHint: undefined,
                  md5Hint,
                },
              })
            );
          });
        });
      }
    );

    context.api.events.on("gamemode-activated", (gameMode: string) => {
      // We do this to pre-warm the cache
      new ESOUIClient(context.api).getAllMods();

      const settings = context.api.getState().settings;
      const autoUpdate = settings["esoui"]["autoUpdate"];

      if (!autoUpdate) return;
      if (gameMode !== GAME_ID) return;

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
        .then(() =>
          Promise.all(
            getModsToUpdate(context.api.getState()).map((mod) =>
              context.api.emitAndAwait(
                "mod-update",
                "teso",
                mod.id,
                mod.attributes?.newestVersion,
                mod.attributes?.source
              )
            )
          )
        );
    });
  });

  context.registerAction(
    "mod-icons",
    115,
    "import",
    {},
    "Import Existing Addons",
    () => {
      const state = context.api.store.getState();
      const gameRef: IGame = util.getGame(selectors.activeGameId(state));
      const installPath: string = util.getSafe(
        state,
        ["settings", "gameMode", "discovered", gameRef.id, "path"],
        undefined
      );
      if (installPath === undefined) {
        throw new Error(`Could not resolve game path for "${gameRef.id}"`);
      }
      // Check if the extension provided us with a "custom" directory
      //  to open when the button is clicked - otherwise assume we
      //  just need to use the default queryModPath value.
      let modPath =
        !!gameRef.details && !!gameRef.details.customOpenModsPath
          ? gameRef.details.customOpenModsPath
          : gameRef.queryModPath(installPath);
      if (!path.isAbsolute(modPath)) {
        // We add a path separator at the end to avoid running executables
        //  instead of opening file explorer. This happens when the
        //  a game's mods folder is named like its executable.
        //  e.g. Vampire the Masquerade's default modding folder is ../Vampire/
        //  and within the same directory ../Vampire.exe exists as well.
        modPath = path.join(installPath, modPath) + path.sep;
      }

      const addons = fs.readdirSync(modPath);
      const allAddons = new ESOUIClient(context.api)
        .getAllMods(true)
        .then(async (allMods) => {
          const addonsToImport = addons
            .filter((name) => {
              // Maybe check that it's not already managed

              return fs.existsSync(
                `${modPath}${path.sep}${name}${path.sep}${name}.txt`
              );
            })
            .map((name) => {
              const addonText = fs
                .readFileSync(
                  `${modPath}${path.sep}${name}${path.sep}${name}.txt`
                )
                .toString();

              return {
                title: addonText.match(/## Title: (.*)/)[1],
                author: addonText.match(/## Author: (.*)/)[1],
                path: name,
              };
            })
            .filter((details) => {
              return (
                details.title !== undefined && details.author !== undefined
              );
            })
            .map((details) => {
              const sanitize = (input: string): string =>
                input
                  .replaceAll(/\|c[a-fA-F0-9]{6}(.*?)\|r/g, "$1")
                  .replaceAll(/\|c[a-fA-F0-9]{6}/g, "");

              return {
                ...details,
                title: sanitize(details.title),
                author: sanitize(details.author),
              };
            });

          // These mods are quick and easy to match, we've got a clean match by their name and author
          const matchedAddons = addonsToImport.filter((details) => {
            return (
              allMods.filter(
                (mod) =>
                  mod.title == details.title &&
                  mod.author == details.author &&
                  mod.addons.length === 1 &&
                  mod.addons[0].path === details.path
              ).length == 1
            );
          });

          let unmatchedAddons = addonsToImport.filter(
            (details) =>
              !matchedAddons.find((match) => match.path === details.path)
          );

          // These mods we can match because there's only one mod in the API that provides this (and only this) module
          const quickMatch = unmatchedAddons.filter((details) => {
            return (
              allMods.filter(
                (mod) =>
                  mod.addons?.length === 1 &&
                  mod.addons[0].path === details.path
              ).length === 1
            );
          });

          unmatchedAddons = unmatchedAddons.filter(
            (details) =>
              !quickMatch.find((match) => match.path === details.path)
          );

          // @TODO: It looks like we're not going to be able to do a sum check on the existing folder. Best bet is to
          // just with the user

          // @TODO: Show a dialogue of all the addons that we're unable to import

          console.log({ matchedAddons, unmatchedAddons, quickMatch });

          // Split the addons into "easy to import" (file md5 matches what's in the DB) and "user confirmation required"
          // (Ask the user if they're happy to override the addon

          // Do the imports
        });
    }
  );

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

// @TODO: Move to selectors
const getCurrentEnabledModForAddon = (
  api: IExtensionApi,
  addonId: string | number
): IMod | undefined => {
  const state = api.getState();

  return Object.values(state.persistent.mods["teso"])
    .filter(
      (mod) =>
        mod.attributes.source === "esoui" &&
        `${mod.attributes.modId}` === `${addonId}`
    )
    .find(
      (mod) => selectors.activeProfile(state).modState[mod.id]?.enabled === true
    );
};

module.exports = { default: init };
