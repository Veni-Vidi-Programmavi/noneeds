var f = require("./usefool.js");
var chalk = require("chalk");
var fs = require("fs");

var infos = {
    "entry": null
};
var entry = process.argv.slice(2);
switch (entry[0]) {
    case "create":
        switch (entry[1]) {
            case "pwa":
                f.log(chalk.gray("=> Running the PWA guide..."));
                //f.log(chalk.gray("=> Creating a new PWA..."));
                infos["entry"] = "pwa";
                break;
            default:
                f.log(chalk.red.bold("ERREUR: Not kind of app specified"));
        }
        break;
    case "log":
        if (entry[1] === "reset") {
            infos["entry"] = "reset_log";
            break;
        };
        infos["entry"] = "log";
        break;
    default:
        f.log(chalk.red.bold("ERREUR: Unknowed command"));
}

module.exports = infos;