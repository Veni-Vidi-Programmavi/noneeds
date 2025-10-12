#!/usr/bin/env node

var chalk = require("chalk");
var fs = require("fs");
var path = require("path");
const os = require('os');

console.log("Home dir:", os.homedir());

if (!fs.existsSync(path.join(os.homedir(), ".noneed"))) {
    console.log(chalk.gray("=> Initalizing the CLI"))
    fs.mkdirSync(path.join(os.homedir(), ".noneed"), {recursive: true});
    fs.mkdirSync(path.join(os.homedir(), '.noneed/pwa'), {recursive: true});
    fs.writeFileSync(path.join(os.homedir(), '.noneed/logs.txt'));
}

var f = require("./usefool.js");
var infos = require("./parser.js");
var pwa = require("./pwa/pwa.js");
const PWA = require("./pwa/pwa.js");
var editor = require("./editor.js");

switch (infos.entry) {
    case "pwa":
        var pwa = new PWA();
        pwa.askUser().then(()=> {
            pwa.genManifest();
        });
        break;
    case "log":
        var logs = fs.readFileSync(path.join(os.homedir(), '.noneed/logs.txt'), "utf-8").split("\n");
        console.log(chalk.blue.bold("Affichage des logs :\n"));
        logs.forEach(element => {
            setTimeout(()=> {
                console.log(element);
            }, 200);
        });
        break;
    case "reset_log":
        fs.writeFileSync(path.join(os.homedir(), '.noneed/logs.txt'), "");
        if (fs.readFileSync(path.join(os.homedir(), '.noneed/logs.txt'), "utf-8") === "") {
            f.log(chalk.green.bold("✅ Logs are good reseted"));
        } else {
            f.log(chalk.red.bold("ERREUR: Logs are NOT good RESETED \n.  Make sur you didn't remove any file of this CLI"));
        };
        break;
    case "list":
        const pwaPath = path.join(os.homedir(), ".noneed", "pwa");

        console.log(chalk.gray("=> Listing projects..."));
        console.log(chalk.gray("=> Path used:"), pwaPath);

        // vérifie que le dossier existe bien
        if (!fs.existsSync(pwaPath)) {
            console.log(chalk.red.bold("❌ Le dossier ~/.noneed/pwa n'existe pas."));
            console.log(chalk.yellow("➡️ Il sera créé automatiquement."));
            fs.mkdirSync(pwaPath, { recursive: true });
        }

        const projects = fs.readdirSync(pwaPath);
        if (projects.length === 0) {
            console.log(chalk.gray("Aucun projet trouvé."));
        } else {
            for (const i of projects) {
                if (i.endsWith(".js") || i.endsWith(".json")) continue;
                console.log(" " + "Project :" + "  " + chalk.bgWhite.blue(" " + i + " "));
            }
        }
        break;
};
if (infos.entry) {
    if (infos.entry.includes("edit")) {
        var a = infos.entry.split(".",2);

    };
}