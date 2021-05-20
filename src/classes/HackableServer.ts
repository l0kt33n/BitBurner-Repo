import type { BitBurner as NS } from "Bitburner"
import ExternalServer from "/src/classes/ExternalServer.js";
import Server, { TreeStructure } from '/src/classes/Server.js'

export default class HackableServer extends ExternalServer {

    // Dynamic values
    /*
    currentSecurityLevel: number
    currentMoney: number
    availableRam: number
    rooted: boolean
    hackable: boolean
    weakenTime: number
    growTime: number
    hackTime: number
    */

    constructor(ns: NS, host: string, treeStructure?: TreeStructure) {
        super(ns, host, treeStructure);
    }
}