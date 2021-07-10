import type { BitBurner as NS } from "Bitburner";
import * as ServerAPI from "/src/api/ServerAPI.js";
import HackableServer from "/src/classes/HackableServer.js";
import Server from "/src/classes/Server.js";
import { CONSTANT } from "/src/lib/constants.js";
import { Tools } from "/src/tools/Tools.js";
import * as PlayerUtils from "/src/util/PlayerUtils.js";
import * as ToolUtils from "/src/util/ToolUtils.js";

export async function computeThreadSpread(ns: NS, tool: Tools, threads: number, isPrep: boolean): Promise<Map<Server, number>> {

    const maxThreadsAvailable = await calculateMaxThreads(ns, tool, isPrep);

    if (threads > maxThreadsAvailable) {
        throw new Error("We don't have that much threads available.");
    }

    const cost: number = ToolUtils.getToolCost(ns, tool);

    let threadsLeft: number = threads;
    let spreadMap: Map<Server, number> = new Map<Server, number>();

    const serverMap: Server[] = (isPrep) ? await ServerAPI.getPreppingServers(ns) : await ServerAPI.getHackingServers(ns);

    for (let server of serverMap) {
        let serverThreads: number = Math.floor(server.getAvailableRam(ns) / cost);

        // If we can't fit any more threads here, skip it
        if (serverThreads === 0) continue;

        // We can fit all our threads in here!
        if (serverThreads >= threadsLeft) {
            spreadMap.set(server, threadsLeft);
            break;
        }

        spreadMap.set(server, serverThreads);
        threadsLeft -= serverThreads;
    }

    return spreadMap;
}

// Here we allow thread spreading over multiple servers
export async function calculateMaxThreads(ns: NS, tool: Tools, isPrep: boolean): Promise<number> {

    const serverMap: Server[] = (isPrep) ? await ServerAPI.getPreppingServers(ns) : await ServerAPI.getHackingServers(ns);

    const cost: number = ToolUtils.getToolCost(ns, tool);

    return serverMap.reduce((threads, server) => threads + Math.floor(server.getAvailableRam(ns) / cost), 0);
}

export function calculateHackThreads(ns: NS, target: HackableServer): number {
    const hackAmount: number = target.percentageToSteal * target.staticHackingProperties.maxMoney;
    return ns.hackAnalyzeThreads(target.characteristics.host, hackAmount);
}

export function calculateWeakenThreads(ns: NS, target: HackableServer, start = target.getSecurityLevel(ns), goal = target.staticHackingProperties.minSecurityLevel) {
    return Math.ceil((start - goal) / PlayerUtils.getWeakenPotency(ns));
}

export function calculateGrowthThreads(ns: NS, target: HackableServer, start = target.getMoney(ns), goal = target.staticHackingProperties.maxMoney) {
    // maxIterations prevents it from somehow looping indefinitely
    var guess = 1;  // We can start with any number, really, but may as well make it simple.
    var previous = 0;
    var previous2 = 0;  // The time before the time before; should identify cyclicle outputs.

    start = Math.max(0, start);    // Can't start with <0 cash.
    if (start >= goal) {
        return 0;   // Good news! You're already there.
    }
    for (var iteration = 0; guess != previous && iteration < CONSTANT.MAX_GROWTH_CALCULATION_ITERATIONS; ++iteration) {
        previous = guess;
        let ratio = goal / (start + guess);
        if (ratio > 1) {
            guess = Math.ceil(ns.growthAnalyze(target.characteristics.host, ratio));
        } else {
            guess = 1;  // We'd only need 1 thread to meet the goal if adding the guess is sufficient to reach goal.
        }
        if (guess == previous2) {   // We got the same output we got the time before last.
            return Math.max(guess, previous);    // The smaller number of the two is obviously insufficient.
        }
        previous2 = previous;
    }
    if (iteration >= CONSTANT.MAX_GROWTH_CALCULATION_ITERATIONS) {
        // Whatever the biggest of the last three values was should be a safe guess.
        return Math.max(guess, previous, previous2);
    }
    return guess;   // It successfully stabilized!
}

export function calculateCompensationWeakenThreads(ns: NS, target: HackableServer, after: Tools, threads: number): number {
    switch (after) {
        case Tools.GROW:
            return Math.ceil(threads * CONSTANT.GROW_HARDENING / PlayerUtils.getWeakenPotency(ns));
        case Tools.HACK:
            return Math.ceil(threads * CONSTANT.HACK_HARDENING / PlayerUtils.getWeakenPotency(ns));
        default:
            throw new Error("We did not recognize the tool");
    }
}

// This is always after a hack
export function calculateCompensationGrowthThreads(ns: NS, target: HackableServer, threads: number): number {
    const hackAmount: number = ((threads * ns.hackAnalyzePercent(target.characteristics.host)) / 100) * target.staticHackingProperties.maxMoney;
    const startAmount: number = target.getMoney(ns) - hackAmount;

    return calculateGrowthThreads(ns, target, startAmount);
}