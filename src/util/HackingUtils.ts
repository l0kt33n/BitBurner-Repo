import type { BitBurner as NS }     from 'Bitburner'
import * as ServerAPI               from '/src/api/ServerAPI.js'
import HackableServer               from '/src/classes/Server/HackableServer.js'
import Server                       from '/src/classes/Server/Server.js'
import { CONSTANT }                 from '/src/lib/constants.js'
import { Tools }                    from '/src/tools/Tools.js'
import * as ToolUtils               from '/src/util/ToolUtils.js'
import { Cycle, ThreadSpread }      from '/src/classes/Misc/HackInterfaces.js'
import { ServerStatus }             from '/src/classes/Server/ServerInterfaces.js'
import Job                          from '/src/classes/Job/Job.js'
import * as Utils                   from '/src/util/Utils.js'
import Batch                        from '/src/classes/Job/Batch.js'
import * as JobAPI                  from '/src/api/JobAPI.js'
import * as HackingCalculationUtils from '/src/util/HackingCalculationUtils.js'
import * as LogAPI                  from '/src/api/LogAPI.js'

const MAX_CYCLE_NUMBER: number = 50 as const // TODO: Find a way to determine this dynamically

export async function hack(ns: NS, target: HackableServer): Promise<void> {
	// If it is prepping or targeting, leave it
	if (target.status !== ServerStatus.NONE) return

// The server is not optimal, so we have to prep it first
	if (!target.isOptimal(ns)) {
		await prepServer(ns, target)
		return
	}

// Make sure that the percentage that we steal is optimal
	await optimizePerformance(ns, target)

	await attackServer(ns, target)

	return
}

export async function prepServer(ns: NS, target: HackableServer): Promise<void> {

	// If the server is optimal, we are done I guess
	if (target.isOptimal(ns)) return

	let initialWeakenJob: Job | undefined
	let growJob: Job | undefined
	let compensationWeakenJob: Job | undefined

	const batchId: string = Utils.generateHash()
	let startTime: Date | undefined
	let endTime: Date | undefined

	const jobs: Job[] = []

	let availableThreads: number = await HackingCalculationUtils.calculateMaxThreads(ns, Tools.WEAKEN, true)
	if (availableThreads <= 0) {
		// LogAPI.printLog(ns, 'Skipped a prep.')
		return
	}

// TODO: Ideally we pick the server that can fit all our threads here immediately,
// then we can have everything on one source server

// TODO: Refactor this shitshow

	if (target.needsWeaken(ns)) {
		const neededWeakenThreads: number = HackingCalculationUtils.calculateWeakenThreads(ns, target)

		const weakenThreads: number            = Math.min(neededWeakenThreads, availableThreads)
		const weakenThreadSpread: ThreadSpread = await HackingCalculationUtils.computeThreadSpread(ns, Tools.WEAKEN, weakenThreads, true)

		const weakenTime: number = target.getWeakenTime(ns)

		const weakenStart: Date = new Date(Date.now() + CONSTANT.INITIAL_JOB_DELAY)
		const weakenEnd: Date   = new Date(weakenStart.getTime() + weakenTime)

		startTime = weakenStart
		endTime   = weakenEnd

		initialWeakenJob = new Job(ns, {
			id: Utils.generateHash(),
			batchId,
			start: weakenStart,
			end: weakenEnd,
			target,
			threads: weakenThreads,
			threadSpread: weakenThreadSpread,
			tool: Tools.WEAKEN,
			isPrep: true,
		})

		jobs.push(initialWeakenJob)

		availableThreads -= weakenThreads

		for (const [server, threads] of weakenThreadSpread) {
			await ServerAPI.increaseReservation(ns, server, threads * await ToolUtils.getToolCost(ns, Tools.WEAKEN))
		}
	}

// First grow, so that the amount of money is optimal
	if (target.needsGrow(ns) && availableThreads > 0) {

		const neededGrowthThreads: number       = HackingCalculationUtils.calculateGrowthThreads(ns, target)
		const compensationWeakenThreads: number = HackingCalculationUtils.calculateCompensationWeakenThreads(ns, target, Tools.GROW, neededGrowthThreads)

		const totalThreads: number = neededGrowthThreads + compensationWeakenThreads

		const threadsFit: boolean = (totalThreads < availableThreads)

		// NOTE: Here we do Math.floor, which could cause us not to execute enough weakens/grows
		// However, we currently run into a lot of errors regarding too little threads available, which is why we do
		// this.

		const growthThreads: number = (threadsFit) ? neededGrowthThreads : Math.floor(neededGrowthThreads * (availableThreads / totalThreads))
		const weakenThreads: number = (threadsFit) ? compensationWeakenThreads : Math.floor(compensationWeakenThreads * (availableThreads / totalThreads))

		if (growthThreads > 0 && weakenThreads > 0) {

			const weakenTime: number = target.getWeakenTime(ns)
			const growthTime: number = target.getGrowTime(ns)

			const firstStartTime: Date = (initialWeakenJob) ? new Date(initialWeakenJob.end.getTime() + CONSTANT.JOB_DELAY) : new Date(Date.now() + CONSTANT.INITIAL_JOB_DELAY)

			let growthStartTime: Date
			let growthEndTime: Date
			let compensationWeakenEndTime: Date
			let compensationWeakenStartTime: Date

			if ((growthTime + CONSTANT.JOB_DELAY) > weakenTime) {
				growthStartTime = new Date(firstStartTime.getTime())
				growthEndTime   = new Date(growthStartTime.getTime() + growthTime)

				compensationWeakenEndTime   = new Date(growthEndTime.getTime() + CONSTANT.JOB_DELAY)
				compensationWeakenStartTime = new Date(compensationWeakenEndTime.getTime() - weakenTime)


			} else {
				compensationWeakenStartTime = new Date(firstStartTime.getTime())
				compensationWeakenEndTime   = new Date(compensationWeakenStartTime.getTime() + growthTime)

				growthEndTime   = new Date(compensationWeakenEndTime.getTime() - CONSTANT.JOB_DELAY)
				growthStartTime = new Date(growthEndTime.getTime() - growthTime)
			}

			startTime = firstStartTime
			endTime   = compensationWeakenEndTime

			const growthThreadSpread: ThreadSpread = await HackingCalculationUtils.computeThreadSpread(ns, Tools.GROW, growthThreads, true)

			growJob = new Job(ns, {
				id: Utils.generateHash(),
				batchId,
				target,
				threads: growthThreads,
				threadSpread: growthThreadSpread,
				tool: Tools.GROW,
				isPrep: true,
				start: growthStartTime,
				end: growthEndTime,
			})

			jobs.push(growJob)

			for (const [server, threads] of growthThreadSpread) {
				await ServerAPI.increaseReservation(ns, server, threads * await ToolUtils.getToolCost(ns, Tools.GROW))
			}

			const compensationWeakenThreadSpread: ThreadSpread = await HackingCalculationUtils.computeThreadSpread(ns, Tools.WEAKEN, weakenThreads, true)

			compensationWeakenJob = new Job(ns, {
				id: Utils.generateHash(),
				batchId,
				target,
				threads: weakenThreads,
				threadSpread: compensationWeakenThreadSpread,
				tool: Tools.WEAKEN,
				isPrep: true,
				start: compensationWeakenStartTime,
				end: compensationWeakenEndTime,
			})

			jobs.push(compensationWeakenJob)

			for (const [server, threads] of compensationWeakenThreadSpread) {
				await ServerAPI.increaseReservation(ns, server, threads * await ToolUtils.getToolCost(ns, Tools.WEAKEN))
			}
		}
	}

// We could not create any jobs, probably the RAM was already fully used.
// TODO: Filter this at the start, if we cannot start any threads, we should not even go here
	if (jobs.length === 0) return

	if (!startTime || !endTime) throw new Error('How the fuck do we not have timings available?')

	const batchJob: Batch = new Batch(ns, {
		batchId,
		target,
		jobs,
		start: startTime,
		end: endTime,
	})

	await JobAPI.startBatch(ns, batchJob)
}

