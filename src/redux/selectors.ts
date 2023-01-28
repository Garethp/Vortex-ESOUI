import { IState } from "vortex-api/lib/types/IState";
import { GAME_ID } from "../constants";
import {
  IMod,
  IModRule,
} from "vortex-api/lib/extensions/mod_management/types/IMod";
import { selectors, util } from "vortex-api";

type ModRuleList = { modId: string; rule: IModRule }[];

export const getDependencyRulesForMod = (
  state: IState,
  id: string | number
): ModRuleList => {
  const modId = `${id}`;

  return Object.values(state.persistent.mods[GAME_ID])
    .filter((modToCheck) => {
      if (!modToCheck.rules?.length) return false;

      const relevantRules = modToCheck.rules.filter(
        (rule) =>
          rule.reference.repo.repository === "esoui" &&
          `${rule.reference.repo.modId}` === modId
      );

      return relevantRules.length > 0;
    })
    .reduce(
      (allRules, modToCheck) => [
        ...allRules,
        ...modToCheck.rules
          .filter(
            (rule) =>
              rule.reference.repo.repository === "esoui" &&
              `${rule.reference.repo.modId}` === modId
          )
          .map((rule) => ({ modId: modToCheck.id, rule })),
      ],
      [] as ModRuleList
    );
};

export const getModsToUpdate = (state: IState): IMod[] =>
  Object.values(state.persistent.mods[GAME_ID] ?? {})
    .filter(
      (mod) =>
        !!mod.attributes?.newestVersion &&
        !!mod.attributes?.version &&
        mod.attributes?.newestVersion !== mod.attributes.version
    )
    .filter(
      (mod) =>
        !Object.values(state.persistent.mods["teso"]).some(
          (installedMod) =>
            installedMod.attributes.modId === mod.attributes.modId &&
            installedMod.attributes.version === mod.attributes.newestVersion
        )
    );

export const isTESOActiveGame = (state: IState): boolean =>
  selectors.activeGameId(state) === GAME_ID;

export const getAddedModIds = (state: IState): number[] => {
  const installedMods: { [id: string]: IMod } =
    state.persistent.mods.teso ?? {};

  const installedIds = Object.values(installedMods)
    .filter((mod) => util.getSafe(mod.attributes, ["source"], null) === "esoui")
    .filter((mod) => util.getSafe(mod.attributes, ["modId"], null) != null)
    .map((mod) => util.getSafe(mod.attributes, ["modId"], null));

  const downloadedMods = state.persistent.downloads.files ?? {};
  const downloadedIds = Object.values(downloadedMods)
    .filter(
      (mod) => util.getSafe(mod, ["modInfo", "source"], undefined) === "esoui"
    )
    .filter((mod) => util.getSafe(mod, ["modInfo", "modId"], null) != null)
    .map((mod) => util.getSafe(mod, ["modInfo", "modId"], null));

  return [...installedIds, ...downloadedIds];
};
