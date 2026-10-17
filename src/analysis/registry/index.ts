import core from "./core.json";
import manager from "./manager.json";
import type { RegistryEntry } from "../types";
export const DEFAULT_REGISTRY: RegistryEntry[] = [
  ...core.entries,
  ...manager.entries,
];
export const REGISTRY_PROVENANCE = [core, manager].map(
  ({ snapshotId, retrievedAt, source, sha256 }) => ({
    snapshotId,
    retrievedAt,
    source,
    sha256,
  }),
);
/** This is a pinned, offline mapping snapshot, not a package installer or trust list. */
export const MODEL_WIDGET_FIELDS: Record<string, Record<number, string>> = {
  CheckpointLoaderSimple: { 0: "ckpt_name" },
  CheckpointLoader: { 1: "ckpt_name" },
  LoraLoader: { 0: "lora_name" },
  LoraLoaderModelOnly: { 0: "lora_name" },
  VAELoader: { 0: "vae_name" },
  CLIPLoader: { 0: "clip_name" },
  DualCLIPLoader: { 0: "clip_name1", 1: "clip_name2" },
  UNETLoader: { 0: "unet_name" },
  ControlNetLoader: { 0: "control_net_name" },
  DiffControlNetLoader: { 0: "control_net_name" },
};