export async function attackServer(ns: NS, target: HackableServer): Promise<void> {

	const numPossibleCycles: number = await HackingCalculationUtils.computeCycles(ns, target)

	const numCycles: number = Math.min(numPossibleCycles, MAX_CYCLE_NUMBER)

	const batchId: string = Utils.generateHash()

	if (numCycles === 0) {
		LogAPI.printLog(ns, 'Skipped an attack.')
		return
	}

	const cycles: Cycle[] = []

	for (let i = 0; i < numCycles; i++) {
		const cycle: Cycle = await HackingCalculationUtils.scheduleCycle(ns, target, batchId, cycles[cycles.length - 1])
		cycles.push(cycle)
	}

	if (cycles.length === 0) {
		throw new Error('No cycles created')
	}

	const startTime: Date = cycles[0].weaken1.start
	const endTime: Date   = cycles[cycles.length - 1].weaken2.end

	const jobs: Job[] = cycles.reduce((array: Job[], cycle: Cycle) => [...array, cycle.hack, cycle.weaken1, cycle.growth, cycle.weaken2], [])

// Create the batch object
	const batchJob: Batch = new Batch(ns, {
		batchId,
		target,
		jobs,
		start: startTime,
		end: endTime,
	})

	await JobAPI.startBatch(ns, batchJob)
}

export async function optimizePerformance(ns: NS, target: HackableServer): Promise<void> {

	// PERFORMANCE: This is a very expensive function call

	// TODO: This does not seem to work properly?

	let performanceUpdated: boolean = false

	const hackingServers: Server[] = ServerAPI.getHackingServers(ns)

	const originalPercentageToSteal: number = target.percentageToSteal

	let optimalTarget: { percentageToSteal: number, profitsPerSecond: number; } = {
		percentageToSteal: CONSTANT.MIN_PERCENTAGE_TO_STEAL,
		profitsPerSecond: -1,
	}

	for (let n = CONSTANT.MIN_PERCENTAGE_TO_STEAL; n <= CONSTANT.MAX_PERCENTAGE_TO_STEAL; n += CONSTANT.DELTA_PERCENTAGE_TO_STEAL) {
		target.percentageToSteal = n
		const cycles: number     = await HackingCalculationUtils.computeCycles(ns, target, hackingServers)
		const profit: number     = target.staticHackingProperties.maxMoney * target.percentageToSteal * cycles

		const totalTime: number = HackingCalculationUtils.calculateTotalBatchTime(ns, target, cycles)

		const profitsPerSecond: number = profit / totalTime

		if (profitsPerSecond > optimalTarget.profitsPerSecond) {
			optimalTarget = { percentageToSteal: n, profitsPerSecond }
		}
	}

	target.percentageToSteal = optimalTarget.percentageToSteal

	if (originalPercentageToSteal !== optimalTarget.percentageToSteal) performanceUpdated = true

	if (performanceUpdated) {
		LogAPI.printLog(ns, `Updated percentage to steal for ${target.characteristics.host} to ~${Math.round(target.percentageToSteal * 100)}%`)
	}
}