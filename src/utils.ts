import ESOUIClient from "./ESOUIClient";
import { IExtensionContext } from "vortex-api/lib/types/IExtensionContext";

export const getDependantMods = async (
  api: IExtensionContext["api"],
  path: string,
  version: string,
  optional: boolean
): Promise<{ type: string; id: string; path: string; checksum: string }[]> => {
  const type = optional ? "recommends" : "requires";

  const client = new ESOUIClient(api);
  const mods = (await client.getDependentMods(path, version)).map((mod) => ({
    ...mod,
    addon: mod.addons.find((addon) => addon.path == path),
  }));

  if (mods.length === 0) return [];
  if (mods.length === 1)
    return [
      {
        type,
        id: `${mods[0].id}`,
        path: mods[0].addon.path,
        checksum: mods[0].checksum,
      },
    ];

  mods.sort(
    (a, b) =>
      parseInt(b.addon.addOnVersion ?? "0") -
      parseInt(a.addon.addOnVersion ?? "0")
  );

  const newestMods = mods.filter(
    (mod) => mod.addon.addOnVersion === mods[0].addon.addOnVersion
  );

  if (newestMods.length == 0)
    return [
      {
        type,
        id: `${mods[0].id}`,
        path: mods[0].addon.path,
        checksum: mods[0].checksum,
      },
    ];

  newestMods.sort((a, b) => b.downloads - a.downloads);

  return [
    {
      type,
      id: `${mods[0].id}`,
      path: mods[0].addon.path,
      checksum: mods[0].checksum,
    },
  ];
};

const NUM_LABELS = ["", "K", "M"];

export function largeNumToString(num: number): string {
  let labelIdx = 0;
  while (num >= 1000 && labelIdx < NUM_LABELS.length - 1) {
    ++labelIdx;
    num /= 1000;
  }
  try {
    return num.toFixed(Math.max(0, labelIdx - 1)) + " " + NUM_LABELS[labelIdx];
  } catch (err) {
    return "???";
  }
}
