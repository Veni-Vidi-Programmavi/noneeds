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
        if (entry[1] !== "reset" && entry[1]) {
            f.log(chalk.red.bold(`ERREUR: '${entry[1]}' is not a valid argument`))
        }
        if (entry[1] === "reset") {
            infos["entry"] = "reset_log";
            f.log(chalk.gray("=> Deleting logs..."));
            break;
        };
        infos["entry"] = "log";
        break;
    case "list":
        infos["entry"] = "list";
        f.log(chalk.gray("=> Listing projects..."));
        break;
    default:
        f.log(chalk.red.bold(`ERREUR: Unknowed command '${entry[0]}'`));
}

module.exports = infos;