import { CONSTANT } from "/src/lib/constants.js";
import { HackManager } from "/src/managers/HackManager.js";
import { ServerManager } from "/src/managers/ServerManager.js";
import { Heuristics } from "/src/util/Heuristics.js";
export async function main(ns) {
    const hostName = ns.getHostname();
    if (hostName !== "home") {
        throw new Error("Execute daemon script from home.");
    }
    while (true) {
        await hackLoop(ns);
    }
}
async function hackLoop(ns) {
    const serverManager = ServerManager.getInstance(ns);
    const hackManager = HackManager.getInstance();
    // TODO: initializeServers 
    // Purchase new servers and such to have some power later on
    // TODO: Root all servers
    let potentialTargets = await serverManager.getTargetableServers(ns);
    // Root all potential targets in advance
    // Then evaluate them afterwards
    await Promise.all(potentialTargets.map(async (target) => {
        if (!target.isRooted) {
            target.root(ns);
        }
        target.evaluate(ns, Heuristics.MainHeuristic);
    }));
    potentialTargets = potentialTargets.sort((a, b) => a.serverValue - b.serverValue);
    if (potentialTargets.length === 0) {
        throw new Error("No potential targets found.");
    }
    let targetCounter = 0;
    for (let target of potentialTargets) {
        // Can't have too many targets at the same time
        if (targetCounter >= CONSTANT.MAX_TARGET_COUNT)
            break;
        const isNewTarget = await hackManager.hack(ns, target);
        if (isNewTarget) {
            targetCounter++;
        }
    }
    // Wait a second!
    await ns.sleep(CONSTANT.HACK_LOOP_DELAY);
}
