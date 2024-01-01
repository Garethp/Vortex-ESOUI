import { IExtensionApi } from "vortex-api/lib/types/IExtensionContext";
import ESOUIClient from "./ESOUIClient";
import { installMods } from "./install";

export interface Mod {
  name: string;
  game: string;
  modId: number;
  fileId: number;
  source?: string;
  enabled?: boolean;
  vortexId?: string;
}

export const registerModlistBackupIntegration = (api: IExtensionApi) => {
  console.log("Registering source esoui");

  api.ext.addSourceToModlistBackup?.(
    "esoui",
    async (api: IExtensionApi, mods: Mod[]) => {
      const esoClient = new ESOUIClient(api);
      const details = await Promise.all(
        mods.map((mod) =>
          esoClient.getModDetails(mod.modId).then((modDetails) => {
            modDetails.installDisabled = mod.enabled === false;
            return modDetails;
          })
        )
      );

      await installMods(details, api);
    }
  );
};
