import React, { useEffect, useState } from "react";
import { IExtensionContext } from "vortex-api/lib/types/IExtensionContext";
import LoadingSpinner from "../LoadingSpinner";
import ESOUIClient, { ModItem, ModListItem } from "../ESOUIClient";
import { MainPage, FlexLayout, Table, TableTextFilter, util } from "vortex-api";
import ModDetails from "./ModDetails";
import { IMod } from "vortex-api/lib/extensions/mod_management/types/IMod";
import { getDependantMods } from "../utils";
import { getAddedModIds, installMod } from "../install";

export default ({
  api,
  mods,
}: {
  api: IExtensionContext["api"];
  mods: string[];
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [allMods, setAllMods] = useState<ModListItem[]>([]);
  const [selectedMod, setSelectedMod] = useState<ModItem>(null);

  const client = new ESOUIClient(api);

  const addedIds = getAddedModIds(api);

  useEffect(() => {
    client.getAllMods().then((modList: ModListItem[]) => {
      setAllMods(modList);
      setIsLoading(false);
    });
  }, []);

  if (isLoading)
    return (
      <MainPage>
        <MainPage.Header></MainPage.Header>
        <MainPage.Body>
          <LoadingSpinner />
        </MainPage.Body>
      </MainPage>
    );

  const startInstall = async (mod: ModItem) => {
    await installMod(mod, api);
  };

  const data = allMods.reduce((reduced, mod) => {
    reduced[mod.id] = mod;
    return reduced;
  }, {} as { [id: number]: ModListItem });

  return (
    <MainPage>
      <MainPage.Body>
        <FlexLayout type="row">
          <FlexLayout.Fixed
            style={{
              width: "30%",
              overflow: "auto",
              maxWidth: "600px",
              marginRight: "10px",
            }}
          >
            <Table
              tableId="esoui-mod-list"
              data={data}
              staticElements={[
                {
                  id: "title",
                  name: "Name",
                  description: "Name",
                  placement: "table",
                  calc: (mod) => mod.title,
                  filter: new TableTextFilter(true),
                  edit: {},
                },
                {
                  id: "author",
                  name: "Author",
                  description: "Author",
                  placement: "table",
                  calc: (mod) => mod.author,
                  edit: {},
                },
                {
                  id: "favourites",
                  name: "Favourites",
                  description: "The amount of people who favourite a mod",
                  calc: (mod: ModListItem) => mod.favorites,
                  edit: {},
                  placement: "table",
                  isSortable: true,
                },
                // {
                //   id: "downloads",
                //   name: "Downloads",
                //   description: "The total downloads that this mod has",
                //   edit: {},
                //   placement: "table",
                //   isSortable: true,
                //   calc: (mod: ModListItem) => largeNumToString(mod.downloads),
                //   sortFuncRaw: (a: ModListItem, b: ModListItem) =>
                //     a.downloads - b.downloads,
                // },
                // {
                //   id: "monthlyDownloads",
                //   name: "Monthly Downloads",
                //   description: "The amount of Downloads per Month this mod has",
                //   edit: {},
                //   placement: "table",
                //   isSortable: true,
                //   calc: (mod: ModListItem) =>
                //     largeNumToString(mod.downloadsMonthly),
                //   sortFuncRaw: (a: ModListItem, b: ModListItem) =>
                //     a.downloadsMonthly - b.downloadsMonthly,
                // },
              ]}
              multiSelect={false}
              onChangeSelection={(ids) => {
                const id = parseInt(ids[0]);
                if (isNaN(id)) {
                  // setSelectedMod(null);
                  return;
                }

                // We should probably have a better way of storing this
                if (selectedMod?.id === id) return;

                client
                  .getModDetails(id)
                  .then((modDetails) => setSelectedMod(modDetails));
              }}
              actions={[]}
            />
          </FlexLayout.Fixed>
          {selectedMod && (
            <FlexLayout.Flex>
              <ModDetails
                mod={selectedMod}
                key={selectedMod.id}
                onInstall={
                  addedIds.includes(selectedMod.id) ? undefined : startInstall
                }
                fileInfoUri={data[selectedMod.id].fileInfoUri}
              />
            </FlexLayout.Flex>
          )}
        </FlexLayout>
      </MainPage.Body>
    </MainPage>
  );
};
