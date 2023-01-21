import React from "react";
import { connect } from "react-redux";
import { IState } from "vortex-api/lib/types/IState";
import { ThunkDispatch } from "redux-thunk";
import { ControlLabel, FormGroup, HelpBlock } from "react-bootstrap";
import { Toggle } from "vortex-api";
import { updateAutoDownload } from "../redux/settings";
import * as Redux from "redux";

type State = {
  autoDownload: boolean;
  canEnable: boolean;
};

type DispatchProps = {
  setAutoDownload: (autoDownload: boolean) => any;
};

type Props = State & DispatchProps;

const SettingsPane = ({ autoDownload, setAutoDownload, canEnable }: Props) => (
  <form>
    <FormGroup>
      <ControlLabel>Automatically Update ESO UI Addons</ControlLabel>
      <HelpBlock>
        With this setting enabled Vortex will automatically check for, and
        install, any updates for Addons that come from ESO UI. This update will
        either happen when you launch Vortex with Elder Scrolls Online as your
        selected game or when you select Elder Scrolls Online as your currently
        managed game
      </HelpBlock>
      <Toggle
        checked={autoDownload}
        onToggle={setAutoDownload}
        disabled={!canEnable}
      >
        Enable Automatic Updates for ESO UI Addons
      </Toggle>
      {!canEnable && (
        <HelpBlock>
          In order to enable this setting, please enable the "Enable Mods when
          installed" setting in the "Interface" tab
        </HelpBlock>
      )}
    </FormGroup>
  </form>
);

const mapStateToProps = (state: IState): State => ({
  autoDownload: state.settings["esoui"]["autoDownload"],
  canEnable: state.settings.automation.enable,
});

const mapDispatchToProps = (
  dispatch: ThunkDispatch<any, null, Redux.Action>
): DispatchProps => ({
  setAutoDownload: (enabled: boolean) => dispatch(updateAutoDownload(enabled)),
});

export default connect(mapStateToProps, mapDispatchToProps)(SettingsPane);
