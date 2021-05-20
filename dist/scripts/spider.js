import { ServerManager } from "/src/managers/ServerManager.js";
export async function main(ns) {
    let serverManager = new ServerManager(ns);
    serverManager.printServerMap(ns);
}