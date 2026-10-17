# Offline registry evidence

These are real pinned upstream mapping snapshots, not installation instructions.

- `core.json`: extracted statically from `NODE_CLASS_MAPPINGS` in ComfyUI `nodes.py` at commit `eb460bba69298a2764a8af17d88e9e1bac9f65a0`. No upstream Python was imported or executed. Exact membership is verified against that source; compatibility with a user's runtime is not.
- `manager.json`: normalized from ComfyUI-Manager `extension-node-map.json` at commit `69187ed44b5def5ec6435b1a68e6d8135f1cae18`. Entries are community-maintained claims, labeled inferred, never independently verified. Repository collisions remain unresolved.

Each snapshot includes source URL, retrieval timestamp and SHA-256 of the downloaded source. Source licenses remain with their upstream owners. Mapping updates require deliberate review and a new immutable snapshot. Do not fetch arbitrary workflow-supplied URLs or auto-install a package.

Coverage is not universal: core extension modules outside `nodes.py` may be absent; Manager snapshots may be stale or contain mistaken claims. Repository identities are deduplicated, not package display names. Versions and model download URLs are never guessed. Model widget positions are only an inference based on common built-in node schemas; filenames do not prove model identity or licensing.

The analyzer has no network access in its code path. It accepts bounded JSON and PNG metadata, never decodes raster pixels, imports node code, or executes workflows. Analysis reports redact nonessential literals. The access-controlled viewer projection preserves bounded positional/named widget values as inert text; original files are retained separately for authorized downloads. Labels and model references remain user-controlled and must be rendered as text.
