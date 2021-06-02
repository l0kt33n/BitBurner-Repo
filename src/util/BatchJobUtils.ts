import type { BitBurner as NS } from "Bitburner";
import HackableServer from "/src/classes/HackableServer.js";
import Job from "/src/classes/Job.js";
import Server from "/src/classes/Server.js";
import { CONSTANT } from "/src/lib/constants.js";
import { ServerManager } from "/src/managers/ServerManager.js";
import { Tools } from "/src/tools/Tools.js";
import ServerHackUtils from "/src/util/ServerHackUtils.js";

export default class BatchJobUtils {

    static async computeMaxCycles(ns: NS, cycleCost: number, allowSpread: boolean = true): Promise<number> {

        const serverManager: ServerManager = ServerManager.getInstance(ns);

        const serverMap: Server[] = await serverManager.getHackingServers(ns);

        // NOTE: We always expect AT LEAST 1 rooted server to be available
        if (!allowSpread) {
            const server: Server = serverMap.shift() as Server;
            return Math.floor(server.getAvailableRam(ns) / cycleCost);
        }

        return serverMap.reduce((threads, server) => threads + Math.floor(server.getAvailableRam(ns) / cycleCost), 0);
    }

    public static async scheduleCycle(ns: NS, target: HackableServer, batchStart: Date): Promise<Job[]> {
        const scheduledJob1: Job = await this.createCycleJob(ns, target, Tools.HACK, batchStart);

        let scheduledJobStart2: Date = new Date(scheduledJob1.end.getTime() + CONSTANT.CYCLE_DELAY);
        const scheduledJob2: Job = await this.createCycleJob(ns, target, Tools.WEAKEN, scheduledJobStart2, true);

        let scheduledJobStart3: Date = new Date(scheduledJob2.end.getTime() + CONSTANT.CYCLE_DELAY);
        const scheduledJob3: Job = await this.createCycleJob(ns, target, Tools.GROW, scheduledJobStart3);

        let scheduledJobStart4: Date = new Date(scheduledJob3.end.getTime() + CONSTANT.CYCLE_DELAY);
        const scheduledJob4: Job = await this.createCycleJob(ns, target, Tools.WEAKEN, scheduledJobStart4, false);

        return [scheduledJob1, scheduledJob2, scheduledJob3, scheduledJob4];
    }


    public static async createCycleJob(ns: NS, target: HackableServer, tool: Tools, start: Date, isFirstWeaken: boolean = false): Promise<Job> {
        let threads: number;
        let executionTime: number;

        if (tool === Tools.HACK) {
            executionTime = ns.getHackTime(target.host) * CONSTANT.MILLISECONDS_IN_SECOND;

            threads = ServerHackUtils.hackThreadsNeeded(ns, target);
        }
        else if (tool === Tools.WEAKEN) {
            executionTime = ns.getWeakenTime(target.host) * CONSTANT.MILLISECONDS_IN_SECOND;

            threads = (isFirstWeaken) ? ServerHackUtils.weakenThreadsNeededAfterTheft(ns, target) : ServerHackUtils.weakenThreadsNeededAfterGrowth(ns, target);
        }
        else if (tool === Tools.GROW) {
            executionTime = ns.getGrowTime(target.host) * CONSTANT.MILLISECONDS_IN_SECOND;

            threads = ServerHackUtils.growThreadsNeededAfterTheft(ns, target);
        }
        else {
            throw new Error("Tool not recognized");
        }


        const end: Date = new Date(start.getTime() + executionTime);

        return new Job(ns, {
            target,
            tool,
            threads,
            start,
            end,
            isPrep: false
        });
    }

    // Returns the number of threads
    public static getOptimalBatchCost(ns: NS, target: HackableServer): number {
        // TODO: Refactor this shitshow

        const weakenCost: number = ServerHackUtils.weakenThreadTotalPerCycle(ns, target);
        const growCost: number = ServerHackUtils.growThreadsNeededAfterTheft(ns, target);
        const hackCost: number = ServerHackUtils.hackThreadsNeeded(ns, target);

        return weakenCost + growCost + hackCost;
    }
}