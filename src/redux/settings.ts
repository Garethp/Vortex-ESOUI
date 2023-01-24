import { IReducerSpec } from "vortex-api/lib/types/IExtensionContext";
import { createAction } from "redux-act";

export type SettingsState = {
  autoUpdate: boolean;
};

export const updateAutoUpdate = createAction(
  "ESO_UI_SETTINGS_AUTO_UPDATE",
  (autoUpdate: boolean) => autoUpdate
);

export const settingsReducer: IReducerSpec = {
  reducers: {
    [updateAutoUpdate as any]: (
      state: SettingsState,
      autoUpdate: boolean
    ): SettingsState => {
      return { ...state, autoUpdate: autoUpdate };
    },
  },
  defaults: {
    autoUpdate: false,
  } as SettingsState,
};
