import type { BitBurner as NS } from 'Bitburner'
import Crime                    from '/src/classes/Misc/Crime.js'
import { CONSTANT }             from '/src/lib/constants.js'
import * as CrimeUtils          from '/src/util/CrimeUtils.js'
import * as LogAPI              from '/src/api/LogAPI.js'
import { LogType }              from '/src/api/LogAPI.js'

export async function main(ns: NS) {

	if (ns.isBusy()) {
		LogAPI.warn(ns, 'Cannot execute crimes, we are currently busy.')
		return
	}

	const flags = ns.flags([
		['homicide', false],
		['experience', false],
	])

	if (flags.homicide && flags.experience) throw new Error('Unable to optimize for experience and force \'homicide\' at the same time.')

	let crimes: Crime[]      = CrimeUtils.getCrimes(ns)
	let isCancelled: boolean = false

	LogAPI.log(ns, 'Executing crimes', LogType.INFORMATION)
	while (!isCancelled) {
		if (ns.isBusy()) {
			await ns.sleep(CONSTANT.CRIME_DELAY)
			continue
		}

		let crime: Crime
		if (flags.homicide) crime = crimes.find((c) => c.name === 'homicide') as Crime
		else {
			// Evaluate the potential crimes afterwards
			await Promise.all(crimes.map(async (c) => {
				return c.evaluate(ns, flags.experience)
			}))

			// Sort the potential crimes
			crimes = crimes.sort((a, b) => b.crimeValue! - a.crimeValue!)

			crime = crimes[0]
		}

		crime.commit(ns)

		const cancelButton = eval('document').getElementById('work-in-progress-cancel-button')

		if (cancelButton) {
			cancelButton.addEventListener('click', () => {
				isCancelled = true
				ns.exit()
			})
		}

		await ns.sleep(crime.crimeStats.time)
	}
}