"use strict";const e=require("electron");e.contextBridge.exposeInMainWorld("electronAPI",{example:()=>console.log("Preload is working")});
