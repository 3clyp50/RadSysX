const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("radsysxDesktop", {
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
