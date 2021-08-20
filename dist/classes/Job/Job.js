import * as LogAPI from '/src/api/LogAPI.js';
import { CONSTANT } from '/src/lib/constants.js';
import * as ServerUtils from '/src/util/ServerUtils.js';
import * as ToolUtils from '/src/util/ToolUtils.js';
export default class Job {
    constructor(ns, job) {
        this.id = job.id;
        this.target = job.target;
        this.threads = job.threads;
        this.tool = job.tool;
        this.isPrep = job.isPrep;
        this.start = job.start;
        this.end = job.end;
        this.threadSpread = job.threadSpread;
        this.batchId = job.batchId;
        this.finished = (job.finished) ? job.finished : false;
        this.pids = (job.pids) ? job.pids : [];
        if (job.cycleId)
            this.cycleId = job.cycleId;
        if (this.threads <= 0)
            throw new Error('Cannot create a job with less than 1 thread');
    }
    static createArgumentArray(ns, args) {
        return [
            args.script,
            args.server.characteristics.host,
            args.threads,
            args.target.characteristics.host,
            args.start.getTime().toString(),
        ];
    }
    execute(ns) {
        const commonArgs = {
            script: this.tool,
            target: this.target,
            start: this.start,
        };
        for (const [server, threads] of this.threadSpread) {
            // We have to copy the tool to the server if it is not available yet
            if (!ServerUtils.isHomeServer(server)) {
                ns.scp(this.tool, CONSTANT.HOME_SERVER_HOST, server.characteristics.host);
            }
            const args = { ...commonArgs, threads, server };
            const pid = ns.exec.apply(null, Job.createArgumentArray(ns, args));
            if (pid === 0)
                LogAPI.warn(ns, 'Could not successfully start the process');
            else
                this.pids.push(pid);
        }
    }
    onStart(ns) {
        this.print(ns, false, false);
    }
    onFinish(ns) {
        this.print(ns, true, false);
    }
    onCancel(ns) {
        this.print(ns, false, true);
    }
    toJSON() {
        return {
            pids: this.pids,
            batchId: this.batchId,
            id: this.id,
            cycleId: this.cycleId,
            target: this.target,
            threads: this.threads,
            tool: this.tool,
            isPrep: this.isPrep,
            start: this.start.getTime(),
            end: this.end.getTime(),
            threadSpread: Array.from(this.threadSpread.entries()),
            finished: this.finished,
        };
    }
    print(ns, isFinished, isCanceled) {
        let verb;
        if (isCanceled)
            verb = (this.isPrep) ? 'Cancelled prep on' : 'Cancelled attack on';
        else if (this.isPrep && !isFinished)
            verb = 'Prepping';
        else if (this.isPrep && isFinished)
            verb = 'Finished prepping';
        else if (!this.isPrep && !isFinished)
            verb = 'Attacking';
        else if (!this.isPrep && isFinished)
            verb = 'Finished attacking';
        else
            throw new Error('This should logically never happen.');
        LogAPI.hack(ns, `${this.id} ${verb} ${this.target.characteristics.host} - ${ToolUtils.getToolName(this.tool)}`);
    }
}