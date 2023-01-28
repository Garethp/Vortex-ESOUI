import { IExtensionApi } from "vortex-api/lib/types/IExtensionContext";
import { IModRepoId } from "vortex-api/lib/extensions/mod_management/types/IMod";
import { IModLookupResult } from "vortex-api/lib/types/IModLookupResult";
import ESOUIClient from "./ESOUIClient";

export function repositoryLookupFactory(api: IExtensionApi) {
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
