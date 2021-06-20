import type { BitBurner as NS } from "Bitburner";
import * as ControlFlowAPI from "/src/api/ControlFlowAPI.js";
import * as JobAPI from "/src/api/JobAPI.js";
import * as ProgramAPI from "/src/api/ProgramAPI.js";
import * as PurchasedServerAPI from "/src/api/PurchasedServerAPI.js";
import * as CodingContractAPI from "/src/api/CodingContractAPI.js";
import * as ServerAPI from "/src/api/ServerAPI.js";
import HackableServer from "/src/classes/HackableServer.js";
import { CONSTANT } from "/src/lib/constants.js";
import * as HackUtils from "/src/util/HackUtils.js";
import { Heuristics } from "/src/util/Heuristics.js";
import * as Utils from "/src/util/Utils.js";

let hackLoopInterval: ReturnType<typeof setInterval>;

async function initialize(ns: NS) {

    Utils.disableLogging(ns);

    // NOTE: We wait until this is resolved before going on
    await ServerAPI.startServerManager(ns);

    // These will run in parallel
    const jobManagerReady: Promise<void> = JobAPI.startJobManager(ns);
    const programManagerReady: Promise<void> = ProgramAPI.startProgramManager(ns);
    const purchasedServerManagerReady: Promise<void> = PurchasedServerAPI.startPurchasedServerManager(ns);
    const codingContractManagerReady: Promise<void> = CodingContractAPI.startCodingContractManager(ns);

    // Wait until everything is initialized
    await Promise.allSettled([jobManagerReady, programManagerReady, purchasedServerManagerReady, codingContractManagerReady]);
}

async function hackLoop(ns: NS) {
    let potentialTargets: HackableServer[] = await ServerAPI.getTargetServers(ns);

    // Then evaluate the potential targets afterwards
    await Promise.all(potentialTargets.map(async (target) => {
        target.evaluate(ns, Heuristics.MainHeuristic);
    }));

    potentialTargets = potentialTargets.sort((a, b) => a.serverValue! - b.serverValue!);

    if (potentialTargets.length === 0) {
        throw new Error("No potential targets found.");
    }

    for (let target of potentialTargets) {
        let currentTargets: string[] = await JobAPI.getCurrentTargets(ns);

        // Can't have too many targets at the same time
        if (currentTargets.length >= CONSTANT.MAX_TARGET_COUNT) break;

        await HackUtils.hack(ns, target);
    }
}

export async function onDestroy(ns: NS) {
    clearInterval(hackLoopInterval);

    // TODO: Wait until it is done executing

    Utils.tprintColored("Stopping the daemon", true, CONSTANT.COLOR_INFORMATION);
}

export async function main(ns: NS) {

    const hostName: string = ns.getHostname();
    if (hostName !== "home") {
        throw new Error("Execute daemon script from home.");
    }

    Utils.tprintColored("Starting the daemon", true, CONSTANT.COLOR_INFORMATION);

    // TODO: Make a decision on whether we start the to-be-made early hacking scripts, 
    // or whether we want to start hacking using our main hacker

    await initialize(ns);

    hackLoopInterval = setInterval(hackLoop.bind(null, ns), CONSTANT.HACK_LOOP_DELAY);

    while (true) {
        const shouldKill: boolean = await ControlFlowAPI.hasDaemonKillRequest(ns);

        if (shouldKill) {
            await onDestroy(ns);
            ns.exit();
        }

        await ns.sleep(CONSTANT.CONTROL_FLOW_CHECK_INTERVAL);
    }
}