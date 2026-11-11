# PSX Revolver integration

Source: https://bigjigglydev.itch.io/psx-revolver
Creator: BigJigglyDev
Downloaded: 2026-11-11. Original file: Colt32-20.fbx (~56 KB).

The creator's page says the asset is free to use and requests optional attribution. It also contains an ambiguous "doesn't come with any license" disclaimer. This local integration is a technical trial; it does not claim a CC0/CC-BY license. Keep the creator link and this provenance with the asset. No model purchase was made.

## Model findings

- 950 triangles, five separate meshes: Body (436), Pin (92), Drum_Mag (246), Hammer (116), Trigger (60).
- No supplied animation clips; animations are implemented by moving the independent meshes.
- Drum_Mag's local bounding box is centered at its origin. Its local Z axis is aligned with the model's barrel axis (model X).
- Cylinder rotation is applied as original quaternion multiplied by local-Z rotation. This preserves the imported orientation and pivot.
- First shot rotates 2160 degrees; subsequent shots advance 60 degrees. Existing six-chamber game outcomes are preserved.
- A real 3D wooden tabletop lies in XY with Z as height. A world-fixed overhead light at (0, 0, 8) casts shadows onto the actual tabletop; no transparent shadow plane or CSS tabletop is used after loading.
- 1–6 brass/copper decorative rounds are displayed on the table. Before the first shot only, the cylinder moves out, rounds animate into it sequentially, and the cylinder closes before the existing spin sound and firing sequence.
- The on-page model credit was removed at the user's request. Source attribution remains in this file.
- Imported mesh geometry/UVs remain intact. Metal materials and a separate brown grip material replace the original pixel texture in the viewer.
- The original file contains a tiny embedded texture; it does not require an external texture download.

## Web integration

Turntable.html lazily imports assets/revolver-viewer.js only in revolver mode. The viewer loads the local FBX with Three.js 0.180.0 (MIT; see vendor/three/LICENSE).

Deploy Turntable.html, assets/, and vendor/ together alongside the site's existing m/, img/, and ttf/ folders. Serve over HTTP(S), not by double-clicking a file:// page. The downloaded model is not hotlinked to itch.io.

Drag the model to inspect it, and use 重設視角 to restore the initial view. Rendering is on demand and device pixel ratio is capped at 2. The mesh has a deliberately low-poly silhouette; this is not a photorealistic model.

Verification: browser FBX/WebGL loading, orbit interaction, chamber rotation and hit/empty round flow; local source inspection and deterministic game tests. Mobile viewport checks do not replace testing on a physical phone/GPU.
