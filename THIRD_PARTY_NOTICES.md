# Third-party notices

AI Mac's code is [MIT](LICENSE). The Linux terminal (`linux` in the Terminal app) runs these third-party components in the visitor's browser. They keep their own licences.

| Component | What it is | Licence | Source |
| --- | --- | --- | --- |
| [v86](https://github.com/copy/v86) 0.5.473 | x86 emulator compiled to WebAssembly (`libv86.mjs`, `v86.wasm`), installed from npm and copied to `public/linux/` | BSD-2-Clause | https://github.com/copy/v86 |
| Linux kernel 6.8.12 (`buildroot-bzimage68.bin`) | The guest operating system's kernel, with a Buildroot root filesystem (busybox and other tools) built into the image | GPL-2.0 (kernel and busybox; Buildroot itself GPL-2.0-or-later; other bundled packages under their own licences) | Kernel: https://kernel.org. Build system: https://buildroot.org. The image is published for v86 by its author at https://i.copy.sh/buildroot-bzimage68.bin and built with the recipe linked from https://github.com/copy/v86 |
| SeaBIOS (`seabios.bin`) | BIOS of the emulated PC | LGPL-3.0 | https://www.seabios.org |
| VGABIOS (`vgabios.bin`) | Video BIOS of the emulated PC | LGPL-2.1 | https://savannah.nongnu.org/projects/vgabios |
| [xterm.js](https://github.com/xtermjs/xterm.js) and its fit addon | Terminal renderer | MIT | https://github.com/xtermjs/xterm.js |

## About the GPL and LGPL components

The kernel image is not stored in this repository. `scripts/linux-assets.mjs` downloads it at build time and checks it against a pinned SHA-256, so the exact binary is known. If you run a public instance, you are distributing that binary to your visitors. The sources for the kernel, busybox and Buildroot are available at the addresses above; to obtain the exact source that corresponds to this image, follow the build recipe on the v86 repository or contact the maintainer of this project.

SeaBIOS and VGABIOS are committed unmodified in `public/linux/`.

## Credit

Real Linux in the browser is made possible by [v86](https://github.com/copy/v86) by Fabian and its contributors.
