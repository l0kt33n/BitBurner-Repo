import * as ServerAPI from '/src/api/ServerAPI.js';
import { CONSTANT } from '/src/lib/constants.js';
import { Tools } from '/src/tools/Tools.js';
import * as PlayerUtils from '/src/util/PlayerUtils.js';
import * as ToolUtils from '/src/util/ToolUtils.js';
export async function computeThreadSpread(ns, tool, threads, isPrep) {
    const maxThreadsAvailable = await calculateMaxThreads(ns, tool, isPrep);
    if (threads > maxThreadsAvailable) {
        throw new Error('We don\'t have that much threads available.');
    }
    const cost = ToolUtils.getToolCost(ns, tool);
    let threadsLeft = threads;
    const spreadMap = new Map();
    const serverList = (isPrep) ? await ServerAPI.getPreppingServers(ns) : await ServerAPI.getHackingServers(ns);
    for (const server of serverList) {
        const serverThreads = Math.floor(server.getAvailableRam(ns) / cost);
        // If we can't fit any more threads here, skip it
        if (serverThreads <= 0)
            continue;
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
export async function calculateMaxThreads(ns, tool, isPrep) {
    const serverList = (isPrep) ? await ServerAPI.getPreppingServers(ns) : await ServerAPI.getHackingServers(ns);
    const cost = ToolUtils.getToolCost(ns, tool);
    return serverList.reduce((threads, server) => {
        return threads + Math.floor(server.getAvailableRam(ns) / cost);
    }, 0);
}
export function calculateHackThreads(ns, target) {
    const hackAmount = target.percentageToSteal * target.staticHackingProperties.maxMoney;
    return ns.hackAnalyzeThreads(target.characteristics.host, hackAmount);
}
export function calculateWeakenThreads(ns, target, start = target.getSecurityLevel(ns), goal = target.staticHackingProperties.minSecurityLevel) {
    return Math.ceil((start - goal) / PlayerUtils.getWeakenPotency(ns));
}
export function calculateGrowthThreads(ns, target, start = target.getMoney(ns), goal = target.staticHackingProperties.maxMoney) {
    // maxIterations prevents it from somehow looping indefinitely
    let guess = 1; // We can start with any number, really, but may as well make it simple.
    let previous = 0;
    let previous2 = 0; // The time before the time before; should identify cyclical outputs.
    let iteration = 0;
    start = Math.max(0, start); // Can't start with <0 cash.
    if (start >= goal) {
        return 0; // Good news! You're already there.
    }
    for (iteration = 0; guess !== previous && iteration < CONSTANT.MAX_GROWTH_CALCULATION_ITERATIONS; ++iteration) {
        previous = guess;
        const ratio = goal / (start + guess);
        if (ratio > 1) {
            guess = Math.ceil(ns.growthAnalyze(target.characteristics.host, ratio));
        }
        else {
            guess = 1; // We'd only need 1 thread to meet the goal if adding the guess is sufficient to reach goal.
        }
        if (guess === previous2) { // We got the same output we got the time before last.
            return Math.max(guess, previous); // The smaller number of the two is obviously insufficient.
        }
        previous2 = previous;
    }
    if (iteration >= CONSTANT.MAX_GROWTH_CALCULATION_ITERATIONS) {
        // Whatever the biggest of the last three values was should be a safe guess.
        return Math.max(guess, previous, previous2);
    }
    return guess; // It successfully stabilized!
}
export function calculateCompensationWeakenThreads(ns, target, after, threads) {
    switch (after) {
        case Tools.GROW:
            return Math.ceil(threads * CONSTANT.GROW_HARDENING / PlayerUtils.getWeakenPotency(ns));
        case Tools.HACK:
            return Math.ceil(threads * CONSTANT.HACK_HARDENING / PlayerUtils.getWeakenPotency(ns));
        default:
            throw new Error('We did not recognize the tool');
    }
}
// This is always after a hack
export function calculateCompensationGrowthThreads(ns, target, threads) {
    const hackAmount = ((threads * ns.hackAnalyzePercent(target.characteristics.host)) / 100) * target.staticHackingProperties.maxMoney;
    const startAmount = target.getMoney(ns) - hackAmount;
    return calculateGrowthThreads(ns, target, startAmount);
}
