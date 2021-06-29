import type { BitBurner as NS } from "Bitburner";
import HackableServer from "/src/classes/HackableServer.js";

export namespace Heuristics {

    export type HeuristicValue = number;

    export interface Heuristic {
        (ns: NS, server: HackableServer): HeuristicValue;
    }

    export var MainHeuristic: Heuristic = function (ns: NS, server: HackableServer): HeuristicValue {
        return 0;
    };

    export function evaluate(ns: NS, server: HackableServer): HeuristicValue {
        if (!server.getSecurityLevel(ns)) {
            throw new Error(`Unable to evaluate ${server.characteristics.host}`);
        }

        // TODO: Get rid of magic numbers

        // TODO: Filter anything that we can't actually attack...

        return server.staticHackingProperties.maxMoney * (100 / (server.staticHackingProperties.minSecurityLevel + server.getSecurityLevel(ns)));
    }
}

