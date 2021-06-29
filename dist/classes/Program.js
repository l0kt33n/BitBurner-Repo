import { CONSTANT } from "/src/lib/constants.js";
import * as Utils from "/src/util/Utils.js";
import * as PlayerUtils from "/src/util/PlayerUtils.js";
export var ProgramType;
(function (ProgramType) {
    ProgramType[ProgramType["Crack"] = 0] = "Crack";
    ProgramType[ProgramType["Util"] = 1] = "Util";
})(ProgramType || (ProgramType = {}));
export class Program {
    constructor(ns, name, price, type) {
        this.name = name;
        this.price = price;
        this.type = type;
    }
    hasProgram(ns) {
        return ns.fileExists(this.name, "home");
    }
    // Returns whether it was successful
    attemptPurchase(ns) {
        const money = PlayerUtils.getMoney(ns);
        if (this.price > money)
            return false;
        const isSuccessful = ns.purchaseProgram(this.toValidString(ns, this.name));
        if (isSuccessful) {
            Utils.tprintColored(`Purchased ${this.name}`, true, CONSTANT.COLOR_INFORMATION);
        }
        return isSuccessful;
    }
    toValidString(ns, name) {
        return name.toLowerCase();
    }
    run(ns, server) {
        switch (this.name) {
            case "BruteSSH.exe":
                return ns.brutessh(server.characteristics.host);
            case "FTPCrack.exe":
                return ns.ftpcrack(server.characteristics.host);
            case "relaySMTP.exe":
                return ns.relaysmtp(server.characteristics.host);
            case "HTTPWorm.exe":
                return ns.httpworm(server.characteristics.host);
            case "SQLInject.exe":
                return ns.sqlinject(server.characteristics.host);
            default:
                throw new Error(`Program "${this.name}" not found.`);
        }
    }
}
