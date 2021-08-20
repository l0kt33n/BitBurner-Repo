import { CONSTANT } from '/src/lib/constants.js';
import * as ServerAPI from '/src/api/ServerAPI.js';
import * as LogAPI from '/src/api/LogAPI.js';
import * as ToolUtils from '/src/util/ToolUtils.js';
import * as SerializationUtils from '/src/util/SerializationUtils.js';
import { ServerStatus } from '/src/classes/Server/ServerInterfaces.js';
export function getJobMap(ns) {
    return readJobMap(ns);
}
function readJobMap(ns) {
    const jobMapString = ns.read(CONSTANT.JOB_MAP_FILENAME).toString();
    const jobMap = JSON.parse(jobMapString);
    jobMap.lastUpdated = new Date(jobMap.lastUpdated);
    const batches = Array.from(jobMap.batches);
    jobMap.batches = [];
    for (const batch of batches) {
        jobMap.batches.push(SerializationUtils.batchFromJSON(ns, batch));
    }
    return jobMap;
}
export function clearJobMap(ns) {
    ns.clear(CONSTANT.JOB_MAP_FILENAME);
}
export function writeJobMap(ns, jobMap) {
    // NOTE: Do we want to do this?
    jobMap.lastUpdated = new Date();
    ns.write(CONSTANT.JOB_MAP_FILENAME, JSON.stringify(jobMap), 'w');
}
export function startBatch(ns, batch) {
    // TODO: We should do some checking in here
    const isPrep = batch.jobs[0].isPrep;
    ServerAPI.setStatus(ns, batch.target.characteristics.host, (isPrep) ? ServerStatus.PREPPING : ServerStatus.TARGETING);
    for (const job of batch.jobs) {
        startJob(ns, job);
    }
    writeBatch(ns, batch);
}
function startJob(ns, job) {
    // TODO: We should do some checking in here
    job.execute(ns);
    job.onStart(ns);
    const threadSpread = job.threadSpread;
    for (const [server, threads] of threadSpread) {
        const reservation = threads * ToolUtils.getToolCost(ns, job.tool);
        ServerAPI.decreaseReservation(ns, server, reservation);
    }
}
export function finishJobs(ns, jobs) {
    // NOTE: This function manually removes the jobs instead of using removeJob (for performance reasons)
    const jobMap = getJobMap(ns);
    for (const finishedJob of jobs) {
        const batchIndex = jobMap.batches.findIndex((b) => b.batchId === finishedJob.batchId);
        if (batchIndex === -1)
            throw new Error(`Could not find the batch`);
        const jobIndex = jobMap.batches[batchIndex].jobs.findIndex((j) => j.id === finishedJob.id);
        if (jobIndex === -1)
            throw new Error('Could not find the job');
        jobMap.batches[batchIndex].jobs[jobIndex].finished = true;
        finishedJob.onFinish(ns);
    }
    const finishedBatchIndices = [];
    for (const [index, batch] of jobMap.batches.entries()) {
        const isBatchFinished = batch.jobs.every((j) => j.finished);
        if (isBatchFinished) {
            ServerAPI.setStatus(ns, batch.target.characteristics.host, ServerStatus.NONE);
            finishedBatchIndices.push(index);
        }
    }
    for (const index of finishedBatchIndices.reverse()) {
        jobMap.batches.splice(index, 1);
    }
    writeJobMap(ns, jobMap);
}
export function writeBatch(ns, batch) {
    const jobMap = getJobMap(ns);
    jobMap.batches.push(batch);
    writeJobMap(ns, jobMap);
}
export function getRunningProcesses(ns) {
    const serverMap = ServerAPI.getServerMap(ns);
    const runningProcesses = [];
    for (const server of serverMap.servers) {
        runningProcesses.push(...ns.ps(server.characteristics.host));
    }
    return runningProcesses;
}
export function cancelAllJobs(ns) {
    const jobMap = getJobMap(ns);
    for (const batch of jobMap.batches) {
        for (const job of batch.jobs) {
            cancelJob(ns, job);
        }
    }
    // TODO: Check whether there are still jobs left that are not cancelled
}
export function cancelJob(ns, job) {
    // TODO: We should do some checking here
    if (job.finished)
        return; // The job has already finished so meh
    if (job.pids.length === 0)
        throw new Error('Cannot cancel a job without the pids');
    let allKilled = true;
    for (const pid of job.pids) {
        const processKilled = ns.kill(pid);
        allKilled = allKilled && processKilled;
    }
    job.onCancel(ns);
    if (!allKilled)
        LogAPI.warn(ns, 'Failed to cancel all jobs');
}
export function initializeJobMap(ns) {
    const jobMap = { lastUpdated: new Date(), batches: [] };
    writeJobMap(ns, jobMap);
}
