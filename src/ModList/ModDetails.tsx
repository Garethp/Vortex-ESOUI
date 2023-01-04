import React from "react";
import { FlexLayout, Icon, ZoomableImage, util } from "vortex-api";
import { Panel } from "react-bootstrap";
import { ModItem } from "../ESOUIClient";
import { largeNumToString } from "../utils";

type Props = {
  mod: ModItem;
  onInstall?: (mod: ModItem) => void;
  fileInfoUri: string;
};

// @TODO: Investigate adding our own tags into the BBCode Parser
// @TODO: Have a way to swap between description and Changelog
export default ({ mod, onInstall, fileInfoUri }: Props) => (
  <FlexLayout type="column" className="esoui-mod-details">
    <FlexLayout.Fixed className="esoui-mod-header">
      <Panel>
        <Panel.Body>
          <FlexLayout type="row" className="description-header" fill={false}>
            <FlexLayout.Fixed>
              <div className="description-image-container">
                {!!mod.images?.length && (
                  <ZoomableImage
                    className="extension-picture"
                    url={mod.images[0].imageUrl}
                  />
                )}
              </div>
            </FlexLayout.Fixed>
            <FlexLayout.Flex>
              <FlexLayout type="column" className="description-header-content">
                <div className="description-title">
                  <span className="description-name">{mod.title}</span>
                  <span className="description-author">by {mod.author}</span>
                </div>
                <div className="description-stats">
                  <div className="extension-downloads">
                    <Icon name="download" /> {largeNumToString(mod.downloads)}
                  </div>
                  <div className="extension-endorsements">
                    <Icon name="endorse-yes" />{" "}
                    {largeNumToString(mod.favorites)}
                  </div>
                </div>
                <div>
                  {onInstall && (
                    <button
                      type="button"
                      className="btn btn-default extension-subscribe"
                      onClick={() => onInstall(mod)}
                      style={{ marginRight: "10px" }}
                    >
                      Install
                    </button>
                  )}

                  {!onInstall && (
                    <button
                      type="button"
                      disabled
                      className="btn btn-default extension-subscribe"
                      style={{ marginRight: "10px" }}
                    >
                      Installed
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-default extension-browse"
                    onClick={() => {
                      util.opn(fileInfoUri);
                    }}
                  >
                    <Icon name="open-in-browser" /> Open in Browser
                  </button>
                </div>
              </FlexLayout>
            </FlexLayout.Flex>
          </FlexLayout>
        </Panel.Body>
      </Panel>
    </FlexLayout.Fixed>
    <FlexLayout.Flex>
      <FlexLayout type="row">
        <FlexLayout.Fixed style={{ width: "70%", marginRight: "10px" }}>
          <Panel>
            <Panel.Body>
              <div
                className="description-text"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {util.bbcodeToReact(
                  mod.description
                    .replace(/\[URL/g, "[url")
                    .replace(/\[\/URL/g, "[/url")
                )}
              </div>
            </Panel.Body>
          </Panel>
        </FlexLayout.Fixed>
        <FlexLayout.Fixed
          className="esoui-mod-version"
          style={{ whiteSpace: "pre-wrap" }}
        >
          <Panel>
            <Panel.Body>
              <div>
                <h2>Version: {mod.version}</h2>
              </div>
            </Panel.Body>
          </Panel>
          <Panel>
            <Panel.Body>
              <h2>Requirements</h2>
            </Panel.Body>
          </Panel>
        </FlexLayout.Fixed>
      </FlexLayout>
    </FlexLayout.Flex>
  </FlexLayout>
);
