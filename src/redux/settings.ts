import { IReducerSpec } from "vortex-api/lib/types/IExtensionContext";
import { createAction } from "redux-act";

export type SettingsState = {
  autoDownload: boolean;
};

export const updateAutoDownload = createAction(
  "ESO_UI_SETTINGS_AUTO_DOWNLOAD",
  (autoDownload: boolean) => autoDownload
);

export const settingsReducer: IReducerSpec = {
  reducers: {
    [updateAutoDownload as any]: (
      state: SettingsState,
      autoDownload: boolean
    ): SettingsState => {
      return { ...state, autoDownload };
    },
  },
  defaults: {
    autoDownload: true,
  } as SettingsState,
};
