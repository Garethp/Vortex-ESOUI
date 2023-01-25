import { IState } from "vortex-api/lib/types/IState";
import { GAME_ID } from "../constants";
import {
  IMod,
  IModRule,
} from "vortex-api/lib/extensions/mod_management/types/IMod";

type ModRuleList = { [id: string]: IModRule[] };

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
      (allRules, modToCheck) => ({
        ...allRules,
        [modToCheck.id]: modToCheck.rules.filter(
          (rule) =>
            rule.reference.repo.repository === "esoui" &&
            `${rule.reference.repo.modId}` === modId
        ),
      }),
      {} as ModRuleList
    );
};

export const getModsToUpdate = (state: IState): IMod[] =>
  Object.values(state.persistent.mods[GAME_ID] ?? {}).filter(
    (mod) =>
      !!mod.attributes?.newestVersion &&
      !!mod.attributes?.version &&
      mod.attributes?.newestVersion !== mod.attributes.version
  );
